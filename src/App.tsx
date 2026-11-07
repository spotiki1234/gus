import { useState, useEffect } from 'react';
import { useTonConnectUI, useTonWallet, TonConnectButton } from '@tonconnect/ui-react';
import confetti from 'canvas-confetti';

// Боевой TON-кошелек для приёма пополнений
const RECEIVER_TON_ADDRESS = 'UQAKTkSiwZWqUDUjlydR0fxQPaPfsHbNRn0kvy8tcJwKzkrT';

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
  openInvoice?: (url: string, callback: (status: string) => void) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

interface BankGift {
  id: number;
  telegram_gift_id: string;
  name: string;
  slug: string;
  image_url: string;
  price_stars: number;
  price_ton: number;
  serial_number?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'upgrade' | 'shop' | 'inventory'>('upgrade');

  const [tgUser] = useState<TgUser>(() => {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || { first_name: 'Пользователь', id: 0 };
  });

  // Баланс с сохранением в память устройства (НЕ пропадает при обновлении!)
  const [balanceTon, setBalanceTon] = useState<number>(() => {
    const saved = localStorage.getItem(`ton_${window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0}`);
    return saved ? parseFloat(saved) : 0.0;
  });

  const [balanceStars, setBalanceStars] = useState<number>(() => {
    const saved = localStorage.getItem(`stars_${window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0}`);
    return saved ? parseInt(saved, 10) : 0;
  });

  // Реальные массивы подарков (без фейковых заглушек)
  const [bankVault, setBankVault] = useState<BankGift[]>([]);
  const [userInventory, setUserInventory] = useState<BankGift[]>([]);

  // Состояние рулетки апгрейда
  const [selectedSource, setSelectedSource] = useState<BankGift | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<BankGift | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinAngle, setSpinAngle] = useState(0);

  // Шторка пополнения
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositStep, setDepositStep] = useState<'methods' | 'stars' | 'wallet' | 'gifts'>('methods');
  const [tonAmountInput, setTonAmountInput] = useState('1.0');
  const [starsToBuy, setStarsToBuy] = useState(100);

  // TON Connect
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }

    // Загрузка реальных подарков банка с бэкенда
    fetch('/api/bank/gifts')
      .then((res) => res.json())
      .then((data: { available_gifts?: BankGift[] }) => {
        if (data.available_gifts) setBankVault(data.available_gifts);
      })
      .catch(() => {});

    // Загрузка реального инвентаря игрока
    if (tgUser.id) {
      fetch(`/api/inventory/${tgUser.id}`)
        .then((res) => res.json())
        .then((data: { items?: BankGift[] }) => {
          if (data.items) setUserInventory(data.items);
        })
        .catch(() => {});
    }
  }, [tgUser.id]);

  // Математический расчет шанса победы с учетом комиссии платформы 5%
  const calculateChance = (): number => {
    if (!selectedSource || !selectedTarget) return 0;
    if (selectedSource.price_ton >= selectedTarget.price_ton) return 0;
    const raw = (selectedSource.price_ton / selectedTarget.price_ton) * 0.95 * 100;
    return Math.min(Math.max(Number(raw.toFixed(2)), 1.0), 85.0);
  };

  const chance = calculateChance();

  // Запуск круговой неоновой рулетки
  const handleUpgrade = () => {
    if (!selectedSource || !selectedTarget || isSpinning || chance <= 0) return;

    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy');
    setIsSpinning(true);

    const roll = Math.random() * 100;
    const isWin = roll < chance;

    const winAngle = chance * 3.6;
    const stopAngle = isWin ? Math.random() * winAngle : winAngle + Math.random() * (360 - winAngle);
    setSpinAngle((prev) => prev + 1800 + stopAngle);

    setTimeout(() => {
      setIsSpinning(false);
      if (isWin) {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } });
        setUserInventory((prev) => [
          ...prev.filter((i) => i.id !== selectedSource.id),
          { ...selectedTarget, id: Date.now() },
        ]);
        setSelectedSource(null);
        setSelectedTarget(null);
      } else {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
        setUserInventory((prev) => prev.filter((i) => i.id !== selectedSource.id));
        setSelectedSource(null);
      }
    }, 3200);
  };

  // НАСТОЯЩЕЕ ПОПОЛНЕНИЕ ЧЕРЕЗ TELEGRAM STARS (СИНЯЯ ШТОРКА ОПЛАТЫ)
  const handleRealStarsPayment = async (amount: number) => {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      alert('Откройте приложение внутри Telegram');
      return;
    }

    tg.HapticFeedback?.impactOccurred('medium');

    try {
      // 1. Запрашиваем официальный инвойс от Bot API
      const res = await fetch('/api/pay-stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starsAmount: amount,
          userId: tgUser.id,
        }),
      });

      const data = await res.json();

      if (!data.invoiceLink) {
        alert('Ошибка генерации счета: ' + (data.error || 'Проверьте токен'));
        return;
      }

      // 2. Вызываем официальную нативную шторку Telegram "Подтвердить и заплатить N звезд"
      if (tg.openInvoice) {
        tg.openInvoice(data.invoiceLink, (status: string) => {
          if (status === 'paid') {
            tg.HapticFeedback?.notificationOccurred('success');
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });

            // Сохраняем баланс навсегда
            setBalanceStars((prev) => {
              const next = prev + amount;
              localStorage.setItem(`stars_${tgUser.id}`, String(next));
              return next;
            });

            setIsDepositOpen(false);
          }
        });
      }
    } catch (err: unknown) {
      console.error(err);
      alert('Ошибка соединения с платежным шлюзом');
    }
  };

  // НАСТОЯЩИЙ ДЕПОЗИТ TON CONNECT
  const handleRealTonDeposit = async () => {
    if (!wallet) {
      alert('Сначала подключите кошелек кнопкой выше!');
      return;
    }

    const amountNano = Math.floor(parseFloat(tonAmountInput) * 1e9);
    if (isNaN(amountNano) || amountNano <= 0) {
      alert('Введите корректную сумму TON');
      return;
    }

    const transaction = {
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: RECEIVER_TON_ADDRESS,
          amount: amountNano.toString(),
        },
      ],
    };

    try {
      await tonConnectUI.sendTransaction(transaction);
      setBalanceTon((prev) => {
        const next = Number((prev + parseFloat(tonAmountInput)).toFixed(2));
        localStorage.setItem(`ton_${tgUser.id}`, String(next));
        return next;
      });

      setIsDepositOpen(false);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      alert(`✅ Транзакция успешно отправлена! Зачислено: ${tonAmountInput} TON.`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Ошибка отправки';
      console.error(errorMsg);
      alert('Транзакция отменена в кошельке.');
    }
  };

  // Переход в CryptoBot
  const handleCryptoBotPayment = () => {
    const tg = window.Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred('light');
    const cryptoBotUrl = 'https://t.me/CryptoBot?start=pay';
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(cryptoBotUrl);
    } else {
      window.open(cryptoBotUrl, '_blank');
    }
  };

  // Переход в xRocket
  const handleXRocketPayment = () => {
    const tg = window.Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred('light');
    const xRocketUrl = 'https://t.me/rocketbot?start=pay';
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(xRocketUrl);
    } else {
      window.open(xRocketUrl, '_blank');
    }
  };

  return (
    <div style={{ backgroundColor: '#090514', color: '#fff', minHeight: '100vh', fontFamily: '-apple-system, sans-serif', paddingBottom: '90px' }}>
      {/* Шапка профиля */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#120d24', borderBottom: '1px solid #23193d' }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '15px' }}>{tgUser.first_name}</div>
          <div style={{ fontSize: '11px', color: '#9333ea', fontWeight: '600' }}>Хранилище @GuseBank</div>
        </div>

        {/* Плашка баланса с кнопкой плюс */}
        <div onClick={() => { setIsDepositOpen(true); setDepositStep('methods'); }} style={{ background: '#1d1538', border: '1px solid #3b2d6b', borderRadius: '24px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#0098ea' }}>💎 {balanceTon.toFixed(2)} TON</div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#fbbf24' }}>⭐ {balanceStars} Stars</div>
          </div>
          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#eab308', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900' }}>+</div>
        </div>
      </div>

      {/* Верхний таб-бар */}
      <div style={{ padding: '16px 20px 8px 20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => setActiveTab('inventory')}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '20px',
            border: 'none',
            fontWeight: '700',
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
            background: activeTab === 'shop' ? '#eab308' : '#171126',
            color: activeTab === 'shop' ? '#000' : '#8b7fa8',
            cursor: 'pointer',
          }}
        >
          Магазин ({bankVault.length})
        </button>
      </div>

      {/* АРЕНА АПГРЕЙДА */}
      {activeTab === 'upgrade' && (
        <div style={{ padding: '10px 20px' }}>
          <div style={{ background: '#130e24', borderRadius: '28px', border: '1px solid #271c47', padding: '24px 16px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800' }}>Арена Апгрейда</h3>

            {/* Рулетка */}
            <div style={{ position: 'relative', width: '150px', height: '150px', margin: '0 auto 20px auto' }}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: chance > 0 ? `conic-gradient(#a855f7 0% ${chance}%, #1f1738 ${chance}% 100%)` : '#1f1738',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: '110px', height: '110px', borderRadius: '50%', background: '#090514', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: '900', color: chance > 0 ? '#c084fc' : '#5b4d7a' }}>{chance}%</div>
                  <span style={{ fontSize: '10px', color: '#8b7fa8' }}>ШАНС</span>
                </div>
              </div>

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
                <div style={{ width: '4px', height: '22px', background: '#eab308', margin: '0 auto', borderRadius: '4px' }} />
              </div>
            </div>

            {/* Ячейки апгрейда */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <div
                onClick={() => setActiveTab('inventory')}
                style={{ width: '120px', height: '130px', borderRadius: '22px', background: '#171126', border: selectedSource ? '2px solid #a855f7' : '2px dashed #3a2b61', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '8px' }}
              >
                {selectedSource ? (
                  <>
                    <img src={selectedSource.image_url} alt="" style={{ width: '46px', height: '46px', objectFit: 'contain' }} />
                    <span style={{ fontSize: '12px', fontWeight: '800', marginTop: '6px' }}>{selectedSource.name}</span>
                    <span style={{ fontSize: '10px', color: '#0098ea' }}>💎 {selectedSource.price_ton}</span>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', color: '#8b7fa8' }}>+ Выбрать свой</span>
                )}
              </div>

              <div style={{ fontSize: '20px', color: '#8b7fa8' }}>➔</div>

              <div
                onClick={() => setActiveTab('shop')}
                style={{ width: '120px', height: '130px', borderRadius: '22px', background: '#171126', border: selectedTarget ? '2px solid #eab308' : '2px dashed #3a2b61', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '8px' }}
              >
                {selectedTarget ? (
                  <>
                    <img src={selectedTarget.image_url} alt="" style={{ width: '46px', height: '46px', objectFit: 'contain' }} />
                    <span style={{ fontSize: '12px', fontWeight: '800', marginTop: '6px' }}>{selectedTarget.name}</span>
                    <span style={{ fontSize: '10px', color: '#0098ea' }}>💎 {selectedTarget.price_ton}</span>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', color: '#8b7fa8' }}>+ Цель банка</span>
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
                background: isSpinning ? '#3b2d6b' : !selectedSource || !selectedTarget ? '#231a3b' : 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                color: '#fff',
                fontSize: '16px',
                fontWeight: '800',
                cursor: !selectedSource || !selectedTarget || isSpinning ? 'not-allowed' : 'pointer',
              }}
            >
              {isSpinning ? 'КРУТИМ РУЛЕТКУ...' : 'УЛУЧШИТЬ ПОДАРОК'}
            </button>
          </div>
        </div>
      )}

      {/* МАГАЗИН БАНКА */}
      {activeTab === 'shop' && (
        <div style={{ padding: '10px 20px' }}>
          {bankVault.length === 0 ? (
            <div style={{ background: '#171126', borderRadius: '24px', padding: '36px 20px', textAlign: 'center', border: '1px solid #271c47' }}>
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>🏦</div>
              <div style={{ fontSize: '15px', fontWeight: '700' }}>В банке пока нет доступных подарков</div>
              <p style={{ fontSize: '12px', color: '#8b7fa8', margin: '6px 0 16px 0' }}>
                Подарки появятся здесь, как только они поступят на баланс <b>@GuseBank</b>
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {bankVault.map((gift) => (
                <div
                  key={gift.id}
                  onClick={() => { setSelectedTarget(gift); setActiveTab('upgrade'); }}
                  style={{ background: '#1c1433', borderRadius: '22px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', border: selectedTarget?.id === gift.id ? '2px solid #eab308' : '1px solid #2d2150' }}
                >
                  <div style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '800', color: '#0098ea', alignSelf: 'flex-start' }}>
                    💎 {gift.price_ton}
                  </div>
                  <img src={gift.image_url} alt="" style={{ width: '50px', height: '50px', margin: '8px 0', objectFit: 'contain' }} />
                  <div style={{ fontSize: '11px', fontWeight: '700' }}>{gift.name}</div>
                  <div style={{ fontSize: '9px', color: '#8b7fa8' }}>{gift.serial_number || '#0000'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ИНВЕНТАРЬ ПОЛЬЗОВАТЕЛЯ */}
      {activeTab === 'inventory' && (
        <div style={{ padding: '10px 20px' }}>
          {userInventory.length === 0 ? (
            <div style={{ background: '#171126', borderRadius: '24px', padding: '36px 20px', textAlign: 'center', border: '1px solid #271c47' }}>
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>🎒</div>
              <div style={{ fontSize: '15px', fontWeight: '700' }}>Ваш инвентарь пуст</div>
              <p style={{ fontSize: '12px', color: '#8b7fa8', margin: '6px 0 16px 0' }}>
                Отправьте свой NFT-подарок на <b>@GuseBank</b> в Telegram — он автоматически появится здесь!
              </p>
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
                  onClick={() => { setSelectedSource(gift); setActiveTab('upgrade'); }}
                  style={{ background: '#1c1433', borderRadius: '22px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', border: selectedSource?.id === gift.id ? '2px solid #a855f7' : '1px solid #2d2150' }}
                >
                  <div style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '800', color: '#0098ea', alignSelf: 'flex-start' }}>
                    💎 {gift.price_ton}
                  </div>
                  <img src={gift.image_url} alt="" style={{ width: '50px', height: '50px', margin: '8px 0', objectFit: 'contain' }} />
                  <div style={{ fontSize: '11px', fontWeight: '700' }}>{gift.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ШТОРКА ПОПОЛНЕНИЯ (BottomSheet) */}
      {isDepositOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#120d24', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', padding: '24px 20px 40px 20px', borderTop: '1px solid #302257' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '17px', fontWeight: '800' }}>
                {depositStep === 'methods' && 'Способ пополнения'}
                {depositStep === 'wallet' && 'Пополнение через TON'}
                {depositStep === 'stars' && 'Пополнение через Stars'}
                {depositStep === 'gifts' && 'Пополнение подарком'}
              </div>
              <button onClick={() => setIsDepositOpen(false)} style={{ background: '#20163d', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
            </div>

            {/* СПИСОК МЕТОДОВ */}
            {depositStep === 'methods' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div onClick={() => setDepositStep('gifts')} style={{ background: '#1b1436', padding: '16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>🎁</span>
                    <span style={{ fontWeight: '700' }}>Gifts (Подарки на @GuseBank)</span>
                  </div>
                  <span>›</span>
                </div>

                <div onClick={() => setDepositStep('stars')} style={{ background: '#1b1436', padding: '16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>⭐</span>
                    <span style={{ fontWeight: '700' }}>Telegram Stars</span>
                  </div>
                  <span>›</span>
                </div>

                <div onClick={() => setDepositStep('wallet')} style={{ background: '#1b1436', padding: '16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>💎</span>
                    <span style={{ fontWeight: '700' }}>Ваш кошелек (TON Connect)</span>
                  </div>
                  <span>›</span>
                </div>

                <div onClick={handleCryptoBotPayment} style={{ background: '#1b1436', padding: '16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>🤖</span>
                    <span style={{ fontWeight: '700' }}>CryptoBot</span>
                  </div>
                  <span>›</span>
                </div>

                <div onClick={handleXRocketPayment} style={{ background: '#1b1436', padding: '16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>🚀</span>
                    <span style={{ fontWeight: '700' }}>xRocket</span>
                  </div>
                  <span>›</span>
                </div>
              </div>
            )}

            {/* ВЫБОР STARS */}
            {depositStep === 'stars' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '46px', marginBottom: '8px' }}>⭐</div>
                <div style={{ fontSize: '18px', fontWeight: '800' }}>Telegram Stars</div>
                <div style={{ fontSize: '32px', fontWeight: '900', color: '#fbbf24', margin: '12px 0' }}>{starsToBuy} ⭐</div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
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
                  onClick={() => handleRealStarsPayment(starsToBuy)}
                  style={{ width: '100%', padding: '16px', borderRadius: '20px', border: 'none', background: '#eab308', color: '#000', fontWeight: '800', fontSize: '16px', cursor: 'pointer' }}
                >
                  Купить {starsToBuy} Stars
                </button>
              </div>
            )}

            {/* ПОДКЛЮЧЕНИЕ TON КОШЕЛЬКА */}
            {depositStep === 'wallet' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                  <TonConnectButton />
                </div>

                {wallet ? (
                  <div>
                    <p style={{ fontSize: '12px', color: '#4ade80', marginBottom: '12px' }}>
                      Кошелек подключен: {wallet.account.address.slice(0, 4)}...{wallet.account.address.slice(-4)}
                    </p>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '12px', color: '#8b7fa8', display: 'block', marginBottom: '6px' }}>Сумма пополнения TON:</label>
                      <input
                        type="number"
                        step="0.1"
                        value={tonAmountInput}
                        onChange={(e) => setTonAmountInput(e.target.value)}
                        style={{ background: '#171126', border: '1px solid #3b2d6b', borderRadius: '14px', padding: '12px', color: '#fff', fontSize: '16px', textAlign: 'center', width: '120px' }}
                      />
                    </div>
                    <button
                      onClick={handleRealTonDeposit}
                      style={{ width: '100%', padding: '16px', borderRadius: '20px', border: 'none', background: '#0098ea', color: '#fff', fontWeight: '800', fontSize: '15px', cursor: 'pointer' }}
                    >
                      Оплатить через Tonkeeper / Wallet
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: '#8b7fa8' }}>
                    Нажмите синюю кнопку выше, чтобы привязать Tonkeeper или Telegram Wallet
                  </p>
                )}
              </div>
            )}

            {/* GIFTS */}
            {depositStep === 'gifts' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '46px', marginBottom: '10px' }}>🎁</div>
                <div style={{ fontSize: '16px', fontWeight: '800', marginBottom: '8px' }}>Перевод подарка в Банк</div>
                <p style={{ fontSize: '13px', color: '#8b7fa8', margin: '0 0 16px 0' }}>
                  Откройте контакт <b>@GuseBank</b> и отправьте ему подарок. Бэкенд автоматически добавит его в ваш инвентарь!
                </p>
                <button
                  onClick={() => window.Telegram?.WebApp?.openTelegramLink?.('https://t.me/GuseBank')}
                  style={{ width: '100%', padding: '16px', borderRadius: '20px', border: 'none', background: '#a855f7', color: '#fff', fontWeight: '800', fontSize: '15px', cursor: 'pointer' }}
                >
                  Открыть диалог с @GuseBank
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* НИЖНЯЯ НАВИГАЦИЯ */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(11, 8, 19, 0.95)', backdropFilter: 'blur(16px)', borderTop: '1px solid #23193d', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '12px 20px', zIndex: 50 }}>
        <button onClick={() => setActiveTab('inventory')} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: activeTab === 'inventory' ? 1 : 0.4 }}>
          <span style={{ fontSize: '22px' }}>🎁</span>
        </button>

        <button
          onClick={() => setActiveTab('upgrade')}
          style={{ width: '64px', height: '42px', borderRadius: '22px', background: activeTab === 'upgrade' ? '#eab308' : '#231a3b', color: activeTab === 'upgrade' ? '#000' : '#8b7fa8', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '900', cursor: 'pointer' }}
        >
          ▲
        </button>

        <button onClick={() => setActiveTab('shop')} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: activeTab === 'shop' ? 1 : 0.4 }}>
          <span style={{ fontSize: '22px' }}>🛒</span>
        </button>
      </div>
    </div>
  );
}