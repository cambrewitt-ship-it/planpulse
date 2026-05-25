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
  const { text, year, startDate, endDate } = body;

  if (!text?.trim()) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 });
  }

  const currentYear = year ?? new Date().getFullYear();
  const hasCampaignPeriod = startDate && endDate;

  const campaignPeriodContext = hasCampaignPeriod
    ? `\nCAMPAIGN PERIOD PROVIDED: ${startDate} to ${endDate}. Use this as the date range for all flights unless the pasted data contains more specific flight-level dates that clearly differ per channel.`
    : `\nNo campaign period was provided. If the pasted data contains month or date headers (e.g. JAN, FEB, MAR or specific week dates), use those to determine flight dates. If no date information is present at all, use ${currentYear}-01-01 to ${currentYear}-12-31 as a placeholder and distribute budget evenly — the user can adjust in the plan builder.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are parsing pasted media plan data from a marketing agency. The data may be:
- Tab-separated cells copied from Excel or Google Sheets (columns separated by \\t, rows by \\n)
- Plain text or a rough description of the plan

Your job is to extract each media channel with its budget and flight dates.
${campaignPeriodContext}

UNDERSTANDING EXCEL MEDIA PLAN LAYOUTS:
Agency media plans typically have this structure:
- Left columns: section/category label, channel name, detail/format
- A "Total Budget" column (often labelled "TOTAL INVESTMENT" or similar)
- Monthly or weekly date columns across the top — either month names (JAN, FEB, MAR...) OR week-commencing dates
- Dollar amounts in cells where a channel is active during that period
- Coloured cells or "$X,XXX" values indicate when a channel is running

WEEK-COMMENCING (W/C) COLUMN HEADERS — very common in Australian/UK agency plans:
Headers may look like: "W/C 5 Jan", "W/C 12 Jan", "W/C 3rd Nov", "w/c 5-Jan", "5-Jan", "Jan 5", "05/01", "2026-01-05"
Each W/C column represents one week. The column header date IS the Monday of that week.
- A channel row with dollar values across MULTIPLE W/C columns = the channel is active across those weeks.
- The flight startDate = the date of the FIRST W/C column that has a dollar value for that channel.
- The flight endDate = the date of the LAST W/C column that has a dollar value + 6 days (end of that week).
- If ALL W/C columns have values = "always-on" = one flight spanning first W/C to last W/C.
- Consecutive W/C columns with values = merge into ONE flight.
- A gap of one or more empty W/C columns between values = separate flights.
- NEVER assign startDate/endDate to only the last column — the flight must span the full active range.

When pasted into text:
- Column headers (months, W/C dates) may appear on one or more rows before the data rows
- Data rows start with the channel name/section, then budgets per period
- Numbers scattered across columns = spend in those time periods
- A "TOTAL" or lump sum in one column = total channel budget
- Multiple dollar values across columns = per-week or per-month spend

PARSING RULES:
1. Map each channel name to the closest standard channel from this list:
   ${STANDARD_CHANNELS.join(', ')}
   OOH sub-types: OOH - BUS BACKS, OOH - BUS SHELTERS, OOH - BILLBOARDS, OOH - DIGITAL BILLBOARDS, OOH - TRANSIT, OOH - POSTERS, OOH - STREET FURNITURE, OOH - LETTERBOX DROPS, OOH - OUTDOOR

2. For organic social, use "Instagram (Organic)", "Facebook (Organic)", or "LinkedIn (Organic)".
   "Facebook / Instagram / TikTok / LinkedIn" organic posting → create separate entries for each OR map to the dominant platform.

3. If a channel maps to nothing standard → channelName = "Other", customChannelName = original name.

4. DATE HANDLING (critical):
   - If W/C column headers are present (any format): identify each column's Monday date, then for each data row find the FIRST and LAST columns with a dollar value — those become startDate and endDate of the flight. Group W/C spend by calendar month for monthlySpend.
   - If month headers (JAN, FEB...) are present: use column position to determine which months a channel is active.
   - If a campaign period was provided above: use that date range for all channels unless the data shows clear per-channel variation.
   - If no dates are determinable: use ${currentYear}-01-01 to ${currentYear}-12-31 and distribute budget evenly.
   - NEVER assign all budget to only the last date column — if multiple columns have values, startDate must be the first, endDate must be the last.
   - NEVER guess specific month dates if they are not inferable — use the campaign period or full year fallback.
   - Dates must be YYYY-MM-DD format. Assume year ${currentYear} unless stated.

5. BUDGET HANDLING:
   - A single large dollar figure beside/under the channel name = totalBudget for that channel.
   - Multiple smaller figures across columns = per-period spend. Sum them for totalBudget.
   - Monthly spend keys must be "YYYY-MM" format (e.g. "${currentYear}-01" for January).
   - If monthly breakdown is not determinable, distribute totalBudget evenly across months in the flight range.
   - Ignore rows labelled TOTAL, SUBTOTAL, SET UP FEE, GST.

6. FLIGHTS:
   - A flight = a continuous period of activity for a channel.
   - If a channel is inactive for one or more months then active again = multiple flights.
   - If a channel runs all year with consistent monthly spend = one flight.

7. percentOfInvestment = integer percentage of grand total across all channels (must sum to ~100).

8. format = ad format or placement detail if visible (e.g. "Search + Shopping", "Suburb Targeting", "Breeze + Breeze Classic"). Empty string if not stated.

Return ONLY valid JSON — no explanation, no markdown:
{
  "channels": [
    {
      "channelName": "Meta Ads",
      "customChannelName": "",
      "format": "Suburb Targeting",
      "totalBudget": 12000,
      "percentOfInvestment": 11,
      "flights": [
        {
          "startDate": "${currentYear}-02-02",
          "endDate": "${currentYear}-03-29",
          "monthlySpend": {
            "${currentYear}-02": 1000,
            "${currentYear}-03": 500
          }
        },
        {
          "startDate": "${currentYear}-05-04",
          "endDate": "${currentYear}-12-31",
          "monthlySpend": {
            "${currentYear}-05": 4000,
            "${currentYear}-06": 500,
            "${currentYear}-07": 500,
            "${currentYear}-08": 4000,
            "${currentYear}-09": 500,
            "${currentYear}-10": 500,
            "${currentYear}-11": 500,
            "${currentYear}-12": 500
          }
        }
      ]
    }
  ]
}

Pasted data:
${text}`;

  const res = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8096,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = res.content.find(b => b.type === 'text')?.text ?? '';

  let parsed: { channels: any[] } | null = null;
  try { parsed = JSON.parse(raw.trim()); } catch { /* fall through */ }
  if (!parsed) {
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try { parsed = JSON.parse(stripped); } catch { /* fall through */ }
  }
  if (!parsed) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) try { parsed = JSON.parse(m[0]); } catch { /* fall through */ }
  }

  if (!parsed?.channels?.length) {
    return NextResponse.json(
      { error: 'Could not extract any channels. Make sure your data includes channel names and budget amounts.' },
      { status: 422 }
    );
  }

  return NextResponse.json({ channels: parsed.channels });
}
