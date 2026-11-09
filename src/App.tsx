import { useState, useEffect } from 'react';
import { useTonConnectUI, useTonWallet, useTonAddress, TonConnectButton } from '@tonconnect/ui-react';
import confetti from 'canvas-confetti';

const RECEIVER_TON_ADDRESS = 'UQAKTkSiwZWqUDUjlydR0fxQPaPfsHbNRn0kvy8tcJwKzkrT';
const STARS_PER_TON = 111;

const ICONS = {
  gift: '/icons/gift.png',
  stars: '/icons/stars.png',
  ton: '/icons/ton.png',
  cryptobot: '/icons/cryptobot.png',
  upgradeArrow: '/icons/upgrade-arrow.png',
};

interface TgUser {
  id: number;
  first_name: string;
  username?: string;
  photo_url?: string;
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
  const [activeTab, setActiveTab] = useState<'upgrade' | 'shop'>('upgrade');

  const [tgUser] = useState<TgUser>(() => {
    return (
      window.Telegram?.WebApp?.initDataUnsafe?.user || {
        first_name: 'Пользователь',
        id: 0,
      }
    );
  });

  const [balanceTon, setBalanceTon] = useState<number>(0.0);
  const [bankVault, setBankVault] = useState<BankGift[]>([]);
  const [userInventory, setUserInventory] = useState<BankGift[]>([]);

  // Реальный онлайн, приходящий от сервера (/api/online)
  const [onlineCount, setOnlineCount] = useState<number>(1);

  // Статистика выведенных предметов из localStorage
  const [withdrawnCount] = useState<number>(() => {
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0;
    const saved = localStorage.getItem(`withdrawn_count_${userId}`);
    return saved ? parseInt(saved, 10) : 0;
  });

  const [withdrawnTotalTon] = useState<number>(() => {
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0;
    const saved = localStorage.getItem(`withdrawn_total_${userId}`);
    return saved ? parseFloat(saved) : 0.0;
  });

  const [selectedSource, setSelectedSource] = useState<BankGift | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<BankGift | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinAngle, setSpinAngle] = useState(0);

  // Шторки
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositStep, setDepositStep] = useState<'methods' | 'stars' | 'wallet' | 'cryptobot'>('methods');
  const [tonAmountInput, setTonAmountInput] = useState('1.0');
  const [cryptoPayAmount, setCryptoPayAmount] = useState('1.0');
  const [starsToBuy, setStarsToBuy] = useState(111);

  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const userFriendlyAddress = useTonAddress();

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

    // Честный пинг реального онлайна: шлём POST с userId каждые 15 секунд
    const pingOnline = () => {
      fetch('/api/online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: tgUser.id || 0 }),
      })
        .then((res) => res.json())
        .then((data: { online?: number }) => {
          if (typeof data.online === 'number') {
            setOnlineCount(data.online);
          }
        })
        .catch(() => {});
    };

    pingOnline();
    const interval = setInterval(pingOnline, 15000);

    return () => clearInterval(interval);
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

  const handleOpenBankChat = () => {
    const tg = window.Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred('light');
    setIsDepositOpen(false);
    setIsProfileOpen(false);
    if (tg?.openTelegramLink) {
      tg.openTelegramLink('https://t.me/GuseBank');
    } else {
      window.open('https://t.me/GuseBank', '_blank');
    }
  };

  const handleDisconnectWallet = async () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
    try {
      await tonConnectUI.disconnect();
    } catch (e) {
      console.error('Ошибка отвязки кошелька:', e);
    }
  };

  const starsConvertedTon = (starsToBuy / STARS_PER_TON).toFixed(2);
  const userInitial = tgUser.first_name ? tgUser.first_name.charAt(0).toUpperCase() : 'U';

  const displayWalletAddress = userFriendlyAddress
    ? `${userFriendlyAddress.slice(0, 4)}...${userFriendlyAddress.slice(-4)}`
    : wallet
    ? `${wallet.account.address.slice(0, 4)}...${wallet.account.address.slice(-4)}`
    : '';

  return (
    <div
      style={{
        backgroundColor: '#090514',
        color: '#fff',
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        paddingBottom: '100px',
        zoom: 0.91,
      }}
    >
      {/* Шапка: логотип + реальный ОНЛАЙН, Баланс и Аватарка */}
      <div
        style={{
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#120d24',
          borderBottom: '1px solid #23193d',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            onClick={() => setActiveTab('upgrade')}
            style={{ fontWeight: '900', fontSize: '18px', letterSpacing: '-0.4px', color: '#fff', cursor: 'pointer' }}
          >
            Guse<span style={{ color: '#eab308' }}>Up</span>
          </div>

          {/* Реальный счетчик онлайн */}
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '12px',
              padding: '3px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 8px #22c55e',
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#4ade80' }}>
              {onlineCount}
            </span>
          </div>
        </div>

        {/* Правый блок: Баланс + Аватарка */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            onClick={() => {
              setIsDepositOpen(true);
              setDepositStep('methods');
            }}
            style={{
              background: 'linear-gradient(135deg, #1f163d 0%, #150f29 100%)',
              border: '1px solid #3b2d6b',
              borderRadius: '24px',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: '900', color: '#0098ea', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <img src={ICONS.ton} alt="TON" style={{ width: '15px', height: '15px', borderRadius: '3px' }} />
              {balanceTon.toFixed(2)} TON
            </div>
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#eab308',
                color: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '900',
                fontSize: '13px',
              }}
            >
              +
            </div>
          </div>

          <div
            onClick={() => {
              window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
              setIsProfileOpen(true);
            }}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #a855f7 0%, #6b21a8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              border: '2px solid #eab308',
              boxShadow: '0 2px 10px rgba(234, 179, 8, 0.35)',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'transform 0.15s ease',
            }}
          >
            {tgUser.photo_url ? (
              <img src={tgUser.photo_url} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontWeight: '800', fontSize: '14px', color: '#fff' }}>{userInitial}</span>
            )}
          </div>
        </div>
      </div>

      {/* АРЕНА АПГРЕЙДА */}
      {activeTab === 'upgrade' && (
        <div style={{ padding: '16px 18px 10px 18px' }}>
          <div style={{ background: '#130e24', borderRadius: '26px', border: '1px solid #271c47', padding: '22px 14px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            <div style={{ position: 'relative', width: '140px', height: '140px', margin: '0 auto 18px auto' }}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: chance > 0 ? `conic-gradient(#a855f7 0% ${chance}%, #1f1738 ${chance}% 100%)` : '#1f1738',
                  boxShadow: '0 0 18px rgba(168, 85, 247, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: '102px', height: '102px', borderRadius: '50%', background: '#090514', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: '900', color: chance > 0 ? '#c084fc' : '#5b4d7a' }}>{chance}%</div>
                  <span style={{ fontSize: '9px', color: '#8b7fa8', fontWeight: '700' }}>ШАНС</span>
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
                <div style={{ width: '4px', height: '20px', background: '#eab308', margin: '0 auto', borderRadius: '4px', boxShadow: '0 0 10px #eab308' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
              <div
                style={{
                  width: '110px',
                  height: '120px',
                  borderRadius: '20px',
                  background: '#171126',
                  border: selectedSource ? '2px solid #a855f7' : '2px dashed #3a2b61',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px',
                }}
              >
                {selectedSource ? (
                  <>
                    <img src={selectedSource.image_url} alt="" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
                    <span style={{ fontSize: '11px', fontWeight: '800', marginTop: '6px' }}>{selectedSource.name}</span>
                    <span style={{ fontSize: '10px', color: '#0098ea', fontWeight: '700' }}>💎 {selectedSource.price_ton}</span>
                  </>
                ) : (
                  <span style={{ fontSize: '11px', color: '#8b7fa8', fontWeight: '600' }}>Выбери из инвентаря</span>
                )}
              </div>

              <div style={{ fontSize: '18px', color: '#8b7fa8', fontWeight: '900' }}>➔</div>

              <div
                onClick={() => {
                  setActiveTab('shop');
                  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                }}
                style={{
                  width: '110px',
                  height: '120px',
                  borderRadius: '20px',
                  background: '#171126',
                  border: selectedTarget ? '2px solid #eab308' : '2px dashed #3a2b61',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: '6px',
                }}
              >
                {selectedTarget ? (
                  <>
                    <img src={selectedTarget.image_url} alt="" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
                    <span style={{ fontSize: '11px', fontWeight: '800', marginTop: '6px' }}>{selectedTarget.name}</span>
                    <span style={{ fontSize: '10px', color: '#0098ea', fontWeight: '700' }}>💎 {selectedTarget.price_ton}</span>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', color: '#8b7fa8', fontWeight: '700' }}>Цель</span>
                )}
              </div>
            </div>

            <button
              onClick={handleUpgrade}
              disabled={!selectedSource || !selectedTarget || isSpinning || chance <= 0}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '18px',
                border: 'none',
                background: isSpinning ? '#3b2d6b' : !selectedSource || !selectedTarget ? '#231a3b' : 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '800',
                cursor: !selectedSource || !selectedTarget || isSpinning ? 'not-allowed' : 'pointer',
                boxShadow: selectedSource && selectedTarget ? '0 4px 18px rgba(168, 85, 247, 0.4)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {isSpinning ? 'КРУТИМ РУЛЕТКУ...' : 'Улучшить'}
            </button>
          </div>

          {/* Инвентарь */}
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#fff' }}>
                Мой инвентарь ({userInventory.length})
              </div>
              <button
                onClick={() => {
                  setIsDepositOpen(true);
                  setDepositStep('methods');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#eab308',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Пополнить
              </button>
            </div>

            {userInventory.length === 0 ? (
              <div style={{ background: '#130e24', borderRadius: '22px', padding: '24px 16px', textAlign: 'center', border: '1px solid #271c47' }}>
                <div style={{ width: '48px', height: '48px', margin: '0 auto 8px auto', background: '#20163d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={ICONS.gift} alt="Инвентарь" style={{ width: '24px', height: '24px', filter: 'invert(1)' }} />
                </div>
                <div style={{ fontSize: '14px', fontWeight: '700' }}>Ваш инвентарь пуст</div>
                <p style={{ fontSize: '11px', color: '#8b7fa8', margin: '4px 0 12px 0' }}>
                  Выберите подарок на витрине магазина или отправьте NFT в Банк
                </p>
                <button
                  onClick={() => {
                    setActiveTab('shop');
                    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                  }}
                  style={{
                    background: '#a855f7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '14px',
                    padding: '9px 18px',
                    fontWeight: '700',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Перейти в магазин
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {userInventory.map((gift) => (
                  <div
                    key={gift.id}
                    onClick={() => {
                      setSelectedSource(gift);
                      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                    }}
                    style={{
                      background: '#1c1433',
                      borderRadius: '20px',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      cursor: 'pointer',
                      border: selectedSource?.id === gift.id ? '2px solid #a855f7' : '1px solid #2d2150',
                      boxShadow: selectedSource?.id === gift.id ? '0 0 12px rgba(168, 85, 247, 0.4)' : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '800', color: '#0098ea', alignSelf: 'flex-start' }}>
                      💎 {gift.price_ton}
                    </div>
                    <img src={gift.image_url} alt="" style={{ width: '46px', height: '46px', margin: '6px 0', objectFit: 'contain' }} />
                    <div style={{ fontSize: '10px', fontWeight: '700' }}>{gift.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* МАГАЗИН БАНКА */}
      {activeTab === 'shop' && (
        <div style={{ padding: '16px 18px 10px 18px' }}>
          <div style={{ fontSize: '17px', fontWeight: '800', marginBottom: '14px' }}>
            Магазин банка ({bankVault.length})
          </div>
          {bankVault.length === 0 ? (
            <div style={{ background: '#171126', borderRadius: '24px', padding: '32px 18px', textAlign: 'center', border: '1px solid #271c47' }}>
              <div style={{ width: '56px', height: '56px', margin: '0 auto 10px auto', background: '#20163d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={ICONS.gift} alt="Банк" style={{ width: '28px', height: '28px', filter: 'invert(1)' }} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: '800' }}>В банке пока нет доступных подарков</div>
              <p style={{ fontSize: '11px', color: '#8b7fa8', margin: '6px 0 14px 0' }}>
                Подарки появятся здесь, как только они поступят на баланс <b>@GuseBank</b>
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {bankVault.map((gift) => (
                <div
                  key={gift.id}
                  onClick={() => {
                    setSelectedTarget(gift);
                    setActiveTab('upgrade');
                    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                  }}
                  style={{
                    background: '#1c1433',
                    borderRadius: '20px',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                    border: selectedTarget?.id === gift.id ? '2px solid #eab308' : '1px solid #2d2150',
                  }}
                >
                  <div style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '800', color: '#0098ea', alignSelf: 'flex-start' }}>
                    💎 {gift.price_ton}
                  </div>
                  <img src={gift.image_url} alt="" style={{ width: '46px', height: '46px', margin: '6px 0', objectFit: 'contain' }} />
                  <div style={{ fontSize: '10px', fontWeight: '700' }}>{gift.name}</div>
                  <div style={{ fontSize: '8px', color: '#8b7fa8' }}>{gift.serial_number || '#0000'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ШТОРКА ПРОФИЛЯ */}
      {isProfileOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 110, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#120d24', borderTopLeftRadius: '28px', borderTopRightRadius: '28px', padding: '20px 18px 36px 18px', borderTop: '1px solid #302257', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '17px', fontWeight: '800' }}>Мой профиль</div>
              <button
                onClick={() => setIsProfileOpen(false)}
                style={{
                  background: '#20163d',
                  border: 'none',
                  color: '#fff',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '12px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Карточка профиля */}
            <div style={{ background: 'linear-gradient(135deg, #1b1338 0%, #130d29 100%)', borderRadius: '22px', padding: '16px', border: '1px solid #33235d', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #a855f7 0%, #6b21a8 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    border: '2px solid #eab308',
                    flexShrink: 0,
                  }}
                >
                  {tgUser.photo_url ? (
                    <img src={tgUser.photo_url} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontWeight: '800', fontSize: '20px', color: '#fff' }}>{userInitial}</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '16px', fontWeight: '800' }}>{tgUser.first_name}</div>
                  <div style={{ fontSize: '11px', color: '#8b7fa8' }}>
                    {tgUser.username ? `@${tgUser.username}` : `ID: ${tgUser.id}`}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0e091e', padding: '12px 14px', borderRadius: '16px', border: '1px solid #23193d' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#8b7fa8', fontWeight: '700', textTransform: 'uppercase' }}>Баланс</div>
                  <div style={{ fontSize: '18px', fontWeight: '900', color: '#0098ea', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <img src={ICONS.ton} alt="TON" style={{ width: '18px', height: '18px', borderRadius: '4px' }} />
                    {balanceTon.toFixed(2)} TON
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    setIsDepositOpen(true);
                    setDepositStep('methods');
                  }}
                  style={{
                    background: '#eab308',
                    color: '#000',
                    border: 'none',
                    borderRadius: '14px',
                    padding: '9px 18px',
                    fontSize: '13px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(234, 179, 8, 0.35)',
                  }}
                >
                  Пополнить
                </button>
              </div>
            </div>

            {/* Кошелёк */}
            <div style={{ background: '#171126', borderRadius: '20px', padding: '14px', border: '1px solid #271c47', marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', color: '#8b7fa8', fontWeight: '700', marginBottom: '10px', textTransform: 'uppercase' }}>
                TON Кошелек
              </div>
              {wallet ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <img src={ICONS.ton} alt="TON" style={{ width: '32px', height: '32px' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '800', color: '#4ade80' }}>Кошелек привязан</div>
                      <div style={{ fontSize: '11px', color: '#a855f7', fontWeight: '700', letterSpacing: '0.2px' }}>
                        {displayWalletAddress}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnectWallet}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: '12px',
                      padding: '7px 12px',
                      fontSize: '11px',
                      fontWeight: '800',
                      cursor: 'pointer',
                    }}
                  >
                    Отвязать
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#8b7fa8' }}>Кошелек не подключен</div>
                  <TonConnectButton />
                </div>
              )}
            </div>

            {/* Статистика */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
              <div style={{ background: '#171126', borderRadius: '18px', padding: '12px 14px', border: '1px solid #271c47' }}>
                <div style={{ fontSize: '10px', color: '#8b7fa8', fontWeight: '700', textTransform: 'uppercase' }}>Выведено предметов</div>
                <div style={{ fontSize: '18px', fontWeight: '900', color: '#fff', marginTop: '4px' }}>
                  {withdrawnCount} шт.
                </div>
              </div>
              <div style={{ background: '#171126', borderRadius: '18px', padding: '12px 14px', border: '1px solid #271c47' }}>
                <div style={{ fontSize: '10px', color: '#8b7fa8', fontWeight: '700', textTransform: 'uppercase' }}>Общая сумма</div>
                <div style={{ fontSize: '18px', fontWeight: '900', color: '#0098ea', marginTop: '4px' }}>
                  💎 {withdrawnTotalTon.toFixed(2)} TON
                </div>
              </div>
            </div>

            {/* Инвентарь в профиле */}
            <div>
              <div style={{ fontSize: '14px', fontWeight: '800', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Инвентарь ({userInventory.length})</span>
                <span style={{ fontSize: '11px', color: '#8b7fa8' }}>Тапните для выбора</span>
              </div>

              {userInventory.length === 0 ? (
                <div style={{ background: '#171126', borderRadius: '18px', padding: '20px 14px', textAlign: 'center', border: '1px solid #271c47' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#8b7fa8' }}>В инвентаре пока нет предметов</div>
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      setActiveTab('shop');
                    }}
                    style={{
                      marginTop: '10px',
                      background: '#a855f7',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '7px 16px',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Перейти в магазин
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {userInventory.map((gift) => (
                    <div
                      key={gift.id}
                      onClick={() => {
                        setSelectedSource(gift);
                        setIsProfileOpen(false);
                        setActiveTab('upgrade');
                        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                      }}
                      style={{
                        background: '#1c1433',
                        borderRadius: '18px',
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        cursor: 'pointer',
                        border: selectedSource?.id === gift.id ? '2px solid #a855f7' : '1px solid #2d2150',
                      }}
                    >
                      <div style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '800', color: '#0098ea', alignSelf: 'flex-start' }}>
                        💎 {gift.price_ton}
                      </div>
                      <img src={gift.image_url} alt="" style={{ width: '42px', height: '42px', margin: '4px 0', objectFit: 'contain' }} />
                      <div style={{ fontSize: '10px', fontWeight: '700', textAlign: 'center' }}>{gift.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ШТОРКА ПОПОЛНЕНИЯ */}
      {isDepositOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 120, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#120d24', borderTopLeftRadius: '28px', borderTopRightRadius: '28px', padding: '20px 18px 36px 18px', borderTop: '1px solid #302257', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {depositStep !== 'methods' && (
                  <button onClick={() => setDepositStep('methods')} style={{ background: 'none', border: 'none', color: '#8b7fa8', fontSize: '16px', cursor: 'pointer' }}>
                    ←
                  </button>
                )}
                <div style={{ fontSize: '16px', fontWeight: '800' }}>
                  {depositStep === 'methods' && 'Способ пополнения'}
                  {depositStep === 'wallet' && 'Пополнение через TON'}
                  {depositStep === 'stars' && 'Оплата звёздами'}
                  {depositStep === 'cryptobot' && 'Пополнение CryptoBot'}
                </div>
              </div>
              <button
                onClick={() => setIsDepositOpen(false)}
                style={{
                  background: '#20163d',
                  border: 'none',
                  color: '#fff',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '12px',
                }}
              >
                ✕
              </button>
            </div>

            {depositStep === 'methods' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  onClick={handleOpenBankChat}
                  style={{
                    background: '#1b1436',
                    padding: '12px 14px',
                    borderRadius: '18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    border: '1px solid #2d2150',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#271c47', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={ICONS.gift} alt="Gifts" style={{ width: '20px', height: '20px', filter: 'invert(1)' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '14px' }}>Gifts</div>
                      <div style={{ fontSize: '10px', color: '#8b7fa8' }}>Перевод подарка на @GuseBank</div>
                    </div>
                  </div>
                  <span style={{ color: '#8b7fa8', fontSize: '18px' }}>›</span>
                </div>

                <div
                  onClick={() => setDepositStep('stars')}
                  style={{
                    background: '#1b1436',
                    padding: '12px 14px',
                    borderRadius: '18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    border: '1px solid #2d2150',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#271c47', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={ICONS.stars} alt="Stars" style={{ width: '24px', height: '24px' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '14px' }}>Telegram Stars</div>
                      <div style={{ fontSize: '10px', color: '#8b7fa8' }}>Курс: 111 звёзд = 1.00 TON</div>
                    </div>
                  </div>
                  <span style={{ color: '#8b7fa8', fontSize: '18px' }}>›</span>
                </div>

                <div
                  onClick={() => setDepositStep('wallet')}
                  style={{
                    background: '#1b1436',
                    padding: '12px 14px',
                    borderRadius: '18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    border: '1px solid #2d2150',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <img src={ICONS.ton} alt="TON" style={{ width: '34px', height: '34px' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '14px' }}>Ваш кошелёк (TON Connect)</div>
                      <div style={{ fontSize: '10px', color: '#8b7fa8' }}>Tonkeeper / Telegram Wallet</div>
                    </div>
                  </div>
                  <span style={{ color: '#8b7fa8', fontSize: '18px' }}>›</span>
                </div>

                <div
                  onClick={() => {
                    setDepositStep('cryptobot');
                    setCryptoPayAmount('1.0');
                  }}
                  style={{
                    background: '#1b1436',
                    padding: '12px 14px',
                    borderRadius: '18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    border: '1px solid #2d2150',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={ICONS.cryptobot} alt="CryptoBot" style={{ width: '34px', height: '34px' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '14px' }}>CryptoBot</div>
                      <div style={{ fontSize: '10px', color: '#8b7fa8' }}>Чек в @CryptoBot (TON / USDT)</div>
                    </div>
                  </div>
                  <span style={{ color: '#8b7fa8', fontSize: '18px' }}>›</span>
                </div>
              </div>
            )}

            {depositStep === 'stars' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '56px', height: '56px', margin: '0 auto 8px auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={ICONS.stars} alt="Stars" style={{ width: '56px', height: '56px' }} />
                </div>
                <div style={{ fontSize: '16px', fontWeight: '800' }}>Оплата звёздами</div>
                <p style={{ fontSize: '11px', color: '#8b7fa8', margin: '4px 0 14px 0' }}>
                  Курс конвертации: <b>111 ★ = 1.00 TON</b>
                </p>

                <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={starsToBuy || ''}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, '');
                      const val = parseInt(clean, 10);
                      setStarsToBuy(isNaN(val) ? 0 : val);
                    }}
                    placeholder="0"
                    style={{
                      width: '140px',
                      background: '#171126',
                      border: '2px solid #fbbf24',
                      borderRadius: '16px',
                      padding: '8px 12px',
                      fontSize: '28px',
                      fontWeight: '900',
                      color: '#fbbf24',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                  <img src={ICONS.stars} alt="★" style={{ width: '24px', height: '24px' }} />
                </div>

                <div style={{ fontSize: '13px', fontWeight: '800', color: '#0098ea', marginBottom: '16px' }}>
                  ≈ {starsConvertedTon} TON на баланс
                </div>

                <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
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
                        padding: '8px 2px',
                        borderRadius: '12px',
                        border: 'none',
                        background: starsToBuy === p.stars ? '#fbbf24' : '#1b1436',
                        color: starsToBuy === p.stars ? '#000' : '#fff',
                        fontWeight: '800',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {p.stars} ★<br />
                      <span style={{ fontSize: '9px', opacity: 0.8 }}>({p.ton} TON)</span>
                    </button>
                  ))}
                </div>

                <button
                  disabled={!starsToBuy || starsToBuy <= 0}
                  onClick={() => handleRealStarsPayment(starsToBuy)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '18px',
                    border: 'none',
                    background: starsToBuy > 0 ? '#eab308' : '#33294d',
                    color: starsToBuy > 0 ? '#000' : '#736b8a',
                    fontWeight: '800',
                    fontSize: '15px',
                    cursor: starsToBuy > 0 ? 'pointer' : 'not-allowed',
                    boxShadow: starsToBuy > 0 ? '0 4px 18px rgba(234, 179, 8, 0.4)' : 'none',
                  }}
                >
                  Заплатить {starsToBuy || 0} ★ (+{starsConvertedTon} TON)
                </button>
              </div>
            )}

            {depositStep === 'cryptobot' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '56px', height: '56px', margin: '0 auto 8px auto', borderRadius: '16px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={ICONS.cryptobot} alt="CryptoBot" style={{ width: '56px', height: '56px' }} />
                </div>
                <div style={{ fontSize: '16px', fontWeight: '800' }}>Оплата через CryptoBot</div>
                <p style={{ fontSize: '11px', color: '#8b7fa8', margin: '4px 0 14px 0' }}>
                  Введите сумму в TON для выставления счёта
                </p>

                <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={cryptoPayAmount}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
                      setCryptoPayAmount(clean);
                    }}
                    style={{
                      width: '140px',
                      background: '#171126',
                      border: '2px solid #0098ea',
                      borderRadius: '16px',
                      padding: '8px 12px',
                      fontSize: '28px',
                      fontWeight: '900',
                      color: '#0098ea',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '20px', color: '#0098ea', fontWeight: '800' }}>TON</span>
                </div>

                <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
                  {['0.5', '1.0', '5.0', '10.0'].map((val) => (
                    <button
                      key={val}
                      onClick={() => setCryptoPayAmount(val)}
                      style={{
                        flex: 1,
                        padding: '8px 0',
                        borderRadius: '12px',
                        border: 'none',
                        background: cryptoPayAmount === val ? '#0098ea' : '#1b1436',
                        color: cryptoPayAmount === val ? '#fff' : '#8b7fa8',
                        fontWeight: '800',
                        fontSize: '11px',
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
                    padding: '14px',
                    borderRadius: '18px',
                    border: 'none',
                    background: '#0098ea',
                    color: '#fff',
                    fontWeight: '800',
                    fontSize: '15px',
                    cursor: 'pointer',
                  }}
                >
                  Перейти к оплате {cryptoPayAmount || '0'} TON
                </button>
              </div>
            )}

            {depositStep === 'wallet' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '56px', height: '56px', margin: '0 auto 10px auto', borderRadius: '14px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src={ICONS.ton} alt="TON" style={{ width: '56px', height: '56px' }} />
                </div>

                <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'center' }}>
                  <TonConnectButton />
                </div>

                {wallet ? (
                  <div>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '11px', color: '#8b7fa8', display: 'block', marginBottom: '6px' }}>
                        Сумма пополнения TON:
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={tonAmountInput}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
                          setTonAmountInput(clean);
                        }}
                        style={{
                          background: '#171126',
                          border: '1px solid #3b2d6b',
                          borderRadius: '14px',
                          padding: '8px 12px',
                          color: '#fff',
                          fontSize: '20px',
                          fontWeight: '800',
                          textAlign: 'center',
                          width: '120px',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <button
                      onClick={handleRealTonDeposit}
                      style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '18px',
                        border: 'none',
                        background: '#0098ea',
                        color: '#fff',
                        fontWeight: '800',
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      Оплатить через Tonkeeper / Wallet
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: '#8b7fa8', margin: '10px 0 0 0' }}>
                    Нажмите кнопку выше, чтобы привязать Tonkeeper или Telegram Wallet
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* НИЖНЯЯ ПАНЕЛЬ НАВИГАЦИИ */}
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
          padding: '8px 18px',
          zIndex: 50,
        }}
      >
        <button
          onClick={handleOpenBankChat}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: 0.7,
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img src={ICONS.gift} alt="Gifts" style={{ width: '22px', height: '22px', filter: 'invert(1)' }} />
        </button>

        <button
          onClick={() => {
            setActiveTab('upgrade');
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
          }}
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: activeTab === 'upgrade' ? '#171126' : '#130d24',
            border: activeTab === 'upgrade' ? '2.5px solid #eab308' : '1.5px solid #3b2d6b',
            boxShadow: activeTab === 'upgrade' ? '0 0 16px rgba(234, 179, 8, 0.45)' : '0 2px 8px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            transform: 'translateY(-6px)',
            transition: 'all 0.2s',
          }}
        >
          <img
            src={ICONS.upgradeArrow}
            alt="Апгрейд"
            style={{
              width: '32px',
              height: '32px',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </button>

        <button
          onClick={() => {
            setActiveTab('shop');
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: activeTab === 'shop' ? 1 : 0.45,
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '22px' }}>🛒</span>
        </button>
      </div>
    </div>
  );
}
