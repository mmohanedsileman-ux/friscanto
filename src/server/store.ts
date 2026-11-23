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

function getKvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
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

export async function loadDatabase(): Promise<PersistedDatabase> {
  const kv = getKvConfig();
  if (kv) {
    try {
      const res = await fetch(`${kv.url}/get/${encodeURIComponent(KV_KEY)}`, {
        headers: { Authorization: `Bearer ${kv.token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { result?: string | null };
        if (json?.result) {
          const parsed = JSON.parse(json.result) as Partial<PersistedDatabase>;
          memoryCache = normalizeDb(parsed);
          return memoryCache;
        }
      }
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
  memoryCache = db;
  const serialized = JSON.stringify(db, null, 2);

  const kv = getKvConfig();
  if (kv) {
    try {
      await fetch(`${kv.url}/set/${encodeURIComponent(KV_KEY)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kv.token}`,
          'Content-Type': 'application/json',
        },
        body: serialized,
      });
    } catch (err) {
      console.error('KV write failed:', err);
    }
  }

  try {
    const targetPath = resolveWritableFilePath();
    const tmpPath = `${targetPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, serialized, 'utf8');
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    console.error('File persistence warning:', err);
  }
}
