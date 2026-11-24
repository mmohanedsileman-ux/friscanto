import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { loadDatabase, type AdminCredentialRecord } from './store.ts';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function getSessionSecret(): Promise<string> {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const db = await loadDatabase();
  return db.sessionSecret;
}

// Bounded in-memory sliding window rate limiter for sensitive auth actions
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000;
const MAX_RATE_LIMIT_ENTRIES = 2000;

function pruneRateLimitMap(now: number): void {
  if (loginAttempts.size < MAX_RATE_LIMIT_ENTRIES) return;
  for (const [key, entry] of loginAttempts.entries()) {
    if (now > entry.resetAt) {
      loginAttempts.delete(key);
    }
  }
  if (loginAttempts.size >= MAX_RATE_LIMIT_ENTRIES) {
    const oldestKey = loginAttempts.keys().next().value;
    if (oldestKey) loginAttempts.delete(oldestKey);
  }
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
    // Compare equal-length dummy buffer to keep timing uniform
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
    // Configured process.env passcode always overrides any claimed fallback hash
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
  pruneRateLimitMap(now);
  const entry = loginAttempts.get(clientKey);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(clientKey, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearFailedLogins(clientKey: string): void {
  loginAttempts.delete(clientKey);
}

function signPayload(payloadB64: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
}

export async function createSessionToken(credentialVersion: string): Promise<string> {
  const secret = await getSessionSecret();
  const payload = {
    role: 'admin',
    v: credentialVersion,
    exp: Date.now() + TOKEN_TTL_MS,
    jti: crypto.randomBytes(8).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signPayload(encoded, secret);
  return `${encoded}.${sig}`;
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

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return false;

  const secret = await getSessionSecret();
  const expectedSig = signPayload(encoded, secret);
  if (!timingSafeCompareStrings(providedSig, expectedSig)) return false;

  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as { role?: string; v?: string; exp?: number };

    if (decoded.role !== 'admin') return false;
    if (!decoded.exp || Date.now() > decoded.exp) return false;

    const currentVersion = await getCurrentCredentialVersion();
    if (currentVersion === 'unclaimed' || decoded.v !== currentVersion) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
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
      res.status(401).json({ error: 'غير مصرح — يرجى إدخال كلمة سر الإدارة.' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
