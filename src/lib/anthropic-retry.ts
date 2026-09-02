import Anthropic from '@anthropic-ai/sdk';

// Anthropic streaming requests return 200 immediately, so a mid-stream
// overload/rate-limit shows up as an in-band SSE `error` event rather than
// a failed HTTP response — the SDK's own retry logic never sees it. These
// helpers give callers a way to retry that case and to avoid ever forwarding
// the raw `{"type":"error",...}` API payload to the client.
const RETRYABLE_TYPES = new Set(['overloaded_error', 'rate_limit_error']);
const RETRY_DELAYS_MS = [800, 2000, 4000];

export function isRetryableAnthropicError(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  if (err.type && RETRYABLE_TYPES.has(err.type)) return true;
  if (typeof err.status === 'number' && (err.status === 429 || err.status >= 500)) return true;
  return false;
}

export function friendlyAnthropicErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    if (err.type === 'overloaded_error' || err.status === 529) {
      return "Claude is experiencing high demand right now. Please try again in a moment.";
    }
    if (err.type === 'rate_limit_error' || err.status === 429) {
      return "We've hit a rate limit talking to the AI service. Please try again shortly.";
    }
    return 'Something went wrong generating a response. Please try again.';
  }
  return (err as { message?: string } | undefined)?.message ?? 'Something went wrong. Please try again.';
}

/**
 * Runs `attempt` and retries with backoff on retryable Anthropic errors
 * (overload/rate-limit/5xx). Pass `canRetry` when `attempt` may have already
 * streamed partial output to the client (e.g. live text deltas) — return
 * false once anything has been sent, so a retry never duplicates output.
 */
export async function withAnthropicOverloadRetry<T>(
  attempt: () => Promise<T>,
  opts: { maxRetries?: number; canRetry?: () => boolean } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? RETRY_DELAYS_MS.length;
  let lastErr: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableAnthropicError(err) && (opts.canRetry ? opts.canRetry() : true);
      if (i >= maxRetries || !retryable) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[Math.min(i, RETRY_DELAYS_MS.length - 1)]));
    }
  }
  throw lastErr;
}
