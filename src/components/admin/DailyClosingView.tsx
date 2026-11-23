import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import {
  EXPENSE_CATEGORY_LABELS,
  formatArabicDate,
  formatCurrency,
  getLocalDateKey,
  PAYMENT_SOURCE_LABELS,
  type DailyClosing,
  type Expense,
  type ExpenseCategory,
  type Order,
  type PaymentSource,
  type StoreSettings,
} from '../../types';
import {
  createExpense,
  deleteExpense,
  saveDailyClosing,
  UnauthorizedError,
} from '../../lib/api';

interface DailyClosingViewProps {
  orders: Order[];
  expenses: Expense[];
  dailyClosings: DailyClosing[];
  settings: StoreSettings;
  authToken: string;
  onDataChanged: () => Promise<void>;
  onUnauthorized: () => void;
}

export function DailyClosingView({
  orders,
  expenses,
  dailyClosings,
  settings,
  authToken,
  onDataChanged,
  onUnauthorized,
}: DailyClosingViewProps) {
  const [selectedDate, setSelectedDate] = useState(getLocalDateKey());
  const [openingCashInput, setOpeningCashInput] = useState('0');
  const [actualCashInput, setActualCashInput] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [savingClosing, setSavingClosing] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Expense Form State
  const [expTitle, setExpTitle] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('fruits');
  const [expAmount, setExpAmount] = useState('');
  const [expSource, setExpSource] = useState<PaymentSource>('cash_drawer');
  const [expNotes, setExpNotes] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);

  const existingClosing = useMemo(
    () => dailyClosings.find((d) => d.dateKey === selectedDate) || null,
    [dailyClosings, selectedDate]
  );

  useEffect(() => {
    if (existingClosing) {
      setOpeningCashInput(String(existingClosing.openingCash));
      setActualCashInput(String(existingClosing.actualCash));
      setClosingNotes(existingClosing.notes || '');
    } else {
      setOpeningCashInput('0');
      setActualCashInput('');
      setClosingNotes('');
    }
    setSavedMessage(null);
  }, [selectedDate, existingClosing]);

  const dayOrders = useMemo(
    () => orders.filter((o) => o.dateKey === selectedDate),
    [orders, selectedDate]
  );

  const dayExpenses = useMemo(
    () => expenses.filter((e) => e.dateKey === selectedDate),
    [expenses, selectedDate]
  );

  const stats = useMemo(() => {
    const active = dayOrders.filter((o) => o.status !== 'cancelled');
    const cancelled = dayOrders.filter((o) => o.status === 'cancelled');

    const grossSales = active.reduce((s, o) => s + o.subtotal, 0);
    const totalDiscounts = active.reduce((s, o) => s + o.discount, 0);
    const netSales = active.reduce((s, o) => s + o.total, 0);

    const cashOrders = active.filter((o) => o.paymentMethod === 'cash');
    const instapayOrders = active.filter((o) => o.paymentMethod === 'instapay');
    const cardOrders = active.filter((o) => o.paymentMethod === 'card');

    const cashSales = cashOrders.reduce((s, o) => s + o.total, 0);
    const instapaySales = instapayOrders.reduce((s, o) => s + o.total, 0);
    const cardSales = cardOrders.reduce((s, o) => s + o.total, 0);

    const totalExpenses = dayExpenses.reduce((s, e) => s + e.amount, 0);
    const cashExpenses = dayExpenses
      .filter((e) => e.paymentSource === 'cash_drawer')
      .reduce((s, e) => s + e.amount, 0);

    const openingCash = Math.max(0, Number(openingCashInput) || 0);
    const expectedCash = openingCash + cashSales - cashExpenses;
    const actualCash =
      actualCashInput === '' ? expectedCash : Math.max(0, Number(actualCashInput) || 0);
    const cashVariance = actualCash - expectedCash;
    const netProfit = netSales - totalExpenses;

    return {
      ordersCount: active.length,
      cancelledCount: cancelled.length,
      cashCount: cashOrders.length,
      instapayCount: instapayOrders.length,
      cardCount: cardOrders.length,
      grossSales,
      totalDiscounts,
      netSales,
      cashSales,
      instapaySales,
      cardSales,
      totalExpenses,
      cashExpenses,
      openingCash,
      expectedCash,
      actualCash,
      cashVariance,
      netProfit,
    };
  }, [dayOrders, dayExpenses, openingCashInput, actualCashInput]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(expAmount);
    if (!expTitle.trim() || !Number.isFinite(amountNum) || amountNum <= 0 || addingExpense) {
      return;
    }

    setAddingExpense(true);
    setErrorMsg(null);
    const monthKey = selectedDate.slice(0, 7);

    try {
      await createExpense(authToken, {
        dateKey: selectedDate,
        monthKey,
        title: expTitle.trim().slice(0, 120),
        category: expCategory,
        amount: Number(amountNum.toFixed(2)),
        paymentSource: expSource,
        notes: expNotes.trim().slice(0, 300),
      });
      setExpTitle('');
      setExpAmount('');
      setExpNotes('');
      await onDataChanged();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر تسجيل المصروف.');
    } finally {
      setAddingExpense(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    setErrorMsg(null);
    try {
      await deleteExpense(authToken, expenseId);
      await onDataChanged();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر حذف المصروف.');
    }
  };

  const handleSaveDailyClosing = async () => {
    if (savingClosing) return;
    setSavingClosing(true);
    setSavedMessage(null);
    setErrorMsg(null);

    try {
      await saveDailyClosing(authToken, selectedDate, {
        ordersCount: stats.ordersCount,
        cancelledCount: stats.cancelledCount,
        grossSales: Number(stats.grossSales.toFixed(2)),
        totalDiscounts: Number(stats.totalDiscounts.toFixed(2)),
        netSales: Number(stats.netSales.toFixed(2)),
        cashSales: Number(stats.cashSales.toFixed(2)),
        instapaySales: Number(stats.instapaySales.toFixed(2)),
        cardSales: Number(stats.cardSales.toFixed(2)),
        totalExpenses: Number(stats.totalExpenses.toFixed(2)),
        cashExpenses: Number(stats.cashExpenses.toFixed(2)),
        openingCash: Number(stats.openingCash.toFixed(2)),
        expectedCash: Number(stats.expectedCash.toFixed(2)),
        actualCash: Number(stats.actualCash.toFixed(2)),
        cashVariance: Number(stats.cashVariance.toFixed(2)),
        netProfit: Number(stats.netProfit.toFixed(2)),
        notes: closingNotes.trim().slice(0, 400),
      });
      setSavedMessage(
        existingClosing
          ? `تم تحديث تقفيل حساب يوم ${selectedDate} بنجاح.`
          : `تم تقفيل وحفظ حساب يوم ${selectedDate} بنجاح.`
      );
      await onDataChanged();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر حفظ تقفيل اليوم.');
    } finally {
      setSavingClosing(false);
    }
  };

  const sortedClosings = useMemo(
    () => [...dailyClosings].sort((a, b) => b.dateKey.localeCompare(a.dateKey)),
    [dailyClosings]
  );

  return (
    <div className="space-y-8">
      {/* Header & Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E5E3DC]">
        <div>
          <h2 className="font-display text-xl font-bold text-[#171916]">
            تقفيل الحساب اليومي (Z-Report)
          </h2>
          <p className="text-xs text-[#676D62] mt-1">
            {formatArabicDate(selectedDate)}
            {existingClosing ? ' · تم تقفيل هذا اليوم مسبقاً (يمكنك التحديث)' : ' · يوم مفتوح لم يُقفّل بعد'}
          </p>
        </div>

        <div className="flex items-center gap-3 no-print">
          <div className="relative">
            <Calendar className="w-4 h-4 text-[#676D62] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pr-9 pl-3 py-2 text-sm font-mono-num bg-white border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#DEDCD3] bg-white text-sm font-semibold text-[#171916] hover:bg-[#F4F3EE] cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {savedMessage && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{savedMessage}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900 font-medium">
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 4-Column Financial Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-[#E5E3DC] rounded-2xl divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-[#EFECE4]">
        <div className="p-5">
          <p className="text-xs text-[#676D62]">صافي المبيعات</p>
          <p className="font-mono-num text-2xl font-bold text-[#14532D] mt-1.5">
            {formatCurrency(stats.netSales, settings.currency)}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 tabular-nums">
            خصومات: {formatCurrency(stats.totalDiscounts, settings.currency)}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[#676D62]">مصروفات اليوم</p>
          <p className="font-mono-num text-2xl font-bold text-amber-800 mt-1.5">
            {formatCurrency(stats.totalExpenses, settings.currency)}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 tabular-nums">
            من الدرج: {formatCurrency(stats.cashExpenses, settings.currency)}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[#676D62]">صافي ربح اليوم</p>
          <p
            className={`font-mono-num text-2xl font-bold mt-1.5 ${
              stats.netProfit >= 0 ? 'text-[#15803D]' : 'text-red-700'
            }`}
          >
            {formatCurrency(stats.netProfit, settings.currency)}
          </p>
          <p className="text-xs text-[#7A8075] mt-1">
            المبيعات مطروحاً منها المصروفات
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[#676D62]">عدد الأوردرات</p>
          <p className="font-mono-num text-2xl font-bold text-[#171916] mt-1.5">
            {stats.ordersCount}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 tabular-nums">
            ملغاة: {stats.cancelledCount}
          </p>
        </div>
      </div>

      {/* Main Grid: Payment Breakdown + Expenses vs Cash Drawer Reconciliation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Right Column: Payment Methods & Daily Expenses */}
        <div className="lg:col-span-7 space-y-6">
          {/* Payment Methods Table */}
          <div className="bg-white border border-[#E5E3DC] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EFECE4]">
              <h3 className="font-display text-base font-bold text-[#171916]">
                تفصيل التحصيل حسب طريقة الدفع
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#F7F6F1] text-xs text-[#676D62]">
                <tr>
                  <th className="text-right py-3 px-5 font-semibold">طريقة الدفع</th>
                  <th className="text-left py-3 px-5 font-semibold">عدد الأوردرات</th>
                  <th className="text-left py-3 px-5 font-semibold">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EFE9]">
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-[#171916]">كاش (نقدي)</td>
                  <td className="py-3.5 px-5 text-left font-mono-num">{stats.cashCount}</td>
                  <td className="py-3.5 px-5 text-left font-mono-num font-bold text-[#14532D]">
                    {formatCurrency(stats.cashSales, settings.currency)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-[#171916]">إنستاباي</td>
                  <td className="py-3.5 px-5 text-left font-mono-num">{stats.instapayCount}</td>
                  <td className="py-3.5 px-5 text-left font-mono-num font-bold text-[#14532D]">
                    {formatCurrency(stats.instapaySales, settings.currency)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3.5 px-5 font-semibold text-[#171916]">فيزا / كارت</td>
                  <td className="py-3.5 px-5 text-left font-mono-num">{stats.cardCount}</td>
                  <td className="py-3.5 px-5 text-left font-mono-num font-bold text-[#14532D]">
                    {formatCurrency(stats.cardSales, settings.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Daily Expenses Tracker */}
          <div className="bg-white border border-[#E5E3DC] rounded-2xl p-5 sm:p-6">
            <h3 className="font-display text-base font-bold text-[#171916] mb-1">
              مصروفات اليوم ({selectedDate})
            </h3>
            <p className="text-xs text-[#676D62] mb-4">
              سجل مشتريات الفاكهة اليومية، الأكواب، الثلج أو أي مصروفات لتُخصم تلقائياً من صافي اليوم والدرج.
            </p>

            <form onSubmit={handleAddExpense} className="grid grid-cols-1 sm:grid-cols-12 gap-3 pb-5 border-b border-[#EFECE4] no-print">
              <input
                type="text"
                required
                maxLength={120}
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                placeholder="بيان المصروف (مثال: شراء مانجو ورمان)"
                className="sm:col-span-5 px-3 py-2 text-xs bg-[#FAFAF8] border border-[#DEDCD3] rounded-lg focus:outline-none focus:border-[#15803D]"
              />
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                className="sm:col-span-3 px-3 py-2 text-xs bg-[#FAFAF8] border border-[#DEDCD3] rounded-lg focus:outline-none focus:border-[#15803D]"
              >
                {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {EXPENSE_CATEGORY_LABELS[k]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                required
                min={1}
                step="any"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder={`المبلغ (${settings.currency})`}
                className="sm:col-span-2 px-3 py-2 text-xs font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-lg focus:outline-none focus:border-[#15803D]"
              />
              <button
                type="submit"
                disabled={addingExpense}
                className="sm:col-span-2 py-2 px-3 rounded-lg bg-[#171916] text-white text-xs font-bold hover:bg-[#14532D] inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة</span>
              </button>

              <div className="sm:col-span-6">
                <select
                  value={expSource}
                  onChange={(e) => setExpSource(e.target.value as PaymentSource)}
                  className="w-full px-3 py-2 text-xs bg-[#FAFAF8] border border-[#DEDCD3] rounded-lg focus:outline-none focus:border-[#15803D]"
                >
                  {(Object.keys(PAYMENT_SOURCE_LABELS) as PaymentSource[]).map((s) => (
                    <option key={s} value={s}>
                      {PAYMENT_SOURCE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-6">
                <input
                  type="text"
                  maxLength={300}
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  placeholder="ملاحظة إضافية (اختياري)"
                  className="w-full px-3 py-2 text-xs bg-[#FAFAF8] border border-[#DEDCD3] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>
            </form>

            {dayExpenses.length === 0 ? (
              <p className="text-xs text-[#7A8075] py-6 text-center">
                لا توجد مصروفات مسجلة في هذا اليوم.
              </p>
            ) : (
              <div className="divide-y divide-[#F0EFE9] mt-2">
                {dayExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="py-3 flex items-center justify-between gap-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#171916]">{exp.title}</p>
                      <p className="text-xs text-[#676D62]">
                        {EXPENSE_CATEGORY_LABELS[exp.category]} · {PAYMENT_SOURCE_LABELS[exp.paymentSource]}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono-num font-bold text-amber-800">
                        {formatCurrency(exp.amount, settings.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteExpense(exp.id)}
                        aria-label="حذف المصروف"
                        className="text-[#8B9186] hover:text-red-700 cursor-pointer no-print"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Left Column: Cash Drawer Reconciliation & Save Z-Report */}
        <div className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-2xl p-5 sm:p-6 space-y-5">
          <div>
            <h3 className="font-display text-base font-bold text-[#171916]">
              جرد درج الكاشير وتقفيل اليوم
            </h3>
            <p className="text-xs text-[#676D62] mt-1">
              قارن النقدية المتوقعة بالدرج مع المبلغ الفعلي قبل اعتماد تقفيل اليوم.
            </p>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-semibold text-[#52584D] mb-1">
                رصيد أول اليوم (العهدة بالدرج)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={openingCashInput}
                onChange={(e) => setOpeningCashInput(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
              />
            </div>

            <div className="p-4 rounded-xl bg-[#F5F4EE] space-y-2 text-xs">
              <div className="flex justify-between text-[#52584D]">
                <span>+ مبيعات الكاش</span>
                <span className="font-mono-num font-semibold">
                  {formatCurrency(stats.cashSales, settings.currency)}
                </span>
              </div>
              <div className="flex justify-between text-[#52584D]">
                <span>- مصروفات من الدرج</span>
                <span className="font-mono-num font-semibold">
                  {formatCurrency(stats.cashExpenses, settings.currency)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#E3E0D6] text-sm font-bold text-[#171916]">
                <span>النقدية المتوقعة بالدرج</span>
                <span className="font-mono-num">
                  {formatCurrency(stats.expectedCash, settings.currency)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#52584D] mb-1">
                النقدية الفعلية بعد الجرد (اتركها فارغة للمطابقة التلقائية)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={actualCashInput}
                onChange={(e) => setActualCashInput(e.target.value)}
                placeholder={String(stats.expectedCash)}
                className="w-full px-3.5 py-2.5 text-sm font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
              />
            </div>

            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                stats.cashVariance === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : stats.cashVariance > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {stats.cashVariance === 0 ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {stats.cashVariance === 0
                    ? 'الدرج مطابق تماماً'
                    : stats.cashVariance > 0
                    ? 'يوجد زيادة بالدرج'
                    : 'يوجد عجز بالدرج'}
                </span>
              </div>
              <span className="font-mono-num font-bold">
                {stats.cashVariance > 0 ? '+' : ''}
                {formatCurrency(stats.cashVariance, settings.currency)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#52584D] mb-1">
                ملاحظات تقفيل اليوم
              </label>
              <textarea
                rows={2}
                maxLength={400}
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="أي ملاحظات حول الوردية أو الجرد..."
                className="w-full px-3.5 py-2 text-xs bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
              />
            </div>

            <button
              type="button"
              disabled={savingClosing}
              onClick={handleSaveDailyClosing}
              className="w-full py-3.5 px-5 rounded-xl bg-[#15803D] text-white font-display text-sm font-bold hover:bg-[#166534] disabled:opacity-60 smooth-settle cursor-pointer no-print"
            >
              {savingClosing
                ? 'جاري الحفظ...'
                : existingClosing
                ? 'تحديث تقفيل حساب اليوم'
                : 'تقفيل وحفظ حساب اليوم'}
            </button>
          </div>
        </div>
      </div>

      {/* Archive Table of Past Daily Closings */}
      <div className="bg-white border border-[#E5E3DC] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EFECE4] flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-[#171916]">
            سجل الأيام المُقفّلة
          </h3>
          <span className="text-xs text-[#676D62] tabular-nums">
            {sortedClosings.length} يوم
          </span>
        </div>

        {sortedClosings.length === 0 ? (
          <p className="text-xs text-[#7A8075] py-10 text-center">
            لم يتم تقفيل أي يوم بعد. اضغط «تقفيل وحفظ حساب اليوم» لحفظ أول تقرير يومي.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F6F1] text-xs text-[#676D62]">
                <tr>
                  <th className="text-right py-3 px-4 font-semibold">التاريخ</th>
                  <th className="text-left py-3 px-4 font-semibold">الأوردرات</th>
                  <th className="text-left py-3 px-4 font-semibold">المبيعات</th>
                  <th className="text-left py-3 px-4 font-semibold">المصروفات</th>
                  <th className="text-left py-3 px-4 font-semibold">صافي الربح</th>
                  <th className="text-left py-3 px-4 font-semibold">فرق الدرج</th>
                  <th className="text-center py-3 px-4 font-semibold no-print">عرض</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EFE9]">
                {sortedClosings.map((closing) => (
                  <tr
                    key={closing.dateKey}
                    className={`hover:bg-[#FAF9F5] ${
                      closing.dateKey === selectedDate ? 'bg-[#F3F6F0]' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono-num font-semibold text-[#171916]">
                      {closing.dateKey}
                    </td>
                    <td className="py-3 px-4 text-left font-mono-num">{closing.ordersCount}</td>
                    <td className="py-3 px-4 text-left font-mono-num font-semibold text-[#14532D]">
                      {formatCurrency(closing.netSales, settings.currency)}
                    </td>
                    <td className="py-3 px-4 text-left font-mono-num text-amber-800">
                      {formatCurrency(closing.totalExpenses, settings.currency)}
                    </td>
                    <td className="py-3 px-4 text-left font-mono-num font-bold text-[#171916]">
                      {formatCurrency(closing.netProfit, settings.currency)}
                    </td>
                    <td
                      className={`py-3 px-4 text-left font-mono-num font-semibold ${
                        closing.cashVariance === 0
                          ? 'text-[#15803D]'
                          : closing.cashVariance > 0
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }`}
                    >
                      {closing.cashVariance === 0
                        ? 'مطابق'
                        : `${closing.cashVariance > 0 ? '+' : ''}${formatCurrency(
                            closing.cashVariance,
                            settings.currency
                          )}`}
                    </td>
                    <td className="py-3 px-4 text-center no-print">
                      <button
                        type="button"
                        onClick={() => setSelectedDate(closing.dateKey)}
                        className="text-xs font-bold text-[#15803D] hover:underline cursor-pointer"
                      >
                        فتح
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
