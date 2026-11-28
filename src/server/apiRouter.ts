import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  type DailyClosing,
  type Expense,
  type MenuCategory,
  type MenuItem,
  type MonthlyClosing,
  type Order,
  type OrderItem,
} from '../types.ts';
import { CATEGORY_DEFAULT_IMAGE, DEFAULT_MENU_ITEMS } from '../data/defaultMenu.ts';
import {
  auditLog,
  checkLoginRateLimit,
  clearFailedLogins,
  createRateLimitMiddleware,
  createSessionToken,
  delayFailedAuth,
  extractBearerToken,
  getClientKey,
  getCurrentCredentialVersion,
  getEnvAdminPassword,
  hashPassword,
  recordFailedLogin,
  requireAdmin,
  revokeSessionToken,
  verifyAdminPassword,
  verifySessionToken,
} from './auth.ts';
import {
  deleteUploadedImage,
  getStorageMode,
  loadDatabase,
  loadUploadedImage,
  saveDatabase,
  saveUploadedImage,
  UPLOAD_IMAGE_ID_RE,
  UPLOAD_IMAGE_URL_PREFIX,
  withDbLock,
  type AllowedImageMime,
} from './store.ts';
import {
  changePasswordSchema,
  createExpenseSchema,
  createMenuItemSchema,
  createOrderSchema,
  dailyClosingSchema,
  formatZodError,
  monthlyClosingSchema,
  passwordOnlySchema,
  setupPasswordSchema,
  updateMenuItemSchema,
  updateOrderStatusSchema,
  updateStoreSettingsSchema,
  uploadImageSchema,
} from './validation.ts';

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

// Max decoded image upload size: 1MB (client compresses under 450KB by default)
const MAX_UPLOAD_IMAGE_BYTES = 1024 * 1024;
const IMAGE_DATA_URL_RE = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/;

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function hasValidImageMagicBytes(mimeType: AllowedImageMime, buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (mimeType === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mimeType === 'image/webp') {
    return (
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

function parseAndValidateImageDataUrl(
  raw: string
): { mimeType: AllowedImageMime; buffer: Buffer } | { error: string } {
  const trimmed = raw.trim();
  const match = IMAGE_DATA_URL_RE.exec(trimmed);
  if (!match) {
    return { error: 'صيغة الصورة غير مدعومة. الصيغ المدعومة هي JPG و PNG و WebP فقط.' };
  }
  const mimeType = match[1] as AllowedImageMime;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_IMAGE_BYTES) {
    return { error: 'حجم الصورة يتجاوز الحد الأقصى المسموح به (1 ميجابايت).' };
  }
  if (!hasValidImageMagicBytes(mimeType, buffer)) {
    return { error: 'محتوى الملف لا يطابق صورة سليمة.' };
  }
  return { mimeType, buffer };
}

function sanitizeImageUrl(val: string | undefined, fallbackCategory: MenuCategory): string {
  const s = (val || '').trim();
  if (!s) return CATEGORY_DEFAULT_IMAGE[fallbackCategory];
  if (s.startsWith('/src/assets/')) return s;
  if (s.startsWith(UPLOAD_IMAGE_URL_PREFIX)) {
    const id = s.slice(UPLOAD_IMAGE_URL_PREFIX.length);
    if (UPLOAD_IMAGE_ID_RE.test(id)) {
      return s;
    }
    return CATEGORY_DEFAULT_IMAGE[fallbackCategory];
  }
  try {
    const parsed = new URL(s);
    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Reject javascript: / data: / http: / malformed URLs
  }
  return CATEGORY_DEFAULT_IMAGE[fallbackCategory];
}

function getAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  const raw = [process.env.ALLOWED_ORIGINS, process.env.APP_URL]
    .filter(Boolean)
    .join(',');
  for (const part of raw.split(',')) {
    const trimmed = part.trim().replace(/\/+$/, '');
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        allowed.add(parsed.origin);
      }
    } catch {
      // Ignore malformed env entries
    }
  }
  return allowed;
}

function isTrustedOrigin(req: Request, originHeader: string): boolean {
  let originUrl: URL;
  try {
    originUrl = new URL(originHeader);
  } catch {
    return false;
  }
  if (originUrl.protocol !== 'https:' && originUrl.protocol !== 'http:') {
    return false;
  }

  const forwardedHost =
    (typeof req.headers['x-forwarded-host'] === 'string'
      ? req.headers['x-forwarded-host'].split(',')[0].trim()
      : '') || req.headers.host || '';
  if (forwardedHost && originUrl.host.toLowerCase() === forwardedHost.toLowerCase()) {
    return true;
  }

  return getAllowedOrigins().has(originUrl.origin);
}

function toPublicMenuItem(item: MenuItem) {
  return {
    id: item.id,
    name: item.name,
    nameEn: item.nameEn || '',
    category: item.category,
    description: item.description,
    price: item.price,
    size: item.size,
    imageUrl: item.imageUrl,
    isAvailable: item.isAvailable,
    isFeatured: item.isFeatured,
    sortOrder: item.sortOrder,
  };
}

function toPublicStoreSettings(s: {
  storeName: string;
  tagline: string;
  phone: string;
  whatsapp?: string;
  address: string;
  workingHours: string;
  currency: string;
  isPublic: boolean;
}) {
  return {
    storeName: s.storeName,
    tagline: s.tagline,
    phone: s.phone,
    whatsapp: s.whatsapp || '',
    address: s.address,
    workingHours: s.workingHours,
    currency: s.currency,
    isPublic: s.isPublic,
  };
}

export function createApiApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1536kb' }));

  // Protective security headers across all responses
  // Note: X-Frame-Options: DENY + CSP frame-ancestors 'none' are enforced on Vercel via vercel.json
  app.use((_req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });

  // Strict CORS: never emit wildcard "*" on API routes; block untrusted cross-origin mutations
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      if (isTrustedOrigin(req, origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      } else {
        if (req.method === 'OPTIONS') {
          res.status(403).end();
          return;
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          auditLog('cors_blocked', req, { origin });
          res.status(403).json({ error: 'مصدر الطلب غير مصرح به.' });
          return;
        }
      }
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // General API rate limit: 100 requests / minute per IP
  app.use(
    '/api',
    createRateLimitMiddleware(
      'general',
      100,
      60 * 1000,
      'تم تجاوز الحد المسموح من الطلبات مؤقتاً.'
    )
  );

  // Stricter write rate limit on admin mutations: 30 write requests / minute per IP
  const adminWriteRateLimit = createRateLimitMiddleware(
    'write',
    30,
    60 * 1000,
    'تم إرسال عدد كبير من عمليات التعديل.'
  );
  app.use('/api/admin', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    adminWriteRateLimit(req, res, next);
  });

  // Stricter upload rate limit: 15 uploads / 10 minutes per IP
  const uploadRateLimit = createRateLimitMiddleware(
    'upload',
    15,
    10 * 60 * 1000,
    'تم تجاوز الحد المسموح لرفع الصور مؤقتاً.'
  );

  // Never cache authentication or private admin/financial data in browser, proxy, or service worker
  app.use(['/api/auth', '/api/admin'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  // Public Storefront Bootstrap (strictly read-only & stripped of internal metadata)
  app.get(
    '/api/public/bootstrap',
    asyncHandler(async (_req: Request, res: Response) => {
      const db = await loadDatabase();
      res.setHeader('Cache-Control', 'no-cache');
      res.json({
        menuItems: db.menuItems.filter((item) => item.isAvailable).map(toPublicMenuItem),
        storeSettings: toPublicStoreSettings(db.storeSettings),
      });
    })
  );

  // Serve Uploaded Menu Item Images (immutable, sandboxed binary response — never executed as HTML)
  app.get(
    '/api/public/images/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id || '');
      if (!UPLOAD_IMAGE_ID_RE.test(id)) {
        res.status(400).end();
        return;
      }
      const record = await loadUploadedImage(id);
      if (!record) {
        res.status(404).end();
        return;
      }
      res.setHeader('Content-Type', record.mimeType);
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(record.buffer);
    })
  );

  // Auth Status (never leaks secrets or passwords)
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
        auditLog('auth_setup_rate_limited', req);
        res.setHeader('Retry-After', String(limit.retryAfterSeconds));
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

      const parsed = setupPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        recordFailedLogin(clientKey);
        await delayFailedAuth();
        res.status(400).json({ error: formatZodError(parsed.error) });
        return;
      }

      const result = await withDbLock(async () => {
        const db = await loadDatabase();
        if (db.adminCredential) {
          return { alreadyClaimed: true as const };
        }
        db.adminCredential = hashPassword(parsed.data.password);
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
      auditLog('auth_setup_completed', req);
      res.status(201).json({ token: result.token, managedByEnv: false });
    })
  );

  // Admin Password Login (5 attempts / 15 min per IP + delay + generic error message)
  app.post(
    '/api/auth/login',
    asyncHandler(async (req: Request, res: Response) => {
      const clientKey = getClientKey(req);
      const limit = checkLoginRateLimit(clientKey);
      if (!limit.allowed) {
        auditLog('auth_login_rate_limited', req);
        res.setHeader('Retry-After', String(limit.retryAfterSeconds));
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

      const parsed = passwordOnlySchema.safeParse(req.body);
      if (!parsed.success) {
        recordFailedLogin(clientKey);
        auditLog('auth_login_failed', req, { reason: 'invalid_payload' });
        await delayFailedAuth();
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });
        return;
      }

      const ok = await verifyAdminPassword(parsed.data.password);
      if (!ok) {
        recordFailedLogin(clientKey);
        auditLog('auth_login_failed', req, { reason: 'bad_credentials' });
        await delayFailedAuth();
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });
        return;
      }

      clearFailedLogins(clientKey);
      const version = await getCurrentCredentialVersion();
      const token = await createSessionToken(version);
      auditLog('auth_login_succeeded', req);
      res.json({ token, managedByEnv: Boolean(envPass) });
    })
  );

  // Admin Logout (revokes active JWT server-side so it cannot be reused)
  app.post(
    '/api/auth/logout',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const token = extractBearerToken(req);
      await revokeSessionToken(token);
      auditLog('auth_logout', req);
      res.json({ ok: true });
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
        res.setHeader('Retry-After', String(limit.retryAfterSeconds));
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

      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: formatZodError(parsed.error) });
        return;
      }

      const validCurrent = await verifyAdminPassword(parsed.data.currentPassword);
      if (!validCurrent) {
        recordFailedLogin(clientKey);
        auditLog('auth_change_password_failed', req);
        await delayFailedAuth();
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });
        return;
      }

      clearFailedLogins(clientKey);
      const token = await withDbLock(async () => {
        const db = await loadDatabase();
        db.adminCredential = hashPassword(parsed.data.newPassword);
        await saveDatabase(db);
        const version = await getCurrentCredentialVersion();
        return createSessionToken(version);
      });
      auditLog('auth_password_changed', req);
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

  // Create Order (Server-authoritative pricing: looks up prices from catalog, never trusts client prices)
  app.post(
    '/api/admin/orders',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = createOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: formatZodError(parsed.error) });
        return;
      }

      const data = parsed.data;

      const result = await withDbLock(async () => {
        const db = await loadDatabase();
        const catalog = db.menuItems.length > 0 ? db.menuItems : DEFAULT_MENU_ITEMS;
        const catalogMap = new Map(catalog.map((m) => [m.id, m]));

        const items: OrderItem[] = [];
        for (const reqItem of data.items) {
          const catalogItem = catalogMap.get(reqItem.itemId);
          if (!catalogItem) {
            return { error: 'أحد الأصناف المختارة غير موجود في قائمة المنيو.' as const };
          }
          const unitPrice = Number(catalogItem.price.toFixed(2));
          const quantity = reqItem.quantity;
          items.push({
            itemId: catalogItem.id,
            name: catalogItem.name,
            category: catalogItem.category,
            unitPrice,
            quantity,
            lineTotal: Number((unitPrice * quantity).toFixed(2)),
          });
        }

        const subtotal = Number(items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2));
        const discount = Number(Math.min(subtotal, Math.max(0, data.discount)).toFixed(2));
        const total = Number(Math.max(0, subtotal - discount).toFixed(2));
        const itemCount = items.reduce((s, i) => s + i.quantity, 0);

        const sameDayCount = db.orders.filter((o) => o.dateKey === data.dateKey).length;
        const seq = String(sameDayCount + 1).padStart(3, '0');
        const orderNumber = `FC-${data.dateKey.slice(5).replace('-', '')}-${seq}`;

        const order: Order = {
          id: `ord_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          orderNumber,
          dateKey: data.dateKey,
          monthKey: data.monthKey,
          orderType: data.orderType,
          paymentMethod: data.paymentMethod,
          status: 'completed',
          items,
          itemCount,
          subtotal,
          discount,
          total,
          customerName: data.customerName,
          notes: data.notes,
          createdBy: 'admin',
          createdAtIso: new Date().toISOString(),
        };

        db.orders.unshift(order);
        await saveDatabase(db);
        return { order };
      });

      if ('error' in result) {
        res.status(400).json({ error: result.error });
        return;
      }

      auditLog('order_created', req, {
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        total: result.order.total,
      });
      res.status(201).json({ order: result.order });
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

      const parsed = updateOrderStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: formatZodError(parsed.error) });
        return;
      }

      const updated = await withDbLock(async () => {
        const db = await loadDatabase();
        const idx = db.orders.findIndex((o) => o.id === id);
        if (idx === -1) return null;
        db.orders[idx] = { ...db.orders[idx], status: parsed.data.status };
        await saveDatabase(db);
        return db.orders[idx];
      });

      if (!updated) {
        res.status(404).json({ error: 'الأوردر غير موجود.' });
        return;
      }
      auditLog('order_status_updated', req, { orderId: id, status: parsed.data.status });
      res.json({ order: updated });
    })
  );

  // Create Expense
  app.post(
    '/api/admin/expenses',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = createExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: formatZodError(parsed.error) });
        return;
      }

      const d = parsed.data;
      const expense = await withDbLock(async () => {
        const db = await loadDatabase();
        const item: Expense = {
          id: `exp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          dateKey: d.dateKey,
          monthKey: d.monthKey,
          title: d.title,
          category: d.category,
          amount: Number(d.amount.toFixed(2)),
          paymentSource: d.paymentSource,
          notes: d.notes,
          createdBy: 'admin',
          createdAtIso: new Date().toISOString(),
        };
        db.expenses.unshift(item);
        await saveDatabase(db);
        return item;
      });
      auditLog('expense_created', req, { expenseId: expense.id, amount: expense.amount });
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
      auditLog('expense_deleted', req, { expenseId: id });
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
      const parsed = dailyClosingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: formatZodError(parsed.error) });
        return;
      }
      const b = parsed.data;
      const closing: DailyClosing = {
        id: dateKey,
        dateKey,
        monthKey: dateKey.slice(0, 7),
        ordersCount: b.ordersCount,
        cancelledCount: b.cancelledCount,
        grossSales: Number(b.grossSales.toFixed(2)),
        totalDiscounts: Number(b.totalDiscounts.toFixed(2)),
        netSales: Number(b.netSales.toFixed(2)),
        cashSales: Number(b.cashSales.toFixed(2)),
        instapaySales: Number(b.instapaySales.toFixed(2)),
        cardSales: Number(b.cardSales.toFixed(2)),
        totalExpenses: Number(b.totalExpenses.toFixed(2)),
        cashExpenses: Number(b.cashExpenses.toFixed(2)),
        openingCash: Number(b.openingCash.toFixed(2)),
        expectedCash: Number(b.expectedCash.toFixed(2)),
        actualCash: Number(b.actualCash.toFixed(2)),
        cashVariance: Number(b.cashVariance.toFixed(2)),
        netProfit: Number(b.netProfit.toFixed(2)),
        notes: b.notes,
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
      auditLog('daily_closing_saved', req, { dateKey, netProfit: closing.netProfit });
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
      const parsed = monthlyClosingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: formatZodError(parsed.error) });
        return;
      }
      const b = parsed.data;
      const closing: MonthlyClosing = {
        id: monthKey,
        monthKey,
        daysClosedCount: b.daysClosedCount,
        ordersCount: b.ordersCount,
        netSales: Number(b.netSales.toFixed(2)),
        cashSales: Number(b.cashSales.toFixed(2)),
        instapaySales: Number(b.instapaySales.toFixed(2)),
        cardSales: Number(b.cardSales.toFixed(2)),
        totalExpenses: Number(b.totalExpenses.toFixed(2)),
        fixedExpenses: Number(b.fixedExpenses.toFixed(2)),
        netProfit: Number(b.netProfit.toFixed(2)),
        topProductName: b.topProductName,
        topProductQty: b.topProductQty,
        notes: b.notes,
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
      auditLog('monthly_closing_saved', req, { monthKey, netProfit: closing.netProfit });
      res.json({ monthlyClosing: closing });
    })
  );

  // Upload Compressed Menu Item Image (Admin Only + Dedicated Rate Limit + Magic Bytes Verification)
  app.post(
    '/api/admin/uploads',
    requireAdmin,
    uploadRateLimit,
    asyncHandler(async (req: Request, res: Response) => {
      const schemaResult = uploadImageSchema.safeParse(req.body);
      if (!schemaResult.success) {
        res.status(400).json({ error: formatZodError(schemaResult.error) });
        return;
      }

      const parsed = parseAndValidateImageDataUrl(schemaResult.data.dataUrl);
      if ('error' in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const imageUrl = await saveUploadedImage(parsed.mimeType, parsed.buffer);
      auditLog('image_uploaded', req, {
        mimeType: parsed.mimeType,
        sizeBytes: parsed.buffer.length,
        imageUrl,
      });
      res.status(201).json({ imageUrl });
    })
  );

  // Menu CRUD
  app.post(
    '/api/admin/menu/seed',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
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
      auditLog('menu_seeded', req, { count: menuItems.length });
      res.json({ menuItems });
    })
  );

  app.post(
    '/api/admin/menu',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = createMenuItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: formatZodError(parsed.error) });
        return;
      }

      const b = parsed.data;
      const item: MenuItem = {
        id: `item_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        name: b.name,
        nameEn: b.nameEn,
        category: b.category,
        description: b.description,
        price: Number(b.price.toFixed(2)),
        size: b.size || 'حجم قياسي',
        imageUrl: sanitizeImageUrl(b.imageUrl, b.category),
        isAvailable: b.isAvailable,
        isFeatured: b.isFeatured,
        sortOrder: b.sortOrder,
        createdBy: 'admin',
      };

      await withDbLock(async () => {
        const db = await loadDatabase();
        db.menuItems.push(item);
        await saveDatabase(db);
      });
      auditLog('menu_item_created', req, {
        itemId: item.id,
        name: item.name,
        price: item.price,
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

      const parsed = updateMenuItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: formatZodError(parsed.error) });
        return;
      }

      const b = parsed.data;
      const updated = await withDbLock(async () => {
        const db = await loadDatabase();
        const idx = db.menuItems.findIndex((i) => i.id === id);
        if (idx === -1) return null;

        const existing = db.menuItems[idx];
        const nextCategory = b.category ?? existing.category;

        const nextItem: MenuItem = {
          ...existing,
          name: b.name ?? existing.name,
          nameEn: b.nameEn ?? existing.nameEn,
          category: nextCategory,
          description: b.description ?? existing.description,
          price: b.price !== undefined ? Number(b.price.toFixed(2)) : existing.price,
          size: b.size ?? existing.size,
          imageUrl:
            b.imageUrl !== undefined
              ? sanitizeImageUrl(b.imageUrl, nextCategory)
              : existing.imageUrl,
          isAvailable: b.isAvailable ?? existing.isAvailable,
          isFeatured: b.isFeatured ?? existing.isFeatured,
          sortOrder: b.sortOrder ?? existing.sortOrder,
        };

        db.menuItems[idx] = nextItem;
        await saveDatabase(db);
        const replacedImageUrl =
          existing.imageUrl !== nextItem.imageUrl &&
          existing.imageUrl.startsWith(UPLOAD_IMAGE_URL_PREFIX) &&
          !db.menuItems.some((i) => i.imageUrl === existing.imageUrl)
            ? existing.imageUrl
            : null;
        return {
          item: nextItem,
          previousPrice: existing.price,
          replacedImageUrl,
        };
      });

      if (!updated) {
        res.status(404).json({ error: 'الصنف غير موجود.' });
        return;
      }
      if (updated.replacedImageUrl) {
        void deleteUploadedImage(updated.replacedImageUrl);
      }
      auditLog('menu_item_updated', req, {
        itemId: id,
        name: updated.item.name,
        previousPrice: updated.previousPrice,
        newPrice: updated.item.price,
      });
      res.json({ item: updated.item });
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
      const deleted = await withDbLock(async () => {
        const db = await loadDatabase();
        const removed = db.menuItems.find((i) => i.id === id);
        db.menuItems = db.menuItems.filter((i) => i.id !== id);
        await saveDatabase(db);
        const orphanImageUrl =
          removed &&
          removed.imageUrl.startsWith(UPLOAD_IMAGE_URL_PREFIX) &&
          !db.menuItems.some((i) => i.imageUrl === removed.imageUrl)
            ? removed.imageUrl
            : null;
        return { name: removed?.name ?? null, orphanImageUrl };
      });
      if (deleted.orphanImageUrl) {
        void deleteUploadedImage(deleted.orphanImageUrl);
      }
      auditLog('menu_item_deleted', req, { itemId: id, name: deleted.name });
      res.json({ ok: true });
    })
  );

  // Update Store Settings
  app.put(
    '/api/admin/settings',
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = updateStoreSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: formatZodError(parsed.error) });
        return;
      }

      const b = parsed.data;
      const storeSettings = await withDbLock(async () => {
        const db = await loadDatabase();
        db.storeSettings = {
          storeName: b.storeName,
          tagline: b.tagline,
          phone: b.phone,
          whatsapp: b.whatsapp,
          address: b.address,
          workingHours: b.workingHours,
          currency: b.currency || 'ج.م',
          isPublic: true,
        };
        await saveDatabase(db);
        return db.storeSettings;
      });
      auditLog('store_settings_updated', req, { storeName: storeSettings.storeName });
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
        res.setHeader('Retry-After', String(limit.retryAfterSeconds));
        res.status(429).json({
          error: `تم إيقاف المحاولات مؤقتاً لحماية النظام. حاول بعد ${limit.retryAfterSeconds} ثانية.`,
        });
        return;
      }

      const parsed = passwordOnlySchema.safeParse(req.body);
      if (!parsed.success) {
        recordFailedLogin(clientKey);
        await delayFailedAuth();
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });
        return;
      }

      const valid = await verifyAdminPassword(parsed.data.password);
      if (!valid) {
        recordFailedLogin(clientKey);
        auditLog('reset_test_data_failed', req);
        await delayFailedAuth();
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });
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
      auditLog('test_data_reset', req);
      res.json({ ok: true });
    })
  );

  // Global error handler — never expose internal stack traces or filesystem paths
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const maybeErr = err as { type?: string; status?: number; message?: string } | null;
    if (maybeErr?.type === 'entity.too.large' || maybeErr?.status === 413) {
      if (!res.headersSent) {
        res.status(413).json({
          error: 'حجم الطلب أو الصورة كبير جداً. الحد الأقصى المسموح به هو 1 ميجابايت.',
        });
      }
      return;
    }
    if (maybeErr?.type === 'entity.parse.failed' || maybeErr?.status === 400) {
      if (!res.headersSent) {
        res.status(400).json({ error: 'تنسيق البيانات المرسلة غير صالح.' });
      }
      return;
    }
    console.error('API Error:', {
      ts: new Date().toISOString(),
      path: req.path,
      message: err instanceof Error ? err.message : 'Unknown error',
    });
    if (res.headersSent) return;
    res.status(500).json({
      error: 'حدث خطأ أثناء حفظ أو قراءة البيانات. يرجى المحاولة مرة أخرى.',
    });
  });

  return app;
}
