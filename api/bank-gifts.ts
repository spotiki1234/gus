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
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, telegram_gift_id, name, slug, image_url, price_stars, price_ton, current_owner_tg_id
       FROM bank_vault_gifts
       WHERE status = 'AVAILABLE_IN_BANK'
       ORDER BY price_ton ASC`
    );

    return res.status(200).json({ available_gifts: result.rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database error';
    return res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}
