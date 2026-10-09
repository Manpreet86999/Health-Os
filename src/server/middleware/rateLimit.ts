import type { NextFunction, Request, Response } from 'express';

const buckets = new Map<string, { count: number; resetAt: number }>();

// Periodically clean up expired buckets to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.resetAt) {
      buckets.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

/** Simple in-memory rate limit for sensitive endpoints (email, auth). */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = (opts.key?.(req) || req.ip || 'local') + ':' + req.path;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > opts.max) {
      res.status(429).json({ error: 'Too many requests. Try again later.' });
      return;
    }
    next();
  };
}
