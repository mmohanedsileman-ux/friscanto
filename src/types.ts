import type { Timestamp } from 'firebase/firestore';

export type MenuCategory =
  | 'fruit_salad'
  | 'fresh_juices'
  | 'smoothies'
  | 'cut_cups'
  | 'family_boxes'
  | 'addons';

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type PaymentMethod = 'cash' | 'instapay' | 'card';
export type OrderStatus = 'preparing' | 'completed' | 'cancelled';
export type ExpenseCategory =
  | 'fruits'
  | 'packaging'
  | 'utilities'
  | 'salaries'
  | 'rent'
  | 'other';
export type PaymentSource = 'cash_drawer' | 'bank_transfer';

export type AdminTab =
  | 'pos'
  | 'accounts'
  | 'daily'
  | 'monthly'
  | 'analytics'
  | 'menu'
  | 'settings';

export interface MenuItem {
  id: string;
  name: string;
  nameEn?: string;
  category: MenuCategory;
  description: string;
  price: number;
  size: string;
  imageUrl: string;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  createdBy?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface OrderItem {
  itemId: string;
  name: string;
  category: MenuCategory;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  dateKey: string;
  monthKey: string;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  items: OrderItem[];
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  customerName: string;
  notes: string;
  createdBy: string;
  createdAtIso?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Expense {
  id: string;
  dateKey: string;
  monthKey: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  paymentSource: PaymentSource;
  notes: string;
  createdBy: string;
  createdAtIso?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface DailyClosing {
  id: string;
  dateKey: string;
  monthKey: string;
  ordersCount: number;
  cancelledCount: number;
  grossSales: number;
  totalDiscounts: number;
  netSales: number;
  cashSales: number;
  instapaySales: number;
  cardSales: number;
  totalExpenses: number;
  cashExpenses: number;
  openingCash: number;
  expectedCash: number;
  actualCash: number;
  cashVariance: number;
  netProfit: number;
  notes: string;
  status: 'closed';
  closedBy: string;
  closedByEmail: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface MonthlyClosing {
  id: string;
  monthKey: string;
  daysClosedCount: number;
  ordersCount: number;
  netSales: number;
  cashSales: number;
  instapaySales: number;
  cardSales: number;
  totalExpenses: number;
  fixedExpenses: number;
  netProfit: number;
  topProductName: string;
  topProductQty: number;
  notes: string;
  status: 'closed';
  closedBy: string;
  closedByEmail: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  phone: string;
  address: string;
  workingHours: string;
  currency: string;
  isPublic: boolean;
  updatedAt?: Timestamp | null;
}

export const CATEGORY_LABELS: Record<MenuCategory, string> = {
  cut_cups: 'أكواب فواكه فريش',
  fruit_salad: 'سبيشال فريستكانتو',
  addons: 'حلويات وإضافات',
  fresh_juices: 'عصائر طبيعية',
  smoothies: 'سموزي فريش',
  family_boxes: 'بوكسات العيلة',
};

export const CATEGORY_ORDER: MenuCategory[] = [
  'cut_cups',
  'fruit_salad',
  'addons',
  'fresh_juices',
  'smoothies',
  'family_boxes',
];

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  takeaway: 'تيك أواي',
  dine_in: 'صالة',
  delivery: 'دليفري',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'كاش',
  instapay: 'إنستاباي',
  card: 'فيزا / كارت',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  preparing: 'قيد التحضير',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fruits: 'شراء فاكهة وخامات',
  packaging: 'عبوات وأكواب وتغليف',
  utilities: 'كهرباء ومياه ومرافق',
  salaries: 'رواتب وعمالة',
  rent: 'إيجار',
  other: 'مصروفات متنوعة',
};

export const PAYMENT_SOURCE_LABELS: Record<PaymentSource, string> = {
  cash_drawer: 'من درج الكاشير',
  bank_transfer: 'خزينة / تحويل بنكي',
};

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getLocalMonthKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatCurrency(amount: number, currency: string = 'ج.م'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toLocaleString('en-US', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function formatArabicDate(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateKey;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatArabicMonth(monthKey: string): string {
  const parts = monthKey.split('-').map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN)) return monthKey;
  const d = new Date(parts[0], parts[1] - 1, 1);
  return d.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
  });
}

export function formatOrderTime(ts?: Timestamp | null, iso?: string): string {
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
  if (!ts || typeof ts.toDate !== 'function') return 'الآن';
  return ts.toDate().toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
