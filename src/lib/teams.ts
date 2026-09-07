import { formatNZWeekdayDate } from '@/lib/timezone';

type Fact = { name: string; value: string };

interface AlertOptions {
  title: string;
  text: string;
  color?: string;
  facts?: Fact[];
  actionUrl?: string;
  actionLabel?: string;
  webhookUrl?: string;
}

async function post(payload: object, webhookUrl?: string): Promise<void> {
  const url = webhookUrl ?? process.env.TEAMS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[teams] failed to send notification:', err);
  }
}

export async function sendTeamsAlert({ title, text, color = '0078D4', facts, actionUrl, actionLabel, webhookUrl }: AlertOptions): Promise<void> {
  const section: Record<string, unknown> = { activityTitle: `**${title}**`, activityText: text };
  if (facts?.length) section.facts = facts;

  const payload: Record<string, unknown> = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: color,
    summary: title,
    sections: [section],
  };

  if (actionUrl) {
    payload.potentialAction = [{ '@type': 'OpenUri', name: actionLabel ?? 'Open', targets: [{ os: 'default', uri: actionUrl }] }];
  }

  await post(payload, webhookUrl);
}

export interface ClientBriefingRow {
  name: string;
  overdue_tasks: number;
  mtd_spend: number | null;
  budget_pacing_pct: number | null;
}

// A client "needs attention" if it has 2+ overdue tasks, or its spend pacing
// is more than 15% off plan — the same pacing threshold used elsewhere in
// the app (chat system prompt's channel-pacing rule, toolGetChannelPerformance).
function needsAttentionReasons(c: ClientBriefingRow): string[] {
  const reasons: string[] = [];
  if (c.overdue_tasks >= 2) reasons.push(`${c.overdue_tasks} overdue tasks`);
  if (c.budget_pacing_pct != null && Math.abs(c.budget_pacing_pct - 100) > 15) {
    reasons.push(`Budget pacing ${c.budget_pacing_pct.toFixed(0)}% of plan`);
  }
  return reasons;
}

export async function sendTeamsDailyBriefing(clients: ClientBriefingRow[], appUrl?: string, webhookUrl?: string): Promise<void> {
  const totalOverdue = clients.reduce((sum, c) => sum + (c.overdue_tasks ?? 0), 0);

  const atRisk = clients
    .map(c => ({ client: c, reasons: needsAttentionReasons(c) }))
    .filter(r => r.reasons.length > 0)
    .slice(0, 5)
    .map(r => ({ name: r.client.name, value: r.reasons.join(' · ') }));

  const sections: object[] = [
    {
      activityTitle: `**Agency Daily Briefing — ${formatNZWeekdayDate(new Date())}**`,
      activityText: `${clients.length} active clients · ${totalOverdue} overdue task${totalOverdue !== 1 ? 's' : ''}`,
    },
  ];

  if (atRisk.length > 0) {
    sections.push({
      activityTitle: '**Clients needing attention**',
      facts: atRisk,
    });
  }

  const payload: Record<string, unknown> = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: atRisk.length > 0 ? 'F7630C' : '0078D4',
    summary: 'Agency Daily Briefing',
    sections,
  };

  if (appUrl) {
    payload.potentialAction = [{ '@type': 'OpenUri', name: 'Open Dashboard', targets: [{ os: 'default', uri: appUrl }] }];
  }

  await post(payload, webhookUrl);
}
