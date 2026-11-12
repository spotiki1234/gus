import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface VercelRequest {
  method?: string;
  query: { [key: string]: string | string[] | undefined };
  url?: string;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  // Извлекаем userId из query или из URL пути (/api/inventory/123456)
  let userId = req.query.userId as string | undefined;
  if (!userId && req.url) {
    const parts = req.url.split('?')[0].split('/');
    userId = parts[parts.length - 1];
  }

  if (!userId || isNaN(Number(userId))) {
    return res.status(400).json({ error: 'Missing or invalid userId', items: [] });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, telegram_gift_id, name, slug, image_url, 
              CAST(price_stars AS FLOAT) as price_stars, 
              CAST(price_ton AS FLOAT) as price_ton, 
              serial_number
       FROM inventory
       WHERE user_id = $1
       ORDER BY id DESC`,
      [Number(userId)]
    );

    // Принудительно приводим цены к числу
    const items = result.rows.map((row) => ({
      ...row,
      price_ton: Number(row.price_ton) || 0,
      price_stars: Number(row.price_stars) || 0,
    }));

    return res.status(200).json({ items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database error';
    return res.status(500).json({ error: msg, items: [] });
  } finally {
    client.release();
  }
}
