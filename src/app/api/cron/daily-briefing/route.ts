import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTeamsDailyBriefing, type ClientBriefingRow } from '@/lib/teams';

// Vercel Cron invokes this with the Authorization header set to CRON_SECRET.
function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // allow locally if not configured
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env vars not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: clients, error: clientErr } = await supabase
    .from('clients')
    .select('id, name');

  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });

  const clientIds = (clients ?? []).map(c => c.id);
  if (clientIds.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: 'no clients' });
  }

  const { data: healthRows } = await supabase
    .from('client_health_status')
    .select('client_id, status, total_overdue_tasks, mtd_actual_spend, budget_health_percentage')
    .in('client_id', clientIds);

  const healthMap = new Map<string, typeof healthRows extends (infer T)[] | null ? T : never>();
  for (const row of healthRows ?? []) {
    healthMap.set(row.client_id, row);
  }

  const briefingRows: ClientBriefingRow[] = (clients ?? []).map(c => {
    const h = healthMap.get(c.id);
    return {
      name: c.name,
      status: h?.status ?? null,
      overdue_tasks: h?.total_overdue_tasks ?? 0,
      mtd_spend: h?.mtd_actual_spend ?? null,
      budget_health_pct: h?.budget_health_percentage ?? null,
    };
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  await sendTeamsDailyBriefing(briefingRows, appUrl);

  return NextResponse.json({ ok: true, sent: true, clients: briefingRows.length });
}
