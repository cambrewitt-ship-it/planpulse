import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

function getFirstMondayOfYear(year: number): string {
  const d = new Date(year, 0, 1);
  const day = d.getDay(); // 0=Sun 1=Mon ... 6=Sat
  const toAdd = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(1 + toAdd);
  return `${year}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getLastMondayOfYear(year: number): string {
  const d = new Date(year, 11, 31);
  const day = d.getDay();
  const toSub = day === 0 ? 6 : day - 1;
  d.setDate(31 - toSub);
  return `${year}-12-${String(d.getDate()).padStart(2, '0')}`;
}

function buildExtractionPrompt(): string {
  const year = new Date().getFullYear();
  const firstMonday = getFirstMondayOfYear(year);
  const lastMonday = getLastMondayOfYear(year);
  return `You are a media planning expert. Analyze this media plan screenshot and extract all channels, budgets, and flight dates.

## Grid structure
Weekly media plan. Each column = one week starting on a Monday (W/C date shown in column header, e.g. "16/Feb").
Use the year visible in the column headers. If unclear, default to ${year}.
If any column headers show "####": the first Monday of January ${year} is ${firstMonday}. Add 7 days per column to reconstruct missing dates.

## STEP A — Identify organic social channels FIRST

Before doing anything else, check whether this channel is an organic social channel:
Facebook (Organic), Instagram (Organic), LinkedIn (Organic), or TikTok used for organic posting (no spend).

If YES — organic channel:
• The row appears as one wide uniform colored band or diagonal-striped band spanning most or all of the year.
• Create ONE single flight spanning the full band: startDate = leftmost visible column's W/C Monday, endDate = rightmost visible column's W/C Monday.
• If the full year is filled, use "${firstMonday}" to "${lastMonday}".
• totalBudget = 0, monthlySpend = {} (empty — organic tracks posts, not spend).
• TikTok organic → channelName "TikTok Ads", format "Organic posting", totalBudget 0.
• SKIP Steps B–D below. Go directly to the next channel row.

## STEP B — For NON-organic channels: use dollar amounts as flight anchors

Excel media plans show flight periods as SOLID COLORED RECTANGLES. A dollar amount (e.g. "$10,000") appears in the first or second column of each rectangle. Other columns in the same rectangle are the same color but have no number.

For each non-organic channel row:

1. List every dollar amount visible in the timeline. Note the W/C column it's in.
2. For each dollar amount, extend LEFT: how many columns immediately to the left share the SAME solid fill? Those are part of this flight. STOP at any white/empty column.
   Extend RIGHT the same way.
3. Group dollar amounts inside the same unbroken colored rectangle into ONE flight.
   Two dollar amounts separated by even ONE white/empty column = TWO separate flights.
4. startDate = W/C of the leftmost column in this group. endDate = W/C of the rightmost column.

IMPORTANT: The dollar label is often in the 1st or 2nd cell of a multi-week block. The cells to the LEFT of the label (with the same solid fill but no number) are still part of the same flight.

### What counts as a flight column

FLIGHT COLUMN: Clearly visible solid fill — dark, medium, or bright — unmistakably distinct from the blank background.
EMPTY COLUMN: Plain white or a very faint overall row tint. If you cannot clearly see a distinct fill, treat as EMPTY.
WARNING: Some rows have a faint background tint across all columns. This is NOT a flight. Only cells with a NOTICEABLY STRONGER fill than surrounding blank cells are flight columns.

## STEP C — Verify flight count

After extracting flights for a channel:
• Count distinct dollar amounts. Number of flights should equal that count (one per amount group).
• If a flight spans more than 3 months with varying per-month amounts, it is likely multiple separate flights — re-examine for white gaps between them.
• Two identical dollar amounts with a gap between them = two separate flights, not one.

## STEP D — monthlySpend keys (non-organic only)
Format: "YEAR-M" (e.g. "${year}-5" for May). Include only months within startDate–endDate.
Single-month flight: put the full burst spend in that month's key.
Multi-month flight: split spend proportionally by week count per calendar month.
CRITICAL: SUM of all monthlySpend across ALL flights for a channel MUST equal totalBudget EXACTLY.

## Return format
Return ONLY a valid JSON object — no markdown, no explanation:
{
  "channels": [
    {
      "channelName": "Meta Ads",
      "customChannelName": "",
      "format": "Suburb targeting",
      "totalBudget": 12000,
      "percentOfInvestment": 11,
      "flights": [
        { "startDate": "${year}-02-09", "endDate": "${year}-02-09", "monthlySpend": { "${year}-2": 1000 } },
        { "startDate": "${year}-04-27", "endDate": "${year}-04-27", "monthlySpend": { "${year}-4": 500 } },
        { "startDate": "${year}-05-04", "endDate": "${year}-05-04", "monthlySpend": { "${year}-5": 4000 } },
        { "startDate": "${year}-06-01", "endDate": "${year}-06-01", "monthlySpend": { "${year}-6": 500 } }
      ]
    }
  ]
}

## Channel name rules
channelName must be one of: "Meta Ads", "Google Ads", "Display Ads", "Native Ads", "LinkedIn Ads", "TikTok Ads", "Instagram Ads", "YouTube Ads", "Snapchat Ads", "Reddit Ads", "Instagram (Organic)", "Facebook (Organic)", "LinkedIn (Organic)", "EDM / Email", "OOH", "Radio", "Linear TV", "SVOD", "BVOD", "Other"
• OOH variants → use "OOH - [SUBTYPE]" as the channelName, using these exact subtypes:
  - Bus Backs → "OOH - BUS BACKS"
  - Bus Shelters → "OOH - BUS SHELTERS"
  - Billboards (static) → "OOH - BILLBOARDS"
  - Digital Billboards / DOOH / Digital OOH → "OOH - DIGITAL BILLBOARDS"
  - Letterbox Drops → "OOH - LETTERBOX DROPS"
  - Transit / Transport → "OOH - TRANSIT"
  - Posters → "OOH - POSTERS"
  - Street Furniture → "OOH - STREET FURNITURE"
  - Any other OOH/Outdoor variant → "OOH - OUTDOOR"
  Leave customChannelName empty for OOH variants. Describe detail in format field.
• No match and not OOH → "Other", real name in customChannelName (e.g. "Trade Me").
• format: text from DETAIL column.
• totalBudget: from TOTAL INVESTMENT column — grand total across ALL bursts. No $ or commas.
• EVERY channel needs at least one flight. If no fills visible use "${firstMonday}" to "${lastMonday}".
• percentOfInvestment: totalBudget ÷ sum of all channels × 100.`;
}

export interface ParsedChannel {
  channelName: string;
  customChannelName?: string;
  format: string;
  totalBudget: number;
  percentOfInvestment: number;
  flights: Array<{
    startDate: string;
    endDate: string;
    monthlySpend: Record<string, number>;
  }>;
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { image: string; mimeType: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { image, mimeType } = body;
  if (!image || !mimeType) {
    return NextResponse.json({ error: 'image and mimeType are required' }, { status: 400 });
  }

  const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validMimeTypes.includes(mimeType)) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: image,
              },
            },
            {
              type: 'text',
              text: buildExtractionPrompt(),
            },
          ],
        },
      ],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';

    let parsed: { channels: ParsedChannel[] } | null = null;

    // 1. Try direct parse first
    try { parsed = JSON.parse(text.trim()); } catch { /* fall through */ }

    // 2. Strip any code fences and try again
    if (!parsed) {
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      try { parsed = JSON.parse(stripped); } catch { /* fall through */ }
    }

    // 3. Find the first {...} block in the text and try to parse that
    if (!parsed) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
      }
    }

    if (!parsed || !Array.isArray(parsed.channels)) {
      console.error('Could not parse Claude response. Raw text (first 1000 chars):', text.slice(0, 1000));
      console.error('Full response content blocks:', JSON.stringify(response.content.map(b => ({ type: b.type, length: 'text' in b ? b.text.length : 0 }))));
      return NextResponse.json(
        { error: 'Could not extract media plan data from screenshot. Please try a clearer image.', raw: text.slice(0, 500) },
        { status: 500 }
      );
    }

    return NextResponse.json({ channels: parsed.channels });
  } catch (err: any) {
    console.error('Error calling Claude for screenshot parsing:', err);
    return NextResponse.json({ error: err.message ?? 'Failed to analyze screenshot' }, { status: 500 });
  }
}
