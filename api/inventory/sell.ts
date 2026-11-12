import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface SellRequestBody {
  userId?: number;
  itemId?: number;
}

interface VercelRequest {
  method?: string;
  body?: SellRequestBody;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, itemId } = req.body || {};

  if (!userId || !itemId) {
    return res.status(400).json({ error: 'Missing userId or itemId' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Ищем подарок в инвентаре пользователя
    const itemRes = await client.query(
      `SELECT * FROM inventory WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [itemId, userId]
    );

    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Подарок не найден в вашем инвентаре' });
    }

    const item = itemRes.rows[0];
    const priceTon = Number(item.price_ton || 0);

    // 2. Начисляем TON на баланс пользователя
    const userRes = await client.query(
      `UPDATE users 
       SET balance_ton = COALESCE(balance_ton, 0) + $1, updated_at = NOW() 
       WHERE telegram_id = $2
       RETURNING balance_ton`,
      [priceTon, userId]
    );

    const newBalance = Number(userRes.rows[0]?.balance_ton || 0);

    // 3. Удаляем подарок из инвентаря пользователя
    await client.query(`DELETE FROM inventory WHERE id = $1`, [itemId]);

    // 4. Добавляем подарок в банк магазина (bank_vault)
    const bankInsertRes = await client.query(
      `INSERT INTO bank_vault (telegram_gift_id, name, slug, image_url, price_stars, price_ton, serial_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        item.telegram_gift_id || '',
        item.name,
        item.slug,
        item.image_url,
        item.price_stars || 0,
        item.price_ton || 0,
        item.serial_number || '',
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      newBalance,
      bankGift: bankInsertRes.rows[0],
    });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : 'Ошибка при продаже подарка';
    return res.status(500).json({ error: message });
  } finally {
    client.release();
  }
      }
