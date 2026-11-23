import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, CheckCircle2, Printer } from 'lucide-react';
import {
  formatArabicMonth,
  formatCurrency,
  getLocalMonthKey,
  type DailyClosing,
  type Expense,
  type MonthlyClosing,
  type Order,
  type StoreSettings,
} from '../../types';
import { saveMonthlyClosing, UnauthorizedError } from '../../lib/api';

interface MonthlyClosingViewProps {
  orders: Order[];
  expenses: Expense[];
  dailyClosings: DailyClosing[];
  monthlyClosings: MonthlyClosing[];
  settings: StoreSettings;
  authToken: string;
  onDataChanged: () => Promise<void>;
  onUnauthorized: () => void;
}

export function MonthlyClosingView({
  orders,
  expenses,
  dailyClosings,
  monthlyClosings,
  settings,
  authToken,
  onDataChanged,
  onUnauthorized,
}: MonthlyClosingViewProps) {
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonthKey());
  const [fixedExpensesInput, setFixedExpensesInput] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const existingClosing = useMemo(
    () => monthlyClosings.find((m) => m.monthKey === selectedMonth) || null,
    [monthlyClosings, selectedMonth]
  );

  useEffect(() => {
    if (existingClosing) {
      setFixedExpensesInput(String(existingClosing.fixedExpenses));
      setNotes(existingClosing.notes || '');
    } else {
      setFixedExpensesInput('0');
      setNotes('');
    }
    setSavedMsg(null);
  }, [selectedMonth, existingClosing]);

  const monthOrders = useMemo(
    () => orders.filter((o) => o.monthKey === selectedMonth && o.status !== 'cancelled'),
    [orders, selectedMonth]
  );

  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.monthKey === selectedMonth),
    [expenses, selectedMonth]
  );

  const monthDailyClosings = useMemo(
    () => dailyClosings.filter((d) => d.monthKey === selectedMonth),
    [dailyClosings, selectedMonth]
  );

  const summary = useMemo(() => {
    const netSales = monthOrders.reduce((s, o) => s + o.total, 0);
    const cashSales = monthOrders
      .filter((o) => o.paymentMethod === 'cash')
      .reduce((s, o) => s + o.total, 0);
    const instapaySales = monthOrders
      .filter((o) => o.paymentMethod === 'instapay')
      .reduce((s, o) => s + o.total, 0);
    const cardSales = monthOrders
      .filter((o) => o.paymentMethod === 'card')
      .reduce((s, o) => s + o.total, 0);

    const loggedExpenses = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const fixedExpenses = Math.max(0, Number(fixedExpensesInput) || 0);
    const totalExpenses = loggedExpenses + fixedExpenses;
    const netProfit = netSales - totalExpenses;
    const profitMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

    // Top selling product this month
    const productCounts = new Map<string, { name: string; qty: number }>();
    for (const order of monthOrders) {
      for (const item of order.items) {
        const prev = productCounts.get(item.itemId) || { name: item.name, qty: 0 };
        prev.qty += item.quantity;
        productCounts.set(item.itemId, prev);
      }
    }
    let topProductName = 'لا يوجد';
    let topProductQty = 0;
    for (const entry of productCounts.values()) {
      if (entry.qty > topProductQty) {
        topProductQty = entry.qty;
        topProductName = entry.name;
      }
    }

    // Daily chart breakdown across active dates
    const byDay = new Map<string, { day: string; sales: number; expenses: number }>();
    for (const o of monthOrders) {
      const dayLabel = o.dateKey.slice(8);
      const curr = byDay.get(o.dateKey) || { day: dayLabel, sales: 0, expenses: 0 };
      curr.sales += o.total;
      byDay.set(o.dateKey, curr);
    }
    for (const e of monthExpenses) {
      const dayLabel = e.dateKey.slice(8);
      const curr = byDay.get(e.dateKey) || { day: dayLabel, sales: 0, expenses: 0 };
      curr.expenses += e.amount;
      byDay.set(e.dateKey, curr);
    }
    const chartData = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);

    return {
      ordersCount: monthOrders.length,
      daysClosedCount: monthDailyClosings.length,
      netSales,
      cashSales,
      instapaySales,
      cardSales,
      loggedExpenses,
      fixedExpenses,
      totalExpenses,
      netProfit,
      profitMargin,
      topProductName,
      topProductQty,
      chartData,
    };
  }, [monthOrders, monthExpenses, monthDailyClosings, fixedExpensesInput]);

  const handleSaveMonthlyClosing = async () => {
    if (saving) return;
    setSaving(true);
    setSavedMsg(null);
    setErrorMsg(null);

    try {
      await saveMonthlyClosing(authToken, selectedMonth, {
        daysClosedCount: Math.min(31, summary.daysClosedCount),
        ordersCount: summary.ordersCount,
        netSales: Number(summary.netSales.toFixed(2)),
        cashSales: Number(summary.cashSales.toFixed(2)),
        instapaySales: Number(summary.instapaySales.toFixed(2)),
        cardSales: Number(summary.cardSales.toFixed(2)),
        totalExpenses: Number(summary.totalExpenses.toFixed(2)),
        fixedExpenses: Number(summary.fixedExpenses.toFixed(2)),
        netProfit: Number(summary.netProfit.toFixed(2)),
        topProductName: summary.topProductName.slice(0, 120),
        topProductQty: summary.topProductQty,
        notes: notes.trim().slice(0, 500),
      });
      setSavedMsg(
        existingClosing
          ? `تم تحديث تقفيل شهر ${formatArabicMonth(selectedMonth)} بنجاح.`
          : `تم تقفيل واعتماد حساب شهر ${formatArabicMonth(selectedMonth)} بنجاح.`
      );
      await onDataChanged();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر حفظ تقفيل الشهر.');
    } finally {
      setSaving(false);
    }
  };

  const sortedArchive = useMemo(
    () => [...monthlyClosings].sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    [monthlyClosings]
  );

  return (
    <div className="space-y-8">
      {/* Header & Month Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E5E3DC]">
        <div>
          <h2 className="font-display text-xl font-bold text-[#171916]">
            تقفيل الحساب الشهري والأرباح
          </h2>
          <p className="text-xs text-[#676D62] mt-1">
            {formatArabicMonth(selectedMonth)}
            {existingClosing ? ' · شهر مقفّل ومعتمد' : ' · شهر مفتوح قيد التشغيل'}
          </p>
        </div>

        <div className="flex items-center gap-3 no-print">
          <div className="relative">
            <Calendar className="w-4 h-4 text-[#676D62] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="pr-9 pl-3 py-2 text-sm font-mono-num bg-white border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#DEDCD3] bg-white text-sm font-semibold text-[#171916] hover:bg-[#F4F3EE] cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة كشف الشهر</span>
          </button>
        </div>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Monthly KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-[#E5E3DC] rounded-2xl divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-[#EFECE4]">
        <div className="p-5">
          <p className="text-xs text-[#676D62]">إجمالي مبيعات الشهر</p>
          <p className="font-mono-num text-2xl font-bold text-[#14532D] mt-1.5">
            {formatCurrency(summary.netSales, settings.currency)}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 tabular-nums">
            {summary.ordersCount} أوردر مكتمل
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[#676D62]">إجمالي المصروفات</p>
          <p className="font-mono-num text-2xl font-bold text-amber-800 mt-1.5">
            {formatCurrency(summary.totalExpenses, settings.currency)}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 tabular-nums">
            يومية: {formatCurrency(summary.loggedExpenses, settings.currency)}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[#676D62]">صافي ربح الشهر</p>
          <p
            className={`font-mono-num text-2xl font-bold mt-1.5 ${
              summary.netProfit >= 0 ? 'text-[#15803D]' : 'text-red-700'
            }`}
          >
            {formatCurrency(summary.netProfit, settings.currency)}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 font-mono-num">
            هامش الربح: {summary.profitMargin.toFixed(1)}%
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[#676D62]">الأكثر طلباً بالشهر</p>
          <p className="font-display text-lg font-bold text-[#171916] mt-1.5 truncate">
            {summary.topProductName}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 tabular-nums">
            {summary.topProductQty} قطعة مباعة
          </p>
        </div>
      </div>

      {/* Chart & Monthly Closing Action */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-[#E5E3DC] rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display text-base font-bold text-[#171916]">
                حركة المبيعات والمصروفات خلال الشهر
              </h3>
              <p className="text-xs text-[#676D62] mt-0.5">
                مقارنة يومية بين المبيعات والمصروفات المسجلة
              </p>
            </div>
            <span className="text-xs text-[#676D62] tabular-nums">
              أيام مقفّلة: {summary.daysClosedCount}
            </span>
          </div>

          {summary.chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-[#7A8075] bg-[#FAFAF8] rounded-xl border border-dashed border-[#DEDCD3]">
              لا توجد بيانات مبيعات مسجلة في هذا الشهر بعد.
            </div>
          ) : (
            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFECE4" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#676D62' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#676D62' }} />
                  <Tooltip
                    formatter={(value, name) => [
                      formatCurrency(Number(value ?? 0), settings.currency),
                      name === 'sales' ? 'المبيعات' : 'المصروفات',
                    ]}
                  />
                  <Bar dataKey="sales" name="sales" fill="#15803D" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" name="expenses" fill="#D97706" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly Payment Mix */}
          <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-[#EFECE4] text-center">
            <div>
              <p className="text-xs text-[#676D62]">تحصيل كاش</p>
              <p className="font-mono-num text-sm font-bold text-[#171916] mt-1">
                {formatCurrency(summary.cashSales, settings.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#676D62]">تحصيل إنستاباي</p>
              <p className="font-mono-num text-sm font-bold text-[#171916] mt-1">
                {formatCurrency(summary.instapaySales, settings.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#676D62]">تحصيل فيزا</p>
              <p className="font-mono-num text-sm font-bold text-[#171916] mt-1">
                {formatCurrency(summary.cardSales, settings.currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Close Month Form */}
        <div className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#171916]">
              اعتماد وتقفيل حساب الشهر
            </h3>
            <p className="text-xs text-[#676D62] mt-1">
              أضف أي مصروفات شهرية ثابتة (إيجار، كهرباء، رواتب) غير مسجلة بالمصروفات اليومية.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#52584D] mb-1">
              مصروفات شهرية ثابتة إضافية ({settings.currency})
            </label>
            <input
              type="number"
              min={0}
              step="any"
              value={fixedExpensesInput}
              onChange={(e) => setFixedExpensesInput(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>

          <div className="p-4 rounded-xl bg-[#F5F4EE] space-y-2 text-xs">
            <div className="flex justify-between text-[#52584D]">
              <span>إجمالي المبيعات</span>
              <span className="font-mono-num font-semibold">
                {formatCurrency(summary.netSales, settings.currency)}
              </span>
            </div>
            <div className="flex justify-between text-[#52584D]">
              <span>- مصروفات يومية مسجلة</span>
              <span className="font-mono-num font-semibold">
                {formatCurrency(summary.loggedExpenses, settings.currency)}
              </span>
            </div>
            <div className="flex justify-between text-[#52584D]">
              <span>- مصروفات ثابتة إضافية</span>
              <span className="font-mono-num font-semibold">
                {formatCurrency(summary.fixedExpenses, settings.currency)}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-[#E3E0D6] text-sm font-bold text-[#14532D]">
              <span>صافي الربح النهائي للشهر</span>
              <span className="font-mono-num">
                {formatCurrency(summary.netProfit, settings.currency)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#52584D] mb-1">
              ملاحظات التقفيل الشهري
            </label>
            <textarea
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملخص أداء الشهر أو توزيع الأرباح..."
              className="w-full px-3.5 py-2 text-xs bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleSaveMonthlyClosing}
            className="w-full py-3.5 px-5 rounded-xl bg-[#15803D] text-white font-display text-sm font-bold hover:bg-[#166534] disabled:opacity-60 smooth-settle cursor-pointer no-print"
          >
            {saving
              ? 'جاري الحفظ...'
              : existingClosing
              ? 'تحديث تقفيل حساب الشهر'
              : 'تقفيل واعتماد حساب الشهر'}
          </button>
        </div>
      </div>

      {/* Monthly Closings Archive */}
      <div className="bg-white border border-[#E5E3DC] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EFECE4] flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-[#171916]">
            أرشيف الحسابات الشهرية المُقفّلة
          </h3>
          <span className="text-xs text-[#676D62] tabular-nums">{sortedArchive.length} شهر</span>
        </div>

        {sortedArchive.length === 0 ? (
          <p className="text-xs text-[#7A8075] py-10 text-center">
            لم يتم تقفيل أي شهر حتى الآن.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F6F1] text-xs text-[#676D62]">
                <tr>
                  <th className="text-right py-3 px-4 font-semibold">الشهر</th>
                  <th className="text-left py-3 px-4 font-semibold">الأوردرات</th>
                  <th className="text-left py-3 px-4 font-semibold">المبيعات</th>
                  <th className="text-left py-3 px-4 font-semibold">المصروفات</th>
                  <th className="text-left py-3 px-4 font-semibold">صافي الربح</th>
                  <th className="text-right py-3 px-4 font-semibold">المنتج الأول</th>
                  <th className="text-center py-3 px-4 font-semibold no-print">فتح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EFE9]">
                {sortedArchive.map((mc) => (
                  <tr key={mc.monthKey} className="hover:bg-[#FAF9F5]">
                    <td className="py-3 px-4 font-semibold text-[#171916]">
                      {formatArabicMonth(mc.monthKey)}
                    </td>
                    <td className="py-3 px-4 text-left font-mono-num">{mc.ordersCount}</td>
                    <td className="py-3 px-4 text-left font-mono-num font-semibold text-[#14532D]">
                      {formatCurrency(mc.netSales, settings.currency)}
                    </td>
                    <td className="py-3 px-4 text-left font-mono-num text-amber-800">
                      {formatCurrency(mc.totalExpenses, settings.currency)}
                    </td>
                    <td className="py-3 px-4 text-left font-mono-num font-bold text-[#171916]">
                      {formatCurrency(mc.netProfit, settings.currency)}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#4A5046]">
                      {mc.topProductName} ({mc.topProductQty})
                    </td>
                    <td className="py-3 px-4 text-center no-print">
                      <button
                        type="button"
                        onClick={() => setSelectedMonth(mc.monthKey)}
                        className="text-xs font-bold text-[#15803D] hover:underline cursor-pointer"
                      >
                        عرض
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
