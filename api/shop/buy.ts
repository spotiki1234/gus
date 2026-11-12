import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface BuyRequestBody {
  userId?: number;
  giftId?: number;
}

interface VercelRequest {
  method?: string;
  body?: BuyRequestBody;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, giftId } = req.body || {};

  if (!userId || !giftId) {
    return res.status(400).json({ error: 'Missing userId or giftId' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Проверяем наличие подарка в банке
    const giftRes = await client.query(
      `SELECT * FROM bank_vault WHERE id = $1 FOR UPDATE`,
      [giftId]
    );

    if (giftRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Этот подарок уже куплен или не найден в банке' });
    }

    const gift = giftRes.rows[0];
    const priceTon = Number(gift.price_ton || 0);

    // 2. Проверяем баланс пользователя (по telegram_id, как в user-balance.ts!)
    const userRes = await client.query(
      `SELECT balance_ton FROM users WHERE telegram_id = $1 FOR UPDATE`,
      [userId]
    );

    const currentBalance = Number(userRes.rows[0]?.balance_ton || 0);
    if (currentBalance < priceTon) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недостаточно TON для покупки' });
    }

    // 3. Списываем TON
    const newBalance = Number((currentBalance - priceTon).toFixed(2));
    await client.query(
      `UPDATE users SET balance_ton = $1, updated_at = NOW() WHERE telegram_id = $2`,
      [newBalance, userId]
    );

    // 4. Удаляем подарок из bank_vault
    await client.query(`DELETE FROM bank_vault WHERE id = $1`, [giftId]);

    // 5. Добавляем подарок в inventory пользователя
    const invRes = await client.query(
      `INSERT INTO inventory (user_id, telegram_gift_id, name, slug, image_url, price_stars, price_ton, serial_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        gift.telegram_gift_id || '',
        gift.name,
        gift.slug,
        gift.image_url,
        gift.price_stars || 0,
        gift.price_ton || 0,
        gift.serial_number || '',
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      item: invRes.rows[0],
      newBalance,
    });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : 'Ошибка при покупке';
    return res.status(400).json({ error: message });
  } finally {
    client.release();
  }
}
