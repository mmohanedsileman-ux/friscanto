import { useMemo, useState } from 'react';
import {
  Plus,
  Minus,
  Trash2,
  Printer,
  CheckCircle2,
  XCircle,
  Search,
  Receipt,
  Clock,
  X,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatCurrency,
  formatOrderTime,
  getLocalDateKey,
  getLocalMonthKey,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type MenuCategory,
  type MenuItem,
  type Order,
  type OrderItem,
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
  type StoreSettings,
} from '../../types';
import { resolveItemImage } from '../../data/defaultMenu';
import { createOrder, UnauthorizedError, updateOrderStatus } from '../../lib/api';
import { SafeImage } from '../SafeImage';

interface PosViewProps {
  menuItems: MenuItem[];
  orders: Order[];
  settings: StoreSettings;
  authToken: string;
  onDataChanged: () => Promise<void>;
  onUnauthorized: () => void;
}

interface CartLine {
  item: MenuItem;
  quantity: number;
}

export function PosView({
  menuItems,
  orders,
  settings,
  authToken,
  onDataChanged,
  onUnauthorized,
}: PosViewProps) {
  const [subView, setSubView] = useState<'new_order' | 'today_orders'>('new_order');
  const [categoryFilter, setCategoryFilter] = useState<'all' | MenuCategory>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('takeaway');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [customerName, setCustomerName] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');

  const todayKey = getLocalDateKey();

  const itemImageLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of menuItems) {
      map.set(m.id, m.imageUrl);
    }
    return map;
  }, [menuItems]);

  const availableMenu = useMemo(
    () =>
      menuItems
        .filter((i) => i.isAvailable)
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)),
    [menuItems]
  );

  const presentCategories = useMemo(() => {
    const set = new Set(availableMenu.map((m) => m.category));
    return CATEGORY_ORDER.filter((c) => set.has(c));
  }, [availableMenu]);

  const filteredMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    return availableMenu.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        CATEGORY_LABELS[item.category].toLowerCase().includes(q)
      );
    });
  }, [availableMenu, categoryFilter, search]);

  const todayOrders = useMemo(
    () => orders.filter((o) => o.dateKey === todayKey),
    [orders, todayKey]
  );

  const filteredTodayOrders = useMemo(() => {
    if (statusFilter === 'all') return todayOrders;
    return todayOrders.filter((o) => o.status === statusFilter);
  }, [todayOrders, statusFilter]);

  const todayActiveSales = useMemo(
    () =>
      todayOrders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.total, 0),
    [todayOrders]
  );

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0),
    [cart]
  );

  const rawDiscount = Math.max(0, Number(discountInput) || 0);
  const discount = Math.min(rawDiscount, subtotal);
  const total = Math.max(0, subtotal - discount);
  const totalItemCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart]
  );

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.item.id === item.id
            ? { ...l, quantity: Math.min(200, l.quantity + 1) }
            : l
        );
      }
      if (prev.length >= 30) return prev;
      return [...prev, { item, quantity: 1 }];
    });
  };

  const updateQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.item.id === itemId ? { ...l, quantity: l.quantity + delta } : l
        )
        .filter((l) => l.quantity > 0)
    );
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setDiscountInput('');
    setNotes('');
  };

  const handleSubmitOrder = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setFeedback(null);
    setErrorMsg(null);

    const now = new Date();
    const dateKey = getLocalDateKey(now);
    const monthKey = getLocalMonthKey(now);

    const orderItems: OrderItem[] = cart.slice(0, 30).map((line) => ({
      itemId: line.item.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128),
      name: line.item.name.slice(0, 100),
      category: line.item.category,
      unitPrice: Number(line.item.price),
      quantity: Math.min(200, Math.max(1, line.quantity)),
      lineTotal: Number((line.item.price * line.quantity).toFixed(2)),
    }));

    try {
      const { order } = await createOrder(authToken, {
        dateKey,
        monthKey,
        orderType,
        paymentMethod,
        items: orderItems,
        discount: Number(discount.toFixed(2)),
        customerName: customerName.trim().slice(0, 100),
        notes: notes.trim().slice(0, 300),
      });
      setReceiptOrder(order);
      clearCart();
      setFeedback(`تم تسجيل الأوردر ${order.orderNumber} بنجاح`);
      await onDataChanged();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر تسجيل الأوردر.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateOrderStatus = async (order: Order, nextStatus: OrderStatus) => {
    setErrorMsg(null);
    try {
      await updateOrderStatus(authToken, order.id, nextStatus);
      await onDataChanged();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر تحديث حالة الأوردر.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation & Live Today Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E3DC]">
        <div className="flex items-center gap-1 p-1 bg-[#EFECE4] rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setSubView('new_order')}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap smooth-settle cursor-pointer ${
              subView === 'new_order'
                ? 'bg-white text-[#14532D]'
                : 'text-[#52584D] hover:text-[#171916]'
            }`}
          >
            تسجيل أوردر جديد
          </button>
          <button
            type="button"
            onClick={() => setSubView('today_orders')}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap smooth-settle cursor-pointer ${
              subView === 'today_orders'
                ? 'bg-white text-[#14532D]'
                : 'text-[#52584D] hover:text-[#171916]'
            }`}
          >
            أوردرات اليوم ({todayOrders.length})
          </button>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-[#676D62] ml-2">مبيعات اليوم:</span>
            <span className="font-mono-num font-bold text-[#14532D]">
              {formatCurrency(todayActiveSales, settings.currency)}
            </span>
          </div>
          <div className="hidden sm:block text-[#DEDCD3]">|</div>
          <div>
            <span className="text-[#676D62] ml-2">أوردرات اليوم:</span>
            <span className="font-mono-num font-bold text-[#171916]">
              {todayOrders.filter((o) => o.status !== 'cancelled').length}
            </span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900">
          <span className="font-medium">{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-700 hover:text-red-950 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {subView === 'new_order' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Product Picker Grid */}
          <div className="xl:col-span-7 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#6B7166] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث سريع في الأصناف..."
                  className="w-full pr-10 pl-4 py-2.5 text-sm bg-white border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                />
              </div>
              {presentCategories.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('all')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
                      categoryFilter === 'all'
                        ? 'bg-[#15803D] text-white'
                        : 'bg-white border border-[#E5E3DC] text-[#52584D] hover:text-[#171916]'
                    }`}
                  >
                    الكل
                  </button>
                  {presentCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
                        categoryFilter === cat
                          ? 'bg-[#15803D] text-white'
                          : 'bg-white border border-[#E5E3DC] text-[#52584D] hover:text-[#171916]'
                      }`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMenu.map((item) => {
                const inCart = cart.find((c) => c.item.id === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addToCart(item)}
                    className={`text-right bg-white rounded-xl overflow-hidden border smooth-settle flex flex-col cursor-pointer hover:-translate-y-0.5 ${
                      inCart
                        ? 'border-[#15803D] ring-1 ring-[#15803D]/20'
                        : 'border-[#E5E3DC] hover:border-[#C2CCBC]'
                    }`}
                  >
                    <div className="relative aspect-[4/3] w-full bg-[#F3F2EC]">
                      <SafeImage
                        src={resolveItemImage(item.id, item.name, item.category, item.imageUrl)}
                        alt={item.name}
                        fallbackLabel={item.name}
                        className="w-full h-full object-cover"
                      />
                      {inCart && (
                        <span className="absolute top-2.5 left-2.5 min-w-7 h-7 px-2 rounded-lg bg-[#15803D] text-white font-mono-num text-xs font-bold flex items-center justify-center">
                          ×{inCart.quantity}
                        </span>
                      )}
                    </div>
                    <div className="p-3.5 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="font-display text-sm font-bold text-[#171916] leading-snug">
                          {item.name}
                        </p>
                        <p className="text-xs text-[#676D62] mt-0.5">{item.size}</p>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-[#F2F1EC] flex items-center justify-between">
                        <span className="font-mono-num text-sm font-bold text-[#14532D]">
                          {formatCurrency(item.price, settings.currency)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D]">
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة</span>
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Cashier Order Panel */}
          <div className="xl:col-span-5 bg-white border border-[#E5E3DC] rounded-2xl p-5 sm:p-6 sticky top-20">
            <div className="flex items-center justify-between pb-4 border-b border-[#EFECE4]">
              <div>
                <h3 className="font-display text-lg font-bold text-[#171916]">
                  فاتورة الأوردر الحالي
                </h3>
                <p className="text-xs text-[#676D62] mt-0.5 tabular-nums">
                  {totalItemCount} قطعة · {cart.length} أصناف
                </p>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs font-semibold text-red-700 hover:text-red-900 cursor-pointer"
                >
                  تفريغ السلة
                </button>
              )}
            </div>

            {/* Cart Items With Crisp Product Images Next to Each Item */}
            <div className="py-4 max-h-[320px] overflow-y-auto divide-y divide-[#F2F1EC]">
              {cart.length === 0 ? (
                <div className="py-10 text-center">
                  <Receipt className="w-8 h-8 text-[#B5B9AF] mx-auto mb-2" />
                  <p className="text-sm font-semibold text-[#4A5046]">
                    اختر الأصناف من القائمة لبدء أوردر جديد
                  </p>
                  <p className="text-xs text-[#7A8075] mt-1">
                    اضغط على أي صنف لإضافته فوراً للفاتورة
                  </p>
                </div>
              ) : (
                cart.map((line) => (
                  <div
                    key={line.item.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#F3F2EC] border border-[#E7E5DE] shrink-0">
                        <SafeImage
                          src={resolveItemImage(
                            line.item.id,
                            line.item.name,
                            line.item.category,
                            line.item.imageUrl
                          )}
                          alt={line.item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#171916] truncate">
                          {line.item.name}
                        </p>
                        <p className="text-xs text-[#676D62] font-mono-num">
                          {formatCurrency(line.item.price, settings.currency)} × {line.quantity}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center border border-[#DEDCD3] rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateQty(line.item.id, 1)}
                          aria-label="زيادة الكمية"
                          className="w-7 h-7 flex items-center justify-center hover:bg-[#F3F2EC] cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-7 text-center text-xs font-mono-num font-bold">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(line.item.id, -1)}
                          aria-label="إنقاص الكمية"
                          className="w-7 h-7 flex items-center justify-center hover:bg-[#F3F2EC] cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="font-mono-num text-sm font-bold text-[#14532D] min-w-[66px] text-left">
                        {formatCurrency(line.item.price * line.quantity, settings.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(line.item.id, -line.quantity)}
                        aria-label="حذف الصنف"
                        className="text-[#8B9186] hover:text-red-700 cursor-pointer p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Order Metadata Controls */}
            <div className="pt-4 border-t border-[#EFECE4] space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#52584D] mb-1.5">
                  نوع الطلب
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['takeaway', 'dine_in', 'delivery'] as OrderType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOrderType(type)}
                      className={`py-2 px-2 rounded-lg text-xs font-bold border smooth-settle cursor-pointer ${
                        orderType === type
                          ? 'bg-[#171916] text-white border-[#171916]'
                          : 'bg-[#FAFAF8] text-[#4A5046] border-[#DEDCD3] hover:border-[#B8BDB2]'
                      }`}
                    >
                      {ORDER_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#52584D] mb-1.5">
                  طريقة الدفع
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'instapay', 'card'] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2 px-2 rounded-lg text-xs font-bold border smooth-settle cursor-pointer ${
                        paymentMethod === method
                          ? 'bg-[#15803D] text-white border-[#15803D]'
                          : 'bg-[#FAFAF8] text-[#4A5046] border-[#DEDCD3] hover:border-[#B8BDB2]'
                      }`}
                    >
                      {PAYMENT_METHOD_LABELS[method]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1">
                    اسم العميل (اختياري)
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="عميل كاشير"
                    className="w-full px-3 py-2 text-xs bg-[#FAFAF8] border border-[#DEDCD3] rounded-lg focus:outline-none focus:border-[#15803D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1">
                    خصم ({settings.currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={subtotal}
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-xs font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-lg focus:outline-none focus:border-[#15803D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#52584D] mb-1">
                  ملاحظات (اختياري)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: بدون كريمة، زيادة رمان..."
                  className="w-full px-3 py-2 text-xs bg-[#FAFAF8] border border-[#DEDCD3] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>

              {/* Totals Breakdown */}
              <div className="p-4 rounded-xl bg-[#F5F4EE] space-y-2 text-sm">
                <div className="flex justify-between text-[#52584D]">
                  <span>المجموع الفرعي</span>
                  <span className="font-mono-num">{formatCurrency(subtotal, settings.currency)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-amber-800">
                    <span>الخصم</span>
                    <span className="font-mono-num">-{formatCurrency(discount, settings.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-[#E3E0D6] font-display text-base font-extrabold text-[#14532D]">
                  <span>الإجمالي المستحق</span>
                  <span className="font-mono-num">{formatCurrency(total, settings.currency)}</span>
                </div>
              </div>

              <button
                type="button"
                disabled={cart.length === 0 || submitting}
                onClick={handleSubmitOrder}
                className="w-full py-3.5 px-5 rounded-xl bg-[#15803D] text-white font-display text-base font-bold hover:bg-[#166534] disabled:opacity-50 smooth-settle cursor-pointer"
              >
                {submitting
                  ? 'جاري تسجيل الأوردر...'
                  : `تأكيد وتسجيل الأوردر · ${formatCurrency(total, settings.currency)}`}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Today's Orders List With Product Photos Alongside Every Order */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {(['all', 'completed', 'preparing', 'cancelled'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    statusFilter === st
                      ? 'bg-[#171916] text-white'
                      : 'bg-white border border-[#E5E3DC] text-[#52584D] hover:text-[#171916]'
                  }`}
                >
                  {st === 'all' ? 'الكل' : ORDER_STATUS_LABELS[st]}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#676D62] tabular-nums">
              عرض {filteredTodayOrders.length} من أصل {todayOrders.length} أوردر اليوم
            </p>
          </div>

          {filteredTodayOrders.length === 0 ? (
            <div className="bg-white border border-[#E5E3DC] rounded-2xl py-16 text-center">
              <p className="font-display font-bold text-[#171916] mb-1">
                لا توجد أوردرات مسجلة اليوم بعد
              </p>
              <p className="text-xs text-[#676D62] mb-5">
                ابدأ بتسجيل أول أوردر من شاشة الكاشير ليظهر هنا فوراً.
              </p>
              <button
                type="button"
                onClick={() => setSubView('new_order')}
                className="px-4 py-2 rounded-lg bg-[#15803D] text-white text-xs font-bold hover:bg-[#166534] cursor-pointer"
              >
                تسجيل أول أوردر
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredTodayOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white border border-[#E5E3DC] rounded-2xl p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#F0EFE9]">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num text-sm font-bold text-[#171916]">
                            {order.orderNumber}
                          </span>
                          <span className="text-xs text-[#676D62]">·</span>
                          <span className="text-xs text-[#52584D]">
                            {ORDER_TYPE_LABELS[order.orderType]}
                          </span>
                          <span className="text-xs text-[#676D62]">·</span>
                          <span className="text-xs text-[#52584D]">
                            {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#7A8075] mt-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatOrderTime(order.createdAt, order.createdAtIso)}</span>
                          {order.customerName && (
                            <>
                              <span>·</span>
                              <span>{order.customerName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-left">
                        <p className="font-mono-num text-base font-bold text-[#14532D]">
                          {formatCurrency(order.total, settings.currency)}
                        </p>
                        <p
                          className={`text-xs font-bold mt-0.5 ${
                            order.status === 'completed'
                              ? 'text-[#15803D]'
                              : order.status === 'cancelled'
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {ORDER_STATUS_LABELS[order.status]}
                        </p>
                      </div>
                    </div>

                    {/* Itemized Order Rows With Each Product Image Clearly Displayed */}
                    <div className="mt-3 space-y-2.5">
                      {order.items.map((item, idx) => (
                        <div
                          key={`${order.id}_${idx}`}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#F3F2EC] border border-[#E7E5DE] shrink-0">
                              <SafeImage
                                src={resolveItemImage(
                                  item.itemId,
                                  item.name,
                                  item.category,
                                  itemImageLookup.get(item.itemId)
                                )}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#171916] truncate">
                                {item.name}
                              </p>
                              <p className="text-xs text-[#676D62] font-mono-num">
                                الكمية: {item.quantity} × {formatCurrency(item.unitPrice, settings.currency)}
                              </p>
                            </div>
                          </div>
                          <span className="font-mono-num text-xs font-bold text-[#171916] shrink-0">
                            {formatCurrency(item.lineTotal, settings.currency)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {order.notes && (
                      <p className="mt-3 text-xs text-[#5C6158] bg-[#F7F6F1] px-3 py-2 rounded-lg">
                        ملاحظة: {order.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[#F0EFE9] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptOrder(order)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#171916] hover:text-[#15803D] cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>عرض / طباعة الإيصال</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {order.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => void handleUpdateOrderStatus(order, 'completed')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>اكتمال</span>
                        </button>
                      )}
                      {order.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => void handleUpdateOrderStatus(order, 'cancelled')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>إلغاء</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Printable Order Receipt Modal */}
      {receiptOrder && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
          onClick={() => setReceiptOrder(null)}
        >
          <div
            className="bg-white rounded-2xl border border-[#E5E3DC] max-w-md w-full p-6 print-only-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center pb-4 border-b border-dashed border-[#D6D3C9]">
              <h3 className="font-display text-xl font-extrabold text-[#14532D]">
                {settings.storeName || 'فريستكانتو'}
              </h3>
              <p className="text-xs text-[#676D62] mt-0.5">طازة · فريش · منعش</p>
              <p className="font-mono-num text-sm font-bold text-[#171916] mt-2">
                إيصال رقم: {receiptOrder.orderNumber}
              </p>
              <p className="text-xs text-[#676D62] mt-0.5">
                {receiptOrder.dateKey} · {ORDER_TYPE_LABELS[receiptOrder.orderType]} ·{' '}
                {PAYMENT_METHOD_LABELS[receiptOrder.paymentMethod]}
              </p>
            </div>

            <div className="py-4 space-y-2.5 border-b border-dashed border-[#D6D3C9]">
              {receiptOrder.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-md overflow-hidden bg-[#F3F2EC] shrink-0 no-print">
                      <SafeImage
                        src={resolveItemImage(
                          item.itemId,
                          item.name,
                          item.category,
                          itemImageLookup.get(item.itemId)
                        )}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="truncate font-medium text-[#171916]">
                      {item.name} × {item.quantity}
                    </span>
                  </div>
                  <span className="font-mono-num font-bold text-[#171916] shrink-0">
                    {formatCurrency(item.lineTotal, settings.currency)}
                  </span>
                </div>
              ))}
            </div>

            <div className="py-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-[#52584D]">
                <span>المجموع الفرعي</span>
                <span className="font-mono-num">
                  {formatCurrency(receiptOrder.subtotal, settings.currency)}
                </span>
              </div>
              {receiptOrder.discount > 0 && (
                <div className="flex justify-between text-amber-800">
                  <span>خصم</span>
                  <span className="font-mono-num">
                    -{formatCurrency(receiptOrder.discount, settings.currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-[#EFECE4] font-display text-base font-extrabold text-[#14532D]">
                <span>الإجمالي المدفوع</span>
                <span className="font-mono-num">
                  {formatCurrency(receiptOrder.total, settings.currency)}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الإيصال</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="py-2.5 px-4 rounded-xl border border-[#DEDCD3] text-sm font-semibold text-[#171916] hover:bg-[#F4F3EE] cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
