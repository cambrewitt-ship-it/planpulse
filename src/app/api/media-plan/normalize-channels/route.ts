import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

const STANDARD_CHANNELS = [
  'Meta Ads', 'Google Ads', 'Display Ads', 'Native Ads', 'LinkedIn Ads', 'TikTok Ads',
  'Instagram Ads', 'YouTube Ads', 'Snapchat Ads', 'Reddit Ads',
  'Instagram (Organic)', 'Facebook (Organic)', 'LinkedIn (Organic)',
  'EDM / Email', 'OOH', 'Radio', 'Linear TV', 'SVOD', 'BVOD', 'Other',
];

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { names } = body as { names: string[] };

  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ mappings: [] });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Map each raw channel name to the closest standard media channel. Use your knowledge of advertising industry terminology to handle nuanced names.

Standard channels: ${STANDARD_CHANNELS.join(', ')}

OOH sub-types → channelName = "OOH - [SUBTYPE]":
OOH - BUS BACKS, OOH - BUS SHELTERS, OOH - BILLBOARDS, OOH - DIGITAL BILLBOARDS,
OOH - TRANSIT, OOH - POSTERS, OOH - STREET FURNITURE, OOH - LETTERBOX DROPS, OOH - OUTDOOR

Common mappings to apply:
- "Search", "Paid Search", "SEM", "Google Search", "Search Campaigns", "Brand Search" → "Google Ads"
- "Paid Social", "Social Media Ads", "Social Advertising" → "Meta Ads"
- "Programmatic", "Banner Ads", "Display", "Trading Desk" → "Display Ads"
- "Sponsored Content", "Content Discovery" → "Native Ads"
- "Podcast", "Streaming Audio", "Spotify" → "Radio"
- "BVOD", "Broadcast VOD", "Catchup TV" → "BVOD"
- "SVOD", "Streaming TV", "Netflix Ads" → "SVOD"
- Organic social rows → "Instagram (Organic)", "Facebook (Organic)", or "LinkedIn (Organic)"
- If no match: channelName = "Other", original name in customChannelName

Rules:
- If the name clearly maps to a standard channel, use it exactly
- customChannelName is empty string unless channelName is "Other"

Input: ${JSON.stringify(names)}

Return ONLY a JSON array in the same order, no explanation:
[{"channelName":"...","customChannelName":""}]`;

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content.find(b => b.type === 'text')?.text ?? '';
  let mappings: Array<{ channelName: string; customChannelName: string }> | null = null;

  try { mappings = JSON.parse(text.trim()); } catch { /* fall through */ }
  if (!mappings) {
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try { mappings = JSON.parse(stripped); } catch { /* fall through */ }
  }
  if (!mappings) {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) try { mappings = JSON.parse(m[0]); } catch { /* fall through */ }
  }

  if (!mappings || !Array.isArray(mappings)) {
    return NextResponse.json({ mappings: names.map(n => ({ channelName: 'Other', customChannelName: n })) });
  }

  const validated = mappings.map((entry, i) => {
    const cn = entry?.channelName ?? 'Other';
    const isStandard = STANDARD_CHANNELS.includes(cn) || cn.startsWith('OOH - ');
    if (!isStandard) return { channelName: 'Other', customChannelName: names[i] };
    return { channelName: cn, customChannelName: entry?.customChannelName ?? '' };
  });

  return NextResponse.json({ mappings: validated });
}
