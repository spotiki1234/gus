import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface CryptoBotPayload {
  update_type?: string;
  payload?: {
    amount?: string;
    payload?: string;
  };
  type?: string;
  data?: {
    amount?: string;
    payload?: string;
  };
}

interface VercelRequest {
  method?: string;
  body?: CryptoBotPayload;
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
    if (!body) {
      return res.status(200).send('OK');
    }

    let userId: number | null = null;
    let addedTon = 0;

    // 1. Уведомление от CryptoBot
    if (body.update_type === 'invoice_paid' && body.payload) {
      const invoice = body.payload;
      if (invoice.payload) {
        const meta = JSON.parse(invoice.payload) as { userId?: number };
        if (meta.userId) {
          userId = Number(meta.userId);
        }
        if (invoice.amount) {
          addedTon = parseFloat(invoice.amount);
        }
      }
    }

    // 2. Уведомление от xRocket
    if (body.type === 'invoice_paid' && body.data) {
      const invoiceData = body.data;
      if (invoiceData.payload) {
        const meta = JSON.parse(invoiceData.payload) as { userId?: number };
        if (meta.userId) {
          userId = Number(meta.userId);
        }
        if (invoiceData.amount) {
          addedTon = parseFloat(invoiceData.amount);
        }
      }
    }

    // Автоматическое зачисление на баланс в PostgreSQL (Neon)
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
  } catch (err: unknown) {
    console.error('Crypto webhook error:', err);
    return res.status(200).json({ ok: true });
  }
}
