const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Server-side check for a Cloudflare Turnstile token collected by
// <TurnstileWidget>. Login/signup get this for free via Supabase Auth's
// captchaToken option, but the public media-plan-builder AI endpoints don't
// go through Supabase Auth, so they verify directly against Cloudflare here.
// No-ops (always allows) if TURNSTILE_SECRET_KEY isn't set — same
// graceful-degradation pattern as rateLimit() and <TurnstileWidget> itself,
// so this doesn't break local dev before Turnstile is configured.
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
