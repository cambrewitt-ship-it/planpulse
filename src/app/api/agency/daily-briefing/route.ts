import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { nzToday, nzDateKeyOffset } from '@/lib/timezone';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const baseUrl = request.nextUrl.origin;
    const headers = { cookie: request.headers.get('cookie') ?? '' };

    const [clientsRes, apRes] = await Promise.all([
      fetch(`${baseUrl}/api/agency/clients`, { headers }),
      fetch(`${baseUrl}/api/agency/action-points`, { headers }),
    ]);

    const clientsData = clientsRes.ok ? await clientsRes.json() : {};
    const apData = apRes.ok ? await apRes.json() : {};

    const clients: any[] = clientsData.clients ?? [];
    const apClients: any[] = apData.clients ?? [];

    const today = nzToday();
    const in7Days = nzDateKeyOffset(7);

    const redClients = clients.filter((c: any) => c.health?.status === 'red').map((c: any) => c.name);
    const amberClients = clients.filter((c: any) => c.health?.status === 'amber').map((c: any) => c.name);
    const overpacing = clients
      .filter((c: any) => c.spendVariancePct != null && c.spendVariancePct > 15)
      .map((c: any) => `${c.name} (+${Number(c.spendVariancePct).toFixed(1)}%)`);
    const underpacing = clients
      .filter((c: any) => c.spendVariancePct != null && c.spendVariancePct < -15)
      .map((c: any) => `${c.name} (${Number(c.spendVariancePct).toFixed(1)}%)`);
    const launchingSoon = clients.flatMap((c: any) =>
      (c.channels ?? [])
        .filter((ch: any) => ch.status === 'upcoming' && ch.startDate >= today && ch.startDate <= in7Days)
        .map((ch: any) => `${c.name} – ${ch.channelName} (${ch.startDate})`)
    );

    let overdueCount = 0;
    for (const ac of apClients) {
      for (const ch of ac.channels ?? []) {
        for (const ap of ch.actionPoints ?? []) {
          if (ap.due_date && ap.due_date < today) overdueCount++;
        }
      }
    }

    const context = {
      date: today,
      total_clients: clients.length,
      red_clients: redClients,
      amber_clients: amberClients,
      overdue_action_points: overdueCount,
      channels_launching_in_7_days: launchingSoon,
      overpacing_clients: overpacing,
      underpacing_clients: underpacing,
    };

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [
        {
          role: 'user',
          content: `You are a digital media agency assistant. Write a daily briefing as 3–4 bullet points, max 8 words each. Each bullet starts with "• ". Lead with issues, end with positives. Ultra-concise — numbers and names only, no filler words. No intro line, no bold markdown.

${JSON.stringify(context)}`,
        },
      ],
    });

    const briefing = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    return NextResponse.json({ briefing });
  } catch (err: any) {
    console.error('Daily briefing error:', err);
    return NextResponse.json({ error: 'Failed to generate briefing' }, { status: 500 });
  }
}
