import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  CATEGORY_ORDER,
  type DailyClosing,
  type Expense,
  type ExpenseCategory,
  type MenuCategory,
  type MenuItem,
  type MonthlyClosing,
  type Order,
  type OrderItem,
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
  type PaymentSource,
} from '../types.ts';
import { CATEGORY_DEFAULT_IMAGE, DEFAULT_MENU_ITEMS } from '../data/defaultMenu.ts';
import {
  checkLoginRateLimit,
  clearFailedLogins,
  createSessionToken,
  extractBearerToken,
  getClientKey,
  getCurrentCredentialVersion,
  getEnvAdminPassword,
  hashPassword,
  recordFailedLogin,
  requireAdmin,
  verifyAdminPassword,
  verifySessionToken,
} from './auth.ts';
import { getStorageMode, loadDatabase, saveDatabase, withDbLock } from './store.ts';

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

const VALID_CATEGORIES = new Set<string>(CATEGORY_ORDER);
const VALID_ORDER_TYPES = new Set<string>(['dine_in', 'takeaway', 'delivery']);
const VALID_PAYMENT_METHODS = new Set<string>(['cash', 'instapay', 'card']);
const VALID_ORDER_STATUSES = new Set<string>(['preparing', 'completed', 'cancelled']);
const VALID_EXPENSE_CATEGORIES = new Set<string>([
  'fruits',
  'packaging',
  'utilities',
  'salaries',
  'rent',
  'other',
]);
const VALID_PAYMENT_SOURCES = new Set<string>(['cash_drawer', 'bank_transfer']);

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function sanitizeString(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function sanitizeImageUrl(val: unknown, fallbackCategory: MenuCategory): string {
  const s = sanitizeString(val, 500);
  if (!s) return CATEGORY_DEFAULT_IMAGE[fallbackCategory];
  if (s.startsWith('/src/assets/')) return s;
  try {
    const parsed = new URL(s);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Reject javascript: / data: / malformed URLs
  }
  return CATEGORY_DEFAULT_IMAGE[fallbackCategory];
}

function sanitizeNumber(val: unknown, min: number, max: number, fallback = 0): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Number(n.toFixed(2))));
}

export function createApiApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));

  // Protective security headers across all responses (no X-Frame-Options to preserve iframe compatibility)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Never cache authentication or private admin/financial data in browser, proxy, or service worker
  app.use(['/api/auth', '/api/admin'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  // Public Storefront Bootstrap (only available items & public settings — never exposes credentials or orders)
  app.get(
    '/api/public/bootstrap',
    asyncHandler(async (_req: Request, res: Response) => {
      const db = await loadDatabase();
      res.setHeader('Cache-Control', 'no-cache');
      res.json({
        menuItems: db.menuItems.filter((item) => item.isAvailable),
        storeSettings: db.storeSettings,
      });
    })
  );

  // Auth Status
  app.get(
    '/api/auth/status',
    asyncHandler(async (req: Request, res: Response) => {
      const db = await loadDatabase();
      const envPass = getEnvAdminPassword();
      const configured = Boolean(envPass || db.adminCredential);
      const token = extractBearerToken(req);
      const authenticated = configured && (await verifySessionToken(token));
      res.json({
        configured,
        managedByEnv: Boolean(envPass),
        authenticated,
      });
    })
  );

  // First-Run One-Time Admin Password Setup (locks permanently once claimed or if env var is set)
  app.post(
    '/api/auth/setup',
    asyncHandler(async (req: Request, res: Response) => {
      const clientKey = getClientKey(req);
      const limit = checkLoginRateLimit(clientKey);
      if (!limit.allowed) {
        res.status(429).json({
          error: `تم إيقاف المحاولات مؤقتاً لحماية النظام. حاول بعد ${limit.retryAfterSeconds} ثانية.`,
        });
        return;
      }

      const envPass = getEnvAdminPassword();
      if (envPass) {
        res.status(409).json({
          error: 'كلمة سر الإدارة محددة مسبقاً عبر إعدادات السيرفر.',
        });
        return;
      }

      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (password.length < 4 || password.length > 128) {
        recordFailedLogin(clientKey);
        res.status(400).json({
          error: 'يجب أن تتكون كلمة السر من 4 أحرف أو أرقام على الأقل.',
        });
        return;
      }

      const result = await withDbLock(async () => {
        const db = await loadDatabase();
        if (db.adminCredential) {
          return { alreadyClaimed: true as const };
        }
        db.adminCredential = hashPassword(password);
        await saveDatabase(db);
        const version = await getCurrentCredentialVersion();
        const token = await createSessionToken(version);
        return { alreadyClaimed: false as const, token };
      });

      if (result.alreadyClaimed) {
        res.status(409).json({
          error: 'تم تعيين كلمة سر الإدارة بالفعل. يرجى إدخال كلمة السر للدخول.',
        });
        return;
      }

      clearFailedLogins(clientKey);
      res.status(201).json({ token: result.token, managedByEnv: false });
    })
  );

  // Admin Password Login
  app.post(
    '/api/auth/login',
    asyncHandler(async (req: Request, res: Response) => {
      const clientKey = getClientKey(req);
      const limit = checkLoginRateLimit(clientKey);
      if (!limit.allowed) {
        res.status(429).json({
          error: `تم إيقاف المحاولات مؤقتاً لحماية النظام. حاول بعد ${limit.retryAfterSeconds} ثانية.`,
        });
        return;
      }

      const db = await loadDatabase();
      const envPass = getEnvAdminPassword();
      if (!envPass && !db.adminCredential) {
        res.status(400).json({
          error: 'لم يتم تعيين كلمة سر الإدارة بعد.',
        });
        return;
      }

      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!password || password.length > 128) {
        recordFailedLogin(clientKey);
        res.status(400).json({ error: 'يرجى إدخال كلمة السر.' });
        return;
      }

      const ok = await verifyAdminPassword(password);
      if (!ok) {
        recordFailedLogin(clientKey);
        res.status(401).json({ error: 'كلمة السر غير صحيحة.' });
        return;
      }

      clearFailedLogins(clientKey);
      const version = await getCurrentCredentialVersion();
      const token = await createSessionToken(version);
      res.json({ token, managedByEnv: Boolean(envPass) });
    })
  );

  // Change Admin Password (Authenticated + Rate Limited)
  app.post(
    '/api/auth/change-password',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const clientKey = getClientKey(req);
      const limit = checkLoginRateLimit(clientKey);
      if (!limit.allowed) {
        res.status(429).json({
          error: `تم إيقاف المحاولات مؤقتاً لحماية النظام. حاول بعد ${limit.retryAfterSeconds} ثانية.`,
        });
        return;
      }

      if (getEnvAdminPassword()) {
        res.status(400).json({
          error:
            'كلمة السر مُدارة حالياً عبر متغير البيئة ADMIN_PASSWORD؛ لتغييرها قم بتحديثها في إعدادات Secrets أو Vercel.',
        });
        return;
      }

      const currentPassword =
        typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const newPassword =
        typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

      if (newPassword.length < 4 || newPassword.length > 128) {
        res.status(400).json({
          error: 'يجب أن تتكون كلمة السر الجديدة من 4 أحرف أو أرقام على الأقل.',
        });
        return;
      }

      const validCurrent = await verifyAdminPassword(currentPassword);
      if (!validCurrent) {
        recordFailedLogin(clientKey);
        res.status(401).json({ error: 'كلمة السر الحالية غير صحيحة.' });
        return;
      }

      clearFailedLogins(clientKey);
      const token = await withDbLock(async () => {
        const db = await loadDatabase();
        db.adminCredential = hashPassword(newPassword);
        await saveDatabase(db);
        const version = await getCurrentCredentialVersion();
        return createSessionToken(version);
      });
      res.json({ token });
    })
  );

  // Admin Full Data Bootstrap
  app.get(
    '/api/admin/bootstrap',
    requireAdmin,
    asyncHandler(async (_req: Request, res: Response) => {
      const db = await loadDatabase();
      res.json({
        menuItems: db.menuItems,
        orders: db.orders,
        expenses: db.expenses,
        dailyClosings: db.dailyClosings,
        monthlyClosings: db.monthlyClosings,
        storeSettings: db.storeSettings,
        managedByEnv: Boolean(getEnvAdminPassword()),
        storageMode: getStorageMode(),
      });
    })
  );

  // Create Order
  app.post(
    '/api/admin/orders',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body ?? {};
      const dateKey = sanitizeString(body.dateKey, 10);
      const monthKey = sanitizeString(body.monthKey, 7);
      const orderType = sanitizeString(body.orderType, 20) as OrderType;
      const paymentMethod = sanitizeString(body.paymentMethod, 20) as PaymentMethod;
      const rawItems = Array.isArray(body.items) ? body.items : [];

      if (!DATE_KEY_RE.test(dateKey) || !MONTH_KEY_RE.test(monthKey)) {
        res.status(400).json({ error: 'تاريخ الأوردر غير صالح.' });
        return;
      }
      if (!VALID_ORDER_TYPES.has(orderType) || !VALID_PAYMENT_METHODS.has(paymentMethod)) {
        res.status(400).json({ error: 'نوع الطلب أو طريقة الدفع غير صالحة.' });
        return;
      }
      if (rawItems.length < 1 || rawItems.length > 30) {
        res.status(400).json({ error: 'يجب أن يحتوي الأوردر على صنف واحد على الأقل.' });
        return;
      }

      const items: OrderItem[] = [];
      for (const raw of rawItems) {
        const cat = sanitizeString(raw?.category, 30);
        if (!VALID_CATEGORIES.has(cat)) {
          res.status(400).json({ error: 'قسم أحد الأصناف غير صالح.' });
          return;
        }
        const unitPrice = sanitizeNumber(raw?.unitPrice, 0, 100000);
        const quantity = Math.round(sanitizeNumber(raw?.quantity, 1, 200, 1));
        items.push({
          itemId: sanitizeString(raw?.itemId, 128).replace(/[^a-zA-Z0-9_-]/g, '_') || 'item',
          name: sanitizeString(raw?.name, 100) || 'صنف',
          category: cat as MenuCategory,
          unitPrice,
          quantity,
          lineTotal: Number((unitPrice * quantity).toFixed(2)),
        });
      }

      const subtotal = Number(items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2));
      const discount = sanitizeNumber(body.discount, 0, subtotal);
      const total = Number(Math.max(0, subtotal - discount).toFixed(2));
      const itemCount = items.reduce((s, i) => s + i.quantity, 0);

      const newOrder = await withDbLock(async () => {
        const db = await loadDatabase();
        const sameDayCount = db.orders.filter((o) => o.dateKey === dateKey).length;
        const seq = String(sameDayCount + 1).padStart(3, '0');
        const orderNumber = `FC-${dateKey.slice(5).replace('-', '')}-${seq}`;

        const order: Order = {
          id: `ord_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          orderNumber,
          dateKey,
          monthKey,
          orderType,
          paymentMethod,
          status: 'completed',
          items,
          itemCount,
          subtotal,
          discount,
          total,
          customerName: sanitizeString(body.customerName, 100),
          notes: sanitizeString(body.notes, 300),
          createdBy: 'admin',
          createdAtIso: new Date().toISOString(),
        };

        db.orders.unshift(order);
        await saveDatabase(db);
        return order;
      });

      res.status(201).json({ order: newOrder });
    })
  );

  // Update Order Status
  app.patch(
    '/api/admin/orders/:id',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id || '');
      if (!SAFE_ID_RE.test(id)) {
        res.status(400).json({ error: 'معرّف الأوردر غير صالح.' });
        return;
      }
      const status = sanitizeString(req.body?.status, 20) as OrderStatus;
      if (!VALID_ORDER_STATUSES.has(status)) {
        res.status(400).json({ error: 'حالة الأوردر غير صالحة.' });
        return;
      }

      const updated = await withDbLock(async () => {
        const db = await loadDatabase();
        const idx = db.orders.findIndex((o) => o.id === id);
        if (idx === -1) return null;
        db.orders[idx] = { ...db.orders[idx], status };
        await saveDatabase(db);
        return db.orders[idx];
      });

      if (!updated) {
        res.status(404).json({ error: 'الأوردر غير موجود.' });
        return;
      }
      res.json({ order: updated });
    })
  );

  // Create Expense
  app.post(
    '/api/admin/expenses',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body ?? {};
      const dateKey = sanitizeString(body.dateKey, 10);
      const monthKey = sanitizeString(body.monthKey, 7);
      const title = sanitizeString(body.title, 120);
      const category = sanitizeString(body.category, 30) as ExpenseCategory;
      const paymentSource = sanitizeString(body.paymentSource, 30) as PaymentSource;
      const amount = sanitizeNumber(body.amount, 0.01, 1000000, 0);

      if (!DATE_KEY_RE.test(dateKey) || !MONTH_KEY_RE.test(monthKey)) {
        res.status(400).json({ error: 'تاريخ المصروف غير صالح.' });
        return;
      }
      if (!title || amount <= 0) {
        res.status(400).json({ error: 'يرجى إدخال بيان ومبلغ المصروف بشكل صحيح.' });
        return;
      }
      if (!VALID_EXPENSE_CATEGORIES.has(category) || !VALID_PAYMENT_SOURCES.has(paymentSource)) {
        res.status(400).json({ error: 'تصنيف المصروف أو مصدر الدفع غير صالح.' });
        return;
      }

      const expense = await withDbLock(async () => {
        const db = await loadDatabase();
        const item: Expense = {
          id: `exp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          dateKey,
          monthKey,
          title,
          category,
          amount,
          paymentSource,
          notes: sanitizeString(body.notes, 300),
          createdBy: 'admin',
          createdAtIso: new Date().toISOString(),
        };
        db.expenses.unshift(item);
        await saveDatabase(db);
        return item;
      });
      res.status(201).json({ expense });
    })
  );

  // Delete Expense
  app.delete(
    '/api/admin/expenses/:id',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id || '');
      if (!SAFE_ID_RE.test(id)) {
        res.status(400).json({ error: 'معرّف غير صالح.' });
        return;
      }
      await withDbLock(async () => {
        const db = await loadDatabase();
        db.expenses = db.expenses.filter((e) => e.id !== id);
        await saveDatabase(db);
      });
      res.json({ ok: true });
    })
  );

  // Save Daily Closing
  app.put(
    '/api/admin/daily-closings/:dateKey',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const dateKey = String(req.params.dateKey || '');
      if (!DATE_KEY_RE.test(dateKey)) {
        res.status(400).json({ error: 'تاريخ التقفيل غير صالح.' });
        return;
      }
      const b = req.body ?? {};
      const closing: DailyClosing = {
        id: dateKey,
        dateKey,
        monthKey: dateKey.slice(0, 7),
        ordersCount: Math.round(sanitizeNumber(b.ordersCount, 0, 100000)),
        cancelledCount: Math.round(sanitizeNumber(b.cancelledCount, 0, 100000)),
        grossSales: sanitizeNumber(b.grossSales, 0, 10000000),
        totalDiscounts: sanitizeNumber(b.totalDiscounts, 0, 10000000),
        netSales: sanitizeNumber(b.netSales, 0, 10000000),
        cashSales: sanitizeNumber(b.cashSales, 0, 10000000),
        instapaySales: sanitizeNumber(b.instapaySales, 0, 10000000),
        cardSales: sanitizeNumber(b.cardSales, 0, 10000000),
        totalExpenses: sanitizeNumber(b.totalExpenses, 0, 10000000),
        cashExpenses: sanitizeNumber(b.cashExpenses, 0, 10000000),
        openingCash: sanitizeNumber(b.openingCash, 0, 10000000),
        expectedCash: sanitizeNumber(b.expectedCash, -10000000, 10000000),
        actualCash: sanitizeNumber(b.actualCash, 0, 10000000),
        cashVariance: sanitizeNumber(b.cashVariance, -10000000, 10000000),
        netProfit: sanitizeNumber(b.netProfit, -10000000, 10000000),
        notes: sanitizeString(b.notes, 400),
        status: 'closed',
        closedBy: 'admin',
        closedByEmail: 'admin',
      };

      await withDbLock(async () => {
        const db = await loadDatabase();
        const idx = db.dailyClosings.findIndex((d) => d.dateKey === dateKey);
        if (idx === -1) db.dailyClosings.unshift(closing);
        else db.dailyClosings[idx] = closing;
        await saveDatabase(db);
      });
      res.json({ dailyClosing: closing });
    })
  );

  // Save Monthly Closing
  app.put(
    '/api/admin/monthly-closings/:monthKey',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const monthKey = String(req.params.monthKey || '');
      if (!MONTH_KEY_RE.test(monthKey)) {
        res.status(400).json({ error: 'الشهر غير صالح.' });
        return;
      }
      const b = req.body ?? {};
      const closing: MonthlyClosing = {
        id: monthKey,
        monthKey,
        daysClosedCount: Math.round(sanitizeNumber(b.daysClosedCount, 0, 31)),
        ordersCount: Math.round(sanitizeNumber(b.ordersCount, 0, 1000000)),
        netSales: sanitizeNumber(b.netSales, 0, 100000000),
        cashSales: sanitizeNumber(b.cashSales, 0, 100000000),
        instapaySales: sanitizeNumber(b.instapaySales, 0, 100000000),
        cardSales: sanitizeNumber(b.cardSales, 0, 100000000),
        totalExpenses: sanitizeNumber(b.totalExpenses, 0, 100000000),
        fixedExpenses: sanitizeNumber(b.fixedExpenses, 0, 100000000),
        netProfit: sanitizeNumber(b.netProfit, -100000000, 100000000),
        topProductName: sanitizeString(b.topProductName, 120),
        topProductQty: Math.round(sanitizeNumber(b.topProductQty, 0, 1000000)),
        notes: sanitizeString(b.notes, 500),
        status: 'closed',
        closedBy: 'admin',
        closedByEmail: 'admin',
      };

      await withDbLock(async () => {
        const db = await loadDatabase();
        const idx = db.monthlyClosings.findIndex((m) => m.monthKey === monthKey);
        if (idx === -1) db.monthlyClosings.unshift(closing);
        else db.monthlyClosings[idx] = closing;
        await saveDatabase(db);
      });
      res.json({ monthlyClosing: closing });
    })
  );

  // Menu CRUD
  app.post(
    '/api/admin/menu/seed',
    requireAdmin,
    asyncHandler(async (_req: Request, res: Response) => {
      const menuItems = await withDbLock(async () => {
        const db = await loadDatabase();
        db.menuItems = DEFAULT_MENU_ITEMS.map((item) => ({
          ...item,
          createdBy: 'admin',
        }));
        db.menuSeeded = true;
        await saveDatabase(db);
        return db.menuItems;
      });
      res.json({ menuItems });
    })
  );

  app.post(
    '/api/admin/menu',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const b = req.body ?? {};
      const name = sanitizeString(b.name, 100);
      const cat = sanitizeString(b.category, 30);
      if (!name || !VALID_CATEGORIES.has(cat)) {
        res.status(400).json({ error: 'يرجى إدخال اسم الصنف والقسم بشكل صحيح.' });
        return;
      }
      const category = cat as MenuCategory;
      const item: MenuItem = {
        id: `item_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        name,
        nameEn: sanitizeString(b.nameEn, 100),
        category,
        description: sanitizeString(b.description, 300),
        price: sanitizeNumber(b.price, 0, 100000),
        size: sanitizeString(b.size, 40) || 'حجم قياسي',
        imageUrl: sanitizeImageUrl(b.imageUrl, category),
        isAvailable: b.isAvailable !== false,
        isFeatured: Boolean(b.isFeatured),
        sortOrder: Math.round(sanitizeNumber(b.sortOrder, 0, 10000, 10)),
        createdBy: 'admin',
      };

      await withDbLock(async () => {
        const db = await loadDatabase();
        db.menuItems.push(item);
        await saveDatabase(db);
      });
      res.status(201).json({ item });
    })
  );

  app.put(
    '/api/admin/menu/:id',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id || '');
      if (!SAFE_ID_RE.test(id)) {
        res.status(400).json({ error: 'معرّف الصنف غير صالح.' });
        return;
      }

      const b = req.body ?? {};
      const updated = await withDbLock(async () => {
        const db = await loadDatabase();
        const idx = db.menuItems.findIndex((i) => i.id === id);
        if (idx === -1) return null;

        const existing = db.menuItems[idx];
        const nextCategory =
          typeof b.category === 'string' && VALID_CATEGORIES.has(b.category)
            ? (b.category as MenuCategory)
            : existing.category;

        const nextItem: MenuItem = {
          ...existing,
          name:
            typeof b.name === 'string'
              ? sanitizeString(b.name, 100) || existing.name
              : existing.name,
          nameEn: typeof b.nameEn === 'string' ? sanitizeString(b.nameEn, 100) : existing.nameEn,
          category: nextCategory,
          description:
            typeof b.description === 'string'
              ? sanitizeString(b.description, 300)
              : existing.description,
          price:
            b.price !== undefined
              ? sanitizeNumber(b.price, 0, 100000, existing.price)
              : existing.price,
          size: typeof b.size === 'string' ? sanitizeString(b.size, 40) : existing.size,
          imageUrl:
            typeof b.imageUrl === 'string'
              ? sanitizeImageUrl(b.imageUrl, nextCategory)
              : existing.imageUrl,
          isAvailable:
            typeof b.isAvailable === 'boolean' ? b.isAvailable : existing.isAvailable,
          isFeatured:
            typeof b.isFeatured === 'boolean' ? b.isFeatured : existing.isFeatured,
          sortOrder:
            b.sortOrder !== undefined
              ? Math.round(sanitizeNumber(b.sortOrder, 0, 10000, existing.sortOrder))
              : existing.sortOrder,
        };

        db.menuItems[idx] = nextItem;
        await saveDatabase(db);
        return nextItem;
      });

      if (!updated) {
        res.status(404).json({ error: 'الصنف غير موجود.' });
        return;
      }
      res.json({ item: updated });
    })
  );

  app.delete(
    '/api/admin/menu/:id',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id || '');
      if (!SAFE_ID_RE.test(id)) {
        res.status(400).json({ error: 'معرّف الصنف غير صالح.' });
        return;
      }
      await withDbLock(async () => {
        const db = await loadDatabase();
        db.menuItems = db.menuItems.filter((i) => i.id !== id);
        await saveDatabase(db);
      });
      res.json({ ok: true });
    })
  );

  // Update Store Settings
  app.put(
    '/api/admin/settings',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const b = req.body ?? {};
      const storeName = sanitizeString(b.storeName, 80);
      if (!storeName) {
        res.status(400).json({ error: 'اسم المحل مطلوب.' });
        return;
      }
      const storeSettings = await withDbLock(async () => {
        const db = await loadDatabase();
        db.storeSettings = {
          storeName,
          tagline: sanitizeString(b.tagline, 160),
          phone: sanitizeString(b.phone, 32),
          address: sanitizeString(b.address, 200),
          workingHours: sanitizeString(b.workingHours, 100),
          currency: sanitizeString(b.currency, 12) || 'ج.م',
          isPublic: true,
        };
        await saveDatabase(db);
        return db.storeSettings;
      });
      res.json({ storeSettings });
    })
  );

  // Reset Test Data (Requires Admin Password Confirmation + Rate Limited)
  app.post(
    '/api/admin/reset-test-data',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const clientKey = getClientKey(req);
      const limit = checkLoginRateLimit(clientKey);
      if (!limit.allowed) {
        res.status(429).json({
          error: `تم إيقاف المحاولات مؤقتاً لحماية النظام. حاول بعد ${limit.retryAfterSeconds} ثانية.`,
        });
        return;
      }

      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const valid = await verifyAdminPassword(password);
      if (!valid) {
        recordFailedLogin(clientKey);
        res.status(401).json({ error: 'كلمة السر غير صحيحة؛ لم يتم مسح أي بيانات.' });
        return;
      }

      clearFailedLogins(clientKey);
      await withDbLock(async () => {
        const db = await loadDatabase();
        db.orders = [];
        db.expenses = [];
        db.dailyClosings = [];
        db.monthlyClosings = [];
        await saveDatabase(db);
      });
      res.json({ ok: true });
    })
  );

  // Global error handler — never expose internal stack traces or filesystem paths
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('API Error:', err instanceof Error ? err.message : 'Unknown error');
    if (res.headersSent) return;
    res.status(500).json({
      error: 'حدث خطأ أثناء حفظ أو قراءة البيانات. يرجى المحاولة مرة أخرى.',
    });
  });

  return app;
}
