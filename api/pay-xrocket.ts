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

interface XRocketInvoiceResponse {
  success: boolean;
  data?: {
    id: number;
    link: string;
  };
  message?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { amountTon, userId } = req.body || {};
  const apiKey = process.env.XROCKET_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'XROCKET_API_KEY не задан в Vercel Settings' });
  }

  if (!amountTon || amountTon <= 0) {
    return res.status(400).json({ error: 'Некорректная сумма пополнения' });
  }

  try {
    const response = await fetch('https://pay.ton-rocket.com/tg-invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Rocket-Pay-Key': apiKey,
      },
      body: JSON.stringify({
        amount: Number(amountTon),
        currency: 'TON',
        description: `Депозит GuseBank #${userId}`,
        hidden: false,
        callbackUrl: 'https://gus-delta-one.vercel.app/api/crypto-webhook',
        payload: JSON.stringify({ userId, amountTon }),
      }),
    });

    const data = (await response.json()) as XRocketInvoiceResponse;

    if (!data.success || !data.data) {
      return res.status(400).json({ error: data.message || 'Ошибка создания счёта в xRocket' });
    }

    return res.status(200).json({ invoiceUrl: data.data.link });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown network error';
    return res.status(500).json({ error: msg });
  }
}
