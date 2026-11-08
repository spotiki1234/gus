import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface VercelRequest {
  method?: string;
  body: any;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  send: (body: string) => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  try {
    const body = req.body;
    let userId: number | null = null;
    let addedTon = 0;

    // 1. Уведомление об успешной оплате от CryptoBot
    if (body.update_type === 'invoice_paid' && body.payload) {
      const invoice = body.payload;
      if (invoice.payload) {
        const meta = JSON.parse(invoice.payload);
        userId = Number(meta.userId);
        addedTon = parseFloat(invoice.amount);
      }
    }

    // 2. Уведомление об успешной оплате от xRocket
    if (body.type === 'invoice_paid' && body.data) {
      const meta = JSON.parse(body.data.payload || '{}');
      userId = Number(meta.userId);
      addedTon = parseFloat(body.data.amount);
    }

    // Автоматическое зачисление на баланс в базу Neon
    if (userId && addedTon > 0) {
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO users (telegram_id, balance_stars, balance_ton)
           VALUES ($1, 0, $2)
           ON CONFLICT (telegram_id)
           DO UPDATE SET balance_ton = users.balance_ton + $2, updated_at = NOW()`,
          [userId, addedTon]
        );
      } finally {
        client.release();
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Crypto webhook error:', err);
    return res.status(200).json({ ok: true });
  }
}
