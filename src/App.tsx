import { useState, useEffect, useCallback } from 'react';
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
  shop: '/icons/shop.png',
  profile: '/icons/profile.png',
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

  // Ползунок ставки балансом: процент от баланса (0%..100%)
  const [balanceSliderPercent, setBalanceSliderPercent] = useState<number>(0);

  // Переключатель под кнопкой: «Инвентарь» / «Желаемый предмет»
  const [subTab, setSubTab] = useState<'inventory' | 'targets'>('inventory');

  // Быстрая анимация рулетки (молния)
  const [isFastSpin, setIsFastSpin] = useState<boolean>(() => {
    return localStorage.getItem('guse_fast_spin') === 'true';
  });

  // Настраиваемые коэффициенты X (по умолчанию: x2, x4, x8)
  const [customMultipliers, setCustomMultipliers] = useState<[number, number, number]>(() => {
    const saved = localStorage.getItem('guse_custom_multipliers');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 3) return [parsed[0], parsed[1], parsed[2]];
      } catch (err) {
        console.error(err);
      }
    }
    return [2, 4, 8];
  });

  // Настраиваемые проценты % (по умолчанию: 35%, 55%, 75%)
  const [customPercents, setCustomPercents] = useState<[number, number, number]>(() => {
    const saved = localStorage.getItem('guse_custom_percents');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 3) return [parsed[0], parsed[1], parsed[2]];
      } catch (err) {
        console.error(err);
      }
    }
    return [35, 55, 75];
  });

  // Временные значения инпутов для модалки настроек
  const [tempMultipliers, setTempMultipliers] = useState<[string, string, string]>(['2', '4', '8']);
  const [tempPercents, setTempPercents] = useState<[string, string, string]>(['35', '55', '75']);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Активный выбранный пресет кнопки (x2, x4, x8, 35%, 55%, 75%)
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Онлайн
  const [onlineCount, setOnlineCount] = useState<number>(1);

  // Статистика выведенных предметов
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

  // Угол поворота стрелки вокруг колеса (колесо остаётся неподвижным!)
  const [arrowAngle, setArrowAngle] = useState<number>(0);

  // Шторки
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositStep, setDepositStep] = useState<'methods' | 'gifts' | 'stars' | 'wallet' | 'cryptobot'>('methods');
  const [tonAmountInput, setTonAmountInput] = useState('1.0');
  const [cryptoPayAmount, setCryptoPayAmount] = useState('1.0');
  const [starsToBuy, setStarsToBuy] = useState(111);
  const [isCheckingInventory, setIsCheckingInventory] = useState(false);

  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const userFriendlyAddress = useTonAddress();

  const loadInventory = useCallback(() => {
    if (!tgUser.id) return;
    setIsCheckingInventory(true);
    fetch(`/api/inventory/${tgUser.id}`)
      .then((res) => res.json())
      .then((data: { items?: BankGift[] }) => {
        if (data.items) setUserInventory(data.items);
      })
      .catch(() => {})
      .finally(() => setIsCheckingInventory(false));
  }, [tgUser.id]);

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

    // Честный пинг реального онлайна
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

  // Сумма ставки с баланса по полоске
  const balanceBetTon = Number(((balanceTon * balanceSliderPercent) / 100).toFixed(2));
  // Общая сумма ставки: предмет из инвентаря + добавка с баланса
  const totalBetAmount = Number(((selectedSource ? selectedSource.price_ton : 0) + balanceBetTon).toFixed(2));

  // Вычисление целевой суммы TON, если цель задана кнопками коэффициентов/процентов
  const calculateTargetBalanceTon = (): number => {
    if (!activePreset || totalBetAmount <= 0) return 0;
    if (activePreset === 'm1') return Number((totalBetAmount * customMultipliers[0]).toFixed(2));
    if (activePreset === 'm2') return Number((totalBetAmount * customMultipliers[1]).toFixed(2));
    if (activePreset === 'm3') return Number((totalBetAmount * customMultipliers[2]).toFixed(2));
    if (activePreset === 'p1') return Number(((totalBetAmount * 0.95 * 100) / customPercents[0]).toFixed(2));
    if (activePreset === 'p2') return Number(((totalBetAmount * 0.95 * 100) / customPercents[1]).toFixed(2));
    if (activePreset === 'p3') return Number(((totalBetAmount * 0.95 * 100) / customPercents[2]).toFixed(2));
    return 0;
  };

  const targetBalanceTon = calculateTargetBalanceTon();

  // Итоговая стоимость цели (либо выигрышный баланс TON по кнопкам коэффициентов, либо выбранный подарок)
  const targetPriceTon = activePreset && targetBalanceTon > 0
    ? targetBalanceTon
    : (selectedTarget ? selectedTarget.price_ton : 0);

  const calculateChance = (): number => {
    if (targetPriceTon <= 0 || totalBetAmount <= 0) return 0;
    if (activePreset && (activePreset === 'p1' || activePreset === 'p2' || activePreset === 'p3')) {
      if (activePreset === 'p1') return customPercents[0];
      if (activePreset === 'p2') return customPercents[1];
      if (activePreset === 'p3') return customPercents[2];
    }
    if (totalBetAmount >= targetPriceTon) return 0;
    const raw = (totalBetAmount / targetPriceTon) * 0.95 * 100;
    return Math.min(Math.max(Number(raw.toFixed(2)), 1.0), 85.0);
  };

  const chance = calculateChance();

  // Подпись сложности шанса
  const getChanceLabel = (c: number): string => {
    if (c <= 0) return 'Ожидание';
    if (c < 25) return 'Низкий шанс';
    if (c <= 60) return 'Средний шанс';
    return 'Высокий шанс';
  };

  // Быстрая крутка (молния)
  const toggleFastSpin = () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
    setIsFastSpin((prev) => {
      const next = !prev;
      localStorage.setItem('guse_fast_spin', String(next));
      return next;
    });
  };

  // Сброс множителей по умолчанию
  const resetMultipliers = () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    setTempMultipliers(['2', '4', '8']);
    setCustomMultipliers([2, 4, 8]);
    localStorage.setItem('guse_custom_multipliers', JSON.stringify([2, 4, 8]));
  };

  // Сброс процентов по умолчанию
  const resetPercents = () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    setTempPercents(['35', '55', '75']);
    setCustomPercents([35, 55, 75]);
    localStorage.setItem('guse_custom_percents', JSON.stringify([35, 55, 75]));
  };

  // Сохранение настроек в модалке «Быстрый подбор»
  const handleSaveSettings = () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');

    const m1 = Math.max(1.1, parseFloat(tempMultipliers[0]) || 2);
    const m2 = Math.max(1.1, parseFloat(tempMultipliers[1]) || 4);
    const m3 = Math.max(1.1, parseFloat(tempMultipliers[2]) || 8);
    const updatedMults: [number, number, number] = [m1, m2, m3];
    setCustomMultipliers(updatedMults);
    localStorage.setItem('guse_custom_multipliers', JSON.stringify(updatedMults));

    const p1 = Math.min(85, Math.max(1, parseInt(tempPercents[0], 10) || 35));
    const p2 = Math.min(85, Math.max(1, parseInt(tempPercents[1], 10) || 55));
    const p3 = Math.min(85, Math.max(1, parseInt(tempPercents[2], 10) || 75));
    const updatedPercs: [number, number, number] = [p1, p2, p3];
    setCustomPercents(updatedPercs);
    localStorage.setItem('guse_custom_percents', JSON.stringify(updatedPercs));

    setIsSettingsOpen(false);
  };

  // Клик по кнопкам коэффициента/процентов: выбирает целью баланс TON
  const handlePresetClick = (presetId: string) => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');

    if (activePreset === presetId) {
      setActivePreset(null);
      return;
    }

    if (totalBetAmount <= 0 && balanceTon > 0) {
      setBalanceSliderPercent(25);
    }

    setActivePreset(presetId);
    setSelectedTarget(null);
  };

  // Апгрейд: КОЛЕСО НЕПОДВИЖНО, КРУТИТСЯ СТРЕЛКА ВОКРУГ КОЛЕСА
  const handleUpgrade = () => {
    if (isSpinning || chance <= 0 || totalBetAmount <= 0 || targetPriceTon <= totalBetAmount) return;

    if (balanceBetTon > balanceTon) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
      return;
    }

    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy');
    setIsSpinning(true);

    const roll = Math.random() * 100;
    const isWin = roll < chance;

    // Сектор шанса начинается снизу у отметки 0% (180°) и идёт по часовой стрелке направо на sectorSpan градусов
    const sectorSpan = (chance / 100) * 360;

    // Стрелка начинает внизу (0° локального поворота).
    // При вращении стрелки по часовой стрелке:
    // Зона выигрыша: от (360° - sectorSpan) до 360° (оранжевый сектор справа).
    // Зона проигрыша: от 0° до (360° - sectorSpan) (тёмный сектор слева).
    const winZoneStart = 360 - sectorSpan;
    const padding = Math.min(3, sectorSpan * 0.05);

    let targetAngle = 0;
    if (isWin) {
      // Случайная точка строго внутри оранжевого сектора
      targetAngle = winZoneStart + padding + Math.random() * (sectorSpan - padding * 2);
    } else {
      // Случайная точка строго внутри тёмной зоны
      const looseSpan = 360 - sectorSpan;
      targetAngle = padding + Math.random() * (looseSpan - padding * 2);
    }

    // Вычисляем плавный доворот с полными оборотами
    const currentMod = arrowAngle % 360;
    let diff = targetAngle - currentMod;
    if (diff < 0) diff += 360;

    const extraFullSpins = isFastSpin ? 360 * 3 : 360 * 6;
    const nextArrowAngle = arrowAngle + extraFullSpins + diff;
    setArrowAngle(nextArrowAngle);

    const spinDuration = isFastSpin ? 800 : 3200;

    // Списываем поставленный баланс
    let currentBal = balanceTon;
    if (balanceBetTon > 0) {
      currentBal = Number(Math.max(0, balanceTon - balanceBetTon).toFixed(2));
      saveBalanceToDb(currentBal);
    }

    setTimeout(() => {
      setIsSpinning(false);
      if (isWin) {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } });

        if (activePreset && targetBalanceTon > 0) {
          const updatedBal = Number((currentBal + targetBalanceTon).toFixed(2));
          saveBalanceToDb(updatedBal);

          if (selectedSource) {
            setUserInventory((prev) => prev.filter((i) => i.id !== selectedSource.id));
          }
        } else if (selectedTarget) {
          if (selectedSource) {
            setUserInventory((prev) => [
              ...prev.filter((i) => i.id !== selectedSource.id),
              { ...selectedTarget, id: Date.now() },
            ]);
          } else {
            setUserInventory((prev) => [
              ...prev,
              { ...selectedTarget, id: Date.now() },
            ]);
          }
        }

        setSelectedSource(null);
        setSelectedTarget(null);
        setActivePreset(null);
        setBalanceSliderPercent(0);
      } else {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
        if (selectedSource) {
          setUserInventory((prev) => prev.filter((i) => i.id !== selectedSource.id));
        }
        setSelectedSource(null);
        setActivePreset(null);
        setBalanceSliderPercent(0);
      }
    }, spinDuration);
  };

  // Оплата звёздами
  const handleRealStarsPayment = async (amountStars: number) => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

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
      if (!data.invoiceLink) return;

      if (tg.openInvoice) {
        tg.openInvoice(data.invoiceLink, (status: string) => {
          if (status === 'paid') {
            tg.HapticFeedback?.notificationOccurred('success');
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });

            const addedTon = Number((amountStars / STARS_PER_TON).toFixed(2));
            const newTon = Number((balanceTon + addedTon).toFixed(2));
            saveBalanceToDb(newTon);

            setIsDepositOpen(false);
          }
        });
      }
    } catch (err: unknown) {
      console.error(err);
    }
  };

  // Пополнение TON через кошелек
  const handleRealTonDeposit = async () => {
    if (!wallet) return;

    const amountNano = Math.floor(parseFloat(tonAmountInput) * 1e9);
    if (isNaN(amountNano) || amountNano <= 0) return;

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
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.5 } });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Ошибка отправки';
      console.error(errorMsg);
    }
  };

  // Оплата через CryptoBot
  const handleCryptoBotPayment = async () => {
    const tg = window.Telegram?.WebApp;
    const amount = parseFloat(cryptoPayAmount);
    if (isNaN(amount) || amount <= 0) return;

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
      }
    } catch (err) {
      console.error(err);
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

  const hasTarget = (activePreset && targetBalanceTon > 0) || !!selectedTarget;
  const canUpgrade = !isSpinning && hasTarget && chance > 0 && totalBetAmount > 0 && balanceBetTon <= balanceTon && targetPriceTon > totalBetAmount;

  // Оранжевый сектор начинается ровно снизу у отметки 0% (180°) и идёт по правой стороне вверх
  // Ровно как на прикреплённом скриншоте!
  const wheelConic = chance > 0
    ? `conic-gradient(from 180deg, #181424 0%, #181424 ${100 - chance}%, #ffb703 ${100 - chance}%, #fb8500 100%)`
    : '#181424';

  return (
    <div
      style={{
        backgroundColor: '#090514',
        color: '#fff',
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        paddingBottom: '90px',
        zoom: 0.91,
      }}
    >
      <style>{`
        input[type=range] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
        }
        input[type=range]::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 4px;
          background: #231b3d;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #8e8a9d;
          box-shadow: 0 2px 6px rgba(0,0,0,0.6);
          margin-top: -8px;
          transition: transform 0.1s;
        }
        input[type=range]:active::-webkit-slider-thumb {
          transform: scale(1.15);
          background: #0098ea;
        }
        input[type=range]::-moz-range-track {
          height: 6px;
          border-radius: 4px;
          background: #231b3d;
        }
        input[type=range]::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border: none;
          border-radius: 50%;
          background: #8e8a9d;
          box-shadow: 0 2px 6px rgba(0,0,0,0.6);
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>

      {/* ЗАКРУГЛЕННАЯ ВЕРХНЯЯ ПАНЕЛЬ */}
      <div style={{ padding: '12px 14px 0 14px' }}>
        <div
          style={{
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(18, 13, 36, 0.92)',
            backdropFilter: 'blur(16px)',
            borderRadius: '24px',
            border: '1px solid #281d45',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {/* Онлайн */}
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '16px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <div
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 8px #22c55e',
              }}
            />
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#4ade80' }}>
              {onlineCount}
            </span>
          </div>

          {/* Баланс + Аватарка */}
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
      </div>

      {/* АРЕНА АПГРЕЙДА */}
      {activeTab === 'upgrade' && (
        <div style={{ padding: '16px 18px 10px 18px' }}>
          <div style={{ position: 'relative', background: '#130e24', borderRadius: '26px', border: '1px solid #271c47', padding: '20px 14px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            
            {/* Кнопки молнии и шестерёнки */}
            <div
              style={{
                position: 'absolute',
                top: '14px',
                left: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                zIndex: 10,
              }}
            >
              <button
                onClick={toggleFastSpin}
                title={isFastSpin ? 'Быстрая крутка включена' : 'Быстрая крутка выключена'}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '12px',
                  border: isFastSpin ? '1.5px solid #eab308' : '1px solid #2f2352',
                  background: isFastSpin ? 'rgba(234, 179, 8, 0.2)' : '#1a1333',
                  color: isFastSpin ? '#eab308' : '#71658f',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isFastSpin ? '0 0 10px rgba(234, 179, 8, 0.4)' : 'none',
                  transition: 'all 0.2s',
                  padding: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={isFastSpin ? '#eab308' : 'currentColor'}>
                  <path d="M13 2L3 14h7v8l11-13h-8l0-7z" />
                </svg>
              </button>

              <button
                onClick={() => {
                  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                  setTempMultipliers([String(customMultipliers[0]), String(customMultipliers[1]), String(customMultipliers[2])]);
                  setTempPercents([String(customPercents[0]), String(customPercents[1]), String(customPercents[2])]);
                  setIsSettingsOpen(true);
                }}
                title="Настроить быстрый подбор"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '12px',
                  border: '1px solid #2f2352',
                  background: '#1a1333',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  padding: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>

            {/* КОЛЕСО РУЛЕТКИ: КОЛЕСО НЕПОДВИЖНО, СТРЕЛКА ВРАЩАЕТСЯ ВОКРУГ НЕГО */}
            <div
              style={{
                position: 'relative',
                width: '210px',
                height: '210px',
                margin: '0 auto 16px auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Метки 50% слева и справа снаружи */}
              <div
                style={{
                  position: 'absolute',
                  left: '-18px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#4b4363',
                  userSelect: 'none',
                }}
              >
                50%
              </div>
              <div
                style={{
                  position: 'absolute',
                  right: '-18px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#4b4363',
                  userSelect: 'none',
                }}
              >
                50%
              </div>

              {/* Внешнее тонкое кольцо с оранжевой обводкой снизу под сектором */}
              <div
                style={{
                  position: 'absolute',
                  width: '202px',
                  height: '202px',
                  borderRadius: '50%',
                  border: '1.5px solid #231c38',
                  borderBottom: chance > 0 ? '2px solid #ff7b00' : '1.5px solid #231c38',
                  boxShadow: chance > 0 ? '0 0 18px rgba(255, 123, 0, 0.35)' : 'none',
                  pointerEvents: 'none',
                }}
              />

              {/* НЕПОДВИЖНЫЙ ДИСК КОЛЕСА СО СВЕТОВЫМ СЕКТОРОМ ШАНСА */}
              <div
                style={{
                  width: '184px',
                  height: '184px',
                  borderRadius: '50%',
                  background: wheelConic,
                  boxShadow: chance > 0 ? 'inset 0 0 20px rgba(0,0,0,0.8), 0 0 24px rgba(255, 133, 0, 0.25)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Неподвижная центральная сердцевина с процентами и текстом */}
                <div
                  style={{
                    width: '128px',
                    height: '128px',
                    borderRadius: '50%',
                    background: '#0d091a',
                    boxShadow: '0 0 18px rgba(0,0,0,0.9), inset 0 0 12px rgba(0,0,0,0.8)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none',
                  }}
                >
                  <div
                    style={{
                      fontSize: '26px',
                      fontWeight: '900',
                      color: '#ffffff',
                      letterSpacing: '-0.5px',
                      lineHeight: '1.1',
                    }}
                  >
                    {chance > 0 ? `${chance.toFixed(2)}%` : '0%'}
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#8b839e',
                      fontWeight: '600',
                      marginTop: '4px',
                    }}
                  >
                    {getChanceLabel(chance)}
                  </span>
                </div>
              </div>

              {/* ВРАЩАЮЩИЙСЯ КОНТЕЙНЕР СТРЕЛКИ ВОКРУГ КОЛЕСА */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  transform: `rotate(${arrowAngle}deg)`,
                  transition: isSpinning
                    ? `transform ${isFastSpin ? '0.8s cubic-bezier(0.1, 0.9, 0.2, 1)' : '3.2s cubic-bezier(0.12, 0.8, 0.2, 1)'}`
                    : 'none',
                  pointerEvents: 'none',
                }}
              >
                {/* Стрелка на 6 часах (внизу), направленная остриём к центру колеса */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-3px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  {/* Острие стрелки вверх в колесо */}
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderBottom: '9px solid #ffb703',
                      filter: 'drop-shadow(0 0 6px rgba(255, 183, 3, 0.9))',
                    }}
                  />
                  {/* Стержень стрелки */}
                  <div
                    style={{
                      width: '2px',
                      height: '13px',
                      background: '#ffb703',
                      boxShadow: '0 0 6px #ffb703',
                    }}
                  />
                  {/* Светящаяся точка на ободке */}
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#ffb703',
                      boxShadow: '0 0 8px #ffb703',
                      marginTop: '-2px',
                    }}
                  />
                </div>
              </div>

              {/* Неподвижная метка 0% снизу на ободке */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '-18px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '10px',
                  fontWeight: '800',
                  color: '#8b839e',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              >
                0%
              </div>
            </div>

            {/* Карточки апгрейда: Исходная ставка -> Желаемая цель */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
              {/* ЛЕВАЯ КАРТОЧКА: ПРЕДМЕТ + БАЛАНС (ИЛИ ТОЛЬКО БАЛАНС) */}
              <div
                onClick={() => setSubTab('inventory')}
                style={{
                  width: '115px',
                  height: '124px',
                  borderRadius: '20px',
                  background: '#171126',
                  border: totalBetAmount > 0 ? '2px solid #a855f7' : '2px dashed #3a2b61',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                {selectedSource ? (
                  <>
                    <img src={selectedSource.image_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                    <span style={{ fontSize: '11px', fontWeight: '800', marginTop: '4px' }}>{selectedSource.name}</span>
                    <span style={{ fontSize: '10px', color: '#0098ea', fontWeight: '700' }}>
                      💎 {totalBetAmount} {balanceBetTon > 0 && <span style={{ color: '#4ade80', fontSize: '9px' }}>(+{balanceBetTon})</span>}
                    </span>
                  </>
                ) : balanceBetTon > 0 ? (
                  <>
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(0, 152, 234, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #0098ea', marginBottom: '4px' }}>
                      <img src={ICONS.ton} alt="TON" style={{ width: '22px', height: '22px' }} />
                    </div>
                    <span style={{ fontSize: '10px', color: '#8b7fa8', fontWeight: '700', textTransform: 'uppercase' }}>Баланс</span>
                    <span style={{ fontSize: '12px', color: '#0098ea', fontWeight: '900', marginTop: '2px' }}>
                      💎 {balanceBetTon} TON
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: '11px', color: '#8b7fa8', fontWeight: '600' }}>Выбери подарок или баланс</span>
                )}

                {/* Кнопка сброса предмета */}
                {selectedSource && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSource(null);
                    }}
                    title="Убрать подарок"
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      background: 'rgba(0,0,0,0.6)',
                      border: 'none',
                      color: '#fff',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      fontSize: '10px',
                      lineHeight: '1',
                      padding: 0,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Стрелка направления */}
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#19122e',
                  border: '1px solid #362859',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#c084fc',
                  boxShadow: '0 0 12px rgba(168, 85, 247, 0.25)',
                  flexShrink: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <polyline points="14 6 20 12 14 18" />
                </svg>
              </div>

              {/* ПРАВАЯ КАРТОЧКА: ЦЕЛЬ (БАЛАНС TON ИЛИ ПОДАРОК) */}
              <div
                onClick={() => setSubTab('targets')}
                style={{
                  width: '115px',
                  height: '124px',
                  borderRadius: '20px',
                  background: '#171126',
                  border: hasTarget ? '2px solid #eab308' : '2px dashed #3a2b61',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: '6px',
                  position: 'relative',
                }}
              >
                {activePreset && targetBalanceTon > 0 ? (
                  <>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(234, 179, 8, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #eab308', marginBottom: '4px' }}>
                      <img src={ICONS.ton} alt="TON" style={{ width: '22px', height: '22px' }} />
                    </div>
                    <span style={{ fontSize: '10px', color: '#eab308', fontWeight: '800', textTransform: 'uppercase' }}>Баланс TON</span>
                    <span style={{ fontSize: '13px', color: '#0098ea', fontWeight: '900', marginTop: '2px' }}>
                      💎 {targetBalanceTon} TON
                    </span>
                  </>
                ) : selectedTarget ? (
                  <>
                    <img src={selectedTarget.image_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                    <span style={{ fontSize: '11px', fontWeight: '800', marginTop: '4px' }}>{selectedTarget.name}</span>
                    <span style={{ fontSize: '10px', color: '#0098ea', fontWeight: '700' }}>💎 {selectedTarget.price_ton}</span>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', color: '#8b7fa8', fontWeight: '700' }}>Цель</span>
                )}
              </div>
            </div>

            {/* ПОЛОСКА СТАВКИ БАЛАНСОМ */}
            <div
              style={{
                background: '#150f29',
                borderRadius: '18px',
                padding: '10px 14px',
                border: '1px solid #281d45',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              {/* Левая часть: Подпись "Ставка" + иконка TON и сумма */}
              <div style={{ textAlign: 'left', minWidth: '70px', flexShrink: 0 }}>
                <div style={{ fontSize: '11px', color: '#8b7fa8', fontWeight: '700' }}>Ставка</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <img src={ICONS.ton} alt="TON" style={{ width: '14px', height: '14px', borderRadius: '3px' }} />
                  <span style={{ fontSize: '13px', fontWeight: '900', color: '#fff' }}>
                    {balanceBetTon.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Центр: Ползунок слайдер */}
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={balanceSliderPercent}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setBalanceSliderPercent(val);
                  }}
                  style={{ width: '100%', zIndex: 2 }}
                />
              </div>

              {/* Правая часть: Бейдж с процентом (0%, 25%, 50%, 100%) */}
              <div
                onClick={() => {
                  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                  if (balanceSliderPercent === 0) setBalanceSliderPercent(25);
                  else if (balanceSliderPercent === 25) setBalanceSliderPercent(50);
                  else if (balanceSliderPercent === 50) setBalanceSliderPercent(100);
                  else setBalanceSliderPercent(0);
                }}
                style={{
                  background: '#22193d',
                  border: '1px solid #36285c',
                  borderRadius: '12px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: '900',
                  color: balanceSliderPercent > 0 ? '#0098ea' : '#fff',
                  cursor: 'pointer',
                  minWidth: '42px',
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                {balanceSliderPercent}%
              </div>
            </div>

            {/* КНОПКА АПГРЕЙДА */}
            <button
              onClick={handleUpgrade}
              disabled={!canUpgrade}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '18px',
                border: 'none',
                background: isSpinning
                  ? '#3b2d6b'
                  : !canUpgrade
                  ? '#231a3b'
                  : 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '800',
                cursor: !canUpgrade ? 'not-allowed' : 'pointer',
                boxShadow: canUpgrade ? '0 4px 18px rgba(168, 85, 247, 0.4)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {isSpinning
                ? (isFastSpin ? '⚡ БЫСТРАЯ КРУТКА...' : 'КРУТИМ РУЛЕТКУ...')
                : totalBetAmount <= 0
                ? 'Сделайте ставку'
                : !hasTarget
                ? 'Выберите цель'
                : activePreset && targetBalanceTon > 0
                ? `Выиграть ${targetBalanceTon} TON`
                : 'Улучшить'}
            </button>
          </div>

          {/* КНОПКИ КОЭФФИЦИЕНТОВ И ПРОЦЕНТОВ */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              marginTop: '14px',
              justifyContent: 'space-between',
            }}
          >
            {[
              { id: 'm1', label: `x${customMultipliers[0]}`, border: '#3b2d6b' },
              { id: 'm2', label: `x${customMultipliers[1]}`, border: '#3b2d6b' },
              { id: 'm3', label: `x${customMultipliers[2]}`, border: '#3b2d6b' },
              { id: 'p1', label: `${customPercents[0]}%`, border: '#ef4444' },
              { id: 'p2', label: `${customPercents[1]}%`, border: '#eab308' },
              { id: 'p3', label: `${customPercents[2]}%`, border: '#22c55e' },
            ].map((btn) => {
              const isSelected = activePreset === btn.id;
              return (
                <button
                  key={btn.id}
                  onClick={() => handlePresetClick(btn.id)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: '20px',
                    background: isSelected ? 'rgba(255,255,255,0.14)' : '#140f26',
                    border: isSelected ? `2px solid ${btn.border}` : `1px solid ${btn.border}`,
                    color: isSelected ? '#fff' : '#9ca3af',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: isSelected ? `0 0 12px ${btn.border}` : 'none',
                    transform: isSelected ? 'scale(1.03)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          {/* ПЕРЕКЛЮЧАТЕЛЬ ТАБОВ: «Инвентарь» / «Желаемый предмет» */}
          <div
            style={{
              marginTop: '14px',
              background: '#130e24',
              borderRadius: '24px',
              padding: '4px',
              display: 'flex',
              gap: '4px',
              border: '1px solid #23193d',
            }}
          >
            <button
              onClick={() => {
                setSubTab('inventory');
                window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
              }}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: '20px',
                border: 'none',
                background: subTab === 'inventory' ? '#22183d' : 'transparent',
                color: subTab === 'inventory' ? '#fff' : '#6b7280',
                fontSize: '13px',
                fontWeight: '800',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Инвентарь
            </button>
            <button
              onClick={() => {
                setSubTab('targets');
                window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
              }}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: '20px',
                border: 'none',
                background: subTab === 'targets' ? '#22183d' : 'transparent',
                color: subTab === 'targets' ? '#fff' : '#6b7280',
                fontSize: '13px',
                fontWeight: '800',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Желаемый предмет
            </button>
          </div>

          {/* КОНТЕНТ ТАБОВ */}
          <div style={{ marginTop: '14px' }}>
            {/* ТАБ 1: ИНВЕНТАРЬ */}
            {subTab === 'inventory' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
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
                    <div style={{ width: '48px', height: '48px', margin: '0 auto 12px auto', background: '#20163d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={ICONS.gift} alt="Инвентарь" style={{ width: '24px', height: '24px', filter: 'invert(1)' }} />
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '800', marginBottom: '6px' }}>Ваш инвентарь пуст</div>
                    <p style={{ fontSize: '11px', color: '#8b7fa8', margin: '0 0 14px 0' }}>
                      Вы можете играть сразу на баланс TON с помощью полоски ставки!
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
                        borderRadius: '16px',
                        padding: '12px 24px',
                        fontWeight: '800',
                        fontSize: '13px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(168, 85, 247, 0.4)',
                      }}
                    >
                      Купить предмет в магазине
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
            )}

            {/* ТАБ 2: ЖЕЛАЕМЫЙ ПРЕДМЕТ (ИЗ БАНКА) */}
            {subTab === 'targets' && (
              <div>
                {bankVault.length === 0 ? (
                  <div style={{ background: '#130e24', borderRadius: '22px', padding: '24px 16px', textAlign: 'center', border: '1px solid #271c47' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700' }}>В банке пока нет подарков</div>
                    <p style={{ fontSize: '11px', color: '#8b7fa8', margin: '4px 0 0 0' }}>
                      Подарки скоро появятся на балансе @GuseBank
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {bankVault.map((gift) => {
                      const isSelected = selectedTarget?.id === gift.id && !activePreset;
                      const isLowerPrice = totalBetAmount > 0 && gift.price_ton <= totalBetAmount;
                      return (
                        <div
                          key={gift.id}
                          onClick={() => {
                            setActivePreset(null);
                            setSelectedTarget(gift);
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
                            border: isSelected ? '2px solid #eab308' : '1px solid #2d2150',
                            boxShadow: isSelected ? '0 0 12px rgba(234, 179, 8, 0.45)' : 'none',
                            opacity: isLowerPrice ? 0.45 : 1,
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '800', color: '#0098ea', alignSelf: 'flex-start' }}>
                            💎 {gift.price_ton}
                          </div>
                          <img src={gift.image_url} alt="" style={{ width: '46px', height: '46px', margin: '6px 0', objectFit: 'contain' }} />
                          <div style={{ fontSize: '10px', fontWeight: '700' }}>{gift.name}</div>
                          <div style={{ fontSize: '8px', color: '#8b7fa8' }}>{gift.serial_number || '#0000'}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ШТОРКА «БЫСТРЫЙ ПОДБОР» */}
      {isSettingsOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 130, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#120d24', borderTopLeftRadius: '28px', borderTopRightRadius: '28px', padding: '20px 18px 36px 18px', borderTop: '1px solid #302257', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '18px', fontWeight: '900', color: '#fff' }}>Быстрый подбор</div>
              <button
                onClick={() => setIsSettingsOpen(false)}
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

            <div style={{ background: '#171126', borderRadius: '22px', padding: '16px', border: '1px solid #271c47', marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '600', marginBottom: '14px', lineHeight: '1.4' }}>
                Настройте кнопки для быстрого подбора коэффициента
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                  {[0, 1, 2].map((idx) => (
                    <div
                      key={idx}
                      style={{
                        flex: 1,
                        background: '#120d22',
                        borderRadius: '24px',
                        border: '1px solid #312353',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px 8px',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: '800', color: '#9ca3af', marginRight: '2px' }}>x</span>
                      <input
                        type="number"
                        value={tempMultipliers[idx]}
                        onChange={(e) => {
                          const val = e.target.value;
                          const next: [string, string, string] = [...tempMultipliers];
                          next[idx] = val;
                          setTempMultipliers(next);
                        }}
                        style={{
                          width: '32px',
                          background: 'transparent',
                          border: 'none',
                          color: '#fff',
                          textAlign: 'center',
                          fontSize: '13px',
                          fontWeight: '800',
                          outline: 'none',
                          padding: 0,
                        }}
                      />
                    </div>
                  ))}
                </div>

                <button
                  onClick={resetMultipliers}
                  title="Сбросить коэффициенты"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#eab308',
                    cursor: 'pointer',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                </button>
              </div>
            </div>

            <div style={{ background: '#171126', borderRadius: '22px', padding: '16px', border: '1px solid #271c47', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '600', marginBottom: '14px', lineHeight: '1.4' }}>
                Настройте кнопки для быстрого подбора процента
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                  {[
                    { idx: 0, border: '#ef4444' },
                    { idx: 1, border: '#eab308' },
                    { idx: 2, border: '#22c55e' },
                  ].map((cfg) => (
                    <div
                      key={cfg.idx}
                      style={{
                        flex: 1,
                        background: '#120d22',
                        borderRadius: '24px',
                        border: `1.5px solid ${cfg.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px 8px',
                      }}
                    >
                      <input
                        type="number"
                        min="1"
                        max="85"
                        value={tempPercents[cfg.idx]}
                        onChange={(e) => {
                          const val = e.target.value;
                          const next: [string, string, string] = [...tempPercents];
                          next[cfg.idx] = val;
                          setTempPercents(next);
                        }}
                        style={{
                          width: '32px',
                          background: 'transparent',
                          border: 'none',
                          color: '#fff',
                          textAlign: 'center',
                          fontSize: '13px',
                          fontWeight: '800',
                          outline: 'none',
                          padding: 0,
                        }}
                      />
                      <span style={{ fontSize: '11px', fontWeight: '800', color: cfg.border, marginLeft: '2px' }}>%</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={resetPercents}
                  title="Сбросить проценты"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#eab308',
                    cursor: 'pointer',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                </button>
              </div>
            </div>

            <button
              onClick={handleSaveSettings}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '18px',
                border: 'none',
                background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                color: '#fff',
                fontWeight: '800',
                fontSize: '15px',
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(168, 85, 247, 0.4)',
              }}
            >
              Сохранить
            </button>
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
                    setActivePreset(null);
                    setSelectedTarget(gift);
                    setActiveTab('upgrade');
                    setSubTab('targets');
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

            <div>
              <div style={{ fontSize: '14px', fontWeight: '800', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Инвентарь</span>
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
                    Купить предмет в магазине
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
                        setSubTab('targets');
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
                  {depositStep === 'gifts' && 'Пополнение подарками'}
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
                  onClick={() => setDepositStep('gifts')}
                  style={{
                    background: '#1b1436',
                    padding: '12px 14px',
                    borderRadius: '18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    border: '1.5px solid #a855f7',
                    boxShadow: '0 0 12px rgba(168, 85, 247, 0.25)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={ICONS.gift} alt="Подарки" style={{ width: '22px', height: '22px' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '14px', color: '#c084fc' }}>Подарки Telegram</div>
                      <div style={{ fontSize: '10px', color: '#8b7fa8' }}>Отправьте подарок на @GuseBank</div>
                    </div>
                  </div>
                  <span style={{ color: '#c084fc', fontSize: '18px' }}>›</span>
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

            {depositStep === 'gifts' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '60px', height: '60px', margin: '0 auto 10px auto', background: 'rgba(168, 85, 247, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #a855f7' }}>
                  <img src={ICONS.gift} alt="Подарки" style={{ width: '32px', height: '32px' }} />
                </div>
                <div style={{ fontSize: '17px', fontWeight: '800' }}>Пополнение подарками</div>
                <p style={{ fontSize: '12px', color: '#8b7fa8', margin: '6px 0 16px 0', lineHeight: '1.4' }}>
                  Отправьте любой подарок со своего профиля на наш аккаунт банка <b>@GuseBank</b>.
                </p>

                <div style={{ background: '#171126', borderRadius: '18px', padding: '14px', border: '1px solid #271c47', textAlign: 'left', marginBottom: '18px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#eab308', marginBottom: '8px' }}>Инструкция:</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.5' }}>
                    1. Нажмите кнопку ниже для перехода к <b>@GuseBank</b><br />
                    2. В его профиле выберите «Отправить подарок»<br />
                    3. После отправки вернитесь сюда и нажмите «Проверить зачисление»
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    onClick={() => {
                      const tg = window.Telegram?.WebApp;
                      if (tg?.openTelegramLink) {
                        tg.openTelegramLink('https://t.me/GuseBank');
                      } else {
                        window.open('https://t.me/GuseBank', '_blank');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '18px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                      color: '#fff',
                      fontWeight: '800',
                      fontSize: '15px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 18px rgba(168, 85, 247, 0.4)',
                    }}
                  >
                    🎁 Открыть профиль @GuseBank
                  </button>

                  <button
                    disabled={isCheckingInventory}
                    onClick={() => {
                      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
                      loadInventory();
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '18px',
                      border: '1px solid #3b2d6b',
                      background: '#171126',
                      color: '#eab308',
                      fontWeight: '800',
                      fontSize: '13px',
                      cursor: isCheckingInventory ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isCheckingInventory ? 'Проверяем...' : '🔄 Проверить зачисление'}
                  </button>
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
          bottom: '10px',
          left: '28px',
          right: '28px',
          background: 'rgba(18, 13, 36, 0.65)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          borderRadius: '26px',
          border: '1px solid rgba(168, 85, 247, 0.22)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '4px 14px',
          zIndex: 50,
        }}
      >
        <button
          onClick={() => {
            setActiveTab('shop');
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: activeTab === 'shop' ? 1 : 0.5,
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
        >
          <img
            src={ICONS.shop}
            alt="Магазин"
            style={{
              width: '24px',
              height: '24px',
              objectFit: 'contain',
              display: 'block',
              filter: activeTab === 'shop' ? 'drop-shadow(0 0 6px rgba(234, 179, 8, 0.7))' : 'none',
            }}
          />
        </button>

        <button
          onClick={() => {
            setActiveTab('upgrade');
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
          }}
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: activeTab === 'upgrade' ? 'linear-gradient(135deg, #1b1338 0%, #130d29 100%)' : '#140e26',
            border: activeTab === 'upgrade' ? '2px solid #eab308' : '1px solid #3b2d6b',
            boxShadow: activeTab === 'upgrade' ? '0 0 14px rgba(234, 179, 8, 0.4)' : '0 2px 6px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            transform: 'translateY(-4px)',
            transition: 'all 0.2s',
          }}
        >
          <img
            src={ICONS.upgradeArrow}
            alt="Апгрейд"
            style={{
              width: '26px',
              height: '26px',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </button>

        <button
          onClick={() => {
            setIsProfileOpen(true);
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: isProfileOpen ? 1 : 0.5,
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
        >
          <img
            src={ICONS.profile}
            alt="Профиль"
            style={{
              width: '24px',
              height: '24px',
              objectFit: 'contain',
              display: 'block',
              filter: isProfileOpen ? 'drop-shadow(0 0 6px rgba(234, 179, 8, 0.7))' : 'none',
            }}
          />
        </button>
      </div>
    </div>
  );
}
