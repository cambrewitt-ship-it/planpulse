import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

function getMonthsInRange(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  const [sy, sm] = startDate.split('-').map(Number);
  const [ey, em] = endDate.split('-').map(Number);
  let y = sy; let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 13) { m = 1; y++; }
  }
  return months;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const start_date = url.searchParams.get('start_date');
  const end_date = url.searchParams.get('end_date');
  const sectionsParam = url.searchParams.get('sections') ?? 'summary,spend,channels,actions';
  const sections = sectionsParam.split(',').map(s => s.trim());

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  const { data: clientRaw } = await (supabase as any)
    .from('clients')
    .select('id, name, logo_url, account_manager')
    .eq('id', clientId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  const client = clientRaw as { id: string; name: string; logo_url: string | null; account_manager: string | null } | null;
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const [healthRes, metricsRes, mediaPlanRes, actionPointsRes, completionsRes] = await Promise.all([
    supabase.from('client_health_status')
      .select('status, total_overdue_tasks, budget_health_percentage, mtd_actual_spend')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase.from('ad_performance_metrics')
      .select('platform, spend, impressions, clicks, ctr, conversions, cpc, cpm')
      .eq('client_id', clientId)
      .gte('date', start_date)
      .lte('date', end_date)
      .not('campaign_id', 'like', 'manual-override-%'),
    supabase.from('client_media_plan_builder')
      .select('channels, commission')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase.from('action_points')
      .select('id, text, channel_type, category, due_date'),
    supabase.from('client_action_point_completions')
      .select('action_point_id, completed, completed_at')
      .eq('client_id', clientId)
      .eq('completed', true),
  ]);

  const health = healthRes.data;
  const metrics = metricsRes.data ?? [];
  const mediaPlan = mediaPlanRes.data;
  const allAps = actionPointsRes.data ?? [];
  const completedIds = new Set((completionsRes.data ?? []).map((c: any) => c.action_point_id));
  const commission = mediaPlan?.commission ?? 0;

  // ── Spend data ─────────────────────────────────────────────────────────────
  const platformLabels: Record<string, string> = {
    'meta-ads': 'Meta Ads', 'google-ads': 'Google Ads',
    'linkedin-ads': 'LinkedIn Ads', 'tiktok-ads': 'TikTok Ads',
  };

  const actualByPlatform = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();
  for (const m of metrics) {
    const existing = actualByPlatform.get(m.platform) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    existing.spend += Number(m.spend || 0);
    existing.impressions += Number(m.impressions || 0);
    existing.clicks += Number(m.clicks || 0);
    existing.conversions += Number(m.conversions || 0);
    actualByPlatform.set(m.platform, existing);
  }

  const monthsInRange = getMonthsInRange(start_date, end_date);
  const rawChannels: any[] = (mediaPlan?.channels as any[]) ?? [];
  const plannedByChannel = new Map<string, number>();
  for (const ch of rawChannels) {
    let total = 0;
    for (const f of ch.flights ?? []) {
      if (f.monthlySpend) {
        for (const m of monthsInRange) {
          total += Number(f.monthlySpend[m] ?? f.monthlySpend[`${parseInt(m.split('-')[0])}-${parseInt(m.split('-')[1])}`] ?? 0);
        }
      }
    }
    if (total > 0) plannedByChannel.set(ch.channelName, total);
  }

  // Build per-channel spend rows combining planned + actual
  const channelNames = new Set([
    ...Array.from(actualByPlatform.keys()).map(p => platformLabels[p] ?? p),
    ...Array.from(plannedByChannel.keys()),
  ]);

  const spendChannels = Array.from(channelNames).map(name => {
    // Try to match actual by platform label
    const platformKey = Object.entries(platformLabels).find(([, v]) => v === name)?.[0];
    const actual = platformKey ? (actualByPlatform.get(platformKey)?.spend ?? 0) : 0;
    const planned = plannedByChannel.get(name) ?? 0;
    const variance_pct = planned > 0 ? Math.round(((actual - planned) / planned) * 1000) / 10 : null;
    const perf = platformKey ? actualByPlatform.get(platformKey) : null;
    const impressions = perf?.impressions ?? null;
    const clicks = perf?.clicks ?? null;
    const conversions = perf?.conversions ?? null;
    const ctr = impressions && impressions > 0 && clicks ? Math.round((clicks / impressions) * 10000) / 100 : null;
    const cpc = clicks && clicks > 0 ? Math.round((actual / clicks) * 100) / 100 : null;
    const pacing_status = variance_pct === null ? 'no plan'
      : variance_pct > 15 ? 'overpacing'
      : variance_pct < -15 ? 'underpacing'
      : 'on track';
    return { name, platform: platformKey ?? 'unknown', planned: planned || null, actual, variance_pct, pacing_status, impressions, clicks, ctr, cpc, conversions };
  });

  // ── Action points ──────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const overdueAps = allAps.filter((ap: any) => !completedIds.has(ap.id) && ap.due_date && ap.due_date < today);
  const completedInPeriod = allAps.filter((ap: any) => completedIds.has(ap.id));
  const outstanding = allAps.filter((ap: any) => !completedIds.has(ap.id) && (!ap.due_date || ap.due_date >= today));

  // ── AI summary ────────────────────────────────────────────────────────────
  let ai_summary = '';
  if (sections.includes('summary')) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const totalActual = spendChannels.reduce((s, c) => s + c.actual, 0);
      const totalPlanned = spendChannels.reduce((s, c) => s + (c.planned ?? 0), 0);
      const prompt = `Write a 3-4 sentence executive summary for ${client.name}'s campaign performance from ${start_date} to ${end_date}.
Health: ${health?.status ?? 'unknown'}. Actual spend: $${totalActual.toLocaleString()} vs planned $${totalPlanned.toLocaleString()}.
Overdue tasks: ${overdueAps.length}. Channels: ${spendChannels.map(c => `${c.name} (${c.pacing_status})`).join(', ')}.
Be concise and professional. Max 80 tokens.`;
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{ role: 'user', content: prompt }],
      });
      ai_summary = (msg.content[0] as any).text ?? '';
    } catch {
      ai_summary = '';
    }
  }

  return NextResponse.json({
    client: { id: client.id, name: client.name, logo_url: client.logo_url, account_manager: client.account_manager },
    date_range: { start: start_date, end: end_date },
    health: {
      status: health?.status ?? 'unknown',
      budget_health_pct: health?.budget_health_percentage ?? null,
      total_overdue_tasks: health?.total_overdue_tasks ?? 0,
    },
    spend: { channels: spendChannels, commission },
    action_points: {
      completed_count: completedInPeriod.length,
      outstanding_count: outstanding.length,
      overdue_count: overdueAps.length,
      overdue_items: overdueAps.slice(0, 10).map((ap: any) => ({ text: ap.text, channel: ap.channel_type, due_date: ap.due_date })),
    },
    media_plan: {
      channels: rawChannels.map((ch: any) => ({
        name: ch.channelName,
        budget: monthsInRange.reduce((s: number, m: string) => {
          for (const f of ch.flights ?? []) {
            if (f.monthlySpend) s += Number(f.monthlySpend[m] ?? 0);
          }
          return s;
        }, 0),
        start: ch.flights?.[0]?.startWeek?.split('T')[0] ?? null,
        end: ch.flights?.[ch.flights.length - 1]?.endWeek?.split('T')[0] ?? null,
      })),
    },
    ai_summary,
  });
}
