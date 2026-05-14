import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

function buildVisionPrompt(): string {
  return `You are reading a media plan spreadsheet. Work through it carefully, row by row.

═══ STEP 1 — Column headers ═══
List every weekly date header across the top of the timeline, left to right.
Write: COLUMNS: 5/Jan, 12/Jan, 19/Jan, 26/Jan, 2/Feb, 9/Feb, 16/Feb, 23/Feb, 2/Mar ...
Include the year if shown. These are week-commencing (W/C) Mondays.

═══ STEP 2 — Each channel row ═══
For every data row (skip header rows), output this block:

ROW: [channel name] | [detail/format text] | [total budget shown, e.g. $12,000]
FILLED: [see instructions below]

━━ How to write the FILLED line ━━

Scan left-to-right across EVERY column for this row.
For each column: is the cell shaded / coloured / filled (even lightly)?

• YES — include that column's W/C date.
  If a dollar amount is written inside that cell, append it in parentheses: 16/Feb($6,000)
  If no dollar amount, just write the date: 23/Feb

• NO (white / blank) — do NOT include that date.
  Instead, write a pipe character  |  to mark the gap between two separate groups.

Collapse consecutive pipe symbols into one.

Example — Radio with 3 separate bursts:
FILLED: 9/Feb($6,000), 16/Feb, 23/Feb | 1/Jun($3,000) | 7/Sep($3,000), 14/Sep

Example — Trade Me with monthly single-week blocks:
FILLED: 1/Jun($1,000) | 6/Jul($1,000) | 3/Aug($1,000) | 7/Sep($1,000)

Example — Google Ads active all year with monthly amounts:
FILLED: 5/Jan($2,750), 12/Jan, 19/Jan, 26/Jan | 2/Feb($2,750), 9/Feb, 16/Feb, 23/Feb | ...

━━ Organic rows ━━
Rows with a full-year diagonal-stripe band and NO dollar amounts are organic social.
Write:  FILLED: ORGANIC

━━ Rows with no fill at all ━━
Write:  FILLED: (none)

Work top to bottom. Do not skip any row. Plain text only — no JSON.`;
}

function buildStructurePrompt(description: string, year: number): string {
  return `Convert the media plan description below into a structured JSON object.

Plan year: ${year}. All dates are week-commencing (W/C) Mondays.
Date conversion: "16/Feb" → "${year}-02-16", "2/Mar" → "${year}-03-02", "26/Jan" → "${year}-01-26"
If a date like "29/Dec" clearly belongs to the prior year, use ${year - 1}.

MEDIA PLAN DESCRIPTION:
${description}

━━━ HOW TO BUILD FLIGHTS FROM FILLED LINES ━━━

Each ROW's FILLED line contains comma-separated dates, with | separating distinct groups.
Each | group = one flight object.

For each group:
  startDate = first date in the group → convert to YYYY-MM-DD
  endDate   = last date in the group  → convert to YYYY-MM-DD

  The flight's budget = the dollar amount shown in parentheses somewhere in that group.
  If no dollar amount in the group, budget = 0.

Special cases:
  FILLED: ORGANIC → one flight: startDate "${year}-01-06", endDate "${year}-12-29", totalBudget 0, monthlySpend {}
  FILLED: (none)  → one flight: startDate "${year}-01-06", endDate "${year}-01-06", totalBudget 0, monthlySpend {}

━━━ MONTHLY SPEND ━━━
monthlySpend keys: "YYYY-M" (e.g. "${year}-2" for February)
Weeks: every 7 days from startDate to endDate inclusive (startDate, startDate+7, startDate+14, ...)
Each W/C week belongs to the calendar month its date falls in.
Distribute flight budget proportionally: (weeks in that month) / (total weeks) × budget.
Round to whole dollars; adjust the largest month so the sum equals the flight budget exactly.
CRITICAL: SUM of all monthlySpend values across ALL flights = channel totalBudget exactly.

━━━ CHANNEL NAME RULES ━━━
channelName must be exactly one of:
"Meta Ads", "Google Ads", "Display Ads", "Native Ads", "LinkedIn Ads", "TikTok Ads",
"Instagram Ads", "YouTube Ads", "Snapchat Ads", "Reddit Ads",
"Instagram (Organic)", "Facebook (Organic)", "LinkedIn (Organic)",
"EDM / Email", "OOH", "Radio", "Linear TV", "SVOD", "BVOD", "Other"

OOH sub-types — channelName = "OOH - [SUBTYPE]", leave customChannelName empty:
  Bus Backs → "OOH - BUS BACKS"         Letterbox Drops → "OOH - LETTERBOX DROPS"
  Bus Shelters → "OOH - BUS SHELTERS"   Billboards → "OOH - BILLBOARDS"
  Digital Billboards/DOOH → "OOH - DIGITAL BILLBOARDS"
  Transit/Transport → "OOH - TRANSIT"   Posters → "OOH - POSTERS"
  Street Furniture → "OOH - STREET FURNITURE"
  Any other OOH/Outdoor → "OOH - OUTDOOR"

No match and not OOH → channelName "Other", real name in customChannelName (e.g. "Trade Me").
format: the detail column text.
totalBudget: plain number, no $ or commas. Must equal sum of all flight budgets.
percentOfInvestment: round(this channel totalBudget / sum of ALL channel totalBudgets × 100).

━━━ OUTPUT ━━━
Return ONLY valid JSON — no markdown, no explanation:
{
  "channels": [
    {
      "channelName": "...",
      "customChannelName": "",
      "format": "...",
      "totalBudget": 0,
      "percentOfInvestment": 0,
      "flights": [
        { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "monthlySpend": { "YYYY-M": 0 } }
      ]
    }
  ]
}`;
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
    // Pass 1: Vision — enumerate filled columns per row
    const visionResponse = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 6000,
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
            { type: 'text', text: buildVisionPrompt() },
          ],
        },
      ],
    });

    const description = visionResponse.content.find(b => b.type === 'text')?.text ?? '';
    if (!description.trim()) {
      return NextResponse.json({ error: 'Could not read the screenshot. Please try a clearer image.' }, { status: 500 });
    }

    const yearMatch = description.match(/\b(20\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

    // Pass 2: Text-only — convert description to structured JSON
    const structureResponse = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: buildStructurePrompt(description, year),
        },
      ],
    });

    const structureText = structureResponse.content.find(b => b.type === 'text')?.text ?? '';

    let parsed: { channels: ParsedChannel[] } | null = null;

    try { parsed = JSON.parse(structureText.trim()); } catch { /* fall through */ }

    if (!parsed) {
      const stripped = structureText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      try { parsed = JSON.parse(stripped); } catch { /* fall through */ }
    }

    if (!parsed) {
      const match = structureText.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
      }
    }

    if (!parsed || !Array.isArray(parsed.channels)) {
      console.error('Pass 1 description:', description.slice(0, 2000));
      console.error('Pass 2 raw output:', structureText.slice(0, 1000));
      return NextResponse.json(
        { error: 'Could not extract media plan data from screenshot. Please try a clearer image.', raw: structureText.slice(0, 500) },
        { status: 500 }
      );
    }

    return NextResponse.json({ channels: parsed.channels });
  } catch (err: any) {
    console.error('Error parsing screenshot:', err);
    return NextResponse.json({ error: err.message ?? 'Failed to analyse screenshot' }, { status: 500 });
  }
}
