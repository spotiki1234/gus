import { useState, useEffect, useCallback } from 'react';
import { useTonConnectUI, useTonWallet, useTonAddress, TonConnectButton } from '@tonconnect/ui-react';
import confetti from 'canvas-confetti';

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
  initData?: string;
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
        id: 1234567, // Тестовый ID для работы в обычном браузере
      }
    );
  });

  const [balanceTon, setBalanceTon] = useState<number>(0.0);
  const [bankVault, setBankVault] = useState<BankGift[]>([]);
  const [userInventory, setUserInventory] = useState<BankGift[]>([]);

  // Ползунок ставки балансом
  const [balanceSliderPercent, setBalanceSliderPercent] = useState<number>(0);
  const [subTab, setSubTab] = useState<'inventory' | 'targets'>('inventory');

  // Быстрая анимация рулетки
  const [isFastSpin, setIsFastSpin] = useState<boolean>(() => {
    return localStorage.getItem('guse_fast_spin') === 'true';
  });

  // Настраиваемые коэффициенты
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

  // Настраиваемые проценты
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

  const [tempMultipliers, setTempMultipliers] = useState<[string, string, string]>(['2', '4', '8']);
  const [tempPercents, setTempPercents] = useState<[string, string, string]>(['35', '55', '75']);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [withdrawnCount] = useState<number>(0);
  const [withdrawnTotalTon] = useState<number>(0.0);

  const [selectedSource, setSelectedSource] = useState<BankGift | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<BankGift | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
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

  const loadUserData = useCallback(() => {
    if (!tgUser.id) return;

    fetch(`/api/user-balance?userId=${tgUser.id}`)
      .then((res) => res.json())
      .then((data: { ton?: number }) => {
        if (typeof data.ton === 'number') setBalanceTon(data.ton);
      })
      .catch(() => {});

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

    loadUserData();

    fetch('/api/bank-gifts')
      .then((res) => res.json())
      .then((data: { available_gifts?: BankGift[] }) => {
        if (data.available_gifts) setBankVault(data.available_gifts);
      })
      .catch(() => {});

    const pingOnline = () => {
      fetch('/api/online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: tgUser.id || 0 }),
      })
        .then((res) => res.json())
        .then((data: { online?: number }) => {
          if (typeof data.online === 'number') setOnlineCount(data.online);
        })
        .catch(() => {});
    };

    pingOnline();
    const interval = setInterval(pingOnline, 15000);
    return () => clearInterval(interval);
  }, [tgUser.id, loadUserData]);

  const balanceBetTon = Number(((balanceTon * balanceSliderPercent) / 100).toFixed(2));
  const totalBetAmount = Number(((selectedSource ? selectedSource.price_ton : 0) + balanceBetTon).toFixed(2));

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

  const getChanceLabel = (c: number): string => {
    if (c <= 0) return 'Ожидание';
    if (c < 25) return 'Низкий шанс';
    if (c <= 60) return 'Средний шанс';
    return 'Высокий шанс';
  };

  const toggleFastSpin = () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
    setIsFastSpin((prev) => {
      const next = !prev;
      localStorage.setItem('guse_fast_spin', String(next));
      return next;
    });
  };

  const resetMultipliers = () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    setTempMultipliers(['2', '4', '8']);
    setCustomMultipliers([2, 4, 8]);
    localStorage.setItem('guse_custom_multipliers', JSON.stringify([2, 4, 8]));
  };

  const resetPercents = () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    setTempPercents(['35', '55', '75']);
    setCustomPercents([35, 55, 75]);
    localStorage.setItem('guse_custom_percents', JSON.stringify([35, 55, 75]));
  };

  const handleSaveSettings = () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    const m1 = Math.max(1.1, parseFloat(tempMultipliers[0]) || 2);
    const m2 = Math.max(1.1, parseFloat(tempMultipliers[1]) || 4);
    const m3 = Math.max(1.1, parseFloat(tempMultipliers[2]) || 8);
    setCustomMultipliers([m1, m2, m3]);
    localStorage.setItem('guse_custom_multipliers', JSON.stringify([m1, m2, m3]));

    const p1 = Math.min(85, Math.max(1, parseInt(tempPercents[0], 10) || 35));
    const p2 = Math.min(85, Math.max(1, parseInt(tempPercents[1], 10) || 55));
    const p3 = Math.min(85, Math.max(1, parseInt(tempPercents[2], 10) || 75));
    setCustomPercents([p1, p2, p3]);
    localStorage.setItem('guse_custom_percents', JSON.stringify([p1, p2, p3]));
    setIsSettingsOpen(false);
  };

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

  // БЕЗОПАСНЫЙ АПГРЕЙД С ВЫЗОВОМ СЕРВЕРА
  const handleUpgrade = async () => {
    if (isSpinning || chance <= 0 || totalBetAmount <= 0 || targetPriceTon <= totalBetAmount) return;

    if (balanceBetTon > balanceTon) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
      return;
    }

    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy');
    setIsSpinning(true);

    try {
      const response = await fetch('/api/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: tgUser.id,
          balanceBetTon,
          sourceItemId: selectedSource ? selectedSource.id : null,
          targetTon: activePreset ? targetBalanceTon : 0,
          targetGiftId: selectedTarget ? selectedTarget.id : null,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        setIsSpinning(false);
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
        alert(result.error || 'Ошибка апгрейда');
        return;
      }

      // Вычисляем угол, пришедший с сервера
      const serverTargetAngle = result.targetAngle;
      const normalizedTarget = (serverTargetAngle % 360 + 360) % 360;
      const currentMod = (arrowAngle % 360 + 360) % 360;
      let diff = normalizedTarget - currentMod;
      if (diff < 0) diff += 360;

      const extraFullSpins = isFastSpin ? 360 * 3 : 360 * 6;
      const nextArrowAngle = arrowAngle + extraFullSpins + diff;
      setArrowAngle(nextArrowAngle);

      const spinDuration = isFastSpin ? 800 : 3200;

      setTimeout(() => {
        setIsSpinning(false);
        // Сброс угла для защиты от переполнения
        setArrowAngle(normalizedTarget);

        setBalanceTon(result.newBalance);

        if (result.isWin) {
          window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } });
        } else {
          window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
        }

        loadUserData();
        setSelectedSource(null);
        setSelectedTarget(null);
        setActivePreset(null);
        setBalanceSliderPercent(0);
      }, spinDuration);

    } catch (e) {
      console.error(e);
      setIsSpinning(false);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    }
  };

  const handleRealStarsPayment = async (amountStars: number) => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    tg.HapticFeedback?.impactOccurred('medium');

    try {
      const res = await fetch('/api/pay-stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starsAmount: amountStars, userId: tgUser.id }),
      });
      const data = await res.json();
      if (data.invoiceLink && tg.openInvoice) {
        tg.openInvoice(data.invoiceLink, (status: string) => {
          if (status === 'paid') {
            tg.HapticFeedback?.notificationOccurred('success');
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
            setIsDepositOpen(false);
            loadUserData();
          }
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRealTonDeposit = async () => {
    if (!wallet) return;
    const amountNano = Math.floor(parseFloat(tonAmountInput) * 1e9);
    if (isNaN(amountNano) || amountNano <= 0) return;

    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: 'UQAKTkSiwZWqUDUjlydR0fxQPaPfsHbNRn0kvy8tcJwKzkrT', amount: amountNano.toString() }],
      });
      setIsDepositOpen(false);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.5 } });
      loadUserData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCryptoBotPayment = async () => {
    const tg = window.Telegram?.WebApp;
    const amount = parseFloat(cryptoPayAmount);
    if (isNaN(amount) || amount <= 0) return;
    try {
      const res = await fetch('/api/pay-cryptobot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountTon: amount, userId: tgUser.id }),
      });
      const data = await res.json();
      if (data.invoiceUrl) {
        setIsDepositOpen(false);
        if (tg?.openTelegramLink) tg.openTelegramLink(data.invoiceUrl);
        else window.open(data.invoiceUrl, '_blank');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      await tonConnectUI.disconnect();
    } catch (e) {
      console.error(e);
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

  // Оранжевый сектор строго симметрично внизу
  const halfPercent = chance > 0 ? chance / 2 : 0;
  const startP = 50 - halfPercent;
  const endP = 50 + halfPercent;
  const wheelConic = chance > 0
    ? `conic-gradient(from 0deg, #181424 0%, #181424 ${startP}%, #ffb703 ${startP}%, #fb8500 50%, #ffb703 ${endP}%, #181424 ${endP}%, #181424 100%)`
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
        input[type=range] { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
        input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 4px; background: #231b3d; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #8e8a9d; box-shadow: 0 2px 6px rgba(0,0,0,0.6); margin-top: -8px; }
        input[type=range]:active::-webkit-slider-thumb { background: #0098ea; }
        input[type=range]::-moz-range-track { height: 6px; border-radius: 4px; background: #231b3d; }
        input[type=range]::-moz-range-thumb { width: 22px; height: 22px; border: none; border-radius: 50%; background: #8e8a9d; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {/* ШАПКА */}
      <div style={{ padding: '12px 14px 0 14px' }}>
        <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(18, 13, 36, 0.92)', backdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid #281d45', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          <div style={{ background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '16px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#4ade80' }}>{onlineCount}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div onClick={() => { setIsDepositOpen(true); setDepositStep('methods'); }} style={{ background: 'linear-gradient(135deg, #1f163d 0%, #150f29 100%)', border: '1px solid #3b2d6b', borderRadius: '24px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <div style={{ fontSize: '13px', fontWeight: '900', color: '#0098ea', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <img src={ICONS.ton} alt="TON" style={{ width: '15px', height: '15px', borderRadius: '3px' }} />
                {balanceTon.toFixed(2)} TON
              </div>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#eab308', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '13px' }}>+</div>
            </div>

            <div onClick={() => { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); setIsProfileOpen(true); }} style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #a855f7 0%, #6b21a8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid #eab308', cursor: 'pointer' }}>
              {tgUser.photo_url ? <img src={tgUser.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontWeight: '800', fontSize: '14px' }}>{userInitial}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* АРЕНА */}
      {activeTab === 'upgrade' && (
        <div style={{ padding: '16px 18px 10px 18px' }}>
          <div style={{ position: 'relative', background: '#130e24', borderRadius: '26px', border: '1px solid #271c47', padding: '20px 14px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            
            <div style={{ position: 'absolute', top: '14px', left: '14px', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10 }}>
              <button onClick={toggleFastSpin} style={{ width: '34px', height: '34px', borderRadius: '12px', border: isFastSpin ? '1.5px solid #eab308' : '1px solid #2f2352', background: isFastSpin ? 'rgba(234, 179, 8, 0.2)' : '#1a1333', color: isFastSpin ? '#eab308' : '#71658f', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill={isFastSpin ? '#eab308' : 'currentColor'}><path d="M13 2L3 14h7v8l11-13h-8l0-7z" /></svg>
              </button>
              <button onClick={() => { setIsSettingsOpen(true); }} style={{ width: '34px', height: '34px', borderRadius: '12px', border: '1px solid #2f2352', background: '#1a1333', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              </button>
            </div>

            {/* КОЛЕСО РУЛЕТКИ: НЕПОДВИЖНОЕ КОЛЕСО, ВРАЩАЮЩАЯСЯ СТРЕЛКА */}
            <div style={{ position: 'relative', width: '210px', height: '210px', margin: '0 auto 16px auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'absolute', left: '-18px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', fontWeight: '700', color: '#4b4363' }}>50%</div>
              <div style={{ position: 'absolute', right: '-18px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', fontWeight: '700', color: '#4b4363' }}>50%</div>

              <div style={{ position: 'absolute', width: '202px', height: '202px', borderRadius: '50%', border: '1.5px solid #231c38', borderBottom: chance > 0 ? '2px solid #ff7b00' : '1.5px solid #231c38', boxShadow: chance > 0 ? '0 0 18px rgba(255, 123, 0, 0.35)' : 'none' }} />

              <div style={{ width: '184px', height: '184px', borderRadius: '50%', background: wheelConic, boxShadow: chance > 0 ? 'inset 0 0 20px rgba(0,0,0,0.8), 0 0 24px rgba(255, 133, 0, 0.25)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '128px', height: '128px', borderRadius: '50%', background: '#0d091a', boxShadow: '0 0 18px rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '26px', fontWeight: '900', color: '#ffffff' }}>{chance > 0 ? `${chance.toFixed(2)}%` : '0%'}</div>
                  <span style={{ fontSize: '11px', color: '#8b839e', fontWeight: '600', marginTop: '4px' }}>{getChanceLabel(chance)}</span>
                </div>
              </div>

              {/* СТРЕЛКА */}
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: `rotate(${arrowAngle}deg)`, transition: isSpinning ? `transform ${isFastSpin ? '0.8s' : '3.2s'} cubic-bezier(0.12, 0.8, 0.2, 1)` : 'none', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', bottom: '-3px', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '9px solid #ffb703', filter: 'drop-shadow(0 0 6px rgba(255, 183, 3, 0.9))' }} />
                  <div style={{ width: '2px', height: '13px', background: '#ffb703', boxShadow: '0 0 6px #ffb703' }} />
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ffb703', boxShadow: '0 0 8px #ffb703', marginTop: '-2px' }} />
                </div>
              </div>

              <div style={{ position: 'absolute', bottom: '-18px', left: '50%', transform: 'translateX(-50%)', fontSize: '10px', fontWeight: '800', color: '#8b839e' }}>0%</div>
            </div>

            {/* КАРТОЧКИ */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
              <div onClick={() => setSubTab('inventory')} style={{ width: '115px', height: '124px', borderRadius: '20px', background: '#171126', border: totalBetAmount > 0 ? '2px solid #a855f7' : '2px dashed #3a2b61', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px', cursor: 'pointer', position: 'relative' }}>
                {selectedSource ? (
                  <>
                    <img src={selectedSource.image_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                    <span style={{ fontSize: '11px', fontWeight: '800', marginTop: '4px' }}>{selectedSource.name}</span>
                    <span style={{ fontSize: '10px', color: '#0098ea', fontWeight: '700' }}>💎 {totalBetAmount}</span>
                  </>
                ) : balanceBetTon > 0 ? (
                  <>
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(0, 152, 234, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #0098ea', marginBottom: '4px' }}>
                      <img src={ICONS.ton} alt="TON" style={{ width: '22px', height: '22px' }} />
                    </div>
                    <span style={{ fontSize: '10px', color: '#8b7fa8', fontWeight: '700' }}>Баланс</span>
                    <span style={{ fontSize: '12px', color: '#0098ea', fontWeight: '900' }}>💎 {balanceBetTon} TON</span>
                  </>
                ) : (
                  <span style={{ fontSize: '11px', color: '#8b7fa8', fontWeight: '600' }}>Выбери подарок или баланс</span>
                )}
                {selectedSource && (
                  <button onClick={(e) => { e.stopPropagation(); setSelectedSource(null); }} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', width: '18px', height: '18px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
                )}
              </div>

              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#19122e', border: '1px solid #362859', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="4" y1="12" x2="20" y2="12" /><polyline points="14 6 20 12 14 18" /></svg>
              </div>

              <div onClick={() => setSubTab('targets')} style={{ width: '115px', height: '124px', borderRadius: '20px', background: '#171126', border: hasTarget ? '2px solid #eab308' : '2px dashed #3a2b61', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '6px' }}>
                {activePreset && targetBalanceTon > 0 ? (
                  <>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(234, 179, 8, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #eab308', marginBottom: '4px' }}>
                      <img src={ICONS.ton} alt="TON" style={{ width: '22px', height: '22px' }} />
                    </div>
                    <span style={{ fontSize: '10px', color: '#eab308', fontWeight: '800' }}>Баланс TON</span>
                    <span style={{ fontSize: '13px', color: '#0098ea', fontWeight: '900' }}>💎 {targetBalanceTon} TON</span>
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

            {/* ПОЛОСКА СТАВКИ */}
            <div style={{ background: '#150f29', borderRadius: '18px', padding: '10px 14px', border: '1px solid #281d45', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ textAlign: 'left', minWidth: '70px' }}>
                <div style={{ fontSize: '11px', color: '#8b7fa8', fontWeight: '700' }}>Ставка</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <img src={ICONS.ton} alt="TON" style={{ width: '14px', height: '14px' }} />
                  <span style={{ fontSize: '13px', fontWeight: '900' }}>{balanceBetTon.toFixed(2)}</span>
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                <input type="range" min="0" max="100" step="5" value={balanceSliderPercent} onChange={(e) => setBalanceSliderPercent(parseInt(e.target.value, 10))} style={{ width: '100%' }} />
              </div>
              <div onClick={() => { setBalanceSliderPercent(prev => prev === 0 ? 25 : prev === 25 ? 50 : prev === 50 ? 100 : 0); }} style={{ background: '#22193d', border: '1px solid #36285c', borderRadius: '12px', padding: '5px 10px', fontSize: '12px', fontWeight: '900', color: balanceSliderPercent > 0 ? '#0098ea' : '#fff', cursor: 'pointer' }}>
                {balanceSliderPercent}%
              </div>
            </div>

            {/* КНОПКА АПГРЕЙДА */}
            <button onClick={handleUpgrade} disabled={!canUpgrade} style={{ width: '100%', padding: '14px', borderRadius: '18px', border: 'none', background: isSpinning ? '#3b2d6b' : !canUpgrade ? '#231a3b' : 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', color: '#fff', fontSize: '15px', fontWeight: '800', cursor: !canUpgrade ? 'not-allowed' : 'pointer', boxShadow: canUpgrade ? '0 4px 18px rgba(168, 85, 247, 0.4)' : 'none' }}>
              {isSpinning ? 'КРУТИМ РУЛЕТКУ...' : totalBetAmount <= 0 ? 'Сделайте ставку' : !hasTarget ? 'Выберите цель' : activePreset && targetBalanceTon > 0 ? `Выиграть ${targetBalanceTon} TON` : 'Улучшить'}
            </button>
          </div>

          {/* КОЭФФИЦИЕНТЫ */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '14px', justifyContent: 'space-between' }}>
            {[
              { id: 'm1', label: `x${customMultipliers[0]}`, border: '#3b2d6b' },
              { id: 'm2', label: `x${customMultipliers[1]}`, border: '#3b2d6b' },
              { id: 'm3', label: `x${customMultipliers[2]}`, border: '#3b2d6b' },
              { id: 'p1', label: `${customPercents[0]}%`, border: '#ef4444' },
              { id: 'p2', label: `${customPercents[1]}%`, border: '#eab308' },
              { id: 'p3', label: `${customPercents[2]}%`, border: '#22c55e' },
            ].map((btn) => (
              <button key={btn.id} onClick={() => handlePresetClick(btn.id)} style={{ flex: 1, padding: '8px 0', borderRadius: '20px', background: activePreset === btn.id ? 'rgba(255,255,255,0.14)' : '#140f26', border: `1.5px solid ${btn.border}`, color: '#fff', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>
                {btn.label}
              </button>
            ))}
          </div>

          {/* ТАБЫ */}
          <div style={{ marginTop: '14px', background: '#130e24', borderRadius: '24px', padding: '4px', display: 'flex', gap: '4px', border: '1px solid #23193d' }}>
            <button onClick={() => setSubTab('inventory')} style={{ flex: 1, padding: '10px 0', borderRadius: '20px', border: 'none', background: subTab === 'inventory' ? '#22183d' : 'transparent', color: subTab === 'inventory' ? '#fff' : '#6b7280', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>Инвентарь</button>
            <button onClick={() => setSubTab('targets')} style={{ flex: 1, padding: '10px 0', borderRadius: '20px', border: 'none', background: subTab === 'targets' ? '#22183d' : 'transparent', color: subTab === 'targets' ? '#fff' : '#6b7280', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>Желаемый предмет</button>
          </div>

          {/* ИНВЕНТАРЬ / ЦЕЛЬ */}
          <div style={{ marginTop: '14px' }}>
            {subTab === 'inventory' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                  <button onClick={() => { setIsDepositOpen(true); setDepositStep('methods'); }} style={{ background: 'none', border: 'none', color: '#eab308', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>Пополнить</button>
                </div>
                {userInventory.length === 0 ? (
                  <div style={{ background: '#130e24', borderRadius: '22px', padding: '24px 16px', textAlign: 'center', border: '1px solid #271c47' }}>
                    <div style={{ width: '48px', height: '48px', margin: '0 auto 12px auto', background: '#20163d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={ICONS.gift} alt="" style={{ width: '24px', height: '24px', filter: 'invert(1)' }} />
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '800' }}>Инвентарь пуст</div>
                    <p style={{ fontSize: '11px', color: '#8b7fa8', margin: '4px 0 14px 0' }}>Играйте сразу на баланс TON с помощью ползунка ставки!</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {userInventory.map((gift) => (
                      <div key={gift.id} onClick={() => setSelectedSource(gift)} style={{ background: '#1c1433', borderRadius: '20px', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', border: selectedSource?.id === gift.id ? '2px solid #a855f7' : '1px solid #2d2150' }}>
                        <div style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '800', color: '#0098ea', alignSelf: 'flex-start' }}>💎 {gift.price_ton}</div>
                        <img src={gift.image_url} alt="" style={{ width: '46px', height: '46px', margin: '6px 0', objectFit: 'contain' }} />
                        <div style={{ fontSize: '10px', fontWeight: '700' }}>{gift.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {subTab === 'targets' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {bankVault.map((gift) => (
                  <div key={gift.id} onClick={() => { setActivePreset(null); setSelectedTarget(gift); }} style={{ background: '#1c1433', borderRadius: '20px', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', border: selectedTarget?.id === gift.id ? '2px solid #eab308' : '1px solid #2d2150' }}>
                    <div style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '800', color: '#0098ea', alignSelf: 'flex-start' }}>💎 {gift.price_ton}</div>
                    <img src={gift.image_url} alt="" style={{ width: '46px', height: '46px', margin: '6px 0', objectFit: 'contain' }} />
                    <div style={{ fontSize: '10px', fontWeight: '700' }}>{gift.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* МАГАЗИН */}
      {activeTab === 'shop' && (
        <div style={{ padding: '16px 18px 10px 18px' }}>
          <div style={{ fontSize: '17px', fontWeight: '800', marginBottom: '14px' }}>Магазин банка ({bankVault.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {bankVault.map((gift) => (
              <div key={gift.id} onClick={() => { setSelectedTarget(gift); setActiveTab('upgrade'); setSubTab('targets'); }} style={{ background: '#1c1433', borderRadius: '20px', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', border: '1px solid #2d2150' }}>
                <div style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '800', color: '#0098ea', alignSelf: 'flex-start' }}>💎 {gift.price_ton}</div>
                <img src={gift.image_url} alt="" style={{ width: '46px', height: '46px', margin: '6px 0', objectFit: 'contain' }} />
                <div style={{ fontSize: '10px', fontWeight: '700' }}>{gift.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ШТОРКА НАСТРОЕК */}
      {isSettingsOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 130, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#120d24', borderTopLeftRadius: '28px', borderTopRightRadius: '28px', padding: '20px 18px 36px 18px', borderTop: '1px solid #302257' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '18px', fontWeight: '900' }}>Быстрый подбор</div>
              <button onClick={() => setIsSettingsOpen(false)} style={{ background: '#20163d', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ background: '#171126', borderRadius: '22px', padding: '16px', border: '1px solid #271c47', marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '12px' }}>Коэффициенты (x2, x4, x8)</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[0, 1, 2].map((idx) => (
                  <div key={idx} style={{ flex: 1, background: '#120d22', borderRadius: '24px', border: '1px solid #312353', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 8px' }}>
                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>x</span>
                    <input type="number" value={tempMultipliers[idx]} onChange={(e) => { const n: [string, string, string] = [...tempMultipliers]; n[idx] = e.target.value; setTempMultipliers(n); }} style={{ width: '32px', background: 'transparent', border: 'none', color: '#fff', textAlign: 'center', fontSize: '13px', fontWeight: '800', outline: 'none' }} />
                  </div>
                ))}
                <button onClick={resetMultipliers} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}>🔄</button>
              </div>
            </div>

            <div style={{ background: '#171126', borderRadius: '22px', padding: '16px', border: '1px solid #271c47', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '12px' }}>Проценты (35%, 55%, 75%)</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['#ef4444', '#eab308', '#22c55e'].map((color, idx) => (
                  <div key={idx} style={{ flex: 1, background: '#120d22', borderRadius: '24px', border: `1.5px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 8px' }}>
                    <input type="number" min="1" max="85" value={tempPercents[idx]} onChange={(e) => { const n: [string, string, string] = [...tempPercents]; n[idx] = e.target.value; setTempPercents(n); }} style={{ width: '32px', background: 'transparent', border: 'none', color: '#fff', textAlign: 'center', fontSize: '13px', fontWeight: '800', outline: 'none' }} />
                    <span style={{ fontSize: '11px', color }}>%</span>
                  </div>
                ))}
                <button onClick={resetPercents} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}>🔄</button>
              </div>
            </div>

            <button onClick={handleSaveSettings} style={{ width: '100%', padding: '14px', borderRadius: '18px', border: 'none', background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', color: '#fff', fontWeight: '800', fontSize: '15px', cursor: 'pointer' }}>Сохранить</button>
          </div>
        </div>
      )}

      {/* ШТОРКА ПРОФИЛЯ */}
      {isProfileOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 110, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#120d24', borderTopLeftRadius: '28px', borderTopRightRadius: '28px', padding: '20px 18px 36px 18px', borderTop: '1px solid #302257', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '17px', fontWeight: '800' }}>Мой профиль</div>
              <button onClick={() => setIsProfileOpen(false)} style={{ background: '#20163d', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #1b1338 0%, #130d29 100%)', borderRadius: '22px', padding: '16px', border: '1px solid #33235d', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid #eab308' }}>
                  {tgUser.photo_url ? <img src={tgUser.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontWeight: '800', fontSize: '20px' }}>{userInitial}</span>}
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '800' }}>{tgUser.first_name}</div>
                  <div style={{ fontSize: '11px', color: '#8b7fa8' }}>ID: {tgUser.id}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0e091e', padding: '12px 14px', borderRadius: '16px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#8b7fa8', textTransform: 'uppercase' }}>Баланс</div>
                  <div style={{ fontSize: '18px', fontWeight: '900', color: '#0098ea', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <img src={ICONS.ton} alt="TON" style={{ width: '18px', height: '18px' }} />
                    {balanceTon.toFixed(2)} TON
                  </div>
                </div>
                <button onClick={() => { setIsProfileOpen(false); setIsDepositOpen(true); }} style={{ background: '#eab308', color: '#000', border: 'none', borderRadius: '14px', padding: '9px 18px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>Пополнить</button>
              </div>
            </div>

            <div style={{ background: '#171126', borderRadius: '20px', padding: '14px', border: '1px solid #271c47', marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', color: '#8b7fa8', fontWeight: '700', marginBottom: '10px' }}>TON КОШЕЛЕК</div>
              {wallet ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#4ade80', fontWeight: '800' }}>{displayWalletAddress}</div>
                  <button onClick={handleDisconnectWallet} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: 'none', borderRadius: '10px', padding: '6px 12px', cursor: 'pointer' }}>Отвязать</button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#8b7fa8' }}>Кошелек не подключен</div>
                  <TonConnectButton />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ШТОРКА ПОПОЛНЕНИЯ */}
      {isDepositOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 120, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#120d24', borderTopLeftRadius: '28px', borderTopRightRadius: '28px', padding: '20px 18px 36px 18px', borderTop: '1px solid #302257' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ fontSize: '16px', fontWeight: '800' }}>Способы пополнения</div>
              <button onClick={() => setIsDepositOpen(false)} style={{ background: '#20163d', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div onClick={() => setDepositStep('stars')} style={{ background: '#1b1436', padding: '12px 14px', borderRadius: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img src={ICONS.stars} alt="" style={{ width: '28px', height: '28px' }} />
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '14px' }}>Telegram Stars</div>
                    <div style={{ fontSize: '10px', color: '#8b7fa8' }}>111 ★ = 1.00 TON</div>
                  </div>
                </div>
                <span>›</span>
              </div>

              {depositStep === 'stars' && (
                <div style={{ marginTop: '8px', padding: '12px', background: '#160f2e', borderRadius: '16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                    {[111, 555, 1110].map(s => (
                      <button key={s} onClick={() => setStarsToBuy(s)} style={{ flex: 1, padding: '8px', background: starsToBuy === s ? '#eab308' : '#22193d', color: starsToBuy === s ? '#000' : '#fff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' }}>{s} ★</button>
                    ))}
                  </div>
                  <button onClick={() => handleRealStarsPayment(starsToBuy)} style={{ width: '100%', padding: '12px', background: '#eab308', color: '#000', border: 'none', borderRadius: '14px', fontWeight: '800', cursor: 'pointer' }}>Оплатить {starsToBuy} ★ (+{starsConvertedTon} TON)</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* НАВИГАЦИЯ ВНИЗУ */}
      <div style={{ position: 'fixed', bottom: '10px', left: '28px', right: '28px', background: 'rgba(18, 13, 36, 0.65)', backdropFilter: 'blur(24px)', borderRadius: '26px', border: '1px solid rgba(168, 85, 247, 0.22)', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '4px 14px', zIndex: 50 }}>
        <button onClick={() => setActiveTab('shop')} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: activeTab === 'shop' ? 1 : 0.5 }}>
          <img src={ICONS.shop} alt="Магазин" style={{ width: '24px', height: '24px' }} />
        </button>
        <button onClick={() => setActiveTab('upgrade')} style={{ width: '46px', height: '46px', borderRadius: '50%', background: activeTab === 'upgrade' ? 'linear-gradient(135deg, #1b1338 0%, #130d29 100%)' : '#140e26', border: activeTab === 'upgrade' ? '2px solid #eab308' : '1px solid #3b2d6b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transform: 'translateY(-4px)' }}>
          <img src={ICONS.upgradeArrow} alt="Апгрейд" style={{ width: '26px', height: '26px' }} />
        </button>
        <button onClick={() => setIsProfileOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: isProfileOpen ? 1 : 0.5 }}>
          <img src={ICONS.profile} alt="Профиль" style={{ width: '24px', height: '24px' }} />
        </button>
      </div>
    </div>
  );
}
