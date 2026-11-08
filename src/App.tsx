import { useState, useEffect } from 'react';
import { useTonConnectUI, useTonWallet, TonConnectButton } from '@tonconnect/ui-react';
import confetti from 'canvas-confetti';

const RECEIVER_TON_ADDRESS = 'UQAKTkSiwZWqUDUjlydR0fxQPaPfsHbNRn0kvy8tcJwKzkrT';

// Курс конвертации звёзд в TON
const STARS_PER_TON = 111;

// Пути к официальным логотипам
const ICONS = {
  gift: '/icons/gift.png',
  stars: '/icons/stars.png',
  ton: '/icons/ton.png',
  cryptobot: '/icons/cryptobot.png',
};

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

  // Единый баланс только в TON
  const [balanceTon, setBalanceTon] = useState<number>(0.0);

  const [bankVault, setBankVault] = useState<BankGift[]>([]);
  const [userInventory, setUserInventory] = useState<BankGift[]>([]);

  const [selectedSource, setSelectedSource] = useState<BankGift | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<BankGift | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinAngle, setSpinAngle] = useState(0);

  // Шторка пополнения
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositStep, setDepositStep] = useState<'methods' | 'stars' | 'wallet' | 'gifts' | 'cryptobot'>('methods');
  const [tonAmountInput, setTonAmountInput] = useState('1.0');
  const [cryptoPayAmount, setCryptoPayAmount] = useState('1.0');
  const [starsToBuy, setStarsToBuy] = useState(111); // По умолчанию 1 TON

  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }

    if (tgUser.id) {
      fetch(`/api/user-balance?userId=${tgUser.id}`)
        .then((res) => res.json())
        .then((data: { ton?: number }) => {
          if (typeof data.ton === 'number') setBalanceTon(data.ton);
        })
        .catch(() => {
          const t = localStorage.getItem(`ton_${tgUser.id}`);
          if (t) setBalanceTon(parseFloat(t));
        });

      fetch(`/api/inventory/${tgUser.id}`)
        .then((res) => res.json())
        .then((data: { items?: BankGift[] }) => {
          if (data.items) setUserInventory(data.items);
        })
        .catch(() => {});
    }

    fetch('/api/bank-gifts')
      .then((res) => res.json())
      .then((data: { available_gifts?: BankGift[] }) => {
        if (data.available_gifts) setBankVault(data.available_gifts);
      })
      .catch(() => {});
  }, [tgUser.id]);

  const saveBalanceToDb = async (newTon: number) => {
    setBalanceTon(newTon);
    localStorage.setItem(`ton_${tgUser.id}`, String(newTon));

    try {
      await fetch('/api/user-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: tgUser.id,
          ton: newTon,
          stars: 0,
        }),
      });
    } catch (e) {
      console.error('Ошибка сохранения баланса в БД:', e);
    }
  };

  const calculateChance = (): number => {
    if (!selectedSource || !selectedTarget) return 0;
    if (selectedSource.price_ton >= selectedTarget.price_ton) return 0;
    const raw = (selectedSource.price_ton / selectedTarget.price_ton) * 0.95 * 100;
    return Math.min(Math.max(Number(raw.toFixed(2)), 1.0), 85.0);
  };

  const chance = calculateChance();

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

  // Оплата звёздами с зачислением в TON (111 Stars = 1 TON)
  const handleRealStarsPayment = async (amountStars: number) => {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      alert('Откройте приложение внутри Telegram');
      return;
    }

    tg.HapticFeedback?.impactOccurred('medium');

    try {
      const res = await fetch('/api/pay-stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starsAmount: amountStars,
          userId: tgUser.id,
        }),
      });

      const data = await res.json();

      if (!data.invoiceLink) {
        alert('Ошибка генерации счета: ' + (data.error || 'Проверьте токен'));
        return;
      }

      if (tg.openInvoice) {
        tg.openInvoice(data.invoiceLink, (status: string) => {
          if (status === 'paid') {
            tg.HapticFeedback?.notificationOccurred('success');
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });

            // Переводим оплаченные звёзды в TON
            const addedTon = Number((amountStars / STARS_PER_TON).toFixed(2));
            const newTon = Number((balanceTon + addedTon).toFixed(2));
            saveBalanceToDb(newTon);

            setIsDepositOpen(false);
            alert(`✅ Баланс успешно пополнен на +${addedTon} TON!`);
          }
        });
      }
    } catch (err: unknown) {
      console.error(err);
      alert('Ошибка соединения с платежным шлюзом');
    }
  };

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
      const newTon = Number((balanceTon + parseFloat(tonAmountInput)).toFixed(2));
      saveBalanceToDb(newTon);

      setIsDepositOpen(false);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      alert(`✅ Транзакция подтверждена! Баланс пополнен на ${tonAmountInput} TON.`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Ошибка отправки';
      console.error(errorMsg);
      alert('Транзакция отменена в кошельке.');
    }
  };

  const handleCryptoBotPayment = async () => {
    const tg = window.Telegram?.WebApp;
    const amount = parseFloat(cryptoPayAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Введите корректную сумму');
      return;
    }

    tg?.HapticFeedback?.impactOccurred('light');

    try {
      const res = await fetch('/api/pay-cryptobot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountTon: amount, userId: tgUser.id }),
      });

      const data = await res.json();
      if (data.invoiceUrl) {
        setIsDepositOpen(false);
        if (tg?.openTelegramLink) {
          tg.openTelegramLink(data.invoiceUrl);
        } else {
          window.open(data.invoiceUrl, '_blank');
        }
      } else {
        alert('Ошибка создания счета: ' + (data.error || 'Проверьте токен'));
      }
    } catch {
      alert('Ошибка соединения с сервисом платежей');
    }
  };

  // Расчет эквивалента в TON для поля Stars
  const starsConvertedTon = (starsToBuy / STARS_PER_TON).toFixed(2);

  return (
    <div style={{ backgroundColor: '#090514', color: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', paddingBottom: '100px' }}>
      {/* Шапка профиля */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#120d24', borderBottom: '1px solid #23193d' }}>
        <div>
          <div style={{ fontWeight: '800', fontSize: '16px', letterSpacing: '-0.3px' }}>{tgUser.first_name}</div>
          <div style={{ fontSize: '11px', color: '#a855f7', fontWeight: '600', marginTop: '2px' }}>Хранилище @GuseBank</div>
        </div>

        {/* Единственная плашка баланса TON */}
        <div 
          onClick={() => { setIsDepositOpen(true); setDepositStep('methods'); }} 
          style={{ 
            background: 'linear-gradient(135deg, #1f163d 0%, #150f29 100%)', 
            border: '1px solid #3b2d6b', 
            borderRadius: '24px', 
            padding: '8px 16px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px', 
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: '900', color: '#0098ea', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <img src={ICONS.ton} alt="TON" style={{ width: '16px', height: '16px', borderRadius: '4px' }} />
            {balanceTon.toFixed(2)} TON
          </div>
          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#eab308', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '14px' }}>+</div>
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
            fontSize: '14px',
            background: activeTab === 'inventory' ? '#eab308' : '#171126',
            color: activeTab === 'inventory' ? '#000' : '#8b7fa8',
            cursor: 'pointer',
            transition: 'all 0.2s',
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
            transition: 'all 0.2s',
          }}
        >
          Магазин ({bankVault.length})
        </button>
      </div>

      {/* АРЕНА АПГРЕЙДА */}
      {activeTab === 'upgrade' && (
        <div style={{ padding: '10px 20px' }}>
          <div style={{ background: '#130e24', borderRadius: '28px', border: '1px solid #271c47', padding: '24px 16px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800' }}>Арена Апгрейда</h3>

            {/* Рулетка */}
            <div style={{ position: 'relative', width: '150px', height: '150px', margin: '0 auto 20px auto' }}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: chance > 0 ? `conic-gradient(#a855f7 0% ${chance}%, #1f1738 ${chance}% 100%)` : '#1f1738',
                  boxShadow: '0 0 20px rgba(168, 85, 247, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: '110px', height: '110px', borderRadius: '50%', background: '#090514', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: chance > 0 ? '#c084fc' : '#5b4d7a' }}>{chance}%</div>
                  <span style={{ fontSize: '10px', color: '#8b7fa8', fontWeight: '700' }}>ШАНС</span>
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
                <div style={{ width: '4px', height: '22px', background: '#eab308', margin: '0 auto', borderRadius: '4px', boxShadow: '0 0 12px #eab308' }} />
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
                    <span style={{ fontSize: '10px', color: '#0098ea', fontWeight: '700' }}>💎 {selectedSource.price_ton}</span>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', color: '#8b7fa8', fontWeight: '600' }}>+ Выбрать свой</span>
                )}
              </div>

              <div style={{ fontSize: '20px', color: '#8b7fa8', fontWeight: '900' }}>➔</div>

              <div
                onClick={() => setActiveTab('shop')}
                style={{ width: '120px', height: '130px', borderRadius: '22px', background: '#171126', border: selectedTarget ? '2px solid #eab308' : '2px dashed #3a2b61', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '8px' }}
              >
                {selectedTarget ? (
                  <>
                    <img src={selectedTarget.image_url} alt="" style={{ width: '46px', height: '46px', objectFit: 'contain' }} />
                    <span style={{ fontSize: '12px', fontWeight: '800', marginTop: '6px' }}>{selectedTarget.name}</span>
                    <span style={{ fontSize: '10px', color: '#0098ea', fontWeight: '700' }}>💎 {selectedTarget.price_ton}</span>
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
                background: isSpinning ? '#3b2d6b' : !selectedSource || !selectedTarget ? '#231a3b' : 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                color: '#fff',
                fontSize: '16px',
                fontWeight: '800',
                cursor: !selectedSource || !selectedTarget || isSpinning ? 'not-allowed' : 'pointer',
                boxShadow: selectedSource && selectedTarget ? '0 4px 20px rgba(168, 85, 247, 0.4)' : 'none',
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
              <div style={{ width: '64px', height: '64px', margin: '0 auto 12px auto', background: '#20163d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={ICONS.gift} alt="Банк" style={{ width: '32px', height: '32px', filter: 'invert(1)' }} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: '800' }}>В банке пока нет доступных подарков</div>
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
              <div style={{ width: '64px', height: '64px', margin: '0 auto 12px auto', background: '#20163d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={ICONS.gift} alt="Инвентарь" style={{ width: '32px', height: '32px', filter: 'invert(1)' }} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: '800' }}>Ваш инвентарь пуст</div>
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
          <div style={{ width: '100%', background: '#120d24', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', padding: '24px 20px 40px 20px', borderTop: '1px solid #302257', maxHeight: '85vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {depositStep !== 'methods' && (
                  <button onClick={() => setDepositStep('methods')} style={{ background: 'none', border: 'none', color: '#8b7fa8', fontSize: '18px', cursor: 'pointer' }}>←</button>
                )}
                <div style={{ fontSize: '17px', fontWeight: '800' }}>
                  {depositStep === 'methods' && 'Способ пополнения'}
                  {depositStep === 'wallet' && 'Пополнение через TON'}
                  {depositStep === 'stars' && 'Оплата звёздами'}
                  {depositStep === 'cryptobot' && 'Пополнение CryptoBot'}
                  {depositStep === 'gifts' && 'Пополнение подарком'}
                </div>
              </div>
              <button onClick={() => setIsDepositOpen(false)} style={{ background: '#20163d', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            </div>

            {/* СПИСОК МЕТОДОВ */}
            {depositStep === 'methods' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                {/* 1. Gifts */}
                <div onClick={() => setDepositStep('gifts')} style={{ background: '#1b1436', padding: '14px 16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px solid #2d2150' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: '#271c47', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={ICONS.gift} alt="Gifts" style={{ width: '22px', height: '22px', filter: 'invert(1)' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '15px' }}>Gifts</div>
                      <div style={{ fontSize: '11px', color: '#8b7fa8' }}>Перевод подарка на @GuseBank</div>
                    </div>
                  </div>
                  <span style={{ color: '#8b7fa8', fontSize: '20px' }}>›</span>
                </div>

                {/* 2. Telegram Stars */}
                <div onClick={() => setDepositStep('stars')} style={{ background: '#1b1436', padding: '14px 16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px solid #2d2150' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: '#271c47', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={ICONS.stars} alt="Stars" style={{ width: '28px', height: '28px' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '15px' }}>Telegram Stars</div>
                      <div style={{ fontSize: '11px', color: '#8b7fa8' }}>Курс: 111 звёзд = 1.00 TON</div>
                    </div>
                  </div>
                  <span style={{ color: '#8b7fa8', fontSize: '20px' }}>›</span>
                </div>

                {/* 3. TON Connect */}
                <div onClick={() => setDepositStep('wallet')} style={{ background: '#1b1436', padding: '14px 16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px solid #2d2150' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <img src={ICONS.ton} alt="TON" style={{ width: '38px', height: '38px' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '15px' }}>Ваш кошелёк (TON Connect)</div>
                      <div style={{ fontSize: '11px', color: '#8b7fa8' }}>Tonkeeper / Telegram Wallet</div>
                    </div>
                  </div>
                  <span style={{ color: '#8b7fa8', fontSize: '20px' }}>›</span>
                </div>

                {/* 4. CryptoBot */}
                <div onClick={() => { setDepositStep('cryptobot'); setCryptoPayAmount('1.0'); }} style={{ background: '#1b1436', padding: '14px 16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px solid #2d2150' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={ICONS.cryptobot} alt="CryptoBot" style={{ width: '38px', height: '38px' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '15px' }}>CryptoBot</div>
                      <div style={{ fontSize: '11px', color: '#8b7fa8' }}>Чек в @CryptoBot (TON / USDT)</div>
                    </div>
                  </div>
                  <span style={{ color: '#8b7fa8', fontSize: '20px' }}>›</span>
                </div>

              </div>
            )}

            {/* ВЫБОР СУММЫ ДЛЯ STARS (КОНВЕРТАЦИЯ 111 = 1 TON) */}
            {depositStep === 'stars' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', margin: '0 auto 10px auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={ICONS.stars} alt="Stars" style={{ width: '64px', height: '64px' }} />
                </div>
                <div style={{ fontSize: '18px', fontWeight: '800' }}>Оплата звёздами</div>
                <p style={{ fontSize: '12px', color: '#8b7fa8', margin: '4px 0 16px 0' }}>
                  Курс конвертации: <b>111 ★ = 1.00 TON</b>
                </p>

                {/* Поле ввода звёзд */}
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    value={starsToBuy || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setStarsToBuy(isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    placeholder="0"
                    style={{
                      width: '160px',
                      background: '#171126',
                      border: '2px solid #fbbf24',
                      borderRadius: '16px',
                      padding: '10px 14px',
                      fontSize: '32px',
                      fontWeight: '900',
                      color: '#fbbf24',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                  <img src={ICONS.stars} alt="★" style={{ width: '28px', height: '28px' }} />
                </div>

                {/* Эквивалент в TON */}
                <div style={{ fontSize: '14px', fontWeight: '800', color: '#0098ea', marginBottom: '18px' }}>
                  ≈ {starsConvertedTon} TON на баланс
                </div>

                {/* Быстрые пресеты */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                  {[
                    { stars: 111, ton: '1.0' },
                    { stars: 555, ton: '5.0' },
                    { stars: 1110, ton: '10.0' },
                    { stars: 2775, ton: '25.0' },
                  ].map((p) => (
                    <button
                      key={p.stars}
                      onClick={() => setStarsToBuy(p.stars)}
                      style={{
                        flex: 1,
                        padding: '10px 4px',
                        borderRadius: '14px',
                        border: 'none',
                        background: starsToBuy === p.stars ? '#fbbf24' : '#1b1436',
                        color: starsToBuy === p.stars ? '#000' : '#fff',
                        fontWeight: '800',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {p.stars} ★<br />
                      <span style={{ fontSize: '10px', opacity: 0.8 }}>({p.ton} TON)</span>
                    </button>
                  ))}
                </div>

                <button
                  disabled={!starsToBuy || starsToBuy <= 0}
                  onClick={() => handleRealStarsPayment(starsToBuy)}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '20px',
                    border: 'none',
                    background: starsToBuy > 0 ? '#eab308' : '#33294d',
                    color: starsToBuy > 0 ? '#000' : '#736b8a',
                    fontWeight: '800',
                    fontSize: '16px',
                    cursor: starsToBuy > 0 ? 'pointer' : 'not-allowed',
                    boxShadow: starsToBuy > 0 ? '0 4px 20px rgba(234, 179, 8, 0.4)' : 'none',
                  }}
                >
                  Заплатить {starsToBuy || 0} ★ (+{starsConvertedTon} TON)
                </button>
              </div>
            )}

            {/* ВЫБОР СУММЫ ДЛЯ CRYPTOBOT */}
            {depositStep === 'cryptobot' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', margin: '0 auto 12px auto', borderRadius: '18px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={ICONS.cryptobot} alt="CryptoBot" style={{ width: '64px', height: '64px' }} />
                </div>
                <div style={{ fontSize: '18px', fontWeight: '800' }}>Оплата через CryptoBot</div>
                <p style={{ fontSize: '12px', color: '#8b7fa8', margin: '4px 0 16px 0' }}>
                  Введите сумму в TON для выставления счёта
                </p>

                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={cryptoPayAmount}
                    onChange={(e) => setCryptoPayAmount(e.target.value)}
                    style={{
                      width: '160px',
                      background: '#171126',
                      border: '2px solid #0098ea',
                      borderRadius: '16px',
                      padding: '10px 14px',
                      fontSize: '32px',
                      fontWeight: '900',
                      color: '#0098ea',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '22px', color: '#0098ea', fontWeight: '800' }}>TON</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                  {['0.5', '1.0', '5.0', '10.0'].map((val) => (
                    <button
                      key={val}
                      onClick={() => setCryptoPayAmount(val)}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: '14px',
                        border: 'none',
                        background: cryptoPayAmount === val ? '#0098ea' : '#1b1436',
                        color: cryptoPayAmount === val ? '#fff' : '#8b7fa8',
                        fontWeight: '800',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      {val} TON
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleCryptoBotPayment}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '20px',
                    border: 'none',
                    background: '#0098ea',
                    color: '#fff',
                    fontWeight: '800',
                    fontSize: '16px',
                    cursor: 'pointer',
                  }}
                >
                  Перейти к оплате {cryptoPayAmount} TON
                </button>
              </div>
            )}

            {/* ПОДКЛЮЧЕНИЕ TON КОШЕЛЬКА */}
            {depositStep === 'wallet' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', margin: '0 auto 12px auto', borderRadius: '16px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src={ICONS.ton} alt="TON" style={{ width: '64px', height: '64px' }} />
                </div>
                
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
                    Нажмите кнопку выше, чтобы привязать Tonkeeper или Telegram Wallet
                  </p>
                )}
              </div>
            )}

            {/* ПЕРЕВОД ПОДАРКА (GIFTS) */}
            {depositStep === 'gifts' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', margin: '0 auto 12px auto', borderRadius: '20px', background: '#20163d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={ICONS.gift} alt="Gifts" style={{ width: '36px', height: '36px', filter: 'invert(1)' }} />
                </div>
                <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>Перевод подарка в Банк</div>
                <p style={{ fontSize: '13px', color: '#8b7fa8', margin: '0 0 16px 0', lineHeight: '1.5' }}>
                  Откройте профиль <b>@GuseBank</b> и отправьте ему подарок. Бэкенд автоматически добавит его в ваш инвентарь!
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

      {/* НИЖНЯЯ ПАНЕЛЬ НАВИГАЦИИ */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(11, 8, 19, 0.95)', backdropFilter: 'blur(16px)', borderTop: '1px solid #23193d', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '12px 20px', zIndex: 50 }}>
        <button onClick={() => setActiveTab('inventory')} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: activeTab === 'inventory' ? 1 : 0.4 }}>
          <img src={ICONS.gift} alt="Инвентарь" style={{ width: '22px', height: '22px', filter: 'invert(1)' }} />
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
