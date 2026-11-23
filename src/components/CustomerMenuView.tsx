import { useMemo, useState } from 'react';
import { Search, X, Clock, MapPin, Phone, ArrowDown } from 'lucide-react';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatCurrency,
  type MenuCategory,
  type MenuItem,
  type StoreSettings,
} from '../types';
import { CATEGORY_DEFAULT_IMAGE, FRESCANTO_IMAGES } from '../data/defaultMenu';
import { SafeImage } from './SafeImage';

interface CustomerMenuViewProps {
  items: MenuItem[];
  settings: StoreSettings;
  loading: boolean;
  onOpenAdmin: () => void;
  isAdminLoggedIn: boolean;
}

export function CustomerMenuView({
  items,
  settings,
  loading,
  onOpenAdmin,
  isAdminLoggedIn,
}: CustomerMenuViewProps) {
  const [activeCategory, setActiveCategory] = useState<'all' | MenuCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const availableItems = useMemo(
    () =>
      items
        .filter((item) => item.isAvailable)
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)),
    [items]
  );

  const categoriesWithItems = useMemo(() => {
    const present = new Set(availableItems.map((i) => i.category));
    return CATEGORY_ORDER.filter((cat) => present.has(cat));
  }, [availableItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return availableItems.filter((item) => {
      const matchesCat = activeCategory === 'all' || item.category === activeCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.nameEn && item.nameEn.toLowerCase().includes(q)) ||
        item.description.toLowerCase().includes(q) ||
        CATEGORY_LABELS[item.category].toLowerCase().includes(q)
      );
    });
  }, [availableItems, activeCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#171916]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#FAFAF8]/95 backdrop-blur-sm border-b border-[#E7E5DE]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text wordmark */}
          <a
            href="#top"
            className="font-display text-2xl font-extrabold tracking-tight text-[#14532D] whitespace-nowrap shrink-0"
          >
            {settings.storeName || 'فريستكانتو'}
          </a>

          {/* Zone 2: Clean single-line nav links */}
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
              مواعيد العمل
            </a>
            <a
              href="#visit"
              className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0 py-1"
            >
              العنوان
            </a>
            <a
              href="#contact"
              className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0 py-1"
            >
              تواصل معنا
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onOpenAdmin}
              className="px-4 py-2 rounded-lg bg-[#171916] text-white text-xs sm:text-sm font-semibold hover:bg-[#14532D] smooth-settle whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15803D]"
            >
              {isAdminLoggedIn ? 'لوحة الإدارة' : 'دخول الإدارة'}
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Section 1: Streamlined, High-Impact Brand Hero */}
        <section className="max-w-7xl mx-auto px-5 sm:px-8 pt-6 pb-8 lg:pt-8 lg:pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
            {/* Compact Brand Identity Card (focused paragraph removed) */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-[#F3F6F0] rounded-2xl p-6 sm:p-8 border border-[#DFE6D8]">
              <div>
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-[#E5B84B] bg-white shrink-0">
                    <SafeImage
                      src={FRESCANTO_IMAGES.logo}
                      alt="شعار فريستكانتو Firstcanto"
                      fallbackLabel="Firstcanto"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="font-display text-2xl sm:text-3xl font-extrabold text-[#14532D] leading-tight">
                      {settings.storeName || 'فريستكانتو'}
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-[#B45309] tracking-wide" dir="ltr">
                      Firstcanto
                    </p>
                  </div>
                </div>

                <p className="text-sm font-bold text-[#15803D] mb-2.5">
                  طازة · فريش · منعش
                </p>

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

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <a
                  href="#menu"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] smooth-settle whitespace-nowrap shrink-0"
                >
                  <span>تصفح المنيو الآن</span>
                  <ArrowDown className="w-4 h-4" />
                </a>
                <span className="text-xs font-semibold text-[#5C6158] tabular-nums">
                  {availableItems.length} أصناف طازجة متاحة اليوم
                </span>
              </div>
            </div>

            {/* Hero Showcase Photography */}
            <div className="lg:col-span-7 overflow-hidden rounded-2xl border border-[#E7E5DE] bg-[#EAE8E0] min-h-[240px] lg:min-h-[340px]">
              <SafeImage
                src={FRESCANTO_IMAGES.hero}
                alt="تشكيلة فريستكانتو للفواكه الفريش والعصائر الطبيعية"
                fallbackLabel="فريستكانتو فواكه فريش"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* Section 2: Clean, Instant Digital Menu */}
        <section id="menu" className="max-w-7xl mx-auto px-5 sm:px-8 py-6 lg:py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E7E5DE]">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#171916]">
                قائمة الأصناف والأسعار
              </h2>
              <p className="text-xs sm:text-sm text-[#676D62] mt-1">
                اضغط على أي صنف لعرض المكونات والتفاصيل
              </p>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-[#6B7166] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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

          {/* Simple Interactive Category Tabs */}
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
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className="group text-right bg-white border border-[#E7E5DE] rounded-2xl overflow-hidden flex flex-col hover:-translate-y-0.5 hover:border-[#BFCFBA] smooth-settle cursor-pointer focus-visible:outline-2 focus-visible:outline-[#15803D]"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-[#F3F2EC]">
                    <SafeImage
                      src={item.imageUrl || CATEGORY_DEFAULT_IMAGE[item.category]}
                      alt={item.name}
                      fallbackLabel={item.name}
                      className="w-full h-full object-cover group-hover:scale-[1.03] smooth-settle"
                    />
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-baseline justify-between gap-3 mb-1.5">
                        <h3 className="font-display text-lg font-bold text-[#171916] group-hover:text-[#15803D] transition-colors">
                          {item.name}
                        </h3>
                        <span className="font-mono-num text-lg font-extrabold text-[#14532D] whitespace-nowrap shrink-0">
                          {formatCurrency(item.price, settings.currency)}
                        </span>
                      </div>
                      <p className="text-xs text-[#676D62] mb-2">
                        {CATEGORY_LABELS[item.category]} · {item.size || 'حجم قياسي'}
                        {item.isFeatured ? ' · الأكثر طلباً' : ''}
                      </p>
                      <p className="text-sm text-[#52584D] leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Section 3: Compact Practical Visit & Contact Strip */}
        <section id="visit" className="max-w-7xl mx-auto px-5 sm:px-8 pt-10 pb-14">
          <div
            id="contact"
            className="bg-white border border-[#E7E5DE] rounded-2xl grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-[#EFECE4]"
          >
            <div className="p-6 flex items-start gap-3.5">
              <Clock className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-sm font-bold text-[#171916]">مواعيد العمل</p>
                <p className="text-xs sm:text-sm text-[#5C6158] mt-1">{settings.workingHours}</p>
              </div>
            </div>
            <div className="p-6 flex items-start gap-3.5">
              <MapPin className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-sm font-bold text-[#171916]">العنوان</p>
                <p className="text-xs sm:text-sm text-[#5C6158] mt-1">{settings.address}</p>
              </div>
            </div>
            <div className="p-6 flex items-start gap-3.5">
              <Phone className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-sm font-bold text-[#171916]">للاستفسار والتواصل</p>
                {settings.phone ? (
                  <a
                    href={`tel:${settings.phone.replace(/[^0-9+]/g, '')}`}
                    className="inline-block text-xs sm:text-sm text-[#14532D] hover:underline font-mono-num mt-1"
                    dir="ltr"
                  >
                    {settings.phone}
                  </a>
                ) : (
                  <p className="text-xs sm:text-sm text-[#5C6158] mt-1">—</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

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
            className="bg-white rounded-2xl border border-[#E5E3DC] max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-[4/3] bg-[#F3F2EC]">
              <SafeImage
                src={selectedItem.imageUrl || CATEGORY_DEFAULT_IMAGE[selectedItem.category]}
                alt={selectedItem.name}
                fallbackLabel={selectedItem.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label="إغلاق"
                className="absolute top-3 left-3 w-9 h-9 rounded-lg bg-white/95 text-[#171916] flex items-center justify-center border border-[#E5E3DC] hover:bg-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-2 text-xs text-[#676D62] mb-2">
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
                <p className="text-xs text-[#7A8075] mb-3" dir="ltr">
                  {selectedItem.nameEn}
                </p>
              )}
              <p className="text-sm text-[#4E544A] leading-relaxed mb-6">
                {selectedItem.description}
              </p>

              <div className="flex justify-end">
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
