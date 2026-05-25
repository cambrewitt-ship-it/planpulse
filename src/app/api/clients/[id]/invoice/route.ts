import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { start_date, end_date, spend_type = 'actual', commission_override } = body as {
    start_date: string;
    end_date: string;
    spend_type?: 'actual' | 'planned';
    commission_override?: number;
  };

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  // Verify client belongs to user
  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const { data: mediaPlan } = await supabase
    .from('client_media_plan_builder')
    .select('channels, commission')
    .eq('client_id', clientId)
    .maybeSingle();

  const commission = commission_override ?? mediaPlan?.commission ?? 0;

  const channels: Array<{ name: string; net: number; gross: number }> = [];

  if (spend_type === 'planned') {
    const rawChannels: any[] = (mediaPlan?.channels as any[]) ?? [];
    const [startY, startM, startD] = start_date.split('-').map(Number);
    const [endY, endM, endD] = end_date.split('-').map(Number);

    for (const ch of rawChannels) {
      let total = 0;
      let year = startY; let month = startM;
      while (year < endY || (year === endY && month <= endM)) {
        const daysInMonth = new Date(year, month, 0).getDate();
        const mStart = (year === startY && month === startM) ? startD : 1;
        const mEnd = (year === endY && month === endM) ? endD : daysInMonth;
        const fraction = (mEnd - mStart + 1) / daysInMonth;
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const keyAlt = `${year}-${month}`;
        for (const f of ch.flights ?? []) {
          if (f.monthlySpend) {
            total += Number(f.monthlySpend[key] ?? f.monthlySpend[keyAlt] ?? 0) * fraction;
          }
        }
        month++; if (month > 12) { month = 1; year++; }
      }
      if (total > 0) {
        const gross = commission > 0 && commission < 100 ? total / (1 - commission / 100) : total;
        channels.push({ name: ch.channelName || 'Unknown', net: Math.round(total * 100) / 100, gross: Math.round(gross * 100) / 100 });
      }
    }
  } else {
    const { data: metrics } = await supabase
      .from('ad_performance_metrics')
      .select('platform, spend')
      .eq('client_id', clientId)
      .gte('date', start_date)
      .lte('date', end_date)
      .not('campaign_id', 'like', 'manual-override-%');

    const byPlatform = new Map<string, number>();
    for (const m of metrics ?? []) {
      byPlatform.set(m.platform, (byPlatform.get(m.platform) ?? 0) + Number(m.spend || 0));
    }

    const platformLabels: Record<string, string> = {
      'meta-ads': 'Meta Ads', 'google-ads': 'Google Ads',
      'linkedin-ads': 'LinkedIn Ads', 'tiktok-ads': 'TikTok Ads',
    };

    for (const [platform, net] of byPlatform) {
      if (net > 0) {
        const gross = commission > 0 && commission < 100 ? net / (1 - commission / 100) : net;
        channels.push({
          name: platformLabels[platform] ?? platform,
          net: Math.round(net * 100) / 100,
          gross: Math.round(gross * 100) / 100,
        });
      }
    }
  }

  const subtotal = channels.reduce((s, c) => s + c.net, 0);
  const totalGross = channels.reduce((s, c) => s + c.gross, 0);

  return NextResponse.json({
    client_name: client.name,
    date_range: { start: start_date, end: end_date },
    spend_type,
    channels,
    subtotal: Math.round(subtotal * 100) / 100,
    commission_pct: commission,
    commission_amount: Math.round((totalGross - subtotal) * 100) / 100,
    total: Math.round(totalGross * 100) / 100,
    generated_at: new Date().toISOString(),
  });
}
