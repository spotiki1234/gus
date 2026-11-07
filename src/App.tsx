import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';

interface TgUser {
  id: number;
  first_name: string;
  username?: string;
}

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  initDataUnsafe?: {
    user?: TgUser;
  };
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

interface GiftItem {
  id: number;
  title: string;
  price_stars: number;
  price_ton: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  image: string;
}

const CATALOG: GiftItem[] = [
  { id: 1, title: 'Зелёное Сердце', price_stars: 50, price_ton: 0.5, rarity: 'common', image: '💚' },
  { id: 2, title: 'Плюшевый Мишка', price_stars: 150, price_ton: 1.5, rarity: 'rare', image: '🧸' },
  { id: 3, title: 'Золотой Гусь', price_stars: 500, price_ton: 5.0, rarity: 'epic', image: '🪿' },
  { id: 4, title: 'Корона Императора', price_stars: 1500, price_ton: 15.0, rarity: 'legendary', image: '👑' },
];

export default function App() {
  // Получаем пользователя Telegram сразу при инициализации
  const [tgUser] = useState<TgUser>(() => {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || { first_name: 'Игрок', id: 777 };
  });

  const [balanceStars, setBalanceStars] = useState(250);
  const [balanceTon] = useState(1.25);

  const [inventory, setInventory] = useState<GiftItem[]>([
    { id: 101, title: 'Зелёное Сердце', price_stars: 50, price_ton: 0.5, rarity: 'common', image: '💚' },
    { id: 102, title: 'Плюшевый Мишка', price_stars: 150, price_ton: 1.5, rarity: 'rare', image: '🧸' },
  ]);

  const [selectedSource, setSelectedSource] = useState<GiftItem | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<GiftItem | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);


  const calculateChance = (): number => {
    if (!selectedSource || !selectedTarget) return 0;
    if (selectedSource.price_stars >= selectedTarget.price_stars) return 0;
    const raw = (selectedSource.price_stars / selectedTarget.price_stars) * 0.95 * 100;
    return Math.min(Math.max(Number(raw.toFixed(1)), 1), 85);
  };

  const chance = calculateChance();

  const handleUpgrade = () => {
    if (!selectedSource || !selectedTarget || isSpinning || chance <= 0) return;

    const tg = window.Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred('medium');

    setIsSpinning(true);
    setMessage(null);

    setTimeout(() => {
      const roll = Math.random() * 100;
      const isWin = roll < chance;

      setIsSpinning(false);

      if (isWin) {
        tg?.HapticFeedback?.notificationOccurred('success');
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        setMessage(`🎉 УСПЕХ! Вы получили ${selectedTarget.title}!`);

        setInventory((prev) => [
          ...prev.filter((item) => item.id !== selectedSource.id),
          { ...selectedTarget, id: Date.now() },
        ]);
        setSelectedSource(null);
        setSelectedTarget(null);
      } else {
        tg?.HapticFeedback?.notificationOccurred('error');
        setMessage('💥 НЕУДАЧА! Подарок сгорел.');
        setInventory((prev) => prev.filter((item) => item.id !== selectedSource.id));
        setSelectedSource(null);
      }
    }, 2500);
  };

  // Продажа подарка за Stars
  const handleSell = (item: GiftItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const sellPrice = Math.floor(item.price_stars * 0.9); // Выкуп за 90% стоимости
    setBalanceStars((prev) => prev + sellPrice);
    setInventory((prev) => prev.filter((i) => i.id !== item.id));
    if (selectedSource?.id === item.id) setSelectedSource(null);
    setMessage(`💰 Вы продали ${item.title} за +${sellPrice} Stars!`);
  };

  // Вывод подарка на аккаунт
  const handleWithdraw = (item: GiftItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setInventory((prev) => prev.filter((i) => i.id !== item.id));
    if (selectedSource?.id === item.id) setSelectedSource(null);
    setMessage(`📦 Запрос на вывод ${item.title} принят! @GuseBank отправит его вам в ЛС.`);
  };

  return (
    <div style={{ padding: '16px', maxWidth: '480px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Профиль игрока */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          background: '#1e293b',
          padding: '12px 16px',
          borderRadius: '12px',
        }}
      >
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{tgUser.first_name}</div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Хранилище: @GuseBank</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#fbbf24', fontWeight: 'bold' }}>⭐ {balanceStars} Stars</div>
          <div style={{ color: '#38bdf8', fontSize: '13px' }}>💎 {balanceTon.toFixed(2)} TON</div>
        </div>
      </div>

      {/* Арена апгрейда */}
      <div
        style={{
          background: '#1e293b',
          borderRadius: '16px',
          padding: '16px',
          marginBottom: '24px',
          textAlign: 'center',
          border: '1px solid #334155',
        }}
      >
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Арена Апгрейда</h3>

        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '20px' }}>
          {/* Исходный подарок */}
          <div
            style={{
              width: '100px',
              height: '110px',
              background: '#0f172a',
              borderRadius: '12px',
              border: selectedSource ? '2px solid #38bdf8' : '2px dashed #475569',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selectedSource ? (
              <>
                <span style={{ fontSize: '32px' }}>{selectedSource.image}</span>
                <span style={{ fontSize: '11px', marginTop: '4px', fontWeight: 'bold' }}>
                  {selectedSource.price_stars} ⭐
                </span>
              </>
            ) : (
              <span style={{ fontSize: '12px', color: '#64748b' }}>Выберите свой</span>
            )}
          </div>

          {/* Индикатор шанса */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: chance > 0 ? '#4ade80' : '#64748b' }}>
              {chance}%
            </div>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>шанс успеха</span>
          </div>

          {/* Целевой подарок */}
          <div
            style={{
              width: '100px',
              height: '110px',
              background: '#0f172a',
              borderRadius: '12px',
              border: selectedTarget ? '2px solid #a855f7' : '2px dashed #475569',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selectedTarget ? (
              <>
                <span style={{ fontSize: '32px' }}>{selectedTarget.image}</span>
                <span style={{ fontSize: '11px', marginTop: '4px', fontWeight: 'bold' }}>
                  {selectedTarget.price_stars} ⭐
                </span>
              </>
            ) : (
              <span style={{ fontSize: '12px', color: '#64748b' }}>Цель</span>
            )}
          </div>
        </div>

        {message && (
          <div
            style={{
              marginBottom: '14px',
              fontWeight: 'bold',
              color: message.includes('УСПЕХ') || message.includes('продали') ? '#4ade80' : '#f87171',
            }}
          >
            {message}
          </div>
        )}

        {/* Кнопка запуска */}
        <button
          onClick={handleUpgrade}
          disabled={!selectedSource || !selectedTarget || isSpinning || chance <= 0}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            background: isSpinning
              ? '#475569'
              : !selectedSource || !selectedTarget
              ? '#334155'
              : 'linear-gradient(90deg, #38bdf8, #818cf8)',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '16px',
            cursor: !selectedSource || !selectedTarget || isSpinning ? 'not-allowed' : 'pointer',
          }}
        >
          {isSpinning ? 'Апгрейд выполняется...' : 'УЛУЧШИТЬ ПОДАРОК'}
        </button>
      </div>

      {/* Каталог целей для апгрейда */}
      <h4 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>🎯 Выберите желаемый подарок:</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '24px' }}>
        {CATALOG.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedTarget(item)}
            style={{
              background: selectedTarget?.id === item.id ? '#312e81' : '#1e293b',
              border: selectedTarget?.id === item.id ? '1px solid #818cf8' : '1px solid #334155',
              padding: '10px 4px',
              borderRadius: '10px',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '24px' }}>{item.image}</div>
            <div style={{ fontSize: '11px', marginTop: '4px', fontWeight: 'bold' }}>{item.price_stars} ⭐</div>
          </div>
        ))}
      </div>

      {/* Инвентарь игрока */}
      <h4 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>🎒 Ваш инвентарь ({inventory.length}):</h4>
      {inventory.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', background: '#1e293b', borderRadius: '12px', color: '#64748b' }}>
          Инвентарь пуст. Переведите подарок на <b>@GuseBank</b> для пополнения!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          {inventory.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedSource(item)}
              style={{
                background: selectedSource?.id === item.id ? '#0f766e' : '#1e293b',
                border: selectedSource?.id === item.id ? '1px solid #2dd4bf' : '1px solid #334155',
                padding: '12px',
                borderRadius: '12px',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '32px' }}>{item.image}</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginTop: '6px' }}>{item.title}</div>
              <div style={{ fontSize: '12px', color: '#fbbf24', marginTop: '2px' }}>
                {item.price_stars} ⭐ / {item.price_ton} TON
              </div>

              {/* Кнопки действий: Продать и Вывести */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                <button
                  onClick={(e) => handleSell(item, e)}
                  style={{
                    flex: 1,
                    fontSize: '11px',
                    padding: '6px 2px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#eab308',
                    color: '#000',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Продать
                </button>
                <button
                  onClick={(e) => handleWithdraw(item, e)}
                  style={{
                    flex: 1,
                    fontSize: '11px',
                    padding: '6px 2px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#334155',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Вывести
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}