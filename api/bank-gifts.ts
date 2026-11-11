import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface VercelRequest {
  method?: string;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, telegram_gift_id, name, slug, image_url, price_stars, price_ton, serial_number
       FROM bank_vault
       ORDER BY price_stars ASC`
    );

    return res.status(200).json({ available_gifts: result.rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database error';
    console.error('API Error:', msg);
    return res.status(500).json({ error: msg, available_gifts: [] });
  } finally {
    client.release();
  }
}
