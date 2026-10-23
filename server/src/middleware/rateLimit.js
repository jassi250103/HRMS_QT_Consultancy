import { ApiError } from '../errors.js';

/* Small in-process window: enough to slow credential stuffing without a Redis dependency. */
export function rateLimit({ windowMs = 60_000, max = 20, keyOf, message = 'Too many attempts. Wait a minute.' } = {}) {
  const hits = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  cleanup.unref();

  return (req, _res, next) => {
    const now = Date.now();
    const key = keyOf ? keyOf(req) : req.ip;
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) return next(ApiError.forbidden(message));
    return next();
  };
}
