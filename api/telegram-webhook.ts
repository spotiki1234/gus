interface PreCheckoutQuery {
  id: string;
  from: { id: number };
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
}

interface TelegramUpdate {
  update_id: number;
  pre_checkout_query?: PreCheckoutQuery;
  message?: {
    from?: { id: number };
    successful_payment?: SuccessfulPayment;
  };
}

interface VercelRequest {
  method?: string;
  body: TelegramUpdate;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  send: (body: string) => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    return res.status(500).send('BOT_TOKEN missing');
  }

  const update = req.body;

  // 1. ОБЯЗАТЕЛЬНОЕ ПОДТВЕРЖДЕНИЕ PRE_CHECKOUT_QUERY (убирает бесконечную загрузку!)
  if (update.pre_checkout_query) {
    const queryId = update.pre_checkout_query.id;

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: queryId,
          ok: true, // Подтверждаем транзакцию!
        }),
      });
    } catch (e) {
      console.error('Ошибка подтверждения pre_checkout:', e);
    }

    return res.status(200).send('OK');
  }

  // 2. УСПЕШНЫЙ ПЛАТЁЖ (Telegram списал звёзды)
  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
    console.log(`⭐️ Успешно оплачено ${payment.total_amount} Stars! Payload:`, payment.invoice_payload);
    return res.status(200).send('OK');
  }

  return res.status(200).send('OK');
}
