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
  initDataUnsafe?: { user?: TgUser };
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  };
  openTelegramLink?: (url: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

// Модель подарка банка с уникальным номером, моделью и паттерном
interface BankGift {
  id: number;
  serialNumber: string; // например #3417
  title: string;
  model: string;
  priceTon: number;
  priceStars: number;
  pattern: string;
  bgGradient: string;
  image: string;
}

// Реальный пул подарков, лежащих в @GuseBank
const INITIAL_BANK_VAULT: BankGift[] = [
  { id: 1, serialNumber: '#3417', title: 'Resistance Dog', model: 'Amethyst', priceTon: 795.6, priceStars: 7950, pattern: 'Crystal', bgGradient: 'linear-gradient(180deg, #8b5cf6 0%, #4c1d95 100%)', image: '🟣🐶' },
  { id: 2, serialNumber: '#9595', title: 'Resistance Dog', model: 'Amber', priceTon: 795.6, priceStars: 7950, pattern: 'Fire', bgGradient: 'linear-gradient(180deg, #f97316 0%, #7c2d12 100%)', image: '🟠🐶' },
  { id: 3, serialNumber: '#9707', title: 'Resistance Dog', model: 'Topaz', priceTon: 795.6, priceStars: 7950, pattern: 'Sun', bgGradient: 'linear-gradient(180deg, #eab308 0%, #713f12 100%)', image: '🟡🐶' },
  { id: 4, serialNumber: '#5078', title: 'Resistance Dog', model: 'Shadow', priceTon: 789.9, priceStars: 7890, pattern: 'Cyber', bgGradient: 'linear-gradient(180deg, #334155 0%, #0f172a 100%)', image: '⚫🐶' },
  { id: 5, serialNumber: '#8052', title: 'Resistance Dog', model: 'Magma', priceTon: 780.0, priceStars: 7800, pattern: 'Volcano', bgGradient: 'linear-gradient(180deg, #ea580c 0%, #431407 100%)', image: '🔥🐶' },
  { id: 6, serialNumber: '#12060', title: 'Resistance Dog', model: 'Sakura Pink', priceTon: 765.0, priceStars: 7650, pattern: 'Heart', bgGradient: 'linear-gradient(180deg, #ec4899 0%, #831843 100%)', image: '🌸🐶' },
  { id: 7, serialNumber: '#101', title: 'Plush Pepe', model: 'Original', priceTon: 5.5, priceStars: 55, pattern: 'Classic', bgGradient: 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)', image: '🐸' },
  { id: 8, serialNumber: '#404', title: 'Golden Goose', model: 'Exclusive', priceTon: 25.0, priceStars: 250, pattern: 'Imperial', bgGradient: 'linear-gradient(180deg, #f59e0b 0%, #78350f 100%)', image: '🪿' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'upgrade' | 'shop' | 'inventory'>('upgrade');
  const [tgUser] = useState<TgUser>(() => window.Telegram?.WebApp?.initDataUnsafe?.user || { first_name: 'skvirtik', id: 777 });

  const [balanceTon, setBalanceTon] = useState(2.25);
  const [balanceStars, setBalanceStars] = useState(350);

  // Банковские подарки и инвентарь игрока
  const [bankVault] = useState<BankGift[]>(INITIAL_BANK_VAULT);
  const [userInventory, setUserInventory] = useState<BankGift[]>([
    INITIAL_BANK_VAULT[6], // Стартовый Plush Pepe #101
  ]);

  // Выбор для апгрейда
  const [selectedSource, setSelectedSource] = useState<BankGift | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<BankGift | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinAngle, setSpinAngle] = useState(0);

  // Состояния для пополнения (BottomSheet)
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositStep, setDepositStep] = useState<'methods' | 'stars' | 'wallet' | 'gifts'>('methods');
  const [starsToBuy, setStarsToBuy] = useState(100);

  // Фильтры магазина
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  // Расчет шанса победы с учетом маржи 5%
  const calculateChance = () => {
    if (!selectedSource || !selectedTarget) return 0;
    if (selectedSource.priceTon >= selectedTarget.priceTon) return 0;
    const raw = (selectedSource.priceTon / selectedTarget.priceTon) * 0.95 * 100;
    return Math.min(Math.max(Number(raw.toFixed(2)), 1.0), 85.0);
  };

  const chance = calculateChance();

  // Анимация рулетки апгрейда
  const handleUpgrade = () => {
    if (!selectedSource || !selectedTarget || isSpinning || chance <= 0) return;

    const tg = window.Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred('heavy');
    setIsSpinning(true);

    const roll = Math.random() * 100;
    const isWin = roll < chance;

    // Угол остановки стрелки
    const winMaxAngle = chance * 3.6;
    const stopAngle = isWin ? Math.random() * winMaxAngle : winMaxAngle + Math.random() * (360 - winMaxAngle);
    const totalRotation = spinAngle + 360 * 5 + (360 - (spinAngle % 360)) + stopAngle;
    setSpinAngle(totalRotation);

    setTimeout(() => {
      setIsSpinning(false);
      if (isWin) {
        tg?.HapticFeedback?.notificationOccurred('success');
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } });
        setUserInventory((prev) => [
          ...prev.filter((i) => i.id !== selectedSource.id),
          { ...selectedTarget, id: Date.now() },
        ]);
        setSelectedSource(null);
        setSelectedTarget(null);
      } else {
        tg?.HapticFeedback?.notificationOccurred('error');
        setUserInventory((prev) => prev.filter((i) => i.id !== selectedSource.id));
        setSelectedSource(null);
      }
    }, 3200);
  };

  // Покупка из хранилища банка
  const handleBuyFromBank = (gift: BankGift) => {
    if (balanceTon < gift.priceTon) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning');
      setIsDepositOpen(true);
      return;
    }
    setBalanceTon((prev) => Number((prev - gift.priceTon).toFixed(2)));
    setUserInventory((prev) => [...prev, { ...gift, id: Date.now() }]);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    confetti({ particleCount: 50, spread: 60 });
  };

  return (
    <div style={{ backgroundColor: '#090514', color: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', paddingBottom: '90px' }}>
      {/* Шапка приложения */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#120d24', borderBottom: '1px solid #23193d' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #a855f7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
            {tgUser.first_name[0]}
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px' }}>{tgUser.first_name}</div>
            <div style={{ fontSize: '11px', color: '#9333ea', fontWeight: '600' }}>Хранилище @GuseBank</div>
          </div>
        </div>

        {/* Плашка баланса с кнопкой плюс */}
        <div onClick={() => { setIsDepositOpen(true); setDepositStep('methods'); }} style={{ background: '#1d1538', border: '1px solid #3b2d6b', borderRadius: '24px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#0098ea' }}>💎 {balanceTon.toFixed(2)} TON</div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#fbbf24' }}>⭐ {balanceStars} Stars</div>
          </div>
          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#eab308', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '14px' }}>+</div>
        </div>
      </div>

      {/* Верхний переключатель "Мои подарки / Магазин" (как на скриншоте 1) */}
      <div style={{ padding: '16px 20px 8px 20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => setActiveTab('inventory')}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '20px',
            border: 'none',
            fontWeight: '700',
            fontSize: '14px',
            background: activeTab === 'inventory' ? '#eab308' : '#171126',
            color: activeTab === 'inventory' ? '#000' : '#8b7fa8',
            cursor: 'pointer',
          }}
        >
          Мои подарки ({userInventory.length})
        </button>
        <button
          onClick={() => setActiveTab('shop')}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '20px',
            border: 'none',
            fontWeight: '700',
            fontSize: '14px',
            background: activeTab === 'shop' ? '#eab308' : '#171126',
            color: activeTab === 'shop' ? '#000' : '#8b7fa8',
            cursor: 'pointer',
          }}
        >
          Магазин
        </button>
      </div>

      {/* КОНТЕНТ: АРЕНА АПГРЕЙДА */}
      {activeTab === 'upgrade' && (
        <div style={{ padding: '10px 20px' }}>
          <div style={{ background: '#130e24', borderRadius: '28px', border: '1px solid #271c47', padding: '24px 16px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800', letterSpacing: '0.5px' }}>Арена Апгрейда</h3>

            {/* Круговая рулетка в стиле CS:GO / Major */}
            <div style={{ position: 'relative', width: '160px', height: '160px', margin: '0 auto 20px auto' }}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: chance > 0 ? `conic-gradient(#a855f7 0% ${chance}%, #1f1738 ${chance}% 100%)` : '#1f1738',
                  boxShadow: '0 0 24px rgba(168, 85, 247, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: '116px', height: '116px', borderRadius: '50%', background: '#090514', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: chance > 0 ? '#c084fc' : '#5b4d7a' }}>{chance}%</div>
                  <span style={{ fontSize: '10px', color: '#8b7fa8', fontWeight: '600' }}>ШАНС УСПЕХА</span>
                </div>
              </div>

              {/* Стрелка бегунка */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  transform: `rotate(${spinAngle}deg)`,
                  transition: isSpinning ? 'transform 3.2s cubic-bezier(0.12, 0.8, 0.2, 1)' : 'none',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ width: '4px', height: '24px', background: '#eab308', margin: '0 auto', borderRadius: '4px', boxShadow: '0 0 12px #eab308' }} />
              </div>
            </div>

            {/* Ячейки апгрейда */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <div
                onClick={() => setActiveTab('inventory')}
                style={{
                  width: '120px',
                  height: '140px',
                  borderRadius: '22px',
                  background: selectedSource ? selectedSource.bgGradient : '#171126',
                  border: selectedSource ? '2px solid #a855f7' : '2px dashed #3a2b61',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: '8px',
                }}
              >
                {selectedSource ? (
                  <>
                    <span style={{ fontSize: '38px' }}>{selectedSource.image}</span>
                    <span style={{ fontSize: '12px', fontWeight: '800', marginTop: '6px' }}>{selectedSource.model}</span>
                    <span style={{ fontSize: '10px', color: '#cbd5e1' }}>{selectedSource.serialNumber}</span>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', color: '#8b7fa8', fontWeight: '600' }}>+ Выбрать свой</span>
                )}
              </div>

              <div style={{ fontSize: '20px', color: '#8b7fa8', fontWeight: '900' }}>➔</div>

              <div
                onClick={() => setActiveTab('shop')}
                style={{
                  width: '120px',
                  height: '140px',
                  borderRadius: '22px',
                  background: selectedTarget ? selectedTarget.bgGradient : '#171126',
                  border: selectedTarget ? '2px solid #eab308' : '2px dashed #3a2b61',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: '8px',
                }}
              >
                {selectedTarget ? (
                  <>
                    <span style={{ fontSize: '38px' }}>{selectedTarget.image}</span>
                    <span style={{ fontSize: '12px', fontWeight: '800', marginTop: '6px' }}>{selectedTarget.model}</span>
                    <span style={{ fontSize: '10px', color: '#cbd5e1' }}>{selectedTarget.serialNumber}</span>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', color: '#8b7fa8', fontWeight: '600' }}>+ Цель банка</span>
                )}
              </div>
            </div>

            <button
              onClick={handleUpgrade}
              disabled={!selectedSource || !selectedTarget || isSpinning || chance <= 0}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '20px',
                border: 'none',
                background: isSpinning
                  ? '#3b2d6b'
                  : !selectedSource || !selectedTarget
                  ? '#231a3b'
                  : 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                color: '#fff',
                fontSize: '16px',
                fontWeight: '800',
                letterSpacing: '0.5px',
                boxShadow: selectedSource && selectedTarget ? '0 4px 20px rgba(168, 85, 247, 0.4)' : 'none',
                cursor: !selectedSource || !selectedTarget || isSpinning ? 'not-allowed' : 'pointer',
              }}
            >
              {isSpinning ? 'КРУТИМ РУЛЕТКУ...' : 'УЛУЧШИТЬ ПОДАРОК'}
            </button>
          </div>
        </div>
      )}

      {/* КОНТЕНТ: МАГАЗИН (Витрина банка как на скриншоте 1) */}
      {activeTab === 'shop' && (
        <div style={{ padding: '10px 20px' }}>
          {/* Поиск и фильтры */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              type="text"
              placeholder="Поиск по названию или номеру..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                background: '#171126',
                border: '1px solid #271c47',
                borderRadius: '16px',
                padding: '12px 16px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* Сетка карточек по 3 в ряд (точь-в-точь как на скриншоте 1) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {bankVault
              .filter((g) => g.title.toLowerCase().includes(searchQuery.toLowerCase()) || g.serialNumber.includes(searchQuery))
              .map((gift) => (
                <div
                  key={gift.id}
                  onClick={() => {
                    setSelectedTarget(gift);
                    setActiveTab('upgrade');
                  }}
                  style={{
                    background: gift.bgGradient,
                    borderRadius: '22px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    position: 'relative',
                    cursor: 'pointer',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
                    border: selectedTarget?.id === gift.id ? '2px solid #eab308' : 'none',
                  }}
                >
                  {/* Плашка цены сверху */}
                  <div style={{ background: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(4px)', padding: '3px 8px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-start' }}>
                    <span style={{ fontSize: '10px', color: '#0098ea' }}>💎</span>
                    <span style={{ fontSize: '11px', fontWeight: '800' }}>{gift.priceTon}</span>
                  </div>

                  {/* Картинка / Модель */}
                  <div style={{ fontSize: '46px', margin: '8px 0' }}>{gift.image}</div>

                  {/* Название и номер снизу */}
                  <div style={{ width: '100%', background: 'rgba(0, 0, 0, 0.65)', borderRadius: '14px', padding: '6px 4px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gift.title}</div>
                    <div style={{ fontSize: '9px', color: '#94a3b8' }}>{gift.serialNumber}</div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBuyFromBank(gift);
                    }}
                    style={{
                      marginTop: '6px',
                      width: '100%',
                      background: '#eab308',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '5px 0',
                      fontSize: '11px',
                      fontWeight: '800',
                      color: '#000',
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

      {/* КОНТЕНТ: ИНВЕНТАРЬ ПОЛЬЗОВАТЕЛЯ */}
      {activeTab === 'inventory' && (
        <div style={{ padding: '10px 20px' }}>
          {userInventory.length === 0 ? (
            <div style={{ background: '#171126', borderRadius: '24px', padding: '36px 20px', textAlign: 'center', border: '1px solid #271c47' }}>
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>🎒</div>
              <div style={{ fontSize: '15px', fontWeight: '700' }}>Ваш инвентарь пуст</div>
              <p style={{ fontSize: '12px', color: '#8b7fa8', margin: '6px 0 16px 0' }}>Переведите подарок на @GuseBank или пополните баланс в Магазине</p>
              <button
                onClick={() => { setIsDepositOpen(true); setDepositStep('gifts'); }}
                style={{ background: '#a855f7', color: '#fff', border: 'none', borderRadius: '16px', padding: '12px 24px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}
              >
                Отправить подарок в Банк
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {userInventory.map((gift) => (
                <div
                  key={gift.id}
                  onClick={() => {
                    setSelectedSource(gift);
                    setActiveTab('upgrade');
                  }}
                  style={{
                    background: gift.bgGradient,
                    borderRadius: '22px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    position: 'relative',
                    cursor: 'pointer',
                    border: selectedSource?.id === gift.id ? '2px solid #a855f7' : 'none',
                  }}
                >
                  <div style={{ background: 'rgba(0, 0, 0, 0.45)', padding: '3px 8px', borderRadius: '12px', alignSelf: 'flex-start', fontSize: '10px', fontWeight: '800' }}>
                    💎 {gift.priceTon}
                  </div>
                  <div style={{ fontSize: '46px', margin: '8px 0' }}>{gift.image}</div>
                  <div style={{ width: '100%', background: 'rgba(0, 0, 0, 0.65)', borderRadius: '14px', padding: '6px 4px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700' }}>{gift.model}</div>
                    <div style={{ fontSize: '9px', color: '#94a3b8' }}>{gift.serialNumber}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ШТОРКА ПОПОЛНЕНИЯ (BottomSheet точно по вашим скриншотам 2, 3, 4) */}
      {isDepositOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#120d24', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', padding: '24px 20px 40px 20px', borderTop: '1px solid #302257', maxHeight: '85vh', overflowY: 'auto' }}>
            
            {/* Заголовок шторки */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {depositStep !== 'methods' && (
                  <button onClick={() => setDepositStep('methods')} style={{ background: 'none', border: 'none', color: '#8b7fa8', fontSize: '18px', cursor: 'pointer' }}>←</button>
                )}
                <div style={{ fontSize: '17px', fontWeight: '800' }}>
                  {depositStep === 'methods' && 'Способ пополнения'}
                  {depositStep === 'stars' && 'Покупка звёздами'}
                  {depositStep === 'wallet' && 'Подключение TON'}
                  {depositStep === 'gifts' && 'Пополнение подарком'}
                </div>
              </div>
              <button onClick={() => setIsDepositOpen(false)} style={{ background: '#20163d', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
            </div>

            {/* ЭКРАН 1: СПИСОК МЕТОДОВ (как на скриншоте 4) */}
            {depositStep === 'methods' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Gifts */}
                <div onClick={() => setDepositStep('gifts')} style={{ background: '#1b1436', padding: '16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>🎁</span>
                    <span style={{ fontWeight: '700', fontSize: '15px' }}>Gifts (Подарки)</span>
                  </div>
                  <span style={{ color: '#8b7fa8' }}>›</span>
                </div>

                {/* Stars */}
                <div onClick={() => setDepositStep('stars')} style={{ background: '#1b1436', padding: '16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>⭐</span>
                    <span style={{ fontWeight: '700', fontSize: '15px' }}>Telegram Stars</span>
                  </div>
                  <span style={{ color: '#8b7fa8' }}>›</span>
                </div>

                {/* Ваш кошелёк (TON) */}
                <div onClick={() => setDepositStep('wallet')} style={{ background: '#1b1436', padding: '16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>💎</span>
                    <span style={{ fontWeight: '700', fontSize: '15px' }}>Ваш кошелёк (TON Connect)</span>
                  </div>
                  <span style={{ color: '#8b7fa8' }}>›</span>
                </div>

                {/* CryptoBot */}
                <div onClick={() => alert('Перенаправление в @CryptoBot...')} style={{ background: '#1b1436', padding: '16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>🤖</span>
                    <span style={{ fontWeight: '700', fontSize: '15px' }}>CryptoBot</span>
                  </div>
                  <span style={{ color: '#8b7fa8' }}>›</span>
                </div>

                {/* xRocket */}
                <div onClick={() => alert('Перенаправление в @xRocket...')} style={{ background: '#1b1436', padding: '16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>🚀</span>
                    <span style={{ fontWeight: '700', fontSize: '15px' }}>xRocket</span>
                  </div>
                  <span style={{ color: '#8b7fa8' }}>›</span>
                </div>
              </div>
            )}

            {/* ЭКРАН 2: STARS (точно как на скриншоте 3) */}
            {depositStep === 'stars' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '50px', marginBottom: '8px' }}>⭐</div>
                <div style={{ fontSize: '18px', fontWeight: '800' }}>Покупка через Stars</div>
                <p style={{ fontSize: '12px', color: '#8b7fa8', margin: '4px 0 20px 0' }}>Оплачивайте звёздами Telegram и получайте баланс для апгрейдов</p>

                <div style={{ fontSize: '36px', fontWeight: '900', color: '#fbbf24', marginBottom: '16px' }}>{starsToBuy} ⭐</div>

                {/* Пресеты 50, 100, 500, 1000 */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                  {[50, 100, 500, 1000].map((val) => (
                    <button
                      key={val}
                      onClick={() => setStarsToBuy(val)}
                      style={{
                        flex: 1,
                        padding: '12px 0',
                        borderRadius: '16px',
                        border: 'none',
                        background: starsToBuy === val ? '#fbbf24' : '#1b1436',
                        color: starsToBuy === val ? '#000' : '#fff',
                        fontWeight: '800',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      {val} ★
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setBalanceStars((prev) => prev + starsToBuy);
                    setIsDepositOpen(false);
                    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
                    confetti({ particleCount: 70, spread: 60 });
                  }}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '20px',
                    border: 'none',
                    background: '#eab308',
                    color: '#000',
                    fontWeight: '800',
                    fontSize: '16px',
                    cursor: 'pointer',
                  }}
                >
                  Купить {starsToBuy} Stars
                </button>
              </div>
            )}

            {/* ЭКРАН 3: GIFTS (Инструкция перевода на @GuseBank) */}
            {depositStep === 'gifts' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '46px', marginBottom: '10px' }}>🎁</div>
                <div style={{ fontSize: '17px', fontWeight: '800' }}>Перевод подарка в Банк</div>
                <div style={{ background: '#1b1436', padding: '16px', borderRadius: '20px', margin: '16px 0', textAlign: 'left', fontSize: '13px', lineHeight: '1.6' }}>
                  1. Откройте профиль <b>@GuseBank</b> в Telegram.<br />
                  2. Нажмите <b>«Отправить подарок»</b>.<br />
                  3. Служба автоматически зачислит его в ваш инвентарь за несколько секунд!
                </div>
                <button
                  onClick={() => {
                    window.Telegram?.WebApp?.openTelegramLink?.('https://t.me/GuseBank');
                  }}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '20px',
                    border: 'none',
                    background: '#a855f7',
                    color: '#fff',
                    fontWeight: '800',
                    fontSize: '15px',
                    cursor: 'pointer',
                  }}
                >
                  Перейти в @GuseBank
                </button>
              </div>
            )}

            {/* ЭКРАН 4: TON WALLET */}
            {depositStep === 'wallet' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '46px', marginBottom: '10px' }}>💎</div>
                <div style={{ fontSize: '17px', fontWeight: '800' }}>TON Connect</div>
                <p style={{ fontSize: '12px', color: '#8b7fa8', margin: '4px 0 20px 0' }}>Подключите Tonkeeper или Telegram Wallet</p>
                <button
                  onClick={() => {
                    setBalanceTon((prev) => Number((prev + 1.5).toFixed(2)));
                    setIsDepositOpen(false);
                    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
                  }}
                  style={{ width: '100%', padding: '16px', borderRadius: '20px', border: 'none', background: '#0098ea', color: '#fff', fontWeight: '800', fontSize: '15px', cursor: 'pointer' }}
                >
                  Подключить кошелёк (+1.5 TON)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* НИЖНЯЯ ПАНЕЛЬ НАВИГАЦИИ (как на скриншоте 1) */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(11, 8, 19, 0.95)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid #23193d',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '12px 20px',
          zIndex: 50,
        }}
      >
        {/* Кнопка Подарков */}
        <button
          onClick={() => setActiveTab('inventory')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: activeTab === 'inventory' ? 1 : 0.4 }}
        >
          <span style={{ fontSize: '22px' }}>🎁</span>
        </button>

        {/* Центральная кнопка Апгрейда (Жёлтая стрелка как на скриншоте 1) */}
        <button
          onClick={() => setActiveTab('upgrade')}
          style={{
            width: '64px',
            height: '42px',
            borderRadius: '22px',
            background: activeTab === 'upgrade' ? '#eab308' : '#231a3b',
            color: activeTab === 'upgrade' ? '#000' : '#8b7fa8',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: '900',
            cursor: 'pointer',
            boxShadow: activeTab === 'upgrade' ? '0 0 16px rgba(234, 179, 8, 0.4)' : 'none',
          }}
        >
          ▲
        </button>

        {/* Кнопка Профиля / Магазина */}
        <button
          onClick={() => setActiveTab('shop')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: activeTab === 'shop' ? 1 : 0.4 }}
        >
          <span style={{ fontSize: '22px' }}>🛒</span>
        </button>
      </div>
    </div>
  );
}