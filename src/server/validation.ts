import { z } from 'zod';
import { CATEGORY_ORDER, type MenuCategory } from '../types.ts';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
const SAFE_ITEM_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function cleanControlChars(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

const cleanString = (max: number, min = 0) =>
  z
    .string()
    .transform(cleanControlChars)
    .refine((v) => v.length >= min, { message: 'الحقل مطلوب.' })
    .refine((v) => v.length <= max, { message: `الحد الأقصى هو ${max} حرف.` });

const categorySchema = z.enum(CATEGORY_ORDER as [MenuCategory, ...MenuCategory[]]);

export const passwordOnlySchema = z
  .object({
    password: z.string().min(1, 'يرجى إدخال كلمة السر.').max(128),
  })
  .strict();

export const setupPasswordSchema = z
  .object({
    password: z
      .string()
      .min(4, 'يجب أن تتكون كلمة السر من 4 أحرف أو أرقام على الأقل.')
      .max(128),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'يرجى إدخال كلمة السر الحالية.').max(128),
    newPassword: z
      .string()
      .min(4, 'يجب أن تتكون كلمة السر الجديدة من 4 أحرف أو أرقام على الأقل.')
      .max(128),
  })
  .strict();

export const uploadImageSchema = z
  .object({
    dataUrl: z.string().min(20).max(1_400_000),
  })
  .strict();

export const createOrderSchema = z
  .object({
    dateKey: z.string().regex(DATE_KEY_RE, 'تاريخ الأوردر غير صالح.'),
    monthKey: z.string().regex(MONTH_KEY_RE, 'شهر الأوردر غير صالح.'),
    orderType: z.enum(['dine_in', 'takeaway', 'delivery']),
    paymentMethod: z.enum(['cash', 'instapay', 'card']),
    items: z
      .array(
        z
          .object({
            itemId: z.string().regex(SAFE_ITEM_ID_RE, 'معرّف الصنف غير صالح.'),
            name: cleanString(100, 1).optional(),
            category: categorySchema.optional(),
            unitPrice: z.number().finite().min(0).max(100000).optional(),
            quantity: z.number().int().min(1).max(200),
            lineTotal: z.number().finite().min(0).max(20000000).optional(),
          })
          .strict()
      )
      .min(1, 'يجب أن يحتوي الأوردر على صنف واحد على الأقل.')
      .max(30),
    discount: z.number().finite().min(0).max(1000000).default(0),
    customerName: cleanString(100).optional().default(''),
    notes: cleanString(300).optional().default(''),
  })
  .strict();

export const updateOrderStatusSchema = z
  .object({
    status: z.enum(['preparing', 'completed', 'cancelled']),
  })
  .strict();

export const createExpenseSchema = z
  .object({
    dateKey: z.string().regex(DATE_KEY_RE, 'تاريخ المصروف غير صالح.'),
    monthKey: z.string().regex(MONTH_KEY_RE, 'شهر المصروف غير صالح.'),
    title: cleanString(120, 1),
    category: z.enum(['fruits', 'packaging', 'utilities', 'salaries', 'rent', 'other']),
    paymentSource: z.enum(['cash_drawer', 'bank_transfer']),
    amount: z.number().finite().min(0.01).max(1000000),
    notes: cleanString(300).optional().default(''),
  })
  .strict();

export const dailyClosingSchema = z
  .object({
    ordersCount: z.number().int().min(0).max(100000),
    cancelledCount: z.number().int().min(0).max(100000),
    grossSales: z.number().finite().min(0).max(10000000),
    totalDiscounts: z.number().finite().min(0).max(10000000),
    netSales: z.number().finite().min(0).max(10000000),
    cashSales: z.number().finite().min(0).max(10000000),
    instapaySales: z.number().finite().min(0).max(10000000),
    cardSales: z.number().finite().min(0).max(10000000),
    totalExpenses: z.number().finite().min(0).max(10000000),
    cashExpenses: z.number().finite().min(0).max(10000000),
    openingCash: z.number().finite().min(0).max(10000000),
    expectedCash: z.number().finite().min(-10000000).max(10000000),
    actualCash: z.number().finite().min(0).max(10000000),
    cashVariance: z.number().finite().min(-10000000).max(10000000),
    netProfit: z.number().finite().min(-10000000).max(10000000),
    notes: cleanString(400).optional().default(''),
  })
  .strict();

export const monthlyClosingSchema = z
  .object({
    daysClosedCount: z.number().int().min(0).max(31),
    ordersCount: z.number().int().min(0).max(1000000),
    netSales: z.number().finite().min(0).max(100000000),
    cashSales: z.number().finite().min(0).max(100000000),
    instapaySales: z.number().finite().min(0).max(100000000),
    cardSales: z.number().finite().min(0).max(100000000),
    totalExpenses: z.number().finite().min(0).max(100000000),
    fixedExpenses: z.number().finite().min(0).max(100000000),
    netProfit: z.number().finite().min(-100000000).max(100000000),
    topProductName: cleanString(120).optional().default(''),
    topProductQty: z.number().int().min(0).max(1000000),
    notes: cleanString(500).optional().default(''),
  })
  .strict();

export const createMenuItemSchema = z
  .object({
    name: cleanString(100, 1),
    nameEn: cleanString(100).optional().default(''),
    category: categorySchema,
    description: cleanString(500).optional().default(''),
    price: z.number().finite().min(0).max(100000),
    size: cleanString(40).optional().default('حجم قياسي'),
    imageUrl: cleanString(500).optional().default(''),
    isAvailable: z.boolean().optional().default(true),
    isFeatured: z.boolean().optional().default(false),
    sortOrder: z.number().int().min(0).max(10000).optional().default(10),
  })
  .strict();

export const updateMenuItemSchema = z
  .object({
    name: cleanString(100, 1).optional(),
    nameEn: cleanString(100).optional(),
    category: categorySchema.optional(),
    description: cleanString(500).optional(),
    price: z.number().finite().min(0).max(100000).optional(),
    size: cleanString(40).optional(),
    imageUrl: cleanString(500).optional(),
    isAvailable: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

export const updateStoreSettingsSchema = z
  .object({
    storeName: cleanString(80, 1),
    tagline: cleanString(160).optional().default(''),
    phone: cleanString(32).optional().default(''),
    whatsapp: cleanString(32).optional().default(''),
    address: cleanString(200).optional().default(''),
    workingHours: cleanString(100).optional().default(''),
    currency: cleanString(12).optional().default('ج.م'),
  })
  .strict();

export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return 'البيانات المرسلة غير صالحة.';
  if (first.code === 'unrecognized_keys') {
    return 'الطلب يحتوي على حقول غير مسموح بها.';
  }
  return first.message || 'يرجى التحقق من صحة البيانات المدخلة.';
}
