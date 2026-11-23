import type {
  DailyClosing,
  Expense,
  ExpenseCategory,
  MenuCategory,
  MenuItem,
  MonthlyClosing,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentSource,
  StoreSettings,
} from '../types';

export class UnauthorizedError extends Error {
  constructor(message = 'انتهت جلسة الإدارة. يرجى إدخال كلمة السر مرة أخرى.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    token?: string | null;
    body?: unknown;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;

  if (res.status === 401) {
    throw new UnauthorizedError(data?.error || 'انتهت جلسة الإدارة. يرجى إدخال كلمة السر مرة أخرى.');
  }

  if (!res.ok) {
    throw new Error(data?.error || 'حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مجدداً.');
  }

  return data;
}

export interface PublicBootstrapResponse {
  menuItems: MenuItem[];
  storeSettings: StoreSettings;
}

export function fetchPublicBootstrap(): Promise<PublicBootstrapResponse> {
  return apiRequest<PublicBootstrapResponse>('/api/public/bootstrap');
}

export interface AuthStatusResponse {
  configured: boolean;
  managedByEnv: boolean;
  authenticated: boolean;
}

export function fetchAuthStatus(token?: string | null): Promise<AuthStatusResponse> {
  return apiRequest<AuthStatusResponse>('/api/auth/status', { token });
}

export interface AuthTokenResponse {
  token: string;
  managedByEnv: boolean;
}

export function setupAdminPassword(password: string): Promise<AuthTokenResponse> {
  return apiRequest<AuthTokenResponse>('/api/auth/setup', {
    method: 'POST',
    body: { password },
  });
}

export function loginAdmin(password: string): Promise<AuthTokenResponse> {
  return apiRequest<AuthTokenResponse>('/api/auth/login', {
    method: 'POST',
    body: { password },
  });
}

export function changeAdminPassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<{ token: string }> {
  return apiRequest<{ token: string }>('/api/auth/change-password', {
    method: 'POST',
    token,
    body: { currentPassword, newPassword },
  });
}

export interface AdminBootstrapResponse {
  menuItems: MenuItem[];
  orders: Order[];
  expenses: Expense[];
  dailyClosings: DailyClosing[];
  monthlyClosings: MonthlyClosing[];
  storeSettings: StoreSettings;
  managedByEnv: boolean;
  storageMode?: 'cloud_kv' | 'local_file' | 'tmp_ephemeral';
}

export function fetchAdminBootstrap(token: string): Promise<AdminBootstrapResponse> {
  return apiRequest<AdminBootstrapResponse>('/api/admin/bootstrap', { token });
}

export interface CreateOrderInput {
  dateKey: string;
  monthKey: string;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
  discount: number;
  customerName: string;
  notes: string;
}

export function createOrder(
  token: string,
  input: CreateOrderInput
): Promise<{ order: Order }> {
  return apiRequest<{ order: Order }>('/api/admin/orders', {
    method: 'POST',
    token,
    body: input,
  });
}

export function updateOrderStatus(
  token: string,
  orderId: string,
  status: OrderStatus
): Promise<{ order: Order }> {
  return apiRequest<{ order: Order }>(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    token,
    body: { status },
  });
}

export interface CreateExpenseInput {
  dateKey: string;
  monthKey: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  paymentSource: PaymentSource;
  notes: string;
}

export function createExpense(
  token: string,
  input: CreateExpenseInput
): Promise<{ expense: Expense }> {
  return apiRequest<{ expense: Expense }>('/api/admin/expenses', {
    method: 'POST',
    token,
    body: input,
  });
}

export function deleteExpense(token: string, expenseId: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/admin/expenses/${encodeURIComponent(expenseId)}`, {
    method: 'DELETE',
    token,
  });
}

export type SaveDailyClosingInput = Omit<
  DailyClosing,
  'id' | 'dateKey' | 'monthKey' | 'status' | 'closedBy' | 'closedByEmail' | 'createdAt' | 'updatedAt'
>;

export function saveDailyClosing(
  token: string,
  dateKey: string,
  input: SaveDailyClosingInput
): Promise<{ dailyClosing: DailyClosing }> {
  return apiRequest<{ dailyClosing: DailyClosing }>(
    `/api/admin/daily-closings/${encodeURIComponent(dateKey)}`,
    {
      method: 'PUT',
      token,
      body: input,
    }
  );
}

export type SaveMonthlyClosingInput = Omit<
  MonthlyClosing,
  'id' | 'monthKey' | 'status' | 'closedBy' | 'closedByEmail' | 'createdAt' | 'updatedAt'
>;

export function saveMonthlyClosing(
  token: string,
  monthKey: string,
  input: SaveMonthlyClosingInput
): Promise<{ monthlyClosing: MonthlyClosing }> {
  return apiRequest<{ monthlyClosing: MonthlyClosing }>(
    `/api/admin/monthly-closings/${encodeURIComponent(monthKey)}`,
    {
      method: 'PUT',
      token,
      body: input,
    }
  );
}

export function seedDefaultMenu(token: string): Promise<{ menuItems: MenuItem[] }> {
  return apiRequest<{ menuItems: MenuItem[] }>('/api/admin/menu/seed', {
    method: 'POST',
    token,
  });
}

export interface MenuItemPayload {
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
}

export function createMenuItem(
  token: string,
  input: MenuItemPayload
): Promise<{ item: MenuItem }> {
  return apiRequest<{ item: MenuItem }>('/api/admin/menu', {
    method: 'POST',
    token,
    body: input,
  });
}

export function updateMenuItem(
  token: string,
  itemId: string,
  input: Partial<MenuItemPayload>
): Promise<{ item: MenuItem }> {
  return apiRequest<{ item: MenuItem }>(`/api/admin/menu/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    token,
    body: input,
  });
}

export function deleteMenuItem(token: string, itemId: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/admin/menu/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    token,
  });
}

export function updateStoreSettings(
  token: string,
  input: Omit<StoreSettings, 'isPublic' | 'updatedAt'>
): Promise<{ storeSettings: StoreSettings }> {
  return apiRequest<{ storeSettings: StoreSettings }>('/api/admin/settings', {
    method: 'PUT',
    token,
    body: input,
  });
}

export function resetTestData(token: string, password: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/admin/reset-test-data', {
    method: 'POST',
    token,
    body: { password },
  });
}
