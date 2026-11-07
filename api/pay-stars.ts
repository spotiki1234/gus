interface RequestBody {
  starsAmount: number;
  userId: number;
}

interface VercelRequest {
  method?: string;
  body: RequestBody;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

interface TelegramInvoiceResponse {
  ok: boolean;
  result?: string;
  description?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { starsAmount, userId } = req.body || {};
  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    return res.status(500).json({ error: 'BOT_TOKEN is not configured in Vercel' });
  }

  if (!starsAmount || starsAmount <= 0) {
    return res.status(400).json({ error: 'Некорректная сумма Stars' });
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Пополнение баланса GuseBank',
        description: `Пополнение счёта на ${starsAmount} Telegram Stars`,
        payload: JSON.stringify({ userId, amount: starsAmount }),
        currency: 'XTR',
        prices: [{ label: `${starsAmount} Stars`, amount: Number(starsAmount) }],
      }),
    });

    const data = (await tgRes.json()) as TelegramInvoiceResponse;
    if (!data.ok) {
      return res.status(400).json({ error: data.description || 'Ошибка Telegram Bot API' });
    }

    return res.status(200).json({ invoiceLink: data.result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
    return res.status(500).json({ error: message });
  }
}
