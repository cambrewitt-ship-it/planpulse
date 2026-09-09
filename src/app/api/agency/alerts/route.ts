// src/app/api/agency/alerts/route.ts
// Agency-wide alerts: channels that have stopped spending, channels pacing
// more than ±10% off their to-date planned budget, and open Setup Auditor /
// Health Check Agent findings — aggregated across every client the logged-in
// user owns, for the /agency page's Alerts panel.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { nzToday, nzStartOfMonth } from '@/lib/timezone';
import { buildActualByClientPlatform, computeChannelPacing } from '@/lib/media-plan/pacing';

const PACING_THRESHOLD_PCT = 10;

export type AgencyAlertType = 'not_spending' | 'pacing' | 'finding';
export type AgencyAlertSeverity = 'critical' | 'warning';

export interface AgencyAlert {
  id: string;
  type: AgencyAlertType;
  severity: AgencyAlertSeverity;
  clientId: string;
  clientName: string;
  channelLabel: string;
  message: string;
  detail: string | null;
  variancePct?: number;
  ruleKey?: string;
}

const SEVERITY_RANK: Record<AgencyAlertSeverity, number> = { critical: 0, warning: 1 };

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: clientsData } = await supabase
    .from('clients')
    .select('id, name')
    .eq('user_id', session.user.id);

  const clients = clientsData || [];
  if (clients.length === 0) return NextResponse.json({ alerts: [] });

  const clientIds = clients.map(c => c.id);
  const clientMap = new Map(clients.map(c => [c.id, c.name]));

  const today = nzToday();
  const startDate = nzStartOfMonth();
  const endDate = today;

  const [{ data: mediaPlans }, { data: metricsRows }] = await Promise.all([
    supabase
      .from('client_media_plan_builder')
      .select('client_id, channels')
      .in('client_id', clientIds),
    supabase
      .from('ad_performance_metrics')
      .select('client_id, platform, spend, impressions, clicks, conversions, reach, cpc, cpm, date, meta_actions')
      .eq('user_id', session.user.id)
      .in('client_id', clientIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .not('campaign_id', 'like', 'manual-override-%'),
  ]);

  const actualByClientPlatform = buildActualByClientPlatform(metricsRows);
  const pacingGroups = computeChannelPacing(mediaPlans || [], actualByClientPlatform, clientMap, { startDate, endDate, today });

  const alerts: AgencyAlert[] = [];

  for (const group of pacingGroups) {
    // channelNameToPlatform only resolves recognized digital ad platforms
    // (Google/Meta/LinkedIn/TikTok) — a group with platform 'unknown' is a
    // non-digital channel (Radio, Print, OOH, ...) that was never wired to
    // ad_performance_metrics, so "not spending" wouldn't be a meaningful signal.
    const isDigital = group.platform !== 'unknown';
    const channelLabel = group.line_items.length > 1
      ? group.line_items.map(li => li.name).join(' + ')
      : group.line_items[0]?.name ?? group.platform;
    // Computed alerts have no persisted row to resolve — "Resolved" instead
    // dismisses this id (see agency_alert_dismissals). Scoping the id to the
    // current month means a dismissal doesn't silently suppress the same
    // problem if it recurs in a future month.
    const idSuffix = `${group.client_id}:${channelLabel}:${startDate}`;

    if (!isDigital) continue;

    if (group.status === 'live' && (group.planned_budget_full_period ?? 0) > 0 && group.actual_spend === 0) {
      alerts.push({
        id: `not_spending:${idSuffix}`,
        type: 'not_spending',
        severity: 'critical',
        clientId: group.client_id,
        clientName: group.client,
        channelLabel,
        message: `${channelLabel} isn't spending`,
        detail: `Planned budget of $${group.planned_budget_full_period?.toLocaleString()} this month but no recorded spend yet.`,
      });
      continue; // zero spend is already covered by "not spending" — don't also report it as pacing
    }

    if ((group.planned_budget_to_date ?? 0) > 0 && group.spend_variance_pct !== null && Math.abs(group.spend_variance_pct) > PACING_THRESHOLD_PCT) {
      const over = group.spend_variance_pct > 0;
      alerts.push({
        id: `pacing:${idSuffix}`,
        type: 'pacing',
        severity: 'warning',
        clientId: group.client_id,
        clientName: group.client,
        channelLabel,
        message: `${channelLabel} is ${over ? 'overspending' : 'underspending'} by ${Math.abs(group.spend_variance_pct).toFixed(0)}%`,
        detail: `$${group.actual_spend.toLocaleString()} spent vs $${group.planned_budget_to_date?.toLocaleString()} planned to date.`,
        variancePct: group.spend_variance_pct,
      });
    }
  }

  // campaign_audit_findings isn't in the generated database.ts types yet —
  // same cast-to-any workaround as src/app/api/setup-auditor/findings/route.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: findingRows } = await (supabase as any)
    .from('campaign_audit_findings')
    .select('*, platform_campaigns(campaign_name, platform, channel_name)')
    .in('client_id', clientIds)
    .eq('status', 'open')
    .in('severity', ['critical', 'warning'])
    .order('severity', { ascending: true })
    .order('first_detected_at', { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const finding of (findingRows ?? []) as any[]) {
    const campaign = finding.platform_campaigns;
    const channelLabel = campaign?.channel_name || campaign?.campaign_name || finding.rule_key.replace(/_/g, ' ');
    alerts.push({
      id: `finding:${finding.id}`,
      type: 'finding',
      severity: finding.severity as AgencyAlertSeverity,
      clientId: finding.client_id,
      clientName: clientMap.get(finding.client_id) ?? 'Unknown',
      channelLabel,
      message: finding.rule_key.replace(/_/g, ' ') + (campaign?.campaign_name ? ` — ${campaign.campaign_name}` : ''),
      detail: finding.detail ?? null,
      ruleKey: finding.rule_key,
    });
  }

  // Computed (not_spending/pacing) alerts a user already dismissed this month
  // — findings don't need this, resolving one updates its own status='open' row.
  // agency_alert_dismissals isn't in the generated database.ts types yet —
  // same cast-to-any workaround as campaign_audit_findings above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dismissalRows } = await (supabase as any)
    .from('agency_alert_dismissals')
    .select('alert_id')
    .eq('user_id', session.user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dismissedIds = new Set((dismissalRows ?? []).map((d: any) => d.alert_id));

  const visibleAlerts = alerts.filter(a => !dismissedIds.has(a.id));

  visibleAlerts.sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDiff !== 0) return rankDiff;
    return a.clientName.localeCompare(b.clientName);
  });

  return NextResponse.json({ alerts: visibleAlerts });
}
