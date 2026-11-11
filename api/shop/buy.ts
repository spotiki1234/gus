import type { IncomingMessage, ServerResponse } from 'http';
// Если файл db.ts лежит в самом корне GuseUP:
import { pool } from '../../../db'; 

interface CustomRequest extends IncomingMessage {
  body?: {
    userId?: number;
    giftId?: number;
  };
}

export default async function handler(req: CustomRequest, res: ServerResponse) {
  // Разрешаем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  // Vercel автоматически парсит JSON-тело в req.body
const { userId, giftId } = req.body || {};


  if (!userId || !giftId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Missing userId or giftId' }));
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
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Этот подарок уже куплен или не найден в банке' }));
    }

    const gift = giftRes.rows[0];
    const priceTon = Number(gift.price_ton || 0);

    // 2. Проверяем баланс пользователя
    const userRes = await client.query(
      `SELECT ton_balance FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );

    const currentBalance = Number(userRes.rows[0]?.ton_balance || 0);
    if (currentBalance < priceTon) {
      await client.query('ROLLBACK');
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Недостаточно TON для покупки' }));
    }

    // 3. Списываем TON
    const newBalance = Number((currentBalance - priceTon).toFixed(2));
    await client.query(
      `UPDATE users SET ton_balance = $1, updated_at = NOW() WHERE id = $2`,
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

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: true,
      item: invRes.rows[0],
      newBalance,
    }));
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : 'Ошибка при покупке';
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: message }));
  } finally {
    client.release();
  }
}