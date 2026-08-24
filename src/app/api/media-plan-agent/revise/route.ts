import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import type { VisionExtraction } from '../vision-extract/route';

function buildRevisePrompt(current: VisionExtraction, correction: string): string {
  return `You previously extracted this media plan data as JSON:

${JSON.stringify(current, null, 2)}

The user has this correction or addition:
"${correction}"

Apply the user's correction to the JSON. Keep everything else exactly as it was unless the correction implies a change to it. Preserve the same schema (channels, fees, customColumns, notes) and the same channel-name/date/format rules as before — channelName must still be one of the fixed set of standard names, dates stay "YYYY-MM-DD", monthlySpend keys stay "YYYY-M", and each channel's monthlySpend must still sum to its flights' budgets.

Return ONLY the corrected JSON — no markdown, no explanation, same shape as the input.`;
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  // Same public daily allowance as vision-extract — shared rate-limit prefix
  // so extraction + corrections count against one combined per-IP total.
  if (!session?.user) {
    const limited = await rateLimit(request, 'media-plan-agent-public', 5, 86400);
    if (limited) return limited;
  }

  let body: { current: VisionExtraction; correction: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { current, correction } = body;
  if (!current || !Array.isArray(current.channels) || !correction?.trim()) {
    return NextResponse.json({ error: 'current (extraction) and correction are required' }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      messages: [{ role: 'user', content: buildRevisePrompt(current, correction) }],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';

    let parsed: VisionExtraction | null = null;
    try { parsed = JSON.parse(text.trim()); } catch { /* fall through */ }
    if (!parsed) {
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      try { parsed = JSON.parse(stripped); } catch { /* fall through */ }
    }
    if (!parsed) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
      }
    }

    if (!parsed || !Array.isArray(parsed.channels)) {
      return NextResponse.json({ error: 'Could not apply that correction. Try rephrasing it.' }, { status: 500 });
    }

    return NextResponse.json({
      channels: parsed.channels,
      fees: Array.isArray(parsed.fees) ? parsed.fees : [],
      customColumns: Array.isArray(parsed.customColumns) ? parsed.customColumns : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    });
  } catch (err: any) {
    console.error('Error revising media plan extraction:', err);
    return NextResponse.json({ error: err.message ?? 'Failed to apply correction' }, { status: 500 });
  }
}
