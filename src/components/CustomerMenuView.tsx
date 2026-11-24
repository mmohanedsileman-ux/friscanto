import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  Clock,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatCurrency,
  type MenuCategory,
  type MenuItem,
  type StoreSettings,
} from '../types';
import {
  CATEGORY_DEFAULT_IMAGE,
  FRESCANTO_IMAGES,
  resolveItemImage,
} from '../data/defaultMenu';
import { SafeImage } from './SafeImage';
import { PWAInstallButton } from './PWAInstallButton';

interface CustomerMenuViewProps {
  items: MenuItem[];
  settings: StoreSettings;
  loading: boolean;
  isFallbackData?: boolean;
  onRetry?: () => void;
  onOpenAdmin: () => void;
  isAdminLoggedIn: boolean;
}

function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

function toWhatsAppNumber(raw?: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0')) {
    digits = `20${digits.slice(1)}`;
  }
  return digits.length >= 10 ? digits : null;
}

function availableLabel(n: number): string {
  if (n <= 0) return 'لا توجد أصناف متاحة حالياً';
  if (n === 1) return 'صنف واحد طازج متاح اليوم';
  if (n === 2) return 'صنفان طازجان متاحان اليوم';
  if (n <= 10) return `${n} أصناف طازجة متاحة اليوم`;
  return `${n} صنفاً طازجاً متاحاً اليوم`;
}

export function CustomerMenuView({
  items,
  settings,
  loading,
  isFallbackData = false,
  onRetry,
  onOpenAdmin,
  isAdminLoggedIn,
}: CustomerMenuViewProps) {
  const [activeCategory, setActiveCategory] = useState<'all' | MenuCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeModalBtnRef = useRef<HTMLButtonElement | null>(null);

  const storeName = settings.storeName?.trim() || 'فريستكانتو';
  const whatsappNumber = useMemo(
    () => toWhatsAppNumber(settings.whatsapp || settings.phone),
    [settings.whatsapp, settings.phone]
  );

  const generalWhatsAppUrl = useMemo(() => {
    if (!whatsappNumber) return null;
    const text = encodeURIComponent(`مرحباً ${storeName}، حابب أطلب من المنيو.`);
    return `https://wa.me/${whatsappNumber}?text=${text}`;
  }, [whatsappNumber, storeName]);

  const availableItems = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];
    return safeItems
      .filter((item) => item && item.isAvailable)
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  }, [items]);

  const categoriesWithItems = useMemo(() => {
    const present = new Set(availableItems.map((i) => i.category));
    return CATEGORY_ORDER.filter((cat) => present.has(cat));
  }, [availableItems]);

  const filteredItems = useMemo(() => {
    const q = normalizeArabic(searchQuery.trim());
    return availableItems.filter((item) => {
      const matchesCat = activeCategory === 'all' || item.category === activeCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        normalizeArabic(item.name).includes(q) ||
        (item.nameEn ? normalizeArabic(item.nameEn).includes(q) : false) ||
        normalizeArabic(item.description).includes(q) ||
        normalizeArabic(CATEGORY_LABELS[item.category]).includes(q)
      );
    });
  }, [availableItems, activeCategory, searchQuery]);

  // Modal accessibility: body scroll lock, focus close button, Escape key, restore focus
  useEffect(() => {
    if (!selectedItem) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus close button on next frame
    const focusTimer = window.requestAnimationFrame(() => {
      closeModalBtnRef.current?.focus();
    });

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedItem(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [selectedItem]);

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>, item: MenuItem) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedItem(item);
    }
  };

  const selectedItemWhatsAppUrl = useMemo(() => {
    if (!whatsappNumber || !selectedItem) return null;
    const priceFormatted = formatCurrency(selectedItem.price, settings.currency);
    const text = encodeURIComponent(
      `مرحباً ${storeName}، حابب أطلب: ${selectedItem.name} (${priceFormatted})`
    );
    return `https://wa.me/${whatsappNumber}?text=${text}`;
  }, [whatsappNumber, selectedItem, storeName, settings.currency]);

  const trimmedAddress = settings.address?.trim() || '';
  const trimmedHours = settings.workingHours?.trim() || '';
  const trimmedPhone = settings.phone?.trim() || '';

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#171916] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#FAFAF8]/95 backdrop-blur-sm border-b border-[#E7E5DE]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#top"
            className="font-display text-2xl font-extrabold tracking-tight text-[#14532D] whitespace-nowrap shrink-0"
          >
            {storeName}
          </a>

          {/* Zone 2: Desktop Nav */}
          <nav
            aria-label="التنقل الرئيسي"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#4A5046]"
          >
            <a
              href="#menu"
              className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0 py-1"
            >
              المنيو
            </a>
            <a
              href="#visit"
              className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0 py-1"
            >
              مواعيد العمل والعنوان
            </a>
            <a
              href="#contact"
              className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0 py-1"
            >
              تواصل معنا
            </a>
          </nav>

          {/* Zone 3: WhatsApp CTA (sm+) & Mobile Hamburger (<md) */}
          <div className="flex items-center gap-2 shrink-0">
            {generalWhatsAppUrl && (
              <a
                href={generalWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534] smooth-settle whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15803D]"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>اطلب عبر واتساب</span>
              </a>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-panel"
              aria-label={mobileMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
              className="md:hidden w-10 h-10 rounded-lg border border-[#E7E5DE] bg-white text-[#171916] flex items-center justify-center hover:bg-[#F3F6F0] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#15803D]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Panel */}
        {mobileMenuOpen && (
          <nav
            id="mobile-nav-panel"
            aria-label="قائمة الجوال"
            className="md:hidden border-t border-[#E7E5DE] bg-[#FAFAF8] px-5 py-3 space-y-1"
          >
            <a
              href="#menu"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-[#171916] hover:bg-[#F3F6F0] hover:text-[#14532D]"
            >
              المنيو
            </a>
            <a
              href="#visit"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-[#171916] hover:bg-[#F3F6F0] hover:text-[#14532D]"
            >
              مواعيد العمل والعنوان
            </a>
            <a
              href="#contact"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-[#171916] hover:bg-[#F3F6F0] hover:text-[#14532D]"
            >
              تواصل معنا
            </a>
            {generalWhatsAppUrl && (
              <a
                href={generalWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>اطلب عبر واتساب</span>
              </a>
            )}
          </nav>
        )}
      </header>

      <main id="top" className="flex-1">
        {/* Fallback Data Alert Banner */}
        {isFallbackData && !loading && (
          <div className="max-w-7xl mx-auto px-5 sm:px-8 mt-4">
            <div
              role="alert"
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 text-amber-950"
            >
              <div className="flex items-start sm:items-center gap-2.5 text-sm font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  تعذّر تحميل أحدث المنيو. الأصناف والأسعار المعروضة قد لا تكون محدّثة، يرجى التأكد
                  من السعر عند الطلب.
                </span>
              </div>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-900 text-white text-xs sm:text-sm font-bold hover:bg-amber-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>إعادة المحاولة</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Section 1: Brand Hero */}
        <section className="max-w-7xl mx-auto px-5 sm:px-8 pt-6 pb-8 lg:pt-8 lg:pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
            {/* Compact Brand Identity Card */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-[#F3F6F0] rounded-2xl p-6 sm:p-8 border border-[#DFE6D8]">
              <div>
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-[#E5B84B] bg-white shrink-0">
                    <SafeImage
                      src={FRESCANTO_IMAGES.logo}
                      alt="شعار فريستكانتو Firstcanto"
                      fallbackLabel="Firstcanto"
                      className="w-full h-full object-cover"
                      eager
                    />
                  </div>
                  <div>
                    <p className="font-display text-xl sm:text-2xl font-extrabold text-[#B45309] tracking-wide leading-tight" dir="ltr">
                      Firstcanto
                    </p>
                    <p className="text-sm font-bold text-[#15803D] mt-1">
                      {settings.tagline?.trim() || 'طازة · فريش · منعش'}
                    </p>
                  </div>
                </div>

                <h1
                  className="font-display font-extrabold text-[#171916] leading-[1.24] mb-6"
                  style={{
                    fontSize: 'clamp(1.65rem, 2.8vw, 2.45rem)',
                    textWrap: 'balance',
                  }}
                >
                  فواكه فريش مقطعة يومياً بطعم لا يُقاوم
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="#menu"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] smooth-settle whitespace-nowrap shrink-0"
                >
                  <span>تصفح المنيو الآن</span>
                  <ArrowDown className="w-4 h-4" />
                </a>
                <PWAInstallButton variant="hero" />
                {!loading && (
                  <span className="text-sm font-semibold text-[#5C6158] tabular-nums w-full sm:w-auto">
                    {availableLabel(availableItems.length)}
                  </span>
                )}
              </div>
            </div>

            {/* Hero Showcase Photography */}
            <div className="lg:col-span-7 overflow-hidden rounded-2xl border border-[#E7E5DE] bg-[#EAE8E0] min-h-[240px] lg:min-h-[340px]">
              <SafeImage
                src={FRESCANTO_IMAGES.hero}
                alt="تشكيلة فريستكانتو للفواكه الفريش والعصائر الطبيعية"
                fallbackLabel="فريستكانتو فواكه فريش"
                className="w-full h-full object-cover"
                eager
              />
            </div>
          </div>
        </section>

        {/* Section 2: Digital Menu */}
        <section id="menu" className="scroll-mt-20 max-w-7xl mx-auto px-5 sm:px-8 py-6 lg:py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E7E5DE]">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#171916]">
                قائمة الأصناف والأسعار
              </h2>
              <p className="text-sm text-[#676D62] mt-1">
                اضغط على أي صنف لعرض المكونات والتفاصيل
              </p>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-[#6B7166] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="ابحث في المنيو"
                placeholder="ابحث عن صنف..."
                className="w-full pr-10 pl-9 py-2.5 text-sm bg-white border border-[#DEDCD3] rounded-xl text-[#171916] placeholder:text-[#848A7F] focus:outline-none focus:border-[#15803D]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="مسح البحث"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7166] hover:text-[#171916] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Interactive Category Tabs */}
          {categoriesWithItems.length > 1 && (
            <div
              role="tablist"
              aria-label="أقسام المنيو"
              className="flex items-center gap-2 overflow-x-auto py-4"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'all'}
                onClick={() => setActiveCategory('all')}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap shrink-0 smooth-settle cursor-pointer ${
                  activeCategory === 'all'
                    ? 'bg-[#15803D] text-white'
                    : 'bg-[#EFECE4] text-[#4A5046] hover:bg-[#E4E0D5] hover:text-[#171916]'
                }`}
              >
                الكل ({availableItems.length})
              </button>
              {categoriesWithItems.map((cat) => {
                const count = availableItems.filter((i) => i.category === cat).length;
                const isSelected = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap shrink-0 smooth-settle cursor-pointer ${
                      isSelected
                        ? 'bg-[#15803D] text-white'
                        : 'bg-[#EFECE4] text-[#4A5046] hover:bg-[#E4E0D5] hover:text-[#171916]'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-[#E7E5DE] rounded-2xl overflow-hidden animate-pulse"
                >
                  <div className="aspect-[4/3] bg-[#ECEAE3]" />
                  <div className="p-5 space-y-3">
                    <div className="h-5 w-40 bg-[#ECEAE3] rounded" />
                    <div className="h-4 w-full bg-[#F3F2EC] rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : availableItems.length === 0 ? (
            <div className="bg-white border border-[#E7E5DE] rounded-2xl py-14 px-6 text-center mt-4">
              <p className="font-display text-lg font-bold text-[#171916] mb-2">
                لا توجد أصناف متاحة حالياً — تابعنا قريباً، أو تواصل معنا لمعرفة المتاح اليوم.
              </p>
              {generalWhatsAppUrl && (
                <a
                  href={generalWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534]"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>تواصل معنا عبر واتساب</span>
                </a>
              )}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-white border border-[#E7E5DE] rounded-2xl py-14 px-6 text-center mt-4">
              <p className="font-display text-lg font-bold text-[#171916] mb-2">
                لا توجد أصناف مطابقة لبحثك
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('all');
                }}
                className="mt-3 px-5 py-2.5 rounded-xl bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534] cursor-pointer"
              >
                عرض جميع الأصناف
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
              {filteredItems.map((item) => {
                const formattedPrice = formatCurrency(item.price, settings.currency);
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${item.name} — ${formattedPrice}`}
                    onClick={() => setSelectedItem(item)}
                    onKeyDown={(e) => handleCardKeyDown(e, item)}
                    className="group text-right bg-white border border-[#E7E5DE] rounded-2xl overflow-hidden flex flex-col hover:-translate-y-0.5 hover:border-[#BFCFBA] smooth-settle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15803D] focus-visible:ring-offset-2"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F3F2EC]">
                      <SafeImage
                        src={resolveItemImage(
                          item.id,
                          item.name,
                          item.category,
                          item.imageUrl || CATEGORY_DEFAULT_IMAGE[item.category]
                        )}
                        alt={item.name}
                        fallbackLabel={item.name}
                        className="w-full h-full object-cover group-hover:scale-[1.03] smooth-settle"
                      />
                      {item.isFeatured && (
                        <span className="absolute top-3 right-3 bg-[#E5B84B] text-[#4A3300] rounded-full px-3 py-1 text-xs font-bold shadow-sm">
                          الأكثر طلباً
                        </span>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-baseline justify-between gap-3 mb-1.5">
                          <h3 className="font-display text-lg font-bold text-[#171916] group-hover:text-[#15803D] transition-colors">
                            {item.name}
                          </h3>
                          <span className="font-mono-num text-lg font-extrabold text-[#14532D] whitespace-nowrap shrink-0">
                            {formattedPrice}
                          </span>
                        </div>
                        <p className="text-sm text-[#676D62] mb-2">
                          {CATEGORY_LABELS[item.category]} · {item.size || 'حجم قياسي'}
                        </p>
                        <p className="text-sm text-[#52584D] leading-relaxed line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 3: Practical Visit & Contact Strip */}
        <section id="visit" className="scroll-mt-20 max-w-7xl mx-auto px-5 sm:px-8 pt-10 pb-12">
          <div
            id="contact"
            className="scroll-mt-20 bg-white border border-[#E7E5DE] rounded-2xl grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-[#EFECE4]"
          >
            <div className="p-6 flex items-start gap-3.5">
              <Clock className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-sm font-bold text-[#171916]">مواعيد العمل</p>
                <p className="text-sm text-[#5C6158] mt-1">{trimmedHours || '—'}</p>
              </div>
            </div>
            <div className="p-6 flex items-start gap-3.5">
              <MapPin className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-sm font-bold text-[#171916]">العنوان</p>
                {trimmedAddress ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedAddress)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm text-[#14532D] hover:underline mt-1"
                  >
                    {trimmedAddress}
                  </a>
                ) : (
                  <p className="text-sm text-[#5C6158] mt-1">—</p>
                )}
              </div>
            </div>
            <div className="p-6 flex items-start gap-3.5">
              <Phone className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-sm font-bold text-[#171916]">للاستفسار والتواصل</p>
                {trimmedPhone ? (
                  <a
                    href={`tel:${trimmedPhone.replace(/[^0-9+]/g, '')}`}
                    className="inline-block text-sm text-[#14532D] hover:underline font-mono-num mt-1"
                    dir="ltr"
                  >
                    {trimmedPhone}
                  </a>
                ) : (
                  <p className="text-sm text-[#5C6158] mt-1">—</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Minimal Footer with Subtle Admin Entry Link */}
      <footer className="border-t border-[#E7E5DE] bg-[#FAFAF8]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-center text-xs text-[#676D62]">
          <button
            type="button"
            onClick={onOpenAdmin}
            className="text-xs font-medium text-[#676D62] hover:text-[#14532D] underline-offset-4 hover:underline cursor-pointer"
          >
            {isAdminLoggedIn ? 'لوحة الإدارة' : 'دخول الإدارة'}
          </button>
        </div>
      </footer>

      {/* Floating WhatsApp Button (Hidden when detail modal is open) */}
      {generalWhatsAppUrl && !selectedItem && (
        <a
          href={generalWhatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="اطلب عبر واتساب"
          className="fixed left-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg flex items-center justify-center hover:scale-105 hover:bg-[#20BD5A] smooth-settle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15803D]"
        >
          <MessageCircle className="w-7 h-7" />
        </a>
      )}

      {/* Product Details Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
          onClick={() => setSelectedItem(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="item-detail-title"
        >
          <div
            className="bg-white rounded-2xl border border-[#E5E3DC] max-w-lg w-full max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-[4/3] bg-[#F3F2EC]">
              <SafeImage
                src={resolveItemImage(
                  selectedItem.id,
                  selectedItem.name,
                  selectedItem.category,
                  selectedItem.imageUrl || CATEGORY_DEFAULT_IMAGE[selectedItem.category]
                )}
                alt={selectedItem.name}
                fallbackLabel={selectedItem.name}
                className="w-full h-full object-cover"
              />
              {selectedItem.isFeatured && (
                <span className="absolute top-3 right-3 bg-[#E5B84B] text-[#4A3300] rounded-full px-3 py-1 text-xs font-bold shadow-sm">
                  الأكثر طلباً
                </span>
              )}
              <button
                ref={closeModalBtnRef}
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label="إغلاق"
                className="absolute top-3 left-3 w-10 h-10 rounded-lg bg-white/95 text-[#171916] flex items-center justify-center border border-[#E5E3DC] hover:bg-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#15803D]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-2 text-sm text-[#676D62] mb-2">
                <span>{CATEGORY_LABELS[selectedItem.category]}</span>
                <span aria-hidden="true">·</span>
                <span>{selectedItem.size || 'حجم قياسي'}</span>
              </div>
              <div className="flex items-baseline justify-between gap-4 mb-2">
                <h3
                  id="item-detail-title"
                  className="font-display text-xl font-bold text-[#171916]"
                >
                  {selectedItem.name}
                </h3>
                <span className="font-mono-num text-xl font-extrabold text-[#14532D] whitespace-nowrap">
                  {formatCurrency(selectedItem.price, settings.currency)}
                </span>
              </div>
              {selectedItem.nameEn && (
                <p className="text-sm text-[#7A8075] mb-3" dir="ltr">
                  {selectedItem.nameEn}
                </p>
              )}
              <p className="text-sm text-[#4E544A] leading-relaxed mb-6">
                {selectedItem.description}
              </p>

              <div className="flex flex-wrap items-center justify-end gap-3">
                {selectedItemWhatsAppUrl && (
                  <a
                    href={selectedItemWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#20BD5A] smooth-settle"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span>اطلب هذا الصنف عبر واتساب</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-5 py-2.5 rounded-xl bg-[#171916] text-white text-sm font-semibold hover:bg-[#14532D] smooth-settle cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
