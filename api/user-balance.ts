import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface UserBalanceRequestBody {
  userId?: number | string;
  stars?: number;
  ton?: number;
}

interface VercelRequest {
  method?: string;
  query: { [key: string]: string | string[] | undefined };
  body?: UserBalanceRequestBody;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const queryUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const userId = queryUserId || req.body?.userId;

  if (!userId) {
    return res.status(400).json({ error: 'Параметр userId не указан' });
  }

  const numericUserId = Number(userId);

  if (req.method === 'GET') {
    const client = await pool.connect();
    try {
      const userRes = await client.query(
        'SELECT balance_stars, balance_ton FROM users WHERE telegram_id = $1',
        [numericUserId]
      );

      if (userRes.rows.length === 0) {
        await client.query(
          'INSERT INTO users (telegram_id, balance_stars, balance_ton) VALUES ($1, 0, 0)',
          [numericUserId]
        );
        return res.status(200).json({ stars: 0, ton: 0 });
      }

      return res.status(200).json({
        stars: Number(userRes.rows[0].balance_stars || 0),
        ton: parseFloat(userRes.rows[0].balance_ton || '0'),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Database error';
      return res.status(500).json({ error: message });
    } finally {
      client.release();
    }
  }

  if (req.method === 'POST') {
    const stars = Number(req.body?.stars || 0);
    const ton = Number(req.body?.ton || 0);

    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO users (telegram_id, balance_stars, balance_ton) 
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_id) 
         DO UPDATE SET balance_stars = EXCLUDED.balance_stars, balance_ton = EXCLUDED.balance_ton, updated_at = NOW()`,
        [numericUserId, stars, ton]
      );
      return res.status(200).json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Database error';
      return res.status(500).json({ error: message });
    } finally {
      client.release();
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
