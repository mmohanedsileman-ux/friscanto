import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  DailyClosing,
  Expense,
  MenuItem,
  MonthlyClosing,
  Order,
  StoreSettings,
} from '../types.ts';
import { DEFAULT_MENU_ITEMS, DEFAULT_STORE_SETTINGS } from '../data/defaultMenu.ts';

export interface AdminCredentialRecord {
  salt: string;
  hash: string;
  updatedAt: string;
}

export type StorageMode = 'cloud_kv' | 'local_file' | 'tmp_ephemeral';

export interface PersistedDatabase {
  menuSeeded: boolean;
  menuItems: MenuItem[];
  orders: Order[];
  expenses: Expense[];
  dailyClosings: DailyClosing[];
  monthlyClosings: MonthlyClosing[];
  storeSettings: StoreSettings;
  adminCredential: AdminCredentialRecord | null;
  sessionSecret: string;
}

function createInitialDatabase(): PersistedDatabase {
  return {
    menuSeeded: true,
    menuItems: DEFAULT_MENU_ITEMS.map((item) => ({
      ...item,
      createdBy: 'system',
      createdAt: null,
      updatedAt: null,
    })),
    orders: [],
    expenses: [],
    dailyClosings: [],
    monthlyClosings: [],
    storeSettings: {
      ...DEFAULT_STORE_SETTINGS,
      updatedAt: null,
    },
    adminCredential: null,
    sessionSecret: crypto.randomBytes(32).toString('hex'),
  };
}

const LOCAL_DATA_DIR = path.resolve(process.cwd(), 'data');
const LOCAL_DB_PATH = path.join(LOCAL_DATA_DIR, 'frescanto-db.json');
const TMP_DB_PATH = '/tmp/frescanto-db.json';
const KV_KEY = 'frescanto:db:v1';

let memoryCache: PersistedDatabase | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Serializes mutating load-modify-save database operations within this process
 * so concurrent requests never overwrite each other's updates.
 */
export function withDbLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function getKvConfig(): { url: string; token: string } | null {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    return { url: url.replace(/\/+$/, ''), token };
  }
  return null;
}

function resolveWritableFilePath(): string {
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    fs.accessSync(LOCAL_DATA_DIR, fs.constants.W_OK);
    return LOCAL_DB_PATH;
  } catch {
    return TMP_DB_PATH;
  }
}

export function getStorageMode(): StorageMode {
  if (getKvConfig()) return 'cloud_kv';
  if (process.env.VERCEL === '1') return 'tmp_ephemeral';
  return resolveWritableFilePath() === LOCAL_DB_PATH ? 'local_file' : 'tmp_ephemeral';
}

function normalizeDb(raw: Partial<PersistedDatabase> | null | undefined): PersistedDatabase {
  const base = createInitialDatabase();
  if (!raw || typeof raw !== 'object') return base;

  return {
    menuSeeded: typeof raw.menuSeeded === 'boolean' ? raw.menuSeeded : true,
    menuItems: Array.isArray(raw.menuItems) ? raw.menuItems : base.menuItems,
    orders: Array.isArray(raw.orders) ? raw.orders : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    dailyClosings: Array.isArray(raw.dailyClosings) ? raw.dailyClosings : [],
    monthlyClosings: Array.isArray(raw.monthlyClosings) ? raw.monthlyClosings : [],
    storeSettings:
      raw.storeSettings && typeof raw.storeSettings === 'object'
        ? { ...base.storeSettings, ...raw.storeSettings }
        : base.storeSettings,
    adminCredential:
      raw.adminCredential &&
      typeof raw.adminCredential.salt === 'string' &&
      typeof raw.adminCredential.hash === 'string'
        ? raw.adminCredential
        : null,
    sessionSecret:
      typeof raw.sessionSecret === 'string' && raw.sessionSecret.length >= 32
        ? raw.sessionSecret
        : base.sessionSecret,
  };
}

async function kvCommand(
  kv: { url: string; token: string },
  command: string[]
): Promise<{ result?: string | null; error?: string }> {
  const res = await fetch(`${kv.url}/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kv.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    result?: string | null;
    error?: string;
  };

  if (!res.ok || payload.error) {
    throw new Error(payload.error || `KV HTTP ${res.status}`);
  }
  return payload;
}

export async function loadDatabase(): Promise<PersistedDatabase> {
  const kv = getKvConfig();
  if (kv) {
    try {
      const json = await kvCommand(kv, ['GET', KV_KEY]);
      if (typeof json.result === 'string' && json.result.length > 0) {
        const parsed = JSON.parse(json.result) as Partial<PersistedDatabase>;
        memoryCache = normalizeDb(parsed);
        return memoryCache;
      }
      // First-time initialization in empty cloud KV
      const initial = createInitialDatabase();
      await saveDatabase(initial);
      return initial;
    } catch (err) {
      console.error('KV read failed, falling back to local store:', err);
    }
  }

  if (memoryCache) return memoryCache;

  const candidatePaths = [LOCAL_DB_PATH, TMP_DB_PATH];
  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content) as Partial<PersistedDatabase>;
        memoryCache = normalizeDb(parsed);
        return memoryCache;
      }
    } catch {
      // Ignore corrupt/unreadable fallback file and continue
    }
  }

  memoryCache = createInitialDatabase();
  await saveDatabase(memoryCache);
  return memoryCache;
}

export async function saveDatabase(db: PersistedDatabase): Promise<void> {
  const serialized = JSON.stringify(db, null, 2);

  const kv = getKvConfig();
  if (kv) {
    // When Cloud KV is configured, persist authoritatively and fail loudly on write error
    await kvCommand(kv, ['SET', KV_KEY, serialized]);
  }

  memoryCache = db;

  try {
    const targetPath = resolveWritableFilePath();
    const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, serialized, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    if (!kv) {
      console.error('File persistence error:', err);
      throw new Error('تعذر حفظ البيانات على القرص. يرجى المحاولة مرة أخرى.');
    }
  }
}
