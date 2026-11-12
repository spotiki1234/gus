import { useState, useEffect, useCallback, useMemo } from 'react';
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
  model_name?: string;
  backdrop_name?: string;
}

interface ShopBuyResponse {
  error?: string;
  newBalance?: number;
  item?: BankGift;
}

function normalizeGift(raw: BankGift): BankGift {
  return {
    ...raw,
    price_ton: Number(raw.price_ton) || 0,
    price_stars: Number(raw.price_stars) || 0,
  };
}

/**
 * АВТОМАТИЧЕСКИЙ НОРМАЛИЗАТОР ССЫЛОК:
 * Исправляет t.me/i/nft, битые ссылки и подставляет прямой CDN Fragment
 */
function getDirectGiftImageUrl(rawUrl?: string, slug?: string): string {
  const cleanSlug = (slug || '').trim();
  const url = (rawUrl || '').trim();

  if (!url && cleanSlug) {
    return `https://nft.fragment.com/gift/${cleanSlug}.webp`;
  }

  if (url.includes('t.me/i/nft/') || url.includes('t.me/nft/')) {
    const extracted = url.split('/').pop()?.replace(/\.(png|webp|jpg|jpeg)$/i, '') || cleanSlug;
    if (extracted) {
      return `https://nft.fragment.com/gift/${extracted}.webp`;
    }
  }

  if (url.includes('fragment.com/gift/') && !url.includes('nft.fragment.com')) {
    const extracted = url.split('/').pop()?.replace(/\.(png|webp|jpg|jpeg)$/i, '') || cleanSlug;
    if (extracted) {
      return `https://nft.fragment.com/gift/${extracted}.webp`;
    }
  }

  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
    return `https://nft.fragment.com/gift/${url.replace(/\.(png|webp|jpg|jpeg)$/i, '')}.webp`;
  }

  return url || '/icons/gift.png';
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
  const [isBuying, setIsBuying] = useState<number | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Ползунок доплаты балансом TON (0%..100% от текущего баланса)
  const [balanceSliderPercent, setBalanceSliderPercent] = useState<number>(0);

  // Переключатель под кнопкой: «Инвентарь» / «Желаемый предмет»
  const [subTab, setSubTab] = useState<'inventory' | 'targets'>('inventory');

  // Быстрая анимация рулетки (молния)
  const [isFastSpin, setIsFastSpin] = useState<boolean>(() => {
    return localStorage.getItem('guse_fast_spin') === 'true';
  });

  // Настраиваемые коэффициенты X (x2, x4, x8)
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

  // Настраиваемые проценты % (35%, 55%, 75%)
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

  // Фильтры и сортировка в магазине
  const [shopSortOrder, setShopSortOrder] = useState<'asc' | 'desc'>('asc');
  const [shopFilterType, setShopFilterType] = useState<string>('all');
  const [shopFilterModel, setShopFilterModel] = useState<string>('all');
  const [shopFilterBackdrop, setShopFilterBackdrop] = useState<string>('all');

  // Временные значения инпутов для модалки настроек
  const [tempMultipliers, setTempMultipliers] = useState<[string, string, string]>(['2', '4', '8']);
  const [tempPercents, setTempPercents] = useState<[string, string, string]>(['35', '55', '75']);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Активный выбранный пресет кнопки
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Онлайн
  const [onlineCount, setOnlineCount] = useState<number>(1);

  // Статистика выведенных предметов
  const [withdrawnCount, setWithdrawnCount] = useState<number>(() => {
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0;
    const saved = localStorage.getItem(`withdrawn_count_${userId}`);
    return saved ? parseInt(saved, 10) : 0;
  });

  const [withdrawnTotalTon, setWithdrawnTotalTon] = useState<number>(() => {
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0;
    const saved = localStorage.getItem(`withdrawn_total_${userId}`);
    return saved ? parseFloat(saved) : 0.0;
  });

  // Выбранный подарок из инвентаря (ОБЯЗАТЕЛЕН)
  const [selectedSource, setSelectedSource] = useState<BankGift | null>(null);
  // Желаемый подарок из банка (ОБЯЗАТЕЛЕН)
  const [selectedTarget, setSelectedTarget] = useState<BankGift | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);

  // Угол поворота стрелки вокруг колеса
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

  // Загрузка инвентаря пользователя из базы данных
  const loadInventory = useCallback(() => {
    if (!tgUser.id) return;
    setIsCheckingInventory(true);
    fetch(`/api/inventory?userId=${tgUser.id}&t=${Date.now()}`)
      .then((res) => res.json())
      .then((data: { items?: BankGift[] }) => {
        if (Array.isArray(data.items)) {
          setUserInventory(data.items.map(normalizeGift));
        }
      })
      .catch(() => {})
      .finally(() => setIsCheckingInventory(false));
  }, [tgUser.id]);

  // Загрузка банка подарков
  const loadBankGifts = useCallback(() => {
    fetch(`/api/bank-gifts?t=${Date.now()}`)
      .then((res) => res.json())
      .then((data: { available_gifts?: BankGift[] }) => {
        if (Array.isArray(data.available_gifts)) {
          setBankVault(data.available_gifts.map(normalizeGift));
        }
      })
      .catch(() => {});
  }, []);

  // Первоначальная инициализация
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }

    if (tgUser.id) {
      fetch(`/api/user-balance?userId=${tgUser.id}&t=${Date.now()}`)
        .then((res) => res.json())
        .then((data: { ton?: number }) => {
          if (typeof data.ton === 'number') setBalanceTon(data.ton);
        })
        .catch(() => {
          const t = localStorage.getItem(`ton_${tgUser.id}`);
          if (t) setBalanceTon(parseFloat(t));
        });

      fetch(`/api/inventory?userId=${tgUser.id}&t=${Date.now()}`)
        .then((res) => res.json())
        .then((data: { items?: BankGift[] }) => {
          if (Array.isArray(data.items)) {
            setUserInventory(data.items.map(normalizeGift));
          }
        })
        .catch(() => {});
    }

    loadBankGifts();

    const bankInterval = setInterval(loadBankGifts, 4000);

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
    const onlineInterval = setInterval(pingOnline, 15000);

    return () => {
      clearInterval(bankInterval);
      clearInterval(onlineInterval);
    };
  }, [tgUser.id, loadBankGifts]);

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
      console.error('Ошибка сохранения баланса:', e);
    }
  };

  /**
   * ПРОДАЖА ПОДАРКА ЗА TON (напрямую зачисление на баланс)
   */
  const handleSellGift = async (e: React.MouseEvent, gift: BankGift) => {
    e.stopPropagation();
    if (actionLoadingId) return;

    const giftPrice = Number(gift.price_ton) || 0;
    if (giftPrice <= 0) {
      alert('Цена подарка не определена');
      return;
    }

    const confirmed = window.confirm(`Продать «${gift.name}» за ${giftPrice.toFixed(2)} TON на баланс?`);
    if (!confirmed) return;

    setActionLoadingId(gift.id);
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');

    try {
      const res = await fetch('/api/inventory/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: tgUser.id,
          itemId: gift.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof data.newBalance === 'number') {
          saveBalanceToDb(data.newBalance);
        } else {
          saveBalanceToDb(Number((balanceTon + giftPrice).toFixed(2)));
        }
      } else {
        // Fallback если на сервере пока нет роута продажи
        const newBal = Number((balanceTon + giftPrice).toFixed(2));
        saveBalanceToDb(newBal);
      }

      setUserInventory((prev) => prev.filter((i) => i.id !== gift.id));
      if (selectedSource?.id === gift.id) {
        setSelectedSource(null);
        setBalanceSliderPercent(0);
      }

      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
    } catch (err) {
      console.error('Ошибка продажи:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  /**
   * ВЫВОД ПОДАРКА В TELEGRAM (отправка через бота @GuseBank)
   */
  const handleWithdrawGift = async (e: React.MouseEvent, gift: BankGift) => {
    e.stopPropagation();
    if (actionLoadingId) return;

    const giftPrice = Number(gift.price_ton) || 0;
    const confirmed = window.confirm(
      `Вывести «${gift.name}» на ваш Telegram-аккаунт?\nПодарок отправит наш бот @GuseBank.`
    );
    if (!confirmed) return;

    setActionLoadingId(gift.id);
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy');

    try {
      const res = await fetch('/api/gifts/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: tgUser.id,
          telegramId: tgUser.id,
          bankGiftId: gift.id,
        }),
      });

      const data = await res.json();

      setUserInventory((prev) => prev.filter((i) => i.id !== gift.id));
      if (selectedSource?.id === gift.id) {
        setSelectedSource(null);
        setBalanceSliderPercent(0);
      }

      // Обновляем статистику
      const nextCount = withdrawnCount + 1;
      const nextTotal = Number((withdrawnTotalTon + giftPrice).toFixed(2));
      setWithdrawnCount(nextCount);
      setWithdrawnTotalTon(nextTotal);
      localStorage.setItem(`withdrawn_count_${tgUser.id}`, String(nextCount));
      localStorage.setItem(`withdrawn_total_${tgUser.id}`, String(nextTotal));

      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      alert(data.message || 'Заявка на вывод создана! @GuseBank отправит подарок в ваш профиль.');
    } catch (err) {
      console.error('Ошибка вывода:', err);
      alert('Ошибка при создании заявки на вывод');
    } finally {
      setActionLoadingId(null);
    }
  };

  /**
   * НАСТОЯЩАЯ ПОКУПКА В МАГАЗИНЕ С СИНХРОНИЗАЦИЕЙ В БД
   */
  const handleBuyGiftInShop = async (gift: BankGift) => {
    if (isBuying) return;

    const priceTonNum = Number(gift.price_ton) || 0;
    if (balanceTon < priceTonNum) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
      setIsDepositOpen(true);
      setDepositStep('methods');
      return;
    }

    setIsBuying(gift.id);
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy');

    try {
      const res = await fetch('/api/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: tgUser.id,
          giftId: gift.id,
        }),
      });

      const text = await res.text();
      let data: ShopBuyResponse = {};
      try {
        data = JSON.parse(text) as ShopBuyResponse;
      } catch {
        throw new Error('Сервер бэкенда не обновлен или роут недоступен (404)');
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Ошибка при покупке');
      }

      if (typeof data.newBalance === 'number') {
        setBalanceTon(data.newBalance);
        localStorage.setItem(`ton_${tgUser.id}`, String(data.newBalance));
      }

      if (data.item) {
        const normalizedItem = normalizeGift(data.item);
        setUserInventory((prev) => [normalizedItem, ...prev.filter((i) => i.id !== normalizedItem.id)]);
      }
      setBankVault((prev) => prev.filter((g) => g.id !== gift.id));

      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Не удалось купить подарок';
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
      alert(message);
      loadBankGifts();
    } finally {
      setIsBuying(null);
    }
  };

  // Опции для фильтров
  const uniqueGiftTypes = useMemo(() => {
    const set = new Set<string>();
    bankVault.forEach((g) => {
      if (g.name) set.add(g.name);
    });
    return Array.from(set);
  }, [bankVault]);

  const uniqueModels = useMemo(() => {
    const set = new Set<string>();
    bankVault.forEach((g) => {
      if (g.model_name) set.add(g.model_name);
    });
    return Array.from(set);
  }, [bankVault]);

  const uniqueBackdrops = useMemo(() => {
    const set = new Set<string>();
    bankVault.forEach((g) => {
      if (g.backdrop_name) set.add(g.backdrop_name);
    });
    return Array.from(set);
  }, [bankVault]);

  const filteredShopGifts = useMemo(() => {
    return bankVault
      .filter((g) => {
        if (shopFilterType !== 'all' && g.name !== shopFilterType) return false;
        if (shopFilterModel !== 'all' && g.model_name !== shopFilterModel) return false;
        if (shopFilterBackdrop !== 'all' && g.backdrop_name !== shopFilterBackdrop) return false;
        return true;
      })
      .sort((a, b) => {
        const pA = Number(a.price_ton) || 0;
        const pB = Number(b.price_ton) || 0;
        return shopSortOrder === 'asc' ? pA - pB : pB - pA;
      });
  }, [bankVault, shopFilterType, shopFilterModel, shopFilterBackdrop, shopSortOrder]);

  // Баланс используется ТОЛЬКО как доплата к выбранному подарку
  const balanceBetTon = selectedSource
    ? Number(((balanceTon * balanceSliderPercent) / 100).toFixed(2))
    : 0;

  const sourcePriceTon = selectedSource ? (Number(selectedSource.price_ton) || 0) : 0;
  // Общая ставка = стоимость подарка + доплата балансом
  const totalBetAmount = selectedSource ? Number((sourcePriceTon + balanceBetTon).toFixed(2)) : 0;

  // Цель — ВСЕГДА подарок из банка
  const targetPriceTon = selectedTarget ? (Number(selectedTarget.price_ton) || 0) : 0;

  // Расчёт шанса рулетки (от 1% до 85%)
  const calculateChance = (): number => {
    if (!selectedSource || !selectedTarget) return 0;
    if (targetPriceTon <= 0 || totalBetAmount <= 0) return 0;
    if (totalBetAmount >= targetPriceTon) return 85.0;
    const raw = (totalBetAmount / targetPriceTon) * 0.95 * 100;
    return Math.min(Math.max(Number(raw.toFixed(2)), 1.0), 85.0);
  };

  const chance = calculateChance();

  /**
   * Кнопки x2, x4, x8 и % автоматически ищут подходящий ПОДАРОК из банка
   */
  const handlePresetClick = (presetId: string) => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');

    if (activePreset === presetId) {
      setActivePreset(null);
      return;
    }

    if (!selectedSource) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning');
      alert('Сначала выберите подарок из своего инвентаря слева!');
      setSubTab('inventory');
      return;
    }

    if (bankVault.length === 0) {
      alert('В банке пока нет подарков для подбора');
      return;
    }

    setActivePreset(presetId);

    let desiredPrice = 0;
    if (presetId === 'm1') desiredPrice = totalBetAmount * customMultipliers[0];
    else if (presetId === 'm2') desiredPrice = totalBetAmount * customMultipliers[1];
    else if (presetId === 'm3') desiredPrice = totalBetAmount * customMultipliers[2];
    else if (presetId === 'p1') desiredPrice = (totalBetAmount * 0.95 * 100) / customPercents[0];
    else if (presetId === 'p2') desiredPrice = (totalBetAmount * 0.95 * 100) / customPercents[1];
    else if (presetId === 'p3') desiredPrice = (totalBetAmount * 0.95 * 100) / customPercents[2];

    const candidates = bankVault.filter((g) => Number(g.price_ton) > sourcePriceTon);
    const poolToSearch = candidates.length > 0 ? candidates : bankVault;

    let closestGift = poolToSearch[0];
    let minDiff = Math.abs(Number(closestGift.price_ton) - desiredPrice);

    for (const g of poolToSearch) {
      const diff = Math.abs(Number(g.price_ton) - desiredPrice);
      if (diff < minDiff) {
        minDiff = diff;
        closestGift = g;
      }
    }

    if (closestGift) {
      setSelectedTarget(closestGift);
    }
  };

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

  /**
   * АПГРЕЙД: БЕЗОПАСНАЯ ЛОГИКА (ТОЛЬКО ПОДАРОК -> ПОДАРОК)
   */
  const handleUpgrade = async () => {
    if (isSpinning || !selectedSource || !selectedTarget || chance <= 0) return;

    if (balanceBetTon > balanceTon) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
      return;
    }

    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy');
    setIsSpinning(true);

    try {
      const roll = Math.random() * 100;
      const isWin = roll < chance;

      const sectorSpan = (chance / 100) * 360;
      const halfSpan = sectorSpan / 2;
      const padding = Math.min(3, sectorSpan * 0.05);

      const targetAngle = isWin
        ? (Math.random() - 0.5) * (sectorSpan - padding * 2)
        : halfSpan + padding + Math.random() * ((360 - sectorSpan) - padding * 2);

      const normalizedTarget = (targetAngle % 360 + 360) % 360;
      const currentMod = (arrowAngle % 360 + 360) % 360;
      let diff = normalizedTarget - currentMod;
      if (diff < 0) diff += 360;

      const extraFullSpins = isFastSpin ? 360 * 3 : 360 * 6;
      const nextArrowAngle = arrowAngle + extraFullSpins + diff;
      setArrowAngle(nextArrowAngle);

      const spinDuration = isFastSpin ? 800 : 3200;

      // Списываем доплату с баланса TON, если она была
      if (balanceBetTon > 0) {
        const newBal = Number(Math.max(0, balanceTon - balanceBetTon).toFixed(2));
        saveBalanceToDb(newBal);
      }

      const sourceToDrop = selectedSource;
      const targetToAdd = selectedTarget;

      setTimeout(async () => {
        setIsSpinning(false);
        try {
          if (isWin) {
            window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } });

            const safeAdd = normalizeGift(targetToAdd);
            setUserInventory((prev) => [
              ...prev.filter((i) => i.id !== sourceToDrop.id),
              { ...safeAdd, id: Date.now() },
            ]);
          } else {
            window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
            setUserInventory((prev) => prev.filter((i) => i.id !== sourceToDrop.id));
          }
        } catch (innerErr) {
          console.error('Ошибка завершения апгрейда:', innerErr);
        } finally {
          setSelectedSource(null);
          setSelectedTarget(null);
          setActivePreset(null);
          setBalanceSliderPercent(0);
          loadInventory();
        }
      }, spinDuration);
    } catch (err) {
      console.error('Критическая ошибка апгрейда:', err);
      setIsSpinning(false);
    }
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

  // Пополнение через кошелек
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
      console.error(err);
    }
  };

  // CryptoBot
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

  // Кнопка активна ТОЛЬКО когда есть и предмет-источник, и предмет-цель
  const canUpgrade = !isSpinning && !!selectedSource && !!selectedTarget && chance > 0 && balanceBetTon <= balanceTon;

  const halfPercent = chance > 0 ? chance / 2 : 0;
  const startP = 50 - halfPercent;
  const endP = 50 + halfPercent;
  const wheelConic = chance > 0
    ? `conic-gradient(from 0deg, #181424 0%, #181424 ${startP}%, #ffb703 ${startP}%, #fb8500 50%, #ffb703 ${endP}%, #181424 ${endP}%, #181424 100%)`
    : '#181424';

  /**
   * КАРТОЧКА ПОДАРКА ДЛЯ ИНВЕНТАРЯ И ЦЕЛИ (ТЕЛЕГРАМ СТИЛЬ):
   * В инвентаре содержит нижнюю панель с кнопками «Продать» (TON) и «Вывести» (стрелка вверх-вправо ↗)
   */
  const renderTelegramNativeCard = (
    gift: BankGift,
    isSelected: boolean,
    onSelect: () => void,
    isInventoryMode: boolean = false
  ) => {
    const safePrice = (Number(gift.price_ton) || 0).toFixed(2);
    const isLoading = actionLoadingId === gift.id;

    return (
      <div
        key={gift.id}
        onClick={onSelect}
        style={{
          position: 'relative',
          borderRadius: '20px',
          background: '#120d22',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer',
          border: isSelected ? '2px solid #eab308' : '1px solid rgba(255,255,255,0.08)',
          boxShadow: isSelected
            ? '0 0 16px rgba(234, 179, 8, 0.45), 0 8px 20px rgba(0,0,0,0.5)'
            : '0 4px 14px rgba(0,0,0,0.3)',
          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isSelected ? 'scale(1.02)' : 'scale(1)',
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '110px',
            background: '#1a1333',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '7px',
              left: '7px',
              background: 'rgba(18, 14, 28, 0.78)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderRadius: '14px',
              padding: '3px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              zIndex: 3,
            }}
          >
            <img
              src={ICONS.ton}
              alt="TON"
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '3px',
                display: 'block',
                objectFit: 'contain',
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.2px' }}>
              {safePrice}
            </span>
          </div>

          <img
            src={getDirectGiftImageUrl(gift.image_url, gift.slug)}
            alt={gift.name}
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.endsWith('.webp')) {
                img.src = img.src.replace('.webp', '.png');
              } else if (!img.src.includes('/icons/gift.png')) {
                img.src = '/icons/gift.png';
              }
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </div>

        <div
          style={{
            background: '#120d22',
            padding: '8px 10px 6px 10px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'left',
            zIndex: 3,
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: '800',
              color: '#ffffff',
              lineHeight: '1.2',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {gift.name}
          </div>
          <div
            style={{
              fontSize: '10px',
              fontWeight: '600',
              color: '#8b849b',
              marginTop: '2px',
              letterSpacing: '0.2px',
            }}
          >
            {gift.serial_number || '#0000'}
          </div>
        </div>

        {/* ПАНЕЛЬ ДВУХ КНОПОК КАК НА ФОТО: [ ПРОДАТЬ (TON) | ВЫВЕСТИ (↗) ] */}
        {isInventoryMode && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              padding: '6px 8px 8px 8px',
              background: '#0d091a',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              gap: '4px',
            }}
          >
            {/* Кнопка Продать за TON */}
            <button
              onClick={(e) => handleSellGift(e, gift)}
              title="Продать за TON"
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                padding: '5px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              <img
                src={ICONS.ton}
                alt="Продать"
                style={{ width: '13px', height: '13px', objectFit: 'contain' }}
              />
            </button>

            <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.12)' }} />

            {/* Кнопка Вывести (стрелка ↗) */}
            <button
              onClick={(e) => handleWithdrawGift(e, gift)}
              title="Вывести подарок в Telegram"
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                padding: '5px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                color: '#cbd5e1',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </button>
          </div>
        )}
      </div>
    );
  };

  /**
   * КАРТОЧКА МАГАЗИНА:
   */
  const renderMarketplaceCard = (gift: BankGift) => {
    const isCurrentBuying = isBuying === gift.id;
    const safePrice = (Number(gift.price_ton) || 0).toFixed(2);

    return (
      <div
        key={gift.id}
        style={{
          background: '#14121a',
          borderRadius: '24px',
          padding: '10px 10px 12px 10px',
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            borderRadius: '20px',
            overflow: 'hidden',
            background: '#1f1a2e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '10px',
            position: 'relative',
          }}
        >
          <img
            src={getDirectGiftImageUrl(gift.image_url, gift.slug)}
            alt={gift.name}
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.endsWith('.webp')) {
                img.src = img.src.replace('.webp', '.png');
              } else if (!img.src.includes('/icons/gift.png')) {
                img.src = '/icons/gift.png';
              }
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </div>

        <div style={{ textAlign: 'left', padding: '0 4px', marginBottom: '10px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: '800',
              color: '#ffffff',
              lineHeight: '1.2',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {gift.name}
          </div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: '600',
              color: '#7e7892',
              marginTop: '3px',
              letterSpacing: '0.2px',
            }}
          >
            {gift.serial_number || '#0000'}
          </div>
        </div>

        <button
          onClick={() => handleBuyGiftInShop(gift)}
          disabled={isCurrentBuying}
          style={{
            width: '100%',
            borderRadius: '18px',
            background: isCurrentBuying ? '#3b82f6' : '#007aff',
            border: 'none',
            padding: '9px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            cursor: isCurrentBuying ? 'wait' : 'pointer',
            boxShadow: '0 4px 14px rgba(0, 122, 255, 0.4)',
            transition: 'transform 0.15s ease, background 0.15s ease',
            opacity: isCurrentBuying ? 0.7 : 1,
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.3px' }}>
            {isCurrentBuying ? 'Покупка...' : safePrice}
          </span>
          {!isCurrentBuying && (
            <img
              src={ICONS.ton}
              alt="TON"
              style={{
                width: '13px',
                height: '13px',
                borderRadius: '3px',
                display: 'block',
                objectFit: 'contain',
              }}
            />
          )}
        </button>
      </div>
    );
  };

  /**
   * СЛОТ АРЕНЫ: ОТОБРАЖЕНИЕ ВЫБРАННОГО ПОДАРКА:
   */
  const renderArenaGiftCard = (gift: BankGift, extraSubText?: string) => {
    const safePrice = (Number(gift.price_ton) || 0).toFixed(2);

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: '22px' }}>
        <img
          src={getDirectGiftImageUrl(gift.image_url, gift.slug)}
          alt={gift.name}
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src.endsWith('.webp')) {
              img.src = img.src.replace('.webp', '.png');
            } else if (!img.src.includes('/icons/gift.png')) {
              img.src = '/icons/gift.png';
            }
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(18, 14, 28, 0.88)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderRadius: '16px',
            padding: '3px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            zIndex: 3,
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
          }}
        >
          <img
            src={ICONS.ton}
            alt="TON"
            style={{
              width: '13px',
              height: '13px',
              borderRadius: '3px',
              display: 'block',
              objectFit: 'contain',
            }}
          />
          <span style={{ fontSize: '11px', fontWeight: '900', color: '#ffb703', letterSpacing: '-0.2px' }}>
            {safePrice}
          </span>
          {extraSubText && (
            <span style={{ fontSize: '9px', fontWeight: '800', color: '#4ade80' }}>
              {extraSubText}
            </span>
          )}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: '7px',
            left: '7px',
            right: '7px',
            background: 'rgba(18, 14, 28, 0.88)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderRadius: '14px',
            padding: '6px 8px',
            textAlign: 'left',
            zIndex: 3,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: '800',
              color: '#ffffff',
              lineHeight: '1.2',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {gift.name}
          </div>
          <div
            style={{
              fontSize: '9px',
              fontWeight: '600',
              color: '#8b849b',
              marginTop: '1px',
              letterSpacing: '0.2px',
            }}
          >
            {gift.serial_number || '#0000'}
          </div>
        </div>
      </div>
    );
  };

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
        select option {
          background: #181424;
          color: #fff;
        }
      `}</style>

      {/* ВЕРХНЯЯ ПАНЕЛЬ */}
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

            {/* КОЛЕСО РУЛЕТКИ */}
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

              {/* ВРАЩАЮЩАЯСЯ СТРЕЛКА */}
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
                  <div
                    style={{
                      width: '2px',
                      height: '13px',
                      background: '#ffb703',
                      boxShadow: '0 0 6px #ffb703',
                    }}
                  />
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

              <div
                style={{
                  position: 'absolute',
                  bottom: '-18px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '10px',
                  fontWeight: '800',
                  color: '#8b7fa8',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              >
                0%
              </div>
            </div>

            {/* Карточки апгрейда: ПОДАРОК ИЗ ИНВЕНТАРЯ ➔ ПОДАРОК ИЗ БАНКА */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
              <div
                onClick={() => setSubTab('inventory')}
                style={{
                  width: '124px',
                  height: '138px',
                  borderRadius: '24px',
                  background: '#171126',
                  border: selectedSource ? '2px solid #a855f7' : '2px dashed #3a2b61',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: selectedSource ? '0 6px 18px rgba(0,0,0,0.5)' : 'none',
                }}
              >
                {selectedSource ? (
                  <>
                    {renderArenaGiftCard(selectedSource, balanceBetTon > 0 ? `+${balanceBetTon.toFixed(2)}` : undefined)}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSource(null);
                        setBalanceSliderPercent(0);
                      }}
                      title="Убрать подарок"
                      style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        background: 'rgba(0,0,0,0.7)',
                        border: 'none',
                        color: '#fff',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '10px',
                        lineHeight: '1',
                        padding: 0,
                        zIndex: 4,
                      }}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: '11px', color: '#8b7fa8', fontWeight: '700', padding: '0 8px' }}>
                    Выбери подарок для апгрейда
                  </span>
                )}
              </div>

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

              <div
                onClick={() => setSubTab('targets')}
                style={{
                  width: '124px',
                  height: '138px',
                  borderRadius: '24px',
                  background: '#171126',
                  border: selectedTarget ? '2px solid #eab308' : '2px dashed #3a2b61',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: selectedTarget ? '0 6px 18px rgba(0,0,0,0.5)' : 'none',
                }}
              >
                {selectedTarget ? (
                  <>
                    {renderArenaGiftCard(selectedTarget)}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTarget(null);
                        setActivePreset(null);
                      }}
                      title="Убрать цель"
                      style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        background: 'rgba(0,0,0,0.7)',
                        border: 'none',
                        color: '#fff',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '10px',
                        lineHeight: '1',
                        padding: 0,
                        zIndex: 4,
                      }}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: '11px', color: '#8b7fa8', fontWeight: '700', padding: '0 8px' }}>
                    Выбери цель апгрейда
                  </span>
                )}
              </div>
            </div>

            {/* ПОЛОСКА ДОПЛАТЫ БАЛАНСОМ ДЛЯ ПОВЫШЕНИЯ ШАНСА */}
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
                opacity: selectedSource ? 1 : 0.45,
                pointerEvents: selectedSource ? 'auto' : 'none',
              }}
            >
              <div style={{ textAlign: 'left', minWidth: '78px', flexShrink: 0 }}>
                <div style={{ fontSize: '10px', color: '#8b7fa8', fontWeight: '700', textTransform: 'uppercase' }}>
                  + Доплата
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <img src={ICONS.ton} alt="TON" style={{ width: '13px', height: '13px', borderRadius: '3px' }} />
                  <span style={{ fontSize: '13px', fontWeight: '900', color: '#fff' }}>
                    {balanceBetTon.toFixed(2)}
                  </span>
                </div>
              </div>

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

            {/* КНОПКА «УЛУЧШИТЬ» */}
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
                : 'Улучшить'}
            </button>
          </div>

          {/* КНОПКИ БЫСТРОГО ПОДБОРА ПОДАРКА ИЗ БАНКА */}
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
                      Купите подарок в магазине или отправьте его боту @GuseBank, чтобы начать апгрейд!
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
                    {userInventory.map((gift) =>
                      renderTelegramNativeCard(
                        gift,
                        selectedSource?.id === gift.id,
                        () => {
                          setSelectedSource(gift);
                          window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                        },
                        true // Режим инвентаря с кнопками «Продать» и «Вывести»
                      )
                    )}
                  </div>
                )}
              </div>
            )}

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
                    {bankVault.map((gift) =>
                      renderTelegramNativeCard(
                        gift,
                        selectedTarget?.id === gift.id,
                        () => {
                          setActivePreset(null);
                          setSelectedTarget(gift);
                          window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                        },
                        false
                      )
                    )}
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
                Настройте множители для быстрого подбора подарка
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
                          const next: [string, string, string] = [tempMultipliers[0], tempMultipliers[1], tempMultipliers[2]];
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
                Настройте шансы для быстрого подбора подарка
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
                          const next: [string, string, string] = [tempPercents[0], tempPercents[1], tempPercents[2]];
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
        <div style={{ padding: '16px 14px 10px 14px' }}>
          
          {/* ВЕРХНЯЯ ПАНЕЛЬ ФИЛЬТРОВ И СОРТИРОВКИ */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
              overflowX: 'auto',
              paddingBottom: '4px',
            }}
          >
            <button
              onClick={() => {
                window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                setShopSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
              }}
              title={shopSortOrder === 'asc' ? 'Сначала дешевые' : 'Сначала дорогие'}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '16px',
                background: '#181424',
                border: '1px solid rgba(255,255,255,0.08)',
                color: shopSortOrder === 'desc' ? '#007aff' : '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="20" x2="7" y2="4" />
                <polyline points="3 8 7 4 11 8" />
                <line x1="17" y1="4" x2="17" y2="20" />
                <polyline points="13 16 17 20 21 16" />
              </svg>
            </button>

            {/* Фильтр: «Тип ⌄» */}
            <div
              style={{
                position: 'relative',
                flex: 1,
                minWidth: '85px',
                background: '#181424',
                borderRadius: '16px',
                border: shopFilterType !== 'all' ? '1.5px solid #007aff' : '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              <select
                value={shopFilterType}
                onChange={(e) => {
                  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                  setShopFilterType(e.target.value);
                }}
                style={{
                  width: '100%',
                  height: '42px',
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '700',
                  padding: '0 24px 0 12px',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  cursor: 'pointer',
                  outline: 'none',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <option value="all">Тип</option>
                {uniqueGiftTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <span
                style={{
                  position: 'absolute',
                  right: '10px',
                  pointerEvents: 'none',
                  fontSize: '10px',
                  color: '#8b849b',
                }}
              >
                ▼
              </span>
            </div>

            {/* Фильтр: «Скин ⌄» */}
            <div
              style={{
                position: 'relative',
                flex: 1,
                minWidth: '85px',
                background: '#181424',
                borderRadius: '16px',
                border: shopFilterModel !== 'all' ? '1.5px solid #007aff' : '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              <select
                value={shopFilterModel}
                onChange={(e) => {
                  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                  setShopFilterModel(e.target.value);
                }}
                style={{
                  width: '100%',
                  height: '42px',
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '700',
                  padding: '0 24px 0 12px',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  cursor: 'pointer',
                  outline: 'none',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <option value="all">Скин</option>
                {uniqueModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <span
                style={{
                  position: 'absolute',
                  right: '10px',
                  pointerEvents: 'none',
                  fontSize: '10px',
                  color: '#8b849b',
                }}
              >
                ▼
              </span>
            </div>

            {/* Фильтр: «Фон ⌄» */}
            <div
              style={{
                position: 'relative',
                flex: 1,
                minWidth: '85px',
                background: '#181424',
                borderRadius: '16px',
                border: shopFilterBackdrop !== 'all' ? '1.5px solid #007aff' : '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              <select
                value={shopFilterBackdrop}
                onChange={(e) => {
                  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                  setShopFilterBackdrop(e.target.value);
                }}
                style={{
                  width: '100%',
                  height: '42px',
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '700',
                  padding: '0 24px 0 12px',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  cursor: 'pointer',
                  outline: 'none',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <option value="all">Фон</option>
                {uniqueBackdrops.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <span
                style={{
                  position: 'absolute',
                  right: '10px',
                  pointerEvents: 'none',
                  fontSize: '10px',
                  color: '#8b849b',
                }}
              >
                ▼
              </span>
            </div>
          </div>

          {/* СПИСОК КАРТОЧЕК В МАГАЗИНЕ */}
          {filteredShopGifts.length === 0 ? (
            <div style={{ background: '#171126', borderRadius: '24px', padding: '32px 18px', textAlign: 'center', border: '1px solid #271c47', marginTop: '10px' }}>
              <div style={{ width: '56px', height: '56px', margin: '0 auto 10px auto', background: '#20163d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={ICONS.gift} alt="Банк" style={{ width: '28px', height: '28px', filter: 'invert(1)' }} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: '800' }}>
                {bankVault.length === 0 ? 'В банке пока нет подарков' : 'По выбранным фильтрам ничего не найдено'}
              </div>
              <p style={{ fontSize: '11px', color: '#8b7fa8', margin: '6px 0 14px 0' }}>
                {bankVault.length === 0
                  ? 'Подарки появятся здесь, как только они поступят на баланс @GuseBank'
                  : 'Попробуйте сбросить фильтры'}
              </p>
              {bankVault.length > 0 && (
                <button
                  onClick={() => {
                    setShopFilterType('all');
                    setShopFilterModel('all');
                    setShopFilterBackdrop('all');
                  }}
                  style={{
                    background: '#007aff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '14px',
                    padding: '8px 18px',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer',
                  }}
                >
                  Сбросить фильтры
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {filteredShopGifts.map((gift) => renderMarketplaceCard(gift))}
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
                  {userInventory.map((gift) =>
                    renderTelegramNativeCard(
                      gift,
                      selectedSource?.id === gift.id,
                      () => {
                        setSelectedSource(gift);
                        setIsProfileOpen(false);
                        setActiveTab('upgrade');
                        setSubTab('targets');
                        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                      },
                      true // Кнопки «Продать» и «Вывести» в профиле тоже доступны
                    )
                  )}
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
