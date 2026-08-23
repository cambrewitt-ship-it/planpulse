import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const limiters = new Map<string, Ratelimit>();

function getLimiter(prefix: string, limit: number, windowSeconds: number): Ratelimit | null {
  if (!redis) return null;
  const key = `${prefix}:${limit}:${windowSeconds}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      prefix: `ratelimit:${prefix}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
}

// Returns a 429 response if the caller has exceeded `limit` requests per
// `windowSeconds`, scoped per-IP under `prefix`. Returns null to let the
// request proceed. No-ops (never blocks) if Upstash env vars aren't set.
export async function rateLimit(
  req: NextRequest,
  prefix: string,
  limit: number,
  windowSeconds: number
): Promise<NextResponse | null> {
  const limiter = getLimiter(prefix, limit, windowSeconds);
  if (!limiter) return null;

  const { success } = await limiter.limit(clientIp(req));
  if (!success) {
    return NextResponse.json({ error: 'Too many requests — please slow down' }, { status: 429 });
  }
  return null;
}
