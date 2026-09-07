import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTeamsAlert } from '@/lib/teams';

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

interface ClientSnapshot {
  spend_variance_pct: number | null;
  overdue_tasks: number;
  critical_findings: number;
}

type AlertSnapshot = Record<string, ClientSnapshot>;

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const { data: integrations, error: intErr } = await supabase
    .from('user_integrations')
    .select('user_id, teams_webhook_url, alert_snapshot')
    .eq('anomaly_alerts_enabled', true)
    .not('teams_webhook_url', 'is', null);

  if (intErr) return NextResponse.json({ error: intErr.message }, { status: 500 });
  if (!integrations?.length) {
    return NextResponse.json({ ok: true, checked: 0 });
  }

  let alertsSent = 0;

  for (const integration of integrations) {
    const { user_id, teams_webhook_url, alert_snapshot } = integration;
    if (!teams_webhook_url) continue;

    const previousSnapshot: AlertSnapshot = (alert_snapshot as AlertSnapshot) ?? {};

    // Fetch current client states
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', user_id);

    if (!clients?.length) continue;

    const clientIds = clients.map((c: { id: string }) => c.id);

    const { data: spendCacheRows } = await supabase
      .from('client_spend_cache')
      .select('client_id, total_overdue_tasks, budget_pacing_percentage')
      .in('client_id', clientIds);

    // Open critical Setup Auditor findings per client — one of the signals
    // that replaced the old red/amber/green status as a real "this needs
    // attention" trigger.
    const { data: findingRows } = await supabase
      .from('campaign_audit_findings')
      .select('client_id, severity')
      .in('client_id', clientIds)
      .eq('status', 'open');

    const criticalFindingsByClient = new Map<string, number>();
    for (const f of findingRows ?? []) {
      if (f.severity !== 'critical') continue;
      criticalFindingsByClient.set(f.client_id, (criticalFindingsByClient.get(f.client_id) ?? 0) + 1);
    }

    const clientMap = new Map(clients.map((c: { id: string; name: string }) => [c.id, c.name]));
    const newSnapshot: AlertSnapshot = {};
    const anomalies: Array<{ clientName: string; clientId: string; reasons: string[] }> = [];

    for (const row of spendCacheRows ?? []) {
      const clientName = clientMap.get(row.client_id) ?? 'Unknown';
      const prev = previousSnapshot[row.client_id];
      const criticalFindings = criticalFindingsByClient.get(row.client_id) ?? 0;

      // Derive spend variance from budget_pacing_percentage (actual/planned * 100)
      // budget_pacing_pct = 100 means perfect pacing; deviation gives variance
      const spendVariancePct = row.budget_pacing_percentage != null
        ? row.budget_pacing_percentage - 100
        : null;

      newSnapshot[row.client_id] = {
        spend_variance_pct: spendVariancePct,
        overdue_tasks: row.total_overdue_tasks ?? 0,
        critical_findings: criticalFindings,
      };

      const reasons: string[] = [];

      // Alert if spend crossed ±30% for the first time
      if (spendVariancePct !== null && prev?.spend_variance_pct !== undefined) {
        const prevV = prev.spend_variance_pct ?? 0;
        if (spendVariancePct > 30 && prevV <= 30) {
          reasons.push(`Spend overpacing: +${spendVariancePct.toFixed(0)}%`);
        }
        if (spendVariancePct < -30 && prevV >= -30) {
          reasons.push(`Spend underpacing: ${spendVariancePct.toFixed(0)}%`);
        }
      }

      // Alert if overdue tasks increased — call out specifically when it
      // crosses into "2+ overdue" territory (this used to be the task leg
      // of turning red), otherwise just report the delta.
      const prevOverdue = prev?.overdue_tasks ?? 0;
      const newOverdue = row.total_overdue_tasks ?? 0;
      if (newOverdue > prevOverdue) {
        if (newOverdue >= 2 && prevOverdue < 2) {
          reasons.push(`Overdue tasks reached ${newOverdue}`);
        } else {
          const delta = newOverdue - prevOverdue;
          reasons.push(`${delta} new overdue task${delta !== 1 ? 's' : ''} (${newOverdue} total)`);
        }
      }

      // Alert if a new open critical Setup Auditor finding appeared
      const prevCritical = prev?.critical_findings ?? 0;
      if (criticalFindings > prevCritical) {
        reasons.push(`${criticalFindings} unresolved Setup Auditor finding${criticalFindings !== 1 ? 's' : ''} (critical)`);
      }

      if (reasons.length > 0) {
        anomalies.push({ clientName, clientId: row.client_id, reasons });
      }
    }

    // Send individual alerts per client (max 5 to avoid flooding)
    for (const anomaly of anomalies.slice(0, 5)) {
      await sendTeamsAlert({
        title: `⚠️ ${anomaly.clientName}`,
        text: anomaly.reasons.join('\n'),
        color: 'D13438',
        actionUrl: `${appUrl}/clients/${anomaly.clientId}/dashboard`,
        actionLabel: 'Open Client',
        webhookUrl: teams_webhook_url,
      });
      alertsSent++;
    }

    // Update snapshot regardless of whether alerts were sent
    await supabase
      .from('user_integrations')
      .update({
        alert_snapshot: newSnapshot,
        alert_snapshot_updated_at: new Date().toISOString(),
      })
      .eq('user_id', user_id);
  }

  return NextResponse.json({ ok: true, checked: integrations.length, alerts_sent: alertsSent });
}
