# PlanPulse — Agent Features Implementation Brief

## How to use this document
Paste this entire document as the first message in a new Claude Code session. It contains everything needed to implement three features without prior context.

---

## What PlanPulse Is

A multi-tenant SaaS platform for marketing agencies to manage campaigns across multiple clients. Built with:
- **Next.js 16** (App Router), **React 19**, **TypeScript**, **Tailwind CSS 4**, **Radix UI**
- **Supabase** (PostgreSQL + Auth, cookie-based sessions)
- **Anthropic SDK** (`@anthropic-ai/sdk` v0.95.0) — `claude-opus-4-7` for in-app chat, `claude-haiku-4-5-20251001` for the bot
- **jsPDF** + **html2canvas** already installed
- **Nango** for Google Ads, Meta Ads, GA4 OAuth integrations
- **Microsoft Teams** webhook integration (`src/lib/teams.ts`)

---

## What Was Already Built (Do Not Rebuild)

| File | What it does |
|---|---|
| `src/app/api/agency/chat/route.ts` | Full Claude agent with 14 tools (read + write). Streams SSE. |
| `src/app/api/bots/teams/[userId]/route.ts` | Teams Outgoing Webhook handler. HMAC validation, Claude Haiku, 7 tools. **Has a 5-second timeout problem — see Feature 3.** |
| `src/lib/agent-tools.ts` | Shared Anthropic tool definitions: `TOOL_DEFINITIONS` (all 14) and `BOT_TOOL_DEFINITIONS` (bot-safe subset). |
| `src/lib/teams.ts` | `sendTeamsAlert(opts)` and `sendTeamsDailyBriefing(rows, appUrl, webhookUrl)` — both accept `webhookUrl` param. |
| `src/app/api/settings/integrations/route.ts` | GET/POST for `user_integrations` table (Teams webhook URL, bot HMAC secret, alert toggles). |
| `src/app/settings/page.tsx` | Settings page with Integrations tab for Teams config. |
| `src/app/api/cron/daily-briefing/route.ts` | Multi-tenant cron — sends daily briefing to all users with `daily_briefing_enabled = true`. |
| `src/app/api/cron/anomaly-alerts/route.ts` | Multi-tenant cron (every 2h) — diffs client state, alerts on status changes / spend threshold / overdue tasks. |
| `supabase/migrations/20260520_add_user_integrations.sql` | Migration for `user_integrations` table (run this first if not done). |
| `vercel.json` | Cron schedules: daily briefing `0 8 * * 1-5`, anomaly alerts `0 */2 * * *`. |
| `src/components/dashboard-v2/invoice-modal.tsx` | Existing invoice UI component — fetches actual + planned spend, calculates commission, renders per-channel breakdown. |

---

## Database Tables (Key Ones)

```
clients              — id, name, logo_url, user_id
client_health_status — client_id, status (red/amber/green), total_overdue_tasks, budget_health_percentage, mtd_actual_spend
ad_performance_metrics — client_id, platform (google-ads/meta-ads), date, spend, impressions, clicks, ctr, conversions, cpc, cpm, reach
client_media_plan_builder — client_id, channels (JSONB), commission
action_points        — id, text, channel_type, category (SET UP/HEALTH CHECK), frequency, due_date
client_action_point_completions — client_id, action_point_id, completed
user_integrations    — user_id, teams_webhook_url, teams_bot_hmac_secret, daily_briefing_enabled, anomaly_alerts_enabled, alert_snapshot
```

GA4 data: fetched live from `/api/ads/google-analytics/metrics` (not stored in DB).

---

## Auth Patterns

**Browser routes** — use `createClient()` from `@/lib/supabase/server` (cookie-based):
```typescript
const supabase = await createClient();
const { data: { session } } = await supabase.auth.getSession();
if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const userId = session.user.id;
```

**Cron/bot routes** — use service role client (no cookies):
```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
```

Note: `user_integrations` is not in the generated Supabase types yet — use `(supabase as any).from('user_integrations')` until types are regenerated.

---

## Feature 1 — Invoice Generation via Agent

### Goal
The agent (both in-app chat and Teams bot) can generate and download a PDF invoice for a client for a given period. The logic already exists in `src/components/dashboard-v2/invoice-modal.tsx` — extract it into a reusable API endpoint.

### What the existing invoice modal does
- Accepts `clientId`, `clientName`, date range
- Fetches actual spend from `fetchSpendData()` (`src/lib/api/analytics-data-integration.ts`)
- Fetches planned spend from `/api/clients/${clientId}/media-plan-builder`
- Calculates commission from the media plan's `commission` field
- Renders a per-channel spend table
- Lets the user switch between actual vs planned spend
- Has a download button (currently uses the browser print dialog or jsPDF — read the component to confirm)

### What to build

**1a. Extract invoice generation into a server API route**

New file: `src/app/api/clients/[id]/invoice/route.ts`

- `POST` — accepts `{ start_date, end_date, spend_type: 'actual' | 'planned', commission_override? }`
- Fetches spend data + media plan server-side (using user's session)
- Returns JSON invoice data: `{ client_name, date_range, channels[], subtotal, commission_amount, commission_pct, total, generated_at }`
- Does NOT generate PDF — that stays client-side or in a separate route

**1b. Add `generate_invoice` tool to `src/lib/agent-tools.ts`**

```typescript
{
  name: 'generate_invoice',
  description: 'Generate an invoice for a client for a given date range. Returns spend per channel, commission, and total. Use when asked to create, generate, or prepare an invoice.',
  input_schema: {
    type: 'object',
    properties: {
      client_name: { type: 'string' },
      start_date: { type: 'string', description: 'YYYY-MM-DD' },
      end_date: { type: 'string', description: 'YYYY-MM-DD' },
      spend_type: { type: 'string', enum: ['actual', 'planned'], description: 'Use actual for real spend, planned for media plan budgets. Default: actual.' },
    },
    required: ['client_name', 'start_date', 'end_date'],
  },
}
```

Add to both `TOOL_DEFINITIONS` and `BOT_TOOL_DEFINITIONS`.

**1c. Implement the tool in the chat route**

In `src/app/api/agency/chat/route.ts`, add a `toolGenerateInvoice()` function that:
- Finds the client by name
- Calls the new `/api/clients/${clientId}/invoice` endpoint
- Returns formatted invoice data for Claude to narrate

**1d. Implement the tool in the bot route**

In `src/app/api/bots/teams/[userId]/route.ts`, add invoice generation to `runBotTools()`:
- Uses service-role Supabase to fetch spend data directly (same logic as the API route)
- Returns formatted invoice data
- Claude narrates it in Teams: channel breakdown, total, commission

**Bot example output:**
```
📄 Invoice — Nike (May 2026)

• Meta Ads: $18,420
• Google Ads: $12,350
• LinkedIn: $6,100
──────────────────
Subtotal: $36,870
Commission (10%): $3,687
**Total: $40,557**

Generated: 21 May 2026
```

### Key files to read first
- `src/components/dashboard-v2/invoice-modal.tsx` — understand full data flow
- `src/lib/api/analytics-data-integration.ts` — understand `fetchSpendData()`
- `src/app/api/clients/[id]/media-plan-builder/route.ts` — understand planned spend API

---

## Feature 2 — Customisable PDF Performance Reports

### Goal
Generate a branded PDF performance report for any client, for any date range, with selectable sections. Can be triggered from:
1. A "Generate Report" button in the client dashboard
2. The Teams bot: `@PlanPulse generate May report for Nike`

### Report sections (all optional, user selects)
1. **Cover page** — Client name, logo, date range, PlanPulse branding
2. **Executive summary** — Health status, overall spend vs plan, key wins/flags (Claude-generated narrative)
3. **Spend overview** — Bar chart: planned vs actual by channel
4. **Channel performance** — Table: channel, spend, impressions, clicks, CTR, CPC, conversions, pacing status
5. **Google Analytics** — Sessions, users, conversions, top channels
6. **Action points summary** — Completed this period, outstanding, overdue
7. **Media plan snapshot** — Current flight dates and budget allocation

### Architecture

**2a. Report data API** — `src/app/api/clients/[id]/report-data/route.ts`

`GET ?start_date=&end_date=&sections=cover,summary,spend,channels,ga4,actions`

Fetches and returns all data needed for the selected sections in one call:
```typescript
{
  client: { id, name, logo_url, account_manager },
  health: { status, budget_health_pct, total_overdue_tasks },
  spend: { channels: [{ name, platform, planned, actual, variance_pct, impressions, clicks, ctr, cpc, conversions }] },
  ga4: { sessions, users, conversions, top_channels } | null,
  action_points: { completed_count, outstanding_count, overdue_count, overdue_items[] },
  media_plan: { channels: [{ name, budget, start, end }] },
  ai_summary: string,  // Claude-generated 3-4 sentence narrative
}
```

The `ai_summary` is generated server-side using `claude-haiku-4-5-20251001` with the data as context. Keep it to 80 tokens max.

**2b. PDF generation API** — `src/app/api/clients/[id]/report/route.ts`

`POST { start_date, end_date, sections[], format: 'pdf' | 'json' }`

- Fetches report data from the data API
- Uses **jsPDF** (already installed) to build the PDF programmatically (no html2canvas — too slow server-side)
- Returns `Content-Type: application/pdf` with the binary

**jsPDF approach** (programmatic, no screenshots):
```typescript
import jsPDF from 'jspdf';
const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
// Draw cover page, tables, text blocks manually
// Use doc.addImage() for logo if available
doc.save(); // or doc.output('arraybuffer') to return as response
```

**2c. Report builder UI component** — `src/components/dashboard-v2/report-builder-modal.tsx`

A modal dialog (similar to invoice-modal.tsx pattern):
- Date range picker
- Section checkboxes (all checked by default)
- "Generate PDF" button → POST to `/api/clients/${clientId}/report` → triggers browser download
- Loading state while generating

**2d. Add "Generate Report" button to client dashboard**

In `src/app/clients/[id]/dashboard/page.tsx` — add alongside the existing invoice button in the admin toggle. Opens `ReportBuilderModal`.

**2e. Add `generate_report` tool to agents**

Add to `src/lib/agent-tools.ts`:
```typescript
{
  name: 'generate_report',
  description: 'Generate a performance report for a client. Returns a summary of the report data and a download link.',
  input_schema: {
    properties: {
      client_name: { type: 'string' },
      start_date: { type: 'string' },
      end_date: { type: 'string' },
      sections: {
        type: 'array',
        items: { type: 'string', enum: ['summary', 'spend', 'channels', 'ga4', 'actions'] },
        description: 'Which sections to include. Omit for all sections.',
      },
    },
    required: ['client_name', 'start_date', 'end_date'],
  },
}
```

In the bot, the tool returns the report data summary and a direct download URL:
```
📊 Report generated — Nike (May 2026)

Health: 🟢 Green | Spend: $36.8k (+3% vs plan)
Meta: on track | Google: underpacing (-12%) | LinkedIn: on track

5 action points completed · 2 outstanding

📥 Download: https://app.planpulse.com/api/clients/abc123/report?token=xyz&start=2026-05-01&end=2026-05-31
```

The download link uses a short-lived signed token (store in Supabase or use a JWT) so it works without a session cookie.

### Key files to read first
- `src/components/dashboard-v2/invoice-modal.tsx` — use as structural reference
- `src/app/clients/[id]/dashboard/page.tsx` — find where to add the button
- `src/app/api/agency/chat/route.ts` — specifically `toolGetChannelPerformance()` and `toolGetClientIntelligence()` — reuse their data-fetching logic
- `src/app/api/ads/google-analytics/` — understand how GA4 data is fetched

---

## Feature 3 — Teams @mention Bot (Fix Async Timeout)

### The Problem
Microsoft Teams Outgoing Webhooks **require a response within 5 seconds** or the bot shows an error to the user. Claude Haiku + 1-2 tool calls typically takes 5-15 seconds.

The existing bot at `src/app/api/bots/teams/[userId]/route.ts` will time out on almost every real query.

### The Fix — Immediate ACK + Async Response

**Pattern:**
1. Return `{ type: 'message', text: '⏳ On it...' }` immediately (within ~100ms)
2. Run the Claude call + tool loop in the background
3. POST the real response to the Teams channel via the incoming webhook URL

This requires the `teams_webhook_url` to be set in `user_integrations` (for posting back), which the settings page already supports.

### Implementation

**3a. Restructure `src/app/api/bots/teams/[userId]/route.ts`**

```typescript
export async function POST(request, { params }) {
  const { userId } = await params;
  const rawBody = await request.text();

  // 1. Load config + validate HMAC (fast — just a DB read + crypto)
  const integration = await getIntegration(userId);
  if (!integration) return teamsResponse('Bot not configured.');
  if (!validateHmac(rawBody, request.headers.get('authorization'), integration.teams_bot_hmac_secret)) {
    return teamsResponse('Invalid signature.');
  }

  const query = stripHtml(JSON.parse(rawBody)?.text ?? '');
  if (!query) return teamsResponse('Ask me anything about your campaigns!');

  // 2. Return ACK immediately — Teams gets its 5s response
  // 3. Run Claude async (do NOT await)
  runClaudeAsync(query, userId, integration.teams_webhook_url).catch(console.error);

  return teamsResponse('⏳ On it...');
}

async function runClaudeAsync(query: string, userId: string, webhookUrl: string) {
  // Full Claude Haiku + tool loop here
  // At the end: sendTeamsAlert({ title: '', text: result, webhookUrl })
}
```

**3b. Make `runClaudeAsync` a proper background function**

The async function runs after the response is sent. On Vercel, use `waitUntil` from the Vercel Edge runtime if available, or just fire-and-forget (Node.js will keep the event loop alive for the duration of the serverless function invocation).

For Vercel: import `{ waitUntil } from '@vercel/functions'` and wrap:
```typescript
import { waitUntil } from '@vercel/functions';
// ...
waitUntil(runClaudeAsync(query, userId, integration.teams_webhook_url));
return teamsResponse('⏳ On it...');
```

**3c. Format the async response for Teams**

When posting back via the webhook, format as a proper MessageCard with the response text. Add a "Open Dashboard" button if the response references a specific client.

**3d. Handle edge cases**
- If `teams_webhook_url` is not set, fall back to trying to respond synchronously (fast queries may still work within 5s)
- If Claude errors, post an error message via webhook: "Something went wrong — try again"
- Strip markdown bold (`**text**`) from Claude responses for Teams — Teams renders `**text**` as `**text**` not bold in MessageCards. Use `__text__` or just plain text.

### Key files to read first
- `src/app/api/bots/teams/[userId]/route.ts` — the existing bot (full file)
- `src/lib/teams.ts` — the webhook sending helpers
- `src/app/api/settings/integrations/route.ts` — how `user_integrations` is read

---

## Build Order

```
1. Feature 3 (Teams bot async fix) — most impactful, unblocks everything else
   a. Restructure bot route with waitUntil + async Claude call
   b. Test with a real Teams @mention

2. Feature 1 (Invoice via agent)
   a. Create /api/clients/[id]/invoice/route.ts
   b. Add generate_invoice to agent-tools.ts
   c. Implement in chat route (toolGenerateInvoice)
   d. Implement in bot route (runBotTools case)
   e. Test via Teams: "@PlanPulse generate invoice for Nike for May"

3. Feature 2 (PDF Reports)
   a. Create /api/clients/[id]/report-data/route.ts
   b. Create /api/clients/[id]/report/route.ts (jsPDF generation)
   c. Create ReportBuilderModal component
   d. Add button to client dashboard
   e. Add generate_report tool to agents
   f. Test PDF download from UI
   g. Test via Teams: "@PlanPulse generate May report for Nike"
```

---

## Environment Variables Already in Use

```
ANTHROPIC_API_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
TEAMS_WEBHOOK_URL          (legacy single-tenant — now per-user in user_integrations)
CRON_SECRET
NEXT_PUBLIC_APP_URL
NANGO_SECRET_KEY_DEV_PLAN_CHECK
NEXT_PUBLIC_NANGO_PUBLIC_KEY
GOOGLE_ADS_DEVELOPER_TOKEN
GOOGLE_ADS_MCC_ID
```

New variable needed:
```
# None required — Teams webhook URL is now stored per-user in the user_integrations table
```

---

## Vercel Package Needed for Feature 3

```bash
npm install @vercel/functions
```

This provides `waitUntil()` which keeps the serverless function alive after the response is sent, allowing the async Claude call to complete.

---

## Key Design Decisions Already Made

- **Bot uses Claude Haiku**, not Opus — faster, cheaper, good enough for structured queries
- **Bot tools are a safe subset** — no `create_client`, no `update_media_plan_budget` (too high-risk for chat commands)
- **Multi-tenant** — all features scoped to `user_id`, no shared state between agencies
- **Teams webhook URL per user** — stored in `user_integrations`, not env vars
- **`user_integrations` table uses `as any` casts** — the Supabase generated types don't include it yet (migration must be run first, then `supabase gen types typescript` to update)
