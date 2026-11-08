import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface CryptoBotInvoicePayload {
  amount?: string;
  payload?: string;
}

interface CryptoBotWebhookBody {
  update_type?: string;
  payload?: CryptoBotInvoicePayload;
}

interface VercelRequest {
  method?: string;
  body?: CryptoBotWebhookBody;
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

    // Уведомление об успешной оплате от CryptoBot
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

    // Автоматическое зачисление на баланс в базу PostgreSQL (Neon)
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
    console.error('CryptoBot webhook error:', err);
    return res.status(200).json({ ok: true });
  }
}
