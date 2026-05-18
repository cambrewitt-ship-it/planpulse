const WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;

type Fact = { name: string; value: string };

interface AlertOptions {
  title: string;
  text: string;
  color?: string;
  facts?: Fact[];
  actionUrl?: string;
  actionLabel?: string;
}

async function post(payload: object): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[teams] failed to send notification:', err);
  }
}

export async function sendTeamsAlert({ title, text, color = '0078D4', facts, actionUrl, actionLabel }: AlertOptions): Promise<void> {
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

  await post(payload);
}

export interface ClientBriefingRow {
  name: string;
  status: 'green' | 'amber' | 'red' | null;
  overdue_tasks: number;
  mtd_spend: number | null;
  budget_health_pct: number | null;
}

export async function sendTeamsDailyBriefing(clients: ClientBriefingRow[], appUrl?: string): Promise<void> {
  const red = clients.filter(c => c.status === 'red');
  const amber = clients.filter(c => c.status === 'amber');
  const green = clients.filter(c => c.status === 'green');
  const totalOverdue = clients.reduce((sum, c) => sum + (c.overdue_tasks ?? 0), 0);

  const statusLine = `🔴 ${red.length}  🟡 ${amber.length}  🟢 ${green.length}`;

  const atRisk = [...red, ...amber].slice(0, 5).map(c => ({
    name: `${c.status === 'red' ? '🔴' : '🟡'} ${c.name}`,
    value: [
      c.overdue_tasks > 0 ? `${c.overdue_tasks} overdue task${c.overdue_tasks !== 1 ? 's' : ''}` : null,
      c.budget_health_pct != null ? `Budget: ${c.budget_health_pct.toFixed(0)}%` : null,
    ].filter(Boolean).join(' · ') || 'Review needed',
  }));

  const sections: object[] = [
    {
      activityTitle: `**Agency Daily Briefing — ${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}**`,
      activityText: `${clients.length} active clients · ${totalOverdue} overdue task${totalOverdue !== 1 ? 's' : ''}`,
      facts: [{ name: 'Health overview', value: statusLine }],
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
    themeColor: red.length > 0 ? 'D13438' : amber.length > 0 ? 'F7630C' : '107C10',
    summary: 'Agency Daily Briefing',
    sections,
  };

  if (appUrl) {
    payload.potentialAction = [{ '@type': 'OpenUri', name: 'Open Dashboard', targets: [{ os: 'default', uri: appUrl }] }];
  }

  await post(payload);
}
