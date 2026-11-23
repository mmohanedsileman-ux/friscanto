import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CATEGORY_LABELS,
  formatCurrency,
  getLocalDateKey,
  getLocalMonthKey,
  ORDER_TYPE_LABELS,
  type MenuCategory,
  type MenuItem,
  type Order,
  type OrderType,
  type StoreSettings,
} from '../../types';
import { resolveItemImage } from '../../data/defaultMenu';
import { SafeImage } from '../SafeImage';

interface AnalyticsViewProps {
  orders: Order[];
  menuItems: MenuItem[];
  settings: StoreSettings;
}

type PeriodKey = 'today' | 'week' | 'month' | 'all';

interface ProductStat {
  itemId: string;
  name: string;
  category: MenuCategory;
  quantity: number;
  revenue: number;
  ordersAppeared: number;
  imageUrl: string;
}

export function AnalyticsView({ orders, menuItems, settings }: AnalyticsViewProps) {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [sortBy, setSortBy] = useState<'quantity' | 'revenue'>('quantity');

  const itemImageLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of menuItems) {
      map.set(m.id, m.imageUrl);
    }
    return map;
  }, [menuItems]);

  const filteredOrders = useMemo(() => {
    const valid = orders.filter((o) => o.status !== 'cancelled');
    const todayKey = getLocalDateKey();
    const monthKey = getLocalMonthKey();

    if (period === 'today') {
      return valid.filter((o) => o.dateKey === todayKey);
    }
    if (period === 'month') {
      return valid.filter((o) => o.monthKey === monthKey);
    }
    if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 6);
      const minKey = getLocalDateKey(weekAgo);
      return valid.filter((o) => o.dateKey >= minKey);
    }
    return valid;
  }, [orders, period]);

  const analytics = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((s, o) => s + o.total, 0);
    const totalOrders = filteredOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const productMap = new Map<string, ProductStat>();
    const categoryMap = new Map<MenuCategory, { qty: number; revenue: number }>();
    const orderTypeMap: Record<OrderType, { count: number; revenue: number }> = {
      takeaway: { count: 0, revenue: 0 },
      dine_in: { count: 0, revenue: 0 },
      delivery: { count: 0, revenue: 0 },
    };

    let totalUnits = 0;

    for (const order of filteredOrders) {
      orderTypeMap[order.orderType].count += 1;
      orderTypeMap[order.orderType].revenue += order.total;

      const seenInOrder = new Set<string>();
      for (const item of order.items) {
        totalUnits += item.quantity;
        const existing = productMap.get(item.itemId) || {
          itemId: item.itemId,
          name: item.name,
          category: item.category,
          quantity: 0,
          revenue: 0,
          ordersAppeared: 0,
          imageUrl: resolveItemImage(
            item.itemId,
            item.name,
            item.category,
            itemImageLookup.get(item.itemId)
          ),
        };
        existing.quantity += item.quantity;
        existing.revenue += item.lineTotal;
        if (!seenInOrder.has(item.itemId)) {
          existing.ordersAppeared += 1;
          seenInOrder.add(item.itemId);
        }
        productMap.set(item.itemId, existing);

        const cat = categoryMap.get(item.category) || { qty: 0, revenue: 0 };
        cat.qty += item.quantity;
        cat.revenue += item.lineTotal;
        categoryMap.set(item.category, cat);
      }
    }

    const products = Array.from(productMap.values()).sort((a, b) =>
      sortBy === 'quantity' ? b.quantity - a.quantity : b.revenue - a.revenue
    );

    const categories = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        label: CATEGORY_LABELS[category],
        ...data,
        share: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      totalUnits,
      products,
      categories,
      orderTypeMap,
      topProduct: products[0] || null,
      topCategory: categories[0] || null,
    };
  }, [filteredOrders, sortBy, itemImageLookup]);

  const chartData = useMemo(
    () =>
      analytics.products.slice(0, 8).map((p) => ({
        name: p.name.length > 18 ? `${p.name.slice(0, 18)}…` : p.name,
        value: sortBy === 'quantity' ? p.quantity : p.revenue,
      })),
    [analytics.products, sortBy]
  );

  return (
    <div className="space-y-8">
      {/* Header & Period Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E5E3DC]">
        <div>
          <h2 className="font-display text-xl font-bold text-[#171916]">
            الأصناف الأكثر طلباً وتحليل المبيعات
          </h2>
          <p className="text-xs text-[#676D62] mt-1">
            تعرف على الأصناف الأعلى مبيعاً وترتيب الأقسام وقنوات الطلب
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EFECE4] rounded-xl w-fit">
          {(
            [
              ['today', 'اليوم'],
              ['week', 'آخر 7 أيام'],
              ['month', 'هذا الشهر'],
              ['all', 'الكل'],
            ] as [PeriodKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap smooth-settle cursor-pointer ${
                period === key
                  ? 'bg-white text-[#14532D]'
                  : 'text-[#52584D] hover:text-[#171916]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-[#E5E3DC] rounded-2xl divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-[#EFECE4]">
        <div className="p-5">
          <p className="text-xs text-[#676D62]">المنتج رقم 1 طلباً</p>
          <p className="font-display text-lg font-bold text-[#14532D] mt-1.5 truncate">
            {analytics.topProduct ? analytics.topProduct.name : 'لا توجد بيانات'}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 tabular-nums">
            {analytics.topProduct
              ? `${analytics.topProduct.quantity} قطعة · ${formatCurrency(
                  analytics.topProduct.revenue,
                  settings.currency
                )}`
              : 'سجّل أوردرات للتحليل'}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-[#676D62]">القسم الأعلى مبيعاً</p>
          <p className="font-display text-lg font-bold text-[#171916] mt-1.5 truncate">
            {analytics.topCategory ? analytics.topCategory.label : '—'}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 font-mono-num">
            {analytics.topCategory ? `${analytics.topCategory.share.toFixed(0)}% من المبيعات` : '—'}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-[#676D62]">متوسط قيمة الأوردر</p>
          <p className="font-mono-num text-2xl font-bold text-[#171916] mt-1.5">
            {formatCurrency(analytics.avgOrderValue, settings.currency)}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 tabular-nums">
            من {analytics.totalOrders} أوردر
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-[#676D62]">إجمالي القطع المباعة</p>
          <p className="font-mono-num text-2xl font-bold text-[#15803D] mt-1.5">
            {analytics.totalUnits}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 font-mono-num">
            {formatCurrency(analytics.totalRevenue, settings.currency)}
          </p>
        </div>
      </div>

      {/* Chart + Category & Channel Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-[#E5E3DC] rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="font-display text-base font-bold text-[#171916]">
                مخطط الأصناف الأكثر طلباً
              </h3>
              <p className="text-xs text-[#676D62] mt-0.5">
                مقارنة الأداء بين أصناف فريستكانتو
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-[#F3F2EC] rounded-lg">
              <button
                type="button"
                onClick={() => setSortBy('quantity')}
                className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer ${
                  sortBy === 'quantity' ? 'bg-white text-[#14532D]' : 'text-[#52584D]'
                }`}
              >
                بالكمية
              </button>
              <button
                type="button"
                onClick={() => setSortBy('revenue')}
                className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer ${
                  sortBy === 'revenue' ? 'bg-white text-[#14532D]' : 'text-[#52584D]'
                }`}
              >
                بالإيراد
              </button>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-[#7A8075] bg-[#FAFAF8] rounded-xl border border-dashed border-[#DEDCD3]">
              لا توجد مبيعات في هذه الفترة بعد.
            </div>
          ) : (
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 20, left: 24, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFECE4" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#676D62' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 12, fill: '#171916' }}
                  />
                  <Tooltip
                    formatter={(value) => [
                      sortBy === 'quantity'
                        ? `${Number(value ?? 0)} قطعة`
                        : formatCurrency(Number(value ?? 0), settings.currency),
                      sortBy === 'quantity' ? 'الكمية المباعة' : 'إجمالي الإيراد',
                    ]}
                  />
                  <Bar dataKey="value" fill="#15803D" radius={[0, 6, 6, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Category & Order Type Split */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-[#E5E3DC] rounded-2xl p-5 sm:p-6">
            <h3 className="font-display text-base font-bold text-[#171916] mb-4">
              أداء الأقسام
            </h3>
            {analytics.categories.length === 0 ? (
              <p className="text-xs text-[#7A8075] py-4 text-center">لا توجد بيانات بعد.</p>
            ) : (
              <div className="space-y-4">
                {analytics.categories.map((cat) => (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-[#171916]">{cat.label}</span>
                      <span className="font-mono-num text-[#52584D]">
                        {formatCurrency(cat.revenue, settings.currency)} · {cat.share.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#EFECE4] overflow-hidden">
                      <div
                        className="h-full bg-[#15803D] rounded-full"
                        style={{ width: `${Math.max(4, cat.share)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-[#E5E3DC] rounded-2xl p-5 sm:p-6">
            <h3 className="font-display text-base font-bold text-[#171916] mb-4">
              توزيع قنوات الطلب
            </h3>
            <div className="divide-y divide-[#F0EFE9]">
              {(['takeaway', 'dine_in', 'delivery'] as OrderType[]).map((type) => {
                const entry = analytics.orderTypeMap[type];
                return (
                  <div
                    key={type}
                    className="py-3 flex items-center justify-between text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#171916]">{ORDER_TYPE_LABELS[type]}</p>
                      <p className="text-xs text-[#676D62] tabular-nums">{entry.count} أوردر</p>
                    </div>
                    <span className="font-mono-num font-bold text-[#14532D]">
                      {formatCurrency(entry.revenue, settings.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Ranked Leaderboard With Product Photos */}
      <div className="bg-white border border-[#E5E3DC] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EFECE4] flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-[#171916]">
            جدول ترتيب الأصناف المباعة
          </h3>
          <span className="text-xs text-[#676D62] tabular-nums">
            {analytics.products.length} صنف
          </span>
        </div>

        {analytics.products.length === 0 ? (
          <p className="text-xs text-[#7A8075] py-12 text-center">
            سجّل أوردرات من شاشة نقطة البيع ليظهر ترتيب الأصناف الأكثر طلباً هنا تلقائياً.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F6F1] text-xs text-[#676D62]">
                <tr>
                  <th className="text-right py-3 px-4 font-semibold">#</th>
                  <th className="text-right py-3 px-4 font-semibold">الصنف</th>
                  <th className="text-right py-3 px-4 font-semibold">القسم</th>
                  <th className="text-left py-3 px-4 font-semibold">الكمية المباعة</th>
                  <th className="text-left py-3 px-4 font-semibold">عدد الأوردرات</th>
                  <th className="text-left py-3 px-4 font-semibold">إجمالي الإيراد</th>
                  <th className="text-left py-3 px-4 font-semibold">نسبة المبيعات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EFE9]">
                {analytics.products.map((prod, idx) => {
                  const pct =
                    analytics.totalRevenue > 0
                      ? (prod.revenue / analytics.totalRevenue) * 100
                      : 0;
                  return (
                    <tr key={prod.itemId} className="hover:bg-[#FAF9F5]">
                      <td className="py-3 px-4 font-mono-num font-bold text-[#676D62]">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#F3F2EC] border border-[#E7E5DE] shrink-0">
                            <SafeImage
                              src={prod.imageUrl}
                              alt={prod.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="font-bold text-[#171916]">{prod.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#5C6158]">
                        {CATEGORY_LABELS[prod.category]}
                      </td>
                      <td className="py-3 px-4 text-left font-mono-num font-bold text-[#171916]">
                        {prod.quantity}
                      </td>
                      <td className="py-3 px-4 text-left font-mono-num text-[#52584D]">
                        {prod.ordersAppeared}
                      </td>
                      <td className="py-3 px-4 text-left font-mono-num font-bold text-[#14532D]">
                        {formatCurrency(prod.revenue, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-left font-mono-num text-xs text-[#52584D]">
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
