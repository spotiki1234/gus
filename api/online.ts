import type { IncomingMessage, ServerResponse } from 'http';

interface ApiRequest extends IncomingMessage {
  body?: { userId?: number | string };
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse extends ServerResponse {
  status: (statusCode: number) => ApiResponse;
  json: (data: unknown) => void;
}

// Карта активности: ключ пользователя -> timestamp последнего пинга
const activeUsers = new Map<string, number>();

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const now = Date.now();
  const WINDOW_MS = 60 * 1000; // Пользователь считается онлайн 60 секунд после пинга

  // Очищаем тех, кто вышел больше минуты назад
  for (const [id, lastSeen] of activeUsers.entries()) {
    if (now - lastSeen > WINDOW_MS) {
      activeUsers.delete(id);
    }
  }

  // Если прилетел POST с userId — продлеваем активность
  if (req.method === 'POST') {
    const userId = req.body?.userId;
    const clientKey = String(userId || req.headers['x-forwarded-for'] || 'guest');
    activeUsers.set(clientKey, now);
  }

  const count = Math.max(1, activeUsers.size);

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(200).json({ online: count });
  } else {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ online: count }));
  }
}
