import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  loadDatabase,
  saveDatabase,
  withDbLock,
  type AdminCredentialRecord,
} from './store.ts';

// 4-hour JWT lifetime (short-lived session window)
const TOKEN_TTL_SECONDS = 4 * 60 * 60;
const FAILED_AUTH_DELAY_MS = 500;

// Login rate limit: 5 failed attempts per 15 minutes per IP
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_RATE_LIMIT_ENTRIES = 2000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();
const generalApiHits = new Map<string, RateLimitEntry>();
const adminWriteHits = new Map<string, RateLimitEntry>();
const uploadHits = new Map<string, RateLimitEntry>();

function pruneMap(map: Map<string, RateLimitEntry>, now: number): void {
  if (map.size < MAX_RATE_LIMIT_ENTRIES) return;
  for (const [key, entry] of map.entries()) {
    if (now > entry.resetAt) {
      map.delete(key);
    }
  }
  if (map.size >= MAX_RATE_LIMIT_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
}

function consumeRateLimit(
  map: Map<string, RateLimitEntry>,
  clientKey: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  pruneMap(map, now);
  const entry = map.get(clientKey);
  if (!entry || now > entry.resetAt) {
    map.set(clientKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function createRateLimitMiddleware(
  bucket: 'general' | 'write' | 'upload',
  maxRequests: number,
  windowMs: number,
  errorMessage: string
) {
  const map =
    bucket === 'general'
      ? generalApiHits
      : bucket === 'write'
      ? adminWriteHits
      : uploadHits;

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientKey = getClientKey(req);
    const result = consumeRateLimit(map, clientKey, maxRequests, windowMs);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      res.status(429).json({
        error: `${errorMessage} حاول مجدداً بعد ${result.retryAfterSeconds} ثانية.`,
      });
      return;
    }
    next();
  };
}

export function getClientKey(req: Request): string {
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim().slice(0, 64);
  }
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
    ? forwarded.split(',')[0]
    : req.ip;
  return (first || 'unknown').trim().slice(0, 64);
}

/**
 * Structured security audit logger (records timestamp, event, IP, and safe metadata;
 * never logs passwords, hashes, or session tokens).
 */
export function auditLog(
  event: string,
  req: Request,
  details?: Record<string, string | number | boolean | null | undefined>
): void {
  const entry = {
    ts: new Date().toISOString(),
    audit: event,
    ip: getClientKey(req),
    ...(details ?? {}),
  };
  console.info(JSON.stringify(entry));
}

export async function delayFailedAuth(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, FAILED_AUTH_DELAY_MS));
}

async function getSessionSecret(): Promise<string> {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const db = await loadDatabase();
  return db.sessionSecret;
}

export function getEnvAdminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || '';
}

export function hashPassword(password: string): AdminCredentialRecord {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return {
    salt,
    hash: derived,
    updatedAt: new Date().toISOString(),
  };
}

function timingSafeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyAgainstRecord(
  password: string,
  record: AdminCredentialRecord
): boolean {
  const derived = crypto.scryptSync(password, record.salt, 64);
  const expected = Buffer.from(record.hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const envPass = getEnvAdminPassword();
  if (envPass) {
    return timingSafeCompareStrings(password, envPass);
  }
  const db = await loadDatabase();
  if (!db.adminCredential) return false;
  return verifyAgainstRecord(password, db.adminCredential);
}

export function checkLoginRateLimit(clientKey: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const entry = loginAttempts.get(clientKey);
  if (!entry || now > entry.resetAt) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordFailedLogin(clientKey: string): void {
  const now = Date.now();
  pruneMap(loginAttempts, now);
  const entry = loginAttempts.get(clientKey);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(clientKey, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearFailedLogins(clientKey: string): void {
  loginAttempts.delete(clientKey);
}

interface JwtHeader {
  alg: 'HS256';
  typ: 'JWT';
}

interface JwtPayload {
  sub: 'admin';
  role: 'admin';
  v: string;
  iat: number;
  exp: number;
  jti: string;
}

function signJwtInput(signingInput: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');
}

export async function createSessionToken(credentialVersion: string): Promise<string> {
  const secret = await getSessionSecret();
  const nowSec = Math.floor(Date.now() / 1000);
  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
  const payload: JwtPayload = {
    sub: 'admin',
    role: 'admin',
    v: credentialVersion,
    iat: nowSec,
    exp: nowSec + TOKEN_TTL_SECONDS,
    jti: crypto.randomBytes(12).toString('hex'),
  };
  const headerB64 = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = signJwtInput(signingInput, secret);
  return `${signingInput}.${sig}`;
}

export async function getCurrentCredentialVersion(): Promise<string> {
  const envPass = getEnvAdminPassword();
  if (envPass) {
    return crypto
      .createHash('sha256')
      .update(`env:${envPass}`)
      .digest('hex')
      .slice(0, 16);
  }
  const db = await loadDatabase();
  if (db.adminCredential) {
    return db.adminCredential.hash.slice(0, 16);
  }
  return 'unclaimed';
}

async function decodeAndVerifyJwt(token: string | undefined): Promise<JwtPayload | null> {
  if (!token || typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, providedSig] = parts;
  if (!headerB64 || !payloadB64 || !providedSig) return null;

  const secret = await getSessionSecret();
  const expectedSig = signJwtInput(`${headerB64}.${payloadB64}`, secret);
  if (!timingSafeCompareStrings(providedSig, expectedSig)) return null;

  try {
    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString('utf8')
    ) as Partial<JwtHeader>;
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

    const decoded = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as Partial<JwtPayload>;

    if (decoded.sub !== 'admin' || decoded.role !== 'admin') return null;
    if (typeof decoded.jti !== 'string' || decoded.jti.length < 8) return null;
    if (typeof decoded.exp !== 'number' || typeof decoded.iat !== 'number') return null;

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= decoded.exp || decoded.iat > nowSec + 60) return null;

    const currentVersion = await getCurrentCredentialVersion();
    if (currentVersion === 'unclaimed' || decoded.v !== currentVersion) {
      return null;
    }

    const db = await loadDatabase();
    if (db.revokedTokens.some((r) => r.jti === decoded.jti)) {
      return null;
    }

    return decoded as JwtPayload;
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  const payload = await decodeAndVerifyJwt(token);
  return payload !== null;
}

export async function revokeSessionToken(token: string | undefined): Promise<boolean> {
  const payload = await decodeAndVerifyJwt(token);
  if (!payload) return false;

  const expMs = payload.exp * 1000;
  await withDbLock(async () => {
    const db = await loadDatabase();
    const now = Date.now();
    db.revokedTokens = db.revokedTokens.filter((r) => r.exp > now && r.jti !== payload.jti);
    db.revokedTokens.push({ jti: payload.jti, exp: expMs });
    if (db.revokedTokens.length > 200) {
      db.revokedTokens = db.revokedTokens.slice(-200);
    }
    await saveDatabase(db);
  });
  return true;
}

export function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
  return authHeader.slice(7).trim();
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req);
    const valid = await verifySessionToken(token);
    if (!valid) {
      res.status(401).json({ error: 'غير مصرح — يرجى تسجيل الدخول للوحة الإدارة.' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
