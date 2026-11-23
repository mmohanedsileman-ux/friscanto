import { useMemo, useState } from 'react';
import {
  Download,
  Printer,
  Plus,
  Search,
  Trash2,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Building2,
  CreditCard,
} from 'lucide-react';
import {
  EXPENSE_CATEGORY_LABELS,
  formatCurrency,
  getLocalDateKey,
  getLocalMonthKey,
  PAYMENT_METHOD_LABELS,
  PAYMENT_SOURCE_LABELS,
  type Expense,
  type ExpenseCategory,
  type Order,
  type PaymentSource,
  type StoreSettings,
} from '../../types';
import { createExpense, deleteExpense, UnauthorizedError } from '../../lib/api';

interface AccountingViewProps {
  orders: Order[];
  expenses: Expense[];
  settings: StoreSettings;
  authToken: string;
  onDataChanged: () => Promise<void>;
  onUnauthorized: () => void;
}

type RangePreset = 'today' | 'month' | 'last30' | 'all' | 'custom';
type MovementFilter = 'all' | 'income' | 'expense';

interface LedgerRow {
  id: string;
  dateKey: string;
  timestampMs: number;
  type: 'income' | 'expense';
  reference: string;
  title: string;
  categoryLabel: string;
  channelLabel: string;
  credit: number;
  debit: number;
  notes: string;
  rawExpenseId?: string;
}

export function AccountingView({
  orders,
  expenses,
  settings,
  authToken,
  onDataChanged,
  onUnauthorized,
}: AccountingViewProps) {
  const todayKey = getLocalDateKey();
  const currentMonthKey = getLocalMonthKey();

  const [preset, setPreset] = useState<RangePreset>('month');
  const [fromDate, setFromDate] = useState(`${currentMonthKey}-01`);
  const [toDate, setToDate] = useState(todayKey);
  const [movementFilter, setMovementFilter] = useState<MovementFilter>('all');
  const [search, setSearch] = useState('');

  // Quick Add Expense Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [expDate, setExpDate] = useState(todayKey);
  const [expTitle, setExpTitle] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('fruits');
  const [expAmount, setExpAmount] = useState('');
  const [expSource, setExpSource] = useState<PaymentSource>('cash_drawer');
  const [expNotes, setExpNotes] = useState('');
  const [savingExp, setSavingExp] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeDateRange = useMemo(() => {
    if (preset === 'today') return { start: todayKey, end: todayKey };
    if (preset === 'month') return { start: `${currentMonthKey}-01`, end: `${currentMonthKey}-31` };
    if (preset === 'last30') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return { start: getLocalDateKey(d), end: todayKey };
    }
    if (preset === 'custom') {
      return { start: fromDate || '2000-01-01', end: toDate || '2099-12-31' };
    }
    return { start: '2000-01-01', end: '2099-12-31' };
  }, [preset, todayKey, currentMonthKey, fromDate, toDate]);

  const scopedOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status !== 'cancelled' &&
          o.dateKey >= activeDateRange.start &&
          o.dateKey <= activeDateRange.end
      ),
    [orders, activeDateRange]
  );

  const scopedExpenses = useMemo(
    () =>
      expenses.filter(
        (e) => e.dateKey >= activeDateRange.start && e.dateKey <= activeDateRange.end
      ),
    [expenses, activeDateRange]
  );

  // Financial Position & Treasury Split
  const financials = useMemo(() => {
    const totalRevenue = scopedOrders.reduce((s, o) => s + o.total, 0);
    const totalDiscounts = scopedOrders.reduce((s, o) => s + o.discount, 0);
    const totalExpenses = scopedExpenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const cashIn = scopedOrders
      .filter((o) => o.paymentMethod === 'cash')
      .reduce((s, o) => s + o.total, 0);
    const instapayIn = scopedOrders
      .filter((o) => o.paymentMethod === 'instapay')
      .reduce((s, o) => s + o.total, 0);
    const cardIn = scopedOrders
      .filter((o) => o.paymentMethod === 'card')
      .reduce((s, o) => s + o.total, 0);

    const cashOut = scopedExpenses
      .filter((e) => e.paymentSource === 'cash_drawer')
      .reduce((s, e) => s + e.amount, 0);
    const bankOut = scopedExpenses
      .filter((e) => e.paymentSource === 'bank_transfer')
      .reduce((s, e) => s + e.amount, 0);

    const netCashTreasury = cashIn - cashOut;
    const netDigitalTreasury = instapayIn + cardIn - bankOut;

    // Expense breakdown by category
    const expByCat = new Map<ExpenseCategory, number>();
    for (const e of scopedExpenses) {
      expByCat.set(e.category, (expByCat.get(e.category) || 0) + e.amount);
    }
    const expenseCategories = Array.from(expByCat.entries())
      .map(([category, amount]) => ({
        category,
        label: EXPENSE_CATEGORY_LABELS[category],
        amount,
        share: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalRevenue,
      totalDiscounts,
      totalExpenses,
      netProfit,
      profitMargin,
      cashIn,
      cashOut,
      instapayIn,
      cardIn,
      bankOut,
      netCashTreasury,
      netDigitalTreasury,
      expenseCategories,
    };
  }, [scopedOrders, scopedExpenses]);

  // Unified Chronological Ledger with Running Balance
  const ledgerWithBalance = useMemo(() => {
    const rows: LedgerRow[] = [];

    for (const o of scopedOrders) {
      const isoMs = o.createdAtIso ? Date.parse(o.createdAtIso) : Number.NaN;
      const tsMs = !Number.isNaN(isoMs)
        ? isoMs
        : o.createdAt && typeof o.createdAt.toMillis === 'function'
        ? o.createdAt.toMillis()
        : new Date(`${o.dateKey}T12:00:00`).getTime();
      rows.push({
        id: `inc_${o.id}`,
        dateKey: o.dateKey,
        timestampMs: tsMs,
        type: 'income',
        reference: o.orderNumber,
        title:
          o.items.length === 1
            ? `${o.items[0].name} (×${o.items[0].quantity})`
            : `مبيعات أوردر (${o.itemCount} قطعة)`,
        categoryLabel: 'مبيعات كاشير',
        channelLabel: PAYMENT_METHOD_LABELS[o.paymentMethod],
        credit: o.total,
        debit: 0,
        notes: o.customerName || o.notes || '',
      });
    }

    for (const e of scopedExpenses) {
      const isoMs = e.createdAtIso ? Date.parse(e.createdAtIso) : Number.NaN;
      const tsMs = !Number.isNaN(isoMs)
        ? isoMs
        : e.createdAt && typeof e.createdAt.toMillis === 'function'
        ? e.createdAt.toMillis()
        : new Date(`${e.dateKey}T12:00:00`).getTime();
      rows.push({
        id: `exp_${e.id}`,
        dateKey: e.dateKey,
        timestampMs: tsMs,
        type: 'expense',
        reference: 'مصروف',
        title: e.title,
        categoryLabel: EXPENSE_CATEGORY_LABELS[e.category],
        channelLabel: PAYMENT_SOURCE_LABELS[e.paymentSource],
        credit: 0,
        debit: e.amount,
        notes: e.notes || '',
        rawExpenseId: e.id,
      });
    }

    // Sort oldest -> newest to compute exact running balance, then reverse for display
    rows.sort((a, b) => a.timestampMs - b.timestampMs);
    let running = 0;
    const computed = rows.map((r) => {
      running += r.credit - r.debit;
      return { ...r, runningBalance: running };
    });

    return computed.reverse();
  }, [scopedOrders, scopedExpenses]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledgerWithBalance.filter((row) => {
      if (movementFilter !== 'all' && row.type !== movementFilter) return false;
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.reference.toLowerCase().includes(q) ||
        row.categoryLabel.toLowerCase().includes(q) ||
        row.channelLabel.toLowerCase().includes(q) ||
        row.dateKey.includes(q)
      );
    });
  }, [ledgerWithBalance, movementFilter, search]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(expAmount);
    if (!expTitle.trim() || !Number.isFinite(amountNum) || amountNum <= 0 || savingExp) {
      return;
    }

    setSavingExp(true);
    setErrorMsg(null);
    const dateKey = expDate || todayKey;
    const monthKey = dateKey.slice(0, 7);

    try {
      await createExpense(authToken, {
        dateKey,
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
      setAddModalOpen(false);
      await onDataChanged();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر حفظ القيد المالي.');
    } finally {
      setSavingExp(false);
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

  const handleExportCsv = () => {
    const headers = [
      'التاريخ',
      'المرجع',
      'البيان',
      'التصنيف',
      'الخزينة / الدفع',
      'دائن (إيراد)',
      'مدين (مصروف)',
      'الرصيد التراكمي',
      'ملاحظات',
    ];
    const escapeCell = (val: string | number) => {
      const s = String(val ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };
    const lines = [
      headers.map(escapeCell).join(','),
      ...visibleRows.map((r) =>
        [
          r.dateKey,
          r.reference,
          r.title,
          r.categoryLabel,
          r.channelLabel,
          r.credit,
          r.debit,
          r.runningBalance.toFixed(2),
          r.notes,
        ]
          .map(escapeCell)
          .join(',')
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `firstcanto-accounts-${todayKey}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-7">
      {/* Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E5E3DC]">
        <div>
          <h2 className="font-display text-xl font-bold text-[#171916]">
            نظام الحسابات والخزينة
          </h2>
          <p className="text-xs text-[#676D62] mt-1">
            متابعة الإيرادات والمصروفات، أرصدة الكاش وإنستاباي والفيزا، وكشف الحساب التفصيلي
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#15803D] text-white text-xs sm:text-sm font-bold hover:bg-[#166534] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل مصروف / بند</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#DEDCD3] bg-white text-xs sm:text-sm font-semibold text-[#171916] hover:bg-[#F4F3EE] cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#DEDCD3] bg-white text-xs sm:text-sm font-semibold text-[#171916] hover:bg-[#F4F3EE] cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة كشف الحساب</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900 no-print">
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

      {/* Period Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-1 p-1 bg-[#EFECE4] rounded-xl overflow-x-auto">
          {(
            [
              ['today', 'اليوم'],
              ['month', 'هذا الشهر'],
              ['last30', 'آخر 30 يوم'],
              ['all', 'الكل'],
              ['custom', 'فترة مخصصة'],
            ] as [RangePreset, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap smooth-settle cursor-pointer ${
                preset === key
                  ? 'bg-white text-[#14532D]'
                  : 'text-[#52584D] hover:text-[#171916]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#676D62]">من</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1.5 font-mono-num bg-white border border-[#DEDCD3] rounded-lg"
            />
            <span className="text-[#676D62]">إلى</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1.5 font-mono-num bg-white border border-[#DEDCD3] rounded-lg"
            />
          </div>
        )}
      </div>

      {/* 4-Column Financial Position KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-[#E5E3DC] rounded-2xl divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-[#EFECE4]">
        <div className="p-5">
          <p className="text-xs text-[#676D62]">إجمالي الإيرادات (دائن)</p>
          <p className="font-mono-num text-2xl font-bold text-[#14532D] mt-1.5">
            {formatCurrency(financials.totalRevenue, settings.currency)}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 tabular-nums">
            من {scopedOrders.length} أوردر مكتمل
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-[#676D62]">إجمالي المصروفات (مدين)</p>
          <p className="font-mono-num text-2xl font-bold text-amber-800 mt-1.5">
            {formatCurrency(financials.totalExpenses, settings.currency)}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 tabular-nums">
            {scopedExpenses.length} حركة مصروف
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-[#676D62]">صافي الربح</p>
          <p
            className={`font-mono-num text-2xl font-bold mt-1.5 ${
              financials.netProfit >= 0 ? 'text-[#15803D]' : 'text-red-700'
            }`}
          >
            {formatCurrency(financials.netProfit, settings.currency)}
          </p>
          <p className="text-xs text-[#7A8075] mt-1 font-mono-num">
            هامش الربح: {financials.profitMargin.toFixed(1)}%
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-[#676D62]">إجمالي الخصومات الممنوحة</p>
          <p className="font-mono-num text-2xl font-bold text-[#171916] mt-1.5">
            {formatCurrency(financials.totalDiscounts, settings.currency)}
          </p>
          <p className="text-xs text-[#7A8075] mt-1">خصومات فواتير الكاشير</p>
        </div>
      </div>

      {/* Treasury Balances + Expense Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Treasury Channels */}
        <div className="lg:col-span-7 bg-white border border-[#E5E3DC] rounded-2xl p-5 sm:p-6">
          <h3 className="font-display text-base font-bold text-[#171916] mb-4">
            أرصدة الخزينة وقنوات التحصيل
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#F6F5F0] border border-[#E9E6DC]">
              <div className="flex items-center gap-2 text-xs font-bold text-[#14532D] mb-2">
                <Wallet className="w-4 h-4" />
                <span>خزينة الكاش (النقدي)</span>
              </div>
              <p className="font-mono-num text-lg font-extrabold text-[#171916]">
                {formatCurrency(financials.netCashTreasury, settings.currency)}
              </p>
              <div className="mt-2 pt-2 border-t border-[#E5E2D8] text-[11px] text-[#5C6158] space-y-0.5 font-mono-num">
                <p>داخل: +{formatCurrency(financials.cashIn, settings.currency)}</p>
                <p>مصروف درج: -{formatCurrency(financials.cashOut, settings.currency)}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#F6F5F0] border border-[#E9E6DC]">
              <div className="flex items-center gap-2 text-xs font-bold text-[#14532D] mb-2">
                <Building2 className="w-4 h-4" />
                <span>تحصيل إنستاباي</span>
              </div>
              <p className="font-mono-num text-lg font-extrabold text-[#171916]">
                {formatCurrency(financials.instapayIn, settings.currency)}
              </p>
              <p className="mt-2 pt-2 border-t border-[#E5E2D8] text-[11px] text-[#5C6158]">
                تحويلات فورية للحساب
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F6F5F0] border border-[#E9E6DC]">
              <div className="flex items-center gap-2 text-xs font-bold text-[#14532D] mb-2">
                <CreditCard className="w-4 h-4" />
                <span>الفيزا والبنك</span>
              </div>
              <p className="font-mono-num text-lg font-extrabold text-[#171916]">
                {formatCurrency(financials.cardIn, settings.currency)}
              </p>
              <p className="mt-2 pt-2 border-t border-[#E5E2D8] text-[11px] text-[#5C6158] font-mono-num">
                مصروفات بنكية: -{formatCurrency(financials.bankOut, settings.currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Expense Breakdown by Category */}
        <div className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-2xl p-5 sm:p-6">
          <h3 className="font-display text-base font-bold text-[#171916] mb-4">
            توزيع المصروفات حسب البند
          </h3>
          {financials.expenseCategories.length === 0 ? (
            <p className="text-xs text-[#7A8075] py-6 text-center">
              لا توجد مصروفات مسجلة خلال هذه الفترة.
            </p>
          ) : (
            <div className="space-y-3.5">
              {financials.expenseCategories.map((cat) => (
                <div key={cat.category}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-[#171916]">{cat.label}</span>
                    <span className="font-mono-num text-[#52584D]">
                      {formatCurrency(cat.amount, settings.currency)} · {cat.share.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#EFECE4] overflow-hidden">
                    <div
                      className="h-full bg-amber-600 rounded-full"
                      style={{ width: `${Math.max(4, cat.share)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Unified Debit / Credit Financial Statement Table */}
      <div className="bg-white border border-[#E5E3DC] rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-[#EFECE4] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#171916]">
              دفتر القيود وكشف الحساب التفصيلي
            </h3>
            <p className="text-xs text-[#676D62] mt-0.5 tabular-nums">
              {visibleRows.length} حركة مالية مسجلة
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 no-print">
            <div className="flex items-center gap-1 p-1 bg-[#F2F1EC] rounded-lg">
              {(
                [
                  ['all', 'الكل'],
                  ['income', 'إيرادات'],
                  ['expense', 'مصروفات'],
                ] as [MovementFilter, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMovementFilter(k)}
                  className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer ${
                    movementFilter === k
                      ? 'bg-white text-[#14532D]'
                      : 'text-[#52584D] hover:text-[#171916]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#6B7166] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في القيود..."
                className="pr-8 pl-3 py-1.5 text-xs bg-[#FAFAF8] border border-[#DEDCD3] rounded-lg focus:outline-none focus:border-[#15803D]"
              />
            </div>
          </div>
        </div>

        {visibleRows.length === 0 ? (
          <div className="py-14 text-center px-6">
            <p className="font-display font-bold text-[#171916] mb-1">
              لا توجد حركات مالية في هذه الفترة
            </p>
            <p className="text-xs text-[#676D62]">
              أي أوردر يُسجل بالكاشير أو مصروف يُضاف سيظهر تلقائياً في كشف الحساب هنا.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F6F1] text-xs text-[#676D62]">
                <tr>
                  <th className="text-right py-3 px-4 font-semibold">التاريخ</th>
                  <th className="text-right py-3 px-4 font-semibold">المرجع</th>
                  <th className="text-right py-3 px-4 font-semibold">البيان</th>
                  <th className="text-right py-3 px-4 font-semibold">التصنيف / القناة</th>
                  <th className="text-left py-3 px-4 font-semibold">دائن (إيراد)</th>
                  <th className="text-left py-3 px-4 font-semibold">مدين (مصروف)</th>
                  <th className="text-left py-3 px-4 font-semibold">الرصيد</th>
                  <th className="text-center py-3 px-3 font-semibold no-print">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EFE9]">
                {visibleRows.map((row) => (
                  <tr key={row.id} className="hover:bg-[#FAF9F5]">
                    <td className="py-3 px-4 font-mono-num text-xs text-[#52584D] whitespace-nowrap">
                      {row.dateKey}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-xs font-semibold text-[#171916] whitespace-nowrap">
                      {row.reference}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {row.type === 'income' ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        )}
                        <div>
                          <p className="font-semibold text-[#171916]">{row.title}</p>
                          {row.notes && (
                            <p className="text-[11px] text-[#7A8075]">{row.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-[#5C6158]">
                      {row.categoryLabel} · {row.channelLabel}
                    </td>
                    <td className="py-3 px-4 text-left font-mono-num font-bold text-[#14532D] whitespace-nowrap">
                      {row.credit > 0 ? `+${formatCurrency(row.credit, settings.currency)}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-left font-mono-num font-bold text-amber-800 whitespace-nowrap">
                      {row.debit > 0 ? `-${formatCurrency(row.debit, settings.currency)}` : '—'}
                    </td>
                    <td
                      className={`py-3 px-4 text-left font-mono-num font-bold whitespace-nowrap ${
                        row.runningBalance >= 0 ? 'text-[#171916]' : 'text-red-700'
                      }`}
                    >
                      {formatCurrency(row.runningBalance, settings.currency)}
                    </td>
                    <td className="py-3 px-3 text-center no-print">
                      {row.rawExpenseId ? (
                        <button
                          type="button"
                          onClick={() => void handleDeleteExpense(row.rawExpenseId!)}
                          aria-label="حذف المصروف"
                          className="text-[#8B9186] hover:text-red-700 cursor-pointer p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-xs text-[#C7C4BA]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 no-print"
          onClick={() => setAddModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-[#E5E3DC] max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#EFECE4] mb-5">
              <h3 className="font-display text-lg font-bold text-[#171916]">
                تسجيل مصروف / قيد مالي
              </h3>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="text-[#676D62] hover:text-[#171916] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#52584D] mb-1">
                  بيان المصروف *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="مثال: فاتورة شراء مانجو ورمان، إيجار الشهر، أكواب..."
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1">
                    المبلغ ({settings.currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    step="any"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1">
                    التاريخ
                  </label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1">
                    البند المحاسبي
                  </label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-3 py-2.5 text-xs bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  >
                    {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((k) => (
                      <option key={k} value={k}>
                        {EXPENSE_CATEGORY_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1">
                    مصدر الدفع
                  </label>
                  <select
                    value={expSource}
                    onChange={(e) => setExpSource(e.target.value as PaymentSource)}
                    className="w-full px-3 py-2.5 text-xs bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  >
                    {(Object.keys(PAYMENT_SOURCE_LABELS) as PaymentSource[]).map((s) => (
                      <option key={s} value={s}>
                        {PAYMENT_SOURCE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#52584D] mb-1">
                  ملاحظات (اختياري)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  placeholder="اسم المورد أو رقم الفاتورة..."
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#DEDCD3] text-sm font-semibold text-[#171916] hover:bg-[#F4F3EE] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingExp}
                  className="px-6 py-2.5 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
                >
                  {savingExp ? 'جاري الحفظ...' : 'حفظ القيد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
