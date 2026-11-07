import React, { useState, useEffect } from 'react';
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
  openInvoice?: (url: string, callback: (status: string) => void) => void;
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
  { id: 5, title: 'Кубок Чемпиона', price_stars: 3500, price_ton: 35.0, rarity: 'legendary', image: '🏆' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'upgrade' | 'shop' | 'wallet'>('upgrade');
  
  const [tgUser] = useState<TgUser>(() => {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || { first_name: 'Игрок', id: 777 };
  });

  const [balanceStars, setBalanceStars] = useState(250);
  const [balanceTon, setBalanceTon] = useState(1.25);

  const [inventory, setInventory] = useState<GiftItem[]>([
    { id: 101, title: 'Зелёное Сердце', price_stars: 50, price_ton: 0.5, rarity: 'common', image: '💚' },
    { id: 102, title: 'Плюшевый Мишка', price_stars: 150, price_ton: 1.5, rarity: 'rare', image: '🧸' },
  ]);

  const [selectedSource, setSelectedSource] = useState<GiftItem | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<GiftItem | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  // Расчет шанса победы (5% комиссия сервиса)
  const calculateChance = (): number => {
    if (!selectedSource || !selectedTarget) return 0;
    if (selectedSource.price_stars >= selectedTarget.price_stars) return 0;
    const raw = (selectedSource.price_stars / selectedTarget.price_stars) * 0.95 * 100;
    return Math.min(Math.max(Number(raw.toFixed(1)), 1), 85);
  };

  const chance = calculateChance();

  // Запуск рулетки апгрейда
  const handleUpgrade = () => {
    if (!selectedSource || !selectedTarget || isSpinning || chance <= 0) return;

    const tg = window.Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred('medium');

    setIsSpinning(true);
    setMessage(null);

    // Определяем победу по честной вероятности
    const roll = Math.random() * 100;
    const isWin = roll < chance;

    // Рассчитываем финальный угол стрелки:
    // Выигрышный сектор: от 0° до (chance * 3.6)°
    // Проигрышный сектор: от (chance * 3.6)° до 360°
    const winMaxAngle = chance * 3.6;
    let targetAngle = 0;
    if (isWin) {
      targetAngle = Math.random() * (winMaxAngle - 4) + 2;
    } else {
      targetAngle = Math.random() * (356 - winMaxAngle) + winMaxAngle + 2;
    }

    // Делаем 5 полных оборотов + сектор
    const totalSpins = 360 * 5;
    const finalRotation = wheelRotation + totalSpins + (360 - (wheelRotation % 360)) + targetAngle;
    setWheelRotation(finalRotation);

    setTimeout(() => {
      setIsSpinning(false);

      if (isWin) {
        tg?.HapticFeedback?.notificationOccurred('success');
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        setMessage(`🎉 УСПЕХ! Вы выиграли ${selectedTarget.title}!`);

        setInventory((prev) => [
          ...prev.filter((item) => item.id !== selectedSource.id),
          { ...selectedTarget, id: Date.now() },
        ]);
        setSelectedSource(null);
        setSelectedTarget(null);
      } else {
        tg?.HapticFeedback?.notificationOccurred('error');
        setMessage('💥 НЕУДАЧА! Предмет сгорел.');
        setInventory((prev) => prev.filter((item) => item.id !== selectedSource.id));
        setSelectedSource(null);
      }
    }, 3200);
  };

  // Продажа предмета сервису
  const handleSell = (item: GiftItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const sellPrice = Math.floor(item.price_stars * 0.9);
    setBalanceStars((prev) => prev + sellPrice);
    setInventory((prev) => prev.filter((i) => i.id !== item.id));
    if (selectedSource?.id === item.id) setSelectedSource(null);
    setMessage(`💰 Вы продали ${item.title} за +${sellPrice} Stars!`);
  };

  // Запрос на вывод
  const handleWithdraw = (item: GiftItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setInventory((prev) => prev.filter((i) => i.id !== item.id));
    if (selectedSource?.id === item.id) setSelectedSource(null);
    setMessage(`📦 Запрос на вывод ${item.title} принят! @GuseBank отправит его вам в ЛС.`);
  };

  // Покупка предмета в магазине
  const handleBuyItem = (item: GiftItem) => {
    if (balanceStars < item.price_stars) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning');
      setMessage('❌ Недостаточно Stars для покупки. Пополните баланс!');
      return;
    }
    setBalanceStars((prev) => prev - item.price_stars);
    setInventory((prev) => [...prev, { ...item, id: Date.now() }]);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    setMessage(`✅ Вы успешно купили ${item.title}! Подарок добавлен в инвентарь.`);
  };

  // Симуляция пополнения Stars
  const handleDepositStars = (amount: number) => {
    setBalanceStars((prev) => prev + amount);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    setMessage(`⭐ Баланс пополнен на +${amount} Stars!`);
  };

  return (
    <div style={{ padding: '16px', maxWidth: '480px', margin: '0 auto', paddingBottom: '70px', minHeight: '100vh', boxSizing: 'border-box' }}>
      {/* Профиль игрока */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          background: '#1e293b',
          padding: '12px 16px',
          borderRadius: '14px',
          border: '1px solid #334155',
        }}
      >
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{tgUser.first_name}</div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Хранилище: @GuseBank</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '15px' }}>⭐ {balanceStars}</div>
          <div style={{ color: '#38bdf8', fontSize: '13px' }}>💎 {balanceTon.toFixed(2)} TON</div>
        </div>
      </div>

      {/* Сообщение об операции */}
      {message && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 'bold',
            textAlign: 'center',
            background: message.includes('УСПЕХ') || message.includes('купили') || message.includes('пополнен') || message.includes('продали')
              ? 'rgba(34, 197, 94, 0.15)'
              : 'rgba(239, 68, 68, 0.15)',
            color: message.includes('УСПЕХ') || message.includes('купили') || message.includes('пополнен') || message.includes('продали')
              ? '#4ade80'
              : '#f87171',
            border: `1px solid ${message.includes('УСПЕХ') || message.includes('купили') || message.includes('пополнен') ? '#22c55e' : '#ef4444'}`,
          }}
        >
          {message}
        </div>
      )}

      {/* ВКЛАДКА 1: АРЕНА АПГРЕЙДА */}
      {activeTab === 'upgrade' && (
        <div>
          <div
            style={{
              background: '#1e293b',
              borderRadius: '18px',
              padding: '16px',
              marginBottom: '20px',
              textAlign: 'center',
              border: '1px solid #334155',
            }}
          >
            <h3 style={{ margin: '0 0 14px 0', fontSize: '17px' }}>Арена Апгрейда</h3>

            {/* Колесо / Рулетка вероятности */}
            <div style={{ position: 'relative', width: '140px', height: '140px', margin: '0 auto 16px auto' }}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: chance > 0
                    ? `conic-gradient(#22c55e 0% ${chance}%, #334155 ${chance}% 100%)`
                    : '#334155',
                  boxShadow: '0 0 15px rgba(0,0,0,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    background: '#0f172a',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: chance > 0 ? '#4ade80' : '#64748b' }}>
                    {chance}%
                  </div>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>ШАНС</span>
                </div>
              </div>

              {/* Стрелка спиннера */}
              <div
                style={{
                  position: 'absolute',
                  top: '0',
                  left: '0',
                  width: '100%',
                  height: '100%',
                  transform: `rotate(${wheelRotation}deg)`,
                  transition: isSpinning ? 'transform 3s cubic-bezier(0.15, 0.9, 0.25, 1)' : 'none',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    width: '4px',
                    height: '24px',
                    background: '#fbbf24',
                    margin: '0 auto',
                    borderRadius: '2px',
                    boxShadow: '0 0 8px #fbbf24',
                  }}
                />
              </div>
            </div>

            {/* Слоты предметов */}
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '16px' }}>
              <div
                style={{
                  width: '95px',
                  height: '105px',
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
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Ваш подарок</span>
                )}
              </div>

              <div style={{ fontSize: '22px', color: '#94a3b8' }}>➔</div>

              <div
                style={{
                  width: '95px',
                  height: '105px',
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
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Цель</span>
                )}
              </div>
            </div>

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
                fontSize: '15px',
                cursor: !selectedSource || !selectedTarget || isSpinning ? 'not-allowed' : 'pointer',
              }}
            >
              {isSpinning ? 'Крутим рулетку...' : 'УЛУЧШИТЬ ПОДАРОК'}
            </button>
          </div>

          {/* Быстрый выбор цели */}
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>🎯 Выберите цель для апгрейда:</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '20px' }}>
            {CATALOG.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedTarget(item)}
                style={{
                  background: selectedTarget?.id === item.id ? '#312e81' : '#1e293b',
                  border: selectedTarget?.id === item.id ? '1px solid #818cf8' : '1px solid #334155',
                  padding: '8px 2px',
                  borderRadius: '10px',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '22px' }}>{item.image}</div>
                <div style={{ fontSize: '10px', marginTop: '4px', fontWeight: 'bold' }}>{item.price_stars} ⭐</div>
              </div>
            ))}
          </div>

          {/* Инвентарь */}
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>🎒 Инвентарь ({inventory.length}):</h4>
          {inventory.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', background: '#1e293b', borderRadius: '12px', color: '#64748b' }}>
              Инвентарь пуст. Купите подарок в Магазине или переведите на <b>@GuseBank</b>!
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
      )}

      {/* ВКЛАДКА 2: МАГАЗИН */}
      {activeTab === 'shop' && (
        <div>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '17px' }}>🏪 Магазин подарков</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {CATALOG.map((item) => (
              <div
                key={item.id}
                style={{
                  background: '#1e293b',
                  borderRadius: '14px',
                  padding: '14px',
                  textAlign: 'center',
                  border: '1px solid #334155',
                }}
              >
                <div style={{ fontSize: '40px' }}>{item.image}</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '8px' }}>{item.title}</div>
                <div style={{ fontSize: '13px', color: '#fbbf24', fontWeight: 'bold', margin: '4px 0 12px 0' }}>
                  {item.price_stars} ⭐ / {item.price_ton} TON
                </div>
                <button
                  onClick={() => handleBuyItem(item)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#22c55e',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Купить
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ВКЛАДКА 3: КОШЕЛЕК И ДЕПОЗИТ */}
      {activeTab === 'wallet' && (
        <div>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '17px' }}>💳 Баланс и Пополнение</h3>
          
          <div style={{ background: '#1e293b', borderRadius: '14px', padding: '16px', marginBottom: '16px', border: '1px solid #334155' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>⭐ Пополнить Telegram Stars</h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[100, 250, 500, 1000].map((val) => (
                <button
                  key={val}
                  onClick={() => handleDepositStars(val)}
                  style={{
                    flex: 1,
                    padding: '10px 4px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#eab308',
                    color: '#000',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  +{val} ⭐
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: '#1e293b', borderRadius: '14px', padding: '16px', border: '1px solid #334155' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>💎 TON Connect (Кошелек)</h4>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px 0' }}>
              Подключите Tonkeeper или Telegram Wallet для прямого вывода NFT и TON.
            </p>
            <button
              onClick={() => {
                setBalanceTon((prev) => prev + 1.0);
                setMessage('💎 Кошелек успешно подключен (+1.0 TON тестовый депозит)!');
              }}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                background: '#0284c7',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Подключить TON Кошелек
            </button>
          </div>
        </div>
      )}

      {/* НИЖНЯЯ ПАНЕЛЬ НАВИГАЦИИ (ТАБЫ) */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#0f172a',
          borderTop: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-around',
          padding: '10px 0',
          maxWidth: '480px',
          margin: '0 auto',
        }}
      >
        <button
          onClick={() => setActiveTab('upgrade')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'upgrade' ? '#38bdf8' : '#64748b',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '18px' }}>🎮</span>
          Апгрейд
        </button>

        <button
          onClick={() => setActiveTab('shop')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'shop' ? '#38bdf8' : '#64748b',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '18px' }}>🏪</span>
          Магазин
        </button>

        <button
          onClick={() => setActiveTab('wallet')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'wallet' ? '#38bdf8' : '#64748b',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '18px' }}>💳</span>
          Касса
        </button>
      </div>
    </div>
  );
}
