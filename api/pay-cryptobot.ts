interface RequestBody {
  amountTon: number;
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

interface CryptoBotInvoiceResponse {
  ok: boolean;
  result?: {
    invoice_id: number;
    bot_invoice_url?: string;
    mini_app_invoice_url?: string;
    pay_url?: string;
  };
  error?: {
    code: number;
    name: string;
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { amountTon, userId } = req.body || {};
  const token = process.env.CRYPTO_BOT_TOKEN;

  if (!token) {
    return res.status(500).json({ error: 'CRYPTO_BOT_TOKEN не задан в Vercel Settings' });
  }

  if (!amountTon || amountTon <= 0) {
    return res.status(400).json({ error: 'Некорректная сумма пополнения' });
  }

  try {
    const response = await fetch('https://pay.crypt.bot/api/createInvoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Crypto-Pay-API-Token': token,
      },
      body: JSON.stringify({
        asset: 'TON',
        amount: String(amountTon),
        description: `Пополнение баланса GuseBank (ID: ${userId})`,
        hidden_message: 'Оплата успешно принята в GuseBank!',
        payload: JSON.stringify({ userId, amountTon }),
        allow_comments: false,
        expires_in: 3600,
      }),
    });

    const data = (await response.json()) as CryptoBotInvoiceResponse;

    if (!data.ok || !data.result) {
      return res.status(400).json({ error: data.error?.name || 'Ошибка создания счёта в CryptoBot' });
    }

    const payUrl = data.result.bot_invoice_url || data.result.mini_app_invoice_url || data.result.pay_url;
    return res.status(200).json({ invoiceUrl: payUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown network error';
    return res.status(500).json({ error: msg });
  }
}
