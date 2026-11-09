import { Telegraf, Markup } from 'telegraf';


const BOT_TOKEN = process.env.BOT_TOKEN || '';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://gus-delta-one.vercel.app/'; // ваш домен Vercel

export const bot = new Telegraf(BOT_TOKEN);

bot.command('start', async (ctx) => {
  const welcomeText = 
`Привет! <tg-emoji emoji-id="5413694143601842851">👋</tg-emoji>

Канал: @GuseUpChannel
Пополнить подарками: @GuseBank

Нажмите ниже, чтобы улучшить свой подарок <tg-emoji emoji-id="5188481279963715781">🚀</tg-emoji>`;

  await ctx.reply(welcomeText, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.webApp('🚀 Улучшить подарок', WEB_APP_URL)],
      [
        Markup.button.url('📢 Канал', 'https://t.me/GuseUpChannel'),
        Markup.button.url('🏦 Банк', 'https://t.me/GuseBank')
      ]
    ])
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {

  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Bot update error:', err);
      return res.status(500).json({ error: 'Failed to process update' });
    }
  }
  return res.status(200).send('Bot webhook is active');
}
