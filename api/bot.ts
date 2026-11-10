import { Telegraf, Markup } from 'telegraf';

const BOT_TOKEN = process.env.BOT_TOKEN || '9272174063:AAE6GVLKvcSZ0k8MpLm1bocgkLekwFGiYeM';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://gus-delta-one.vercel.app';

export const bot = new Telegraf(BOT_TOKEN);

bot.command('start', async (ctx) => {
  const welcomeText = 
`Привет! <tg-emoji emoji-id="5413694143601842851">👋</tg-emoji>

Канал: @GuseUpChannel
Пополнить подарками: @GuseBank

Нажмите ниже, чтобы улучшить свой подарок <tg-emoji emoji-id="5188481279963715781">🚀</tg-emoji>`;

  try {
    await ctx.reply(welcomeText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 Улучшить подарок', WEB_APP_URL)],
      ])
    });
  } catch (err) {
    console.error('Ошибка отправки /start:', err);
  }
});

interface RequestLike {
  method?: string;
  body?: unknown;
}

interface ResponseLike {
  status: (code: number) => {
    json: (data: unknown) => void;
    send: (data: string) => void;
  };
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method === 'GET') {
    return res.status(200).send('Bot webhook is alive and ready!');
  }

  if (req.method === 'POST') {
    try {
      if (!BOT_TOKEN) {
        return res.status(500).json({ error: 'BOT_TOKEN is missing' });
      }

      await bot.handleUpdate(req.body as Parameters<typeof bot.handleUpdate>[0]);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Bot update error:', err);
      return res.status(500).json({ error: 'Failed to process update' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
