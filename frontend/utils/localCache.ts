import { AuthService } from '../services/authService';

interface CacheEnvelope<T> {
  version: 1;
  cachedAt: number;
  expiresAt: number;
  value: T;
}

const CACHE_PREFIX = 'RetailCo-growth-cache:v1';

const getScopedKey = (cacheKey: string) => {
  const user = AuthService.getUserFromAccessToken();
  const scope = user?.email || user?.id || 'anonymous';
  return `${CACHE_PREFIX}:${scope}:${cacheKey}`;
};

const readEnvelope = <T>(cacheKey: string): CacheEnvelope<T> | null => {
  if (typeof window === 'undefined') return null;

  const scopedKey = getScopedKey(cacheKey);

  try {
    const raw = window.localStorage.getItem(scopedKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (
      parsed?.version !== 1 ||
      typeof parsed.cachedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number' ||
      !('value' in parsed)
    ) {
      window.localStorage.removeItem(scopedKey);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn(`Failed to read local cache for ${cacheKey}`, error);
    try {
      window.localStorage.removeItem(scopedKey);
    } catch {
      // Ignore secondary cleanup failure.
    }
    return null;
  }
};

export const getLocalCache = <T>(cacheKey: string, allowExpired: boolean = false): T | null => {
  const envelope = readEnvelope<T>(cacheKey);
  if (!envelope) return null;

  if (!allowExpired && Date.now() > envelope.expiresAt) {
    try {
      window.localStorage.removeItem(getScopedKey(cacheKey));
    } catch (error) {
      console.warn(`Failed to remove expired local cache for ${cacheKey}`, error);
    }
    return null;
  }

  return envelope.value;
};

export const setLocalCache = <T>(cacheKey: string, value: T, ttlMs: number): void => {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  const envelope: CacheEnvelope<T> = {
    version: 1,
    cachedAt: now,
    expiresAt: now + ttlMs,
    value,
  };

  try {
    window.localStorage.setItem(getScopedKey(cacheKey), JSON.stringify(envelope));
  } catch (error) {
    console.warn(`Failed to persist local cache for ${cacheKey}`, error);
  }
};

export const clearLocalCache = (cacheKey: string): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(getScopedKey(cacheKey));
  } catch (error) {
    console.warn(`Failed to clear local cache for ${cacheKey}`, error);
  }
};
