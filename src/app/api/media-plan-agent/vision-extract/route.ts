import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { PRESET_CHANNELS } from '@/lib/utils/channel-icons';

function getFirstMondayOfYear(year: number): string {
  const d = new Date(year, 0, 1);
  const day = d.getDay();
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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX: Record<string, number> = Object.fromEntries(MONTH_NAMES.map((m, i) => [m.toLowerCase(), i]));

function parseDMon(text: string): { day: number; month: number } | null {
  const m = text.match(/(\d{1,2})\s*\/\s*([A-Za-z]{3,})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
  if (month === undefined || day < 1 || day > 31) return null;
  return { day, month };
}

// Fixed reference year (leap, so Feb 29 never throws) — only day-level deltas matter.
function dayOfYear({ day, month }: { day: number; month: number }): number {
  return Math.floor((Date.UTC(2024, month, day) - Date.UTC(2024, 0, 1)) / 86400000);
}

// Shifts every "D/Mon" token in free-form text by deltaDays — used to correct a
// whole-table column misalignment uniformly across headers and FILLED lines alike.
function shiftDateTokens(text: string, deltaDays: number): string {
  return text.replace(/\b(\d{1,2})\s*\/\s*([A-Za-z]{3,})\b/g, (full, dayStr: string, monStr: string) => {
    const day = parseInt(dayStr, 10);
    const month = MONTH_INDEX[monStr.slice(0, 3).toLowerCase()];
    if (month === undefined || day < 1 || day > 31) return full;
    const shifted = new Date(Date.UTC(2024, month, day + deltaDays));
    return `${shifted.getUTCDate()}/${MONTH_NAMES[shifted.getUTCMonth()]}`;
  });
}

function buildAnchorPrompt(): string {
  return `Look at this media plan image. Ignore any prior reading of it — read fresh.

Find the row-label area on the left (channel name / format / budget columns). The weekly date grid begins immediately to its right.

Read the header printed directly above the very FIRST weekly column in that grid — the one with no other date column between it and the row-label area. Transcribe its printed date character by character; do not infer it from where shading happens to start in the rows below, since that's exactly the kind of guess that causes a one-column misalignment.

Reply with ONLY this one line, nothing else:
FIRST_COLUMN: <date exactly as printed, e.g. 5/Jan>`;
}

function buildVisionPrompt(): string {
  return `You are reading a screenshot of a media plan. Work through it carefully, and describe everything you see in plain English — this description will be read by the user before anything gets applied, so be thorough and precise.

═══ STEP 1 — Column headers ═══
List every weekly date header across the top of the timeline, left to right, and note the year if shown. These are week-commencing (W/C) Mondays. Number each one as you list it: "COL1: 5/Jan", "COL2: 12/Jan", etc.
Header text is often rotated vertically and easy to misalign by one column — count columns carefully rather than estimating: check that your column count matches the number of distinct cell boundaries in the data area below. If several rows' shaded blocks start at the same horizontal position, they must resolve to the very same COL number — use that agreement across rows to cross-check your column count.
Then write: COLUMN COUNT CHECK: [state the number of header dates you listed] vs [the number of distinct cell-boundary slots you count in the data grid below]. These must match — if they don't, recount before continuing.

Also list any OTHER columns you see that aren't a weekly date, the channel name, or a budget/spend figure — e.g. an "Audience" column, a "Notes" column, an "Owner" column, anything genuinely custom. Do NOT list a budget/spend/$-amount column here, no matter what it's labeled — "Budget", "Spend", "Cost", "Investment", "Media $", "Planned", "Actual", a bare "$" header, or no header at all. The test is the CELL CONTENTS, not the header wording: if a column's cells are dollar figures, it is a budget column and belongs in the ROW line's total-budget field below, never in CUSTOM COLUMNS. If a sheet has two dollar columns (e.g. "Planned" and "Actual"), use the one that represents the row's overall spend as the total-budget figure and mention the other one under NOTES (step 4) instead of inventing a custom column for it. Do NOT list a KPI/metric/measurement-type column here either — fold that text into the ROW line's detail/format field instead. Call out only genuinely extra, non-dollar columns under CUSTOM COLUMNS.

═══ STEP 2 — Each channel row ═══
For every data row that represents a media channel (skip header/title rows), output:

ROW: [channel name] | [detail/format text — if there's a separate KPI/metric column, append it here too, e.g. "Static & Video · Metric: Form completions"] | [total budget shown, e.g. $12,000]
FILLED: [see instructions below]
CUSTOM: [see instructions below]

To find the FIRST shaded cell of each row, don't just read the rotated label nearest it — that's exactly what causes off-by-one mistakes. Instead count column borders from the left edge of the grid to find its column NUMBER (matching your Step 1 numbering), then look up that number's date from your Step 1 list. Do the same for the last shaded cell of each group.

━━ How to write the CUSTOM line ━━
If you listed any CUSTOM COLUMNS in Step 1, this line is REQUIRED for every row, even
if it's blank for that row — do not skip it. For each custom column, look at THIS row's
cell under that column and transcribe exactly what's written there — text, a number, a
percentage, whatever it is, verbatim, not just whether it's filled in.
Format: "column name: exact cell value", comma-separated if there's more than one column.
If a given row's cell under a column is empty, omit just that column from the line.
If there are no custom columns at all, or every cell for this row is empty, write CUSTOM: (none).
Example: CUSTOM: Audience: 18-34 female, KPI: CPM

━━ How to write the FILLED line ━━
Scan left-to-right across every weekly column for this row. For each column, is the cell shaded/coloured/filled (even lightly)?
• YES — include that column's W/C date. If a dollar amount is written inside the cell, append it in parentheses: 16/Feb($6,000). If no amount, just the date.
• NO (white/blank) — do not include it; write a pipe "|" to mark the gap between separate groups. Collapse consecutive pipes into one.
Use COMMA when the same campaign/burst continues (weeks within a burst, or monthly budget cells of an ongoing run). Use PIPE when the campaign goes fully dark for 8+ consecutive weeks before resuming.
Organic rows (full-year diagonal-stripe band, no dollar amounts) — write FILLED: ORGANIC.
Rows with no fill at all — write FILLED: (none).

═══ STEP 2B — Alignment cross-check ═══
Before moving on: for every row you just wrote, look at the LEFTMOST shaded cell's column position again and re-confirm its column number against your Step 1 list — a rotated header sitting visually one slot away from the cell it actually labels is the single most common cause of getting a flight's start date wrong. Where two or more rows' shaded blocks start at the same horizontal position, confirm they all cite the identical date; if any one of them disagrees, that row's count is off — fix it now rather than in a later pass. Only proceed once every row's FILLED dates are consistent with Step 1's numbering and with each other.

═══ STEP 3 — Fees not tied to a channel ═══
Look for any line items that are NOT a media channel — e.g. "Setup fee", "Creative production", "Agency management fee", "Ad serving fee". List each as:
FEE: [name] | [amount]
If there are none, write FEES: (none).

═══ STEP 4 — Anything else ═══
Note anything else worth flagging — ambiguous cells, handwritten notes, totals that don't add up, unusual formatting, a channel you're not confident how to categorise, missing dates, etc. Write these under NOTES: as short bullet points. If nothing stands out, write NOTES: (none).

Work top to bottom. Do not skip any row. Plain text only — no JSON.`;
}

function buildStructurePrompt(description: string, year: number): string {
  const firstMonday = getFirstMondayOfYear(year);
  const lastMonday = getLastMondayOfYear(year);
  return `Convert the media plan description below into a structured JSON object.

Plan year: ${year}. All dates are week-commencing (W/C) Mondays.
Date conversion: "16/Feb" → "${year}-02-16", "2/Mar" → "${year}-03-02", "26/Jan" → "${year}-01-26"
If a date like "29/Dec" clearly belongs to the prior year, use ${year - 1}.

MEDIA PLAN DESCRIPTION:
${description}

━━━ HOW TO BUILD FLIGHTS FROM FILLED LINES ━━━
Each ROW's FILLED line contains comma-separated dates, with | separating distinct groups. Each | group = one flight object.
For each group: startDate = first date → YYYY-MM-DD. endDate = last date → YYYY-MM-DD.
Budget: if the group has MULTIPLE dollar amounts, sum them into totalBudget and build monthlySpend per calendar month from each date's amount. If ONE dollar amount, that's the totalBudget, distributed proportionally by week count per month. If none, budget = 0.
FILLED: ORGANIC → one flight: startDate "${firstMonday}", endDate "${lastMonday}", totalBudget 0, monthlySpend {}.
FILLED: (none) → one flight: startDate "${firstMonday}", endDate "${firstMonday}", totalBudget 0, monthlySpend {}.

━━━ MONTHLY SPEND ━━━
monthlySpend keys: "YYYY-M" (e.g. "${year}-2" for February). Weeks run every 7 days from startDate to endDate inclusive. Distribute proportionally by weeks-in-month. Round to whole dollars; adjust the largest month so the sum equals the flight budget exactly.
SUM of all monthlySpend values across ALL flights for a channel must equal that channel's totalBudget exactly.

━━━ CHANNEL NAME RULES ━━━
channelName must be exactly one of the channels this platform already supports — matching one of these exactly (case-sensitive) is what makes the row show the right logo/card in the builder, so never invent a variant spelling or a hyphenated sub-type of one of these:
${PRESET_CHANNELS.map(c => `"${c}"`).join(', ')}, "Other"

Use judgement to match a specific product, campaign type, or placement name to the platform that actually runs it — keep that specific name in the format field (see below), NOT in channelName or customChannelName, so the row still shows the right logo:
  Google Performance Max, PMax, Search/SEM, Display/GDN, Discovery, Demand Gen, Shopping → channelName "Google Ads" (format keeps the product name, e.g. "Performance Max")
  Meta Advantage+, Reels, Stories, Facebook & Instagram combined → channelName "Meta Ads"
  Bus Backs, Billboards, Digital Billboards/DOOH, Transit/Transport, Posters, Street Furniture, Letterbox Drops, or any other outdoor/out-of-home format → channelName "OOH" (format keeps the sub-type, e.g. "Bus Backs")
  DV360, The Trade Desk, or other programmatic/display buys not on a named platform above → channelName "Programmatic"

It's expected and fine for two rows on the same plan to share a channelName (e.g. one "Google Ads" row for Search and another "Google Ads" row for Performance Max, sitting one after another) — they're kept as separate rows distinguished by their format text, so never merge them into one row or invent a different channelName just to make them unique.

customChannelName: leave empty for everything above — only set it, together with channelName "Other", when the channel genuinely isn't any platform on the list (e.g. a named local publisher, "Trade Me", a niche network not covered above).
format: the detail column text — this is also where any specific product/sub-type name from the matching above belongs.
totalBudget: plain number, no $ or commas. Must equal sum of all flight budgets.
isOrganic: true only if FILLED was ORGANIC.
customFields: an object built from that row's CUSTOM line — one key per "column name: value" pair in that line, using the exact value transcribed (text, number, percentage, whatever it is), e.g. {"Audience": "18-34 female", "KPI": "CPM"}. Do not invent or drop values that are present in the CUSTOM line. Omit the whole field only if the row had no CUSTOM line or it said "(none)". If any pair's value is itself a bare dollar amount (e.g. "$4,000", "4000"), that is a budget figure that was miscategorised upstream — leave it out of customFields and fold it into that row's totalBudget instead.

━━━ FEES ━━━
From every FEE: line, produce { "name": "...", "amount": 0 } (plain number, no $ or commas).

━━━ CUSTOM COLUMNS ━━━
From the CUSTOM COLUMNS list in step 1, produce [{ "name": "..." }] for each distinct custom column name seen.

━━━ NOTES ━━━
From the NOTES: bullet points, produce a plain string array. Empty array if "(none)".

━━━ OUTPUT ━━━
Return ONLY valid JSON — no markdown, no explanation:
{
  "channels": [
    {
      "channelName": "...",
      "customChannelName": "",
      "format": "...",
      "isOrganic": false,
      "customFields": {},
      "flights": [
        { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "monthlySpend": { "YYYY-M": 0 } }
      ]
    }
  ],
  "fees": [ { "name": "...", "amount": 0 } ],
  "customColumns": [ { "name": "..." } ],
  "notes": [ "..." ]
}`;
}

export interface VisionExtractionChannel {
  channelName: string;
  customChannelName?: string;
  format: string;
  isOrganic?: boolean;
  customFields?: Record<string, string>;
  flights: Array<{
    startDate: string;
    endDate: string;
    monthlySpend: Record<string, number>;
  }>;
}

export interface VisionExtraction {
  channels: VisionExtractionChannel[];
  fees: Array<{ name: string; amount: number }>;
  customColumns: Array<{ name: string }>;
  notes: string[];
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  // Anonymous visitors (the public /media-plan-builder tool) get a small daily
  // allowance instead of being blocked outright; authenticated dashboard use
  // stays unlimited, as before.
  if (!session?.user) {
    const limited = await rateLimit(request, 'media-plan-agent-public', 5, 86400);
    if (limited) return limited;
  }

  let body: { image: string; mimeType: string; year?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { image, mimeType, year: clientYear } = body;
  if (!image || !mimeType) {
    return NextResponse.json({ error: 'image and mimeType are required' }, { status: 400 });
  }

  const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validMimeTypes.includes(mimeType)) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
  }

  try {
    const imageBlock = {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: image,
      },
    };

    // Pass 1: Vision — plain-English description, shown to the user as-is before anything is applied
    const visionResponse = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 6500,
      messages: [
        {
          role: 'user',
          content: [imageBlock, { type: 'text', text: buildVisionPrompt() }],
        },
      ],
    });

    let description = visionResponse.content.find(b => b.type === 'text')?.text ?? '';
    if (!description.trim()) {
      return NextResponse.json({ error: 'Could not read the screenshot. Please try a clearer image.' }, { status: 500 });
    }

    // Pass 1.5: independent re-check of the first weekly column, fresh (no memory of
    // pass 1's own reading). A whole-table shift is invisible to pass 1's internal
    // consistency check — every row agrees with itself on the same wrong mapping — so
    // this only catches it by re-deriving the anchor date from the image a second time.
    let correctionNote: string | null = null;
    try {
      const anchorResponse = await anthropic.messages.create({
        model: 'claude-opus-5',
        max_tokens: 100,
        messages: [{ role: 'user', content: [imageBlock, { type: 'text', text: buildAnchorPrompt() }] }],
      });
      const anchorText = anchorResponse.content.find(b => b.type === 'text')?.text ?? '';
      const anchorMatch = anchorText.match(/FIRST_COLUMN:\s*(\S.*)/i);
      const claimedMatch = description.match(/COL1:\s*(\S.*?)(?:[,\n]|$)/i);
      if (anchorMatch && claimedMatch) {
        const anchorDate = parseDMon(anchorMatch[1]);
        const claimedDate = parseDMon(claimedMatch[1]);
        if (anchorDate && claimedDate) {
          const deltaDays = dayOfYear(anchorDate) - dayOfYear(claimedDate);
          if (deltaDays === 7 || deltaDays === -7) {
            description = shiftDateTokens(description, deltaDays);
            correctionNote = `Auto-corrected a ${deltaDays > 0 ? 'one-week-late' : 'one-week-early'} column misalignment caught by a second look at the image.`;
          } else if (deltaDays !== 0 && Math.abs(deltaDays) < 60) {
            correctionNote = `A second look at the image disagreed with the first read of the leftmost date column by ${Math.abs(deltaDays)} day(s) — please double-check the first flight's start date on each channel.`;
          }
        }
      }
    } catch (err) {
      console.error('Anchor verification pass failed (non-fatal):', err);
    }

    const yearMatch = description.match(/\b(20\d{2})\b/);
    const detectedYear = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
    const year = (clientYear && clientYear >= 2020 && clientYear <= 2040) ? clientYear : detectedYear;

    // Pass 2: Text-only — convert description to structured JSON
    const structureResponse = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content: buildStructurePrompt(description, year) }],
    });

    const structureText = structureResponse.content.find(b => b.type === 'text')?.text ?? '';

    let parsed: VisionExtraction | null = null;
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
      console.error('Vision pass description:', description.slice(0, 2000));
      console.error('Structure pass raw output:', structureText.slice(0, 1000));
      return NextResponse.json(
        { error: 'Could not extract media plan data from screenshot. Please try a clearer image.', raw: structureText.slice(0, 500) },
        { status: 500 }
      );
    }

    // Deterministic backstop: even with prompt guardrails, a budget figure can
    // still slip into customFields (e.g. a "Spend" column the model didn't
    // recognise as money). Strip anything that reads as a dollar amount rather
    // than silently letting it masquerade as a custom column.
    const CURRENCY_VALUE_RE = /\$\s*-?[\d,]+(\.\d{1,2})?\b/;
    const BUDGET_KEY_RE = /budget|spend|cost|invest|amount|price|rate|fee|\$/i;
    const budgetLeakNotes: string[] = [];
    for (const ch of parsed.channels) {
      if (!ch.customFields) continue;
      for (const [key, value] of Object.entries(ch.customFields)) {
        const valueStr = String(value).trim();
        const looksLikeCurrency = CURRENCY_VALUE_RE.test(valueStr) || (BUDGET_KEY_RE.test(key) && /\d/.test(valueStr));
        if (looksLikeCurrency) {
          delete ch.customFields[key];
          const label = ch.customChannelName || ch.channelName;
          budgetLeakNotes.push(`Dropped "${key}: ${value}" from ${label}'s custom fields — it looked like a budget figure, not a custom column. Please double-check that channel's total budget.`);
        }
      }
      if (Object.keys(ch.customFields).length === 0) delete ch.customFields;
    }

    return NextResponse.json({
      description,
      channels: parsed.channels,
      fees: Array.isArray(parsed.fees) ? parsed.fees : [],
      customColumns: Array.isArray(parsed.customColumns) ? parsed.customColumns : [],
      notes: [
        ...(correctionNote ? [correctionNote] : []),
        ...(Array.isArray(parsed.notes) ? parsed.notes : []),
        ...budgetLeakNotes,
      ],
    });
  } catch (err: any) {
    console.error('Error extracting media plan from screenshot:', err);
    return NextResponse.json({ error: err.message ?? 'Failed to analyse screenshot' }, { status: 500 });
  }
}
