import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTeamsDailyBriefing, type ClientBriefingRow } from '@/lib/teams';
import { nzHour, nzDayOfWeek } from '@/lib/timezone';

// Sent weekdays at 8am NZ time. Vercel cron only runs on a fixed UTC schedule
// (see vercel.json — this route fires every hour), so the actual "is it time
// yet" decision happens here against NZ wall-clock time, keeping it correct
// across the NZDT/NZST daylight-saving transitions instead of drifting an
// hour twice a year.
const TARGET_NZ_HOUR = 8;

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const weekday = nzDayOfWeek(now); // 0 = Sun .. 6 = Sat
  if (nzHour(now) !== TARGET_NZ_HOUR || weekday === 0 || weekday === 6) {
    return NextResponse.json({ ok: true, sent: 0, skipped: true, reason: 'not 8am NZ time on a weekday' });
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env vars not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Find all users who have the daily briefing enabled
  const { data: integrations, error: intErr } = await supabase
    .from('user_integrations')
    .select('user_id, teams_webhook_url')
    .eq('daily_briefing_enabled', true)
    .not('teams_webhook_url', 'is', null);

  if (intErr) return NextResponse.json({ error: intErr.message }, { status: 500 });
  if (!integrations?.length) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'no users with daily briefing enabled' });
  }

  let sent = 0;

  for (const integration of integrations) {
    const { user_id, teams_webhook_url } = integration;
    if (!teams_webhook_url) continue;

    // Fetch this user's clients
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', user_id);

    if (!clients?.length) continue;

    const clientIds = clients.map((c: { id: string }) => c.id);

    const { data: healthRows } = await supabase
      .from('client_health_status')
      .select('client_id, status, total_overdue_tasks, mtd_actual_spend, budget_health_percentage')
      .in('client_id', clientIds);

    const healthMap = new Map<string, typeof healthRows extends (infer T)[] | null ? T : never>();
    for (const row of healthRows ?? []) {
      healthMap.set(row.client_id, row);
    }

    const briefingRows: ClientBriefingRow[] = clients.map((c: { id: string; name: string }) => {
      const h = healthMap.get(c.id);
      return {
        name: c.name,
        status: h?.status ?? null,
        overdue_tasks: h?.total_overdue_tasks ?? 0,
        mtd_spend: h?.mtd_actual_spend ?? null,
        budget_health_pct: h?.budget_health_percentage ?? null,
      };
    });

    await sendTeamsDailyBriefing(briefingRows, appUrl, teams_webhook_url);
    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
