import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // user_integrations is a new table — cast to any until types are regenerated
  const { data, error } = await (supabase as any)
    .from('user_integrations')
    .select('teams_webhook_url, teams_bot_hmac_secret, daily_briefing_enabled, anomaly_alerts_enabled')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) return NextResponse.json({ integration: null });

  return NextResponse.json({
    integration: {
      teams_webhook_url: data.teams_webhook_url,
      // Only return last 4 chars of the secret so the UI can show it's saved
      teams_bot_hmac_secret: data.teams_bot_hmac_secret
        ? `••••${data.teams_bot_hmac_secret.slice(-4)}`
        : null,
      daily_briefing_enabled: data.daily_briefing_enabled,
      anomaly_alerts_enabled: data.anomaly_alerts_enabled,
    },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    teams_webhook_url,
    teams_bot_hmac_secret,
    daily_briefing_enabled,
    anomaly_alerts_enabled,
  } = body;

  const payload: Record<string, unknown> = {
    user_id: session.user.id,
    daily_briefing_enabled: Boolean(daily_briefing_enabled),
    anomaly_alerts_enabled: Boolean(anomaly_alerts_enabled),
    updated_at: new Date().toISOString(),
  };

  if (teams_webhook_url !== undefined) payload.teams_webhook_url = teams_webhook_url || null;

  // Only update the secret if a new value was provided (not the masked placeholder)
  if (teams_bot_hmac_secret && !teams_bot_hmac_secret.startsWith('••••')) {
    payload.teams_bot_hmac_secret = teams_bot_hmac_secret;
  }

  const { error } = await (supabase as any)
    .from('user_integrations')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
