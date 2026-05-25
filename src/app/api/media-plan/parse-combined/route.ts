import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedChannel {
  channelName: string;
  customChannelName: string;
  format: string;
  totalBudget: number;
  percentOfInvestment: number;
  flights: Array<{
    startDate: string;
    endDate: string;
    monthlySpend: Record<string, number>;
  }>;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const STANDARD_CHANNELS = [
  'Meta Ads','Google Ads','Display Ads','Native Ads','LinkedIn Ads','TikTok Ads',
  'Instagram Ads','YouTube Ads','Snapchat Ads','Reddit Ads',
  'Instagram (Organic)','Facebook (Organic)','LinkedIn (Organic)',
  'EDM / Email','OOH','Radio','Linear TV','SVOD','BVOD','Other',
];

const SKIP_ROW_RE = /^(total|sub\s*total|grand\s*total|gst|set\s*up|setup|production|management\s*fee|agency\s*fee|admin)\b/i;

function isFillColored(fill: ExcelJS.Fill | undefined): boolean {
  if (!fill || fill.type !== 'pattern') return false;
  const pf = fill as any;
  if (pf.pattern === 'none') return false;
  const fg = pf.fgColor;
  if (!fg) return false;
  if (fg.argb) {
    const hex = (fg.argb as string).toUpperCase();
    if (hex.startsWith('00') || hex === 'FFFFFFFF' || hex.length < 6) return false;
    const r = parseInt(hex.slice(-6, -4), 16);
    const g2 = parseInt(hex.slice(-4, -2), 16);
    const b = parseInt(hex.slice(-2), 16);
    return (0.299 * r + 0.587 * g2 + 0.114 * b) / 255 < 0.92;
  }
  if (fg.theme !== undefined) return (fg.tint ?? 0) < 0.9;
  if (fg.indexed !== undefined) return fg.indexed !== 65;
  return false;
}

function cellColFromRef(ref: string): number {
  const m = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!m) return 0;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return col;
}

function cellRowFromRef(ref: string): number {
  const m = ref.match(/^[A-Z]+(\d+)$/i);
  return m ? parseInt(m[1]) : 0;
}

function snapToMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function extractDollarAmount(cell: ExcelJS.Cell): number | null {
  let v: any = cell.value;
  if (cell.type === ExcelJS.ValueType.Formula) v = (cell.value as ExcelJS.CellFormulaValue)?.result;
  if (typeof v === 'number' && v >= 100) return Math.round(v);
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[$,\s]/g, ''));
    if (!isNaN(n) && n >= 100) return Math.round(n);
  }
  return null;
}

function parseFlexibleDate(raw: string, year: number): Date | null {
  const months: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const s = raw.trim().toLowerCase();
  let m = s.match(/^(\d{1,2})[\/\- ]([a-z]{3,})$/);
  if (m) { const mon = months[m[2].slice(0,3)]; if (mon) return new Date(year, mon-1, parseInt(m[1])); }
  m = s.match(/^([a-z]{3,})[\/\- ](\d{1,2})$/);
  if (m) { const mon = months[m[1].slice(0,3)]; if (mon) return new Date(year, mon-1, parseInt(m[2])); }
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m) { const day = parseInt(m[1]), mon = parseInt(m[2]); if (mon >= 1 && mon <= 12) return new Date(year, mon-1, day); }
  return null;
}

function buildMonthlySpend(
  startDate: Date, endDate: Date, totalBudget: number,
  cellSpendMap: Map<number, number>, dateColMap: Map<number, Date>
): Record<string, number> {
  const ms: Record<string, number> = {};
  if (cellSpendMap.size > 1) {
    for (const [col, amount] of cellSpendMap) {
      const d = dateColMap.get(col); if (!d) continue;
      const k = `${d.getFullYear()}-${d.getMonth()+1}`;
      ms[k] = (ms[k] ?? 0) + amount;
    }
    return ms;
  }
  const wc: Record<string, number> = {};
  let total = 0;
  const cur = new Date(startDate);
  while (cur <= endDate) { const k = `${cur.getFullYear()}-${cur.getMonth()+1}`; wc[k] = (wc[k] ?? 0) + 1; total++; cur.setDate(cur.getDate() + 7); }
  if (!total || !totalBudget) return {};
  let running = 0;
  const entries = Object.entries(wc);
  entries.forEach(([k, weeks], i) => {
    if (i === entries.length - 1) ms[k] = totalBudget - running;
    else { const share = Math.round((weeks / total) * totalBudget); ms[k] = share; running += share; }
  });
  return ms;
}

async function mapChannelNames(rawNames: string[], anthropic: Anthropic): Promise<Array<{ channelName: string; customChannelName: string }>> {
  if (rawNames.length === 0) return [];
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 800,
    messages: [{ role: 'user', content: `Map each raw channel name to the closest standard media channel using advertising knowledge.
Standard: ${STANDARD_CHANNELS.join(', ')}
OOH sub-types: OOH - BUS BACKS, OOH - BUS SHELTERS, OOH - BILLBOARDS, OOH - DIGITAL BILLBOARDS, OOH - TRANSIT, OOH - POSTERS, OOH - STREET FURNITURE, OOH - LETTERBOX DROPS, OOH - OUTDOOR
"Search"/"Paid Search"/"SEM" → "Google Ads". "Paid Social" → "Meta Ads". Organic → respective Organic channel.
No match: channelName "Other", original in customChannelName. customChannelName empty otherwise.
Input: ${JSON.stringify(rawNames)}
Return ONLY JSON array same order: [{"channelName":"...","customChannelName":""}]` }],
  });
  const text = res.content.find(b => b.type === 'text')?.text ?? '';
  let parsed: Array<{ channelName: string; customChannelName: string }> | null = null;
  try { parsed = JSON.parse(text.trim()); } catch { /* */ }
  if (!parsed) { const stripped = text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```\s*$/i,'').trim(); try { parsed = JSON.parse(stripped); } catch { /* */ } }
  if (!parsed) { const m = text.match(/\[[\s\S]*\]/); if (m) try { parsed = JSON.parse(m[0]); } catch { /* */ } }
  if (!parsed || !Array.isArray(parsed)) return rawNames.map(n => ({ channelName: 'Other', customChannelName: n }));
  return parsed.map((e, i) => {
    const cn = e?.channelName ?? 'Other';
    return (STANDARD_CHANNELS.includes(cn) || cn.startsWith('OOH - ')) ? { channelName: cn, customChannelName: e?.customChannelName ?? '' } : { channelName: 'Other', customChannelName: rawNames[i] };
  });
}

// ── XLSX auto-parse (no user row selection required) ──────────────────────────

async function autoParseXlsx(file: File, year: number, anthropic: Anthropic): Promise<ParsedChannel[]> {
  const bytes = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    // @ts-expect-error ExcelJS types expect legacy Buffer
    await workbook.xlsx.load(Buffer.from(bytes));
  } catch { return []; }

  let ws = workbook.worksheets[0];
  let bestScore = 0;
  for (const sheet of workbook.worksheets.slice(0, 3)) {
    let score = 0; sheet.eachRow({ includeEmpty: false }, row => { score += row.actualCellCount; });
    if (score > bestScore) { bestScore = score; ws = sheet; }
  }

  const mergedRanges: Array<{ startRow: number; endRow: number; startCol: number; endCol: number }> = [];
  const mc = (ws as any).model?.merges as string[] | undefined;
  if (mc) {
    for (const range of mc) {
      const [s, e] = range.split(':'); if (!s || !e) continue;
      mergedRanges.push({ startRow: cellRowFromRef(s), endRow: cellRowFromRef(e), startCol: cellColFromRef(s), endCol: cellColFromRef(e) });
    }
  }

  const getMasterCell = (rn: number, cn: number): ExcelJS.Cell => {
    for (const mr of mergedRanges) {
      if (rn >= mr.startRow && rn <= mr.endRow && cn >= mr.startCol && cn <= mr.endCol)
        return ws.getCell(mr.startRow, mr.startCol);
    }
    return ws.getCell(rn, cn);
  };
  const getMasterFill = (rn: number, cn: number) => getMasterCell(rn, cn).fill as ExcelJS.Fill | undefined;
  const getMasterValue = (rn: number, cn: number) => getMasterCell(rn, cn).value;
  const isMergeSlave = (rn: number, cn: number) =>
    mergedRanges.some(mr => rn >= mr.startRow && rn <= mr.endRow && cn >= mr.startCol && cn <= mr.endCol && !(mr.startRow === rn && mr.startCol === cn));

  // Find date header row
  let dateHeaderRowNumber = 1, bestDateCount = 0;
  for (let rn = 1; rn <= Math.min(ws.rowCount, 15); rn++) {
    let dc = 0;
    ws.getRow(rn).eachCell({ includeEmpty: false }, cell => {
      let v: any = cell.value;
      if (v !== null && typeof v === 'object' && 'result' in v) v = (v as any).result;
      if (v instanceof Date) { dc++; }
      else if (typeof v === 'number' && v > 1 && v < 100000) { const d = new Date(new Date(1899,11,30).getTime() + v*86400000); if (!isNaN(d.getTime()) && d.getFullYear() > 1990) dc++; }
      else if (typeof v === 'string' && /^\d{1,2}[\/\- ][a-zA-Z]{3,}$|^[a-zA-Z]{3,}[\/\- ]\d{1,2}$/.test(v.trim())) dc++;
    });
    if (dc > bestDateCount) { bestDateCount = dc; dateHeaderRowNumber = rn; }
  }
  if (bestDateCount < 3) return [];

  const dateColMap = new Map<number, Date>();
  ws.getRow(dateHeaderRowNumber).eachCell({ includeEmpty: false }, (cell, colNum) => {
    let d: Date | null = null;
    let v: any = cell.value;
    if (v !== null && typeof v === 'object' && 'result' in v) v = (v as any).result;
    if (v instanceof Date && !isNaN(v.getTime())) d = v;
    else if (typeof v === 'number' && v > 1 && v < 100000) { const c = new Date(new Date(1899,11,30).getTime() + v*86400000); if (!isNaN(c.getTime())) d = c; }
    else if (typeof v === 'string') d = parseFlexibleDate(v, year);
    if (d && !isNaN(d.getTime())) dateColMap.set(colNum, snapToMonday(new Date(year, d.getMonth(), d.getDate())));
  });
  if (dateColMap.size === 0) return [];

  // Strip trailing isolated columns
  const allCols = Array.from(dateColMap.keys()).sort((a,b) => a-b);
  if (allCols.length >= 3) {
    const steps = allCols.slice(1).map((c,i) => c - allCols[i]).sort((a,b) => a-b);
    const med = steps[Math.floor(steps.length / 2)];
    for (let i = allCols.length - 1; i > 0; i--) {
      if (allCols[i] - allCols[i-1] > med * 2) dateColMap.delete(allCols[i]); else break;
    }
  }

  const dateCols = Array.from(dateColMap.keys()).sort((a,b) => a-b);
  const firstDateCol = dateCols[0];
  const lastDateCol  = dateCols[dateCols.length - 1];

  // Auto-detect channel rows: any row with text label + colored/merged cells or spend values
  const channelRows: number[] = [];
  for (let rn = dateHeaderRowNumber + 1; rn <= ws.rowCount; rn++) {
    const label = String(getMasterValue(rn, 1) ?? '').trim() || String(getMasterValue(rn, 2) ?? '').trim();
    if (!label || /^\d+(\.\d+)?$/.test(label) || SKIP_ROW_RE.test(label)) continue;

    let hasColor = false, hasSpend = false;
    for (const col of dateCols) { if (isFillColored(getMasterFill(rn, col))) { hasColor = true; break; } }
    for (const col of dateCols) { if (extractDollarAmount(ws.getCell(rn, col)) !== null) { hasSpend = true; break; } }
    const hasMerge = mergedRanges.some(mr => mr.startRow === rn && mr.endCol >= firstDateCol && mr.startCol <= lastDateCol);

    if (hasColor || hasSpend || hasMerge) channelRows.push(rn);
  }
  if (channelRows.length === 0) return [];

  // Extract channels
  interface RawFlight { startDate: Date; endDate: Date; totalBudget: number; cellSpendMap: Map<number, number>; }
  const rawChannels: Array<{ rawName: string; formatText: string; flights: RawFlight[] }> = [];

  for (const rowNum of channelRows) {
    const rawName = String(getMasterValue(rowNum, 1) ?? '').trim() || String(getMasterValue(rowNum, 2) ?? '').trim();
    if (!rawName) continue;
    const formatText = String(ws.getCell(rowNum, 2).value ?? '').trim();

    const rowMerges = mergedRanges.filter(mr => mr.startRow === rowNum && mr.endCol >= firstDateCol && mr.startCol <= lastDateCol);
    const mergeBlocks: Array<{ startCol: number; endCol: number; masterCell: ExcelJS.Cell }> = [];
    for (const mr of rowMerges) {
      const masterCell = ws.getCell(mr.startRow, mr.startCol);
      if (isFillColored(masterCell.fill as ExcelJS.Fill | undefined)) mergeBlocks.push({ startCol: mr.startCol, endCol: mr.endCol, masterCell });
    }

    const individualCells: Array<{ col: number; dollar: number | null }> = [];
    for (const col of dateCols) {
      if (isMergeSlave(rowNum, col) || mergeBlocks.some(mb => col >= mb.startCol && col <= mb.endCol)) continue;
      if (isFillColored(getMasterFill(rowNum, col))) individualCells.push({ col, dollar: extractDollarAmount(ws.getCell(rowNum, col)) });
    }

    const flights: RawFlight[] = [];

    for (const mb of mergeBlocks) {
      let sc = Math.max(mb.startCol, firstDateCol); while (sc <= mb.endCol && !dateColMap.has(sc)) sc++;
      let ec = Math.min(mb.endCol, lastDateCol); while (ec > sc && !dateColMap.has(ec)) ec--;
      const sd = dateColMap.get(sc); const ed = dateColMap.get(ec); if (!sd || !ed) continue;
      const fe = new Date(ed); fe.setDate(fe.getDate() + 6);
      const csm = new Map<number, number>();
      const dollar = extractDollarAmount(mb.masterCell); if (dollar !== null) csm.set(sc, dollar);
      flights.push({ startDate: sd, endDate: fe, totalBudget: Array.from(csm.values()).reduce((s,v) => s+v, 0), cellSpendMap: csm });
    }

    if (individualCells.length > 0) {
      let rs = individualCells[0], re = individualCells[0], rc: typeof individualCells = [individualCells[0]];
      const commit = () => {
        const sd = dateColMap.get(rs.col); const ed = dateColMap.get(re.col); if (!sd || !ed) return;
        const fe = new Date(ed); fe.setDate(fe.getDate() + 6);
        const csm = new Map<number, number>(); for (const cb of rc) if (cb.dollar !== null) csm.set(cb.col, cb.dollar);
        flights.push({ startDate: sd, endDate: fe, totalBudget: Array.from(csm.values()).reduce((s,v) => s+v, 0), cellSpendMap: csm });
      };
      for (let i = 1; i < individualCells.length; i++) {
        const gap = dateCols.indexOf(individualCells[i].col) - dateCols.indexOf(individualCells[i-1].col) - 1;
        if (gap >= 2) { commit(); rs = individualCells[i]; rc = []; }
        re = individualCells[i]; rc.push(individualCells[i]);
      }
      commit();
    }

    // Label-column budget fallback
    if (flights.reduce((s,f) => s + f.totalBudget, 0) === 0 && flights.length > 0) {
      for (let c = 1; c < firstDateCol; c++) {
        const d = extractDollarAmount(ws.getCell(rowNum, c));
        if (d !== null && d >= 500) {
          const pp = Math.round(d / flights.length);
          flights.forEach((f, i) => { f.totalBudget = i === flights.length - 1 ? d - pp * (flights.length - 1) : pp; });
          break;
        }
      }
    }

    rawChannels.push({ rawName, formatText, flights });
  }

  const mappedNames = await mapChannelNames(rawChannels.map(c => c.rawName), anthropic);
  const grandTotal = rawChannels.reduce((s, ch) => s + ch.flights.reduce((ss,f) => ss + f.totalBudget, 0), 0);

  return rawChannels.map((ch, i) => {
    const { channelName, customChannelName } = mappedNames[i] ?? { channelName: 'Other', customChannelName: ch.rawName };
    const budget = ch.flights.reduce((s,f) => s + f.totalBudget, 0);
    const pf = ch.flights.map(f => ({
      startDate: toISO(f.startDate), endDate: toISO(f.endDate),
      monthlySpend: buildMonthlySpend(f.startDate, f.endDate, f.totalBudget, f.cellSpendMap, dateColMap),
    }));
    if (pf.length === 0) { const fd = dateColMap.get(firstDateCol)!; pf.push({ startDate: toISO(fd), endDate: toISO(fd), monthlySpend: {} }); }
    return { channelName, customChannelName: customChannelName || '', format: ch.formatText, totalBudget: budget, percentOfInvestment: grandTotal > 0 ? Math.round((budget / grandTotal) * 100) : 0, flights: pf };
  });
}

// ── Vision prompt (same as parse-screenshot) ──────────────────────────────────

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
  If a dollar amount is written inside that cell, append it: 16/Feb($6,000)
  If no dollar amount, just write the date: 23/Feb

• NO (white / blank) — do NOT include that date.
  Instead, write a pipe character | to mark the gap between two separate groups.

Collapse consecutive pipe symbols into one.

Example — Radio with 3 separate bursts:
FILLED: 9/Feb($6,000), 16/Feb, 23/Feb | 1/Jun($3,000) | 7/Sep($3,000), 14/Sep

Example — Google Ads active all year:
FILLED: 5/Jan($2,750), 12/Jan, 19/Jan, 26/Jan, 2/Feb($2,750), 9/Feb, 16/Feb, 23/Feb, ...

━━ When to use | vs comma ━━
COMMA — same campaign continues: weeks within a burst, or monthly budget cells of an ongoing run.
PIPE — campaign goes DARK for 8+ consecutive empty W/C weeks before resuming.

━━ Organic rows ━━
Rows with a full-year diagonal-stripe band and NO dollar amounts are organic social.
Write: FILLED: ORGANIC

━━ Rows with no fill at all ━━
Write: FILLED: (none)

Work top to bottom. Do not skip any row. Plain text only — no JSON.`;
}

// ── Reconciliation ────────────────────────────────────────────────────────────

function buildReconcilePrompt(xlsxChannels: ParsedChannel[], visionDescription: string, year: number): string {
  const firstMonday = (() => {
    const d = new Date(year, 0, 1); const day = d.getDay(); const add = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
    d.setDate(1 + add); return `${year}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  return `You are producing a final media plan by reconciling two independent readings of the same document.

SOURCE A — Excel data (precise dollar amounts, auto-parsed):
${JSON.stringify(xlsxChannels, null, 2)}

SOURCE B — Visual screenshot description (accurate channel names and flight layout):
${visionDescription}

═══ RECONCILIATION RULES ═══

1. CHANNEL MATCHING: Match channels across A and B by meaning, not exact name.
   Examples: "Search" / "Paid Search" / "SEM" in B = "Google Ads" in A.
   "Paid Social" / "Social Media" in B = "Meta Ads" in A.
   Use common sense — agency plans use non-standard names.

2. For MATCHED channels (same channel in both sources):
   • channelName: use the STANDARD name from A (already AI-mapped), or from B's description if clearer
   • totalBudget: use A's value (exact from Excel)
   • flights: use the startDate/endDate from B's visual description (coloured block detection is reliable)
   • monthlySpend: distribute A's budget proportionally across B's flight periods by week count

3. For channels ONLY in A (Excel has it, not visible in screenshot): include as-is from A

4. For channels ONLY in B (visible in screenshot, not in Excel): include with the budget visible in the screenshot description (or 0 if none shown)

5. CHANNEL NAME must be exactly one of these standard names:
   "Meta Ads", "Google Ads", "Display Ads", "Native Ads", "LinkedIn Ads", "TikTok Ads",
   "Instagram Ads", "YouTube Ads", "Snapchat Ads", "Reddit Ads",
   "Instagram (Organic)", "Facebook (Organic)", "LinkedIn (Organic)",
   "EDM / Email", "OOH", "Radio", "Linear TV", "SVOD", "BVOD", "Other"
   OOH sub-types: "OOH - BUS BACKS", "OOH - BUS SHELTERS", "OOH - BILLBOARDS",
   "OOH - DIGITAL BILLBOARDS", "OOH - TRANSIT", "OOH - POSTERS", "OOH - STREET FURNITURE",
   "OOH - LETTERBOX DROPS", "OOH - OUTDOOR"
   Non-standard names: channelName = "Other", original in customChannelName.

6. DATE HANDLING:
   • All dates YYYY-MM-DD format, year ${year}
   • endDate = last W/C Monday of flight + 6 days (end of that week)
   • FILLED: ORGANIC → startDate "${firstMonday}", endDate = last Monday of year + 6

7. monthlySpend keys: "YYYY-M" (e.g. "${year}-3" for March)
   Sum of all monthlySpend across all flights must equal channel totalBudget exactly.

8. percentOfInvestment: round(channelBudget / grandTotal × 100), must sum to ~100.

9. format: the detail/placement text if visible. Empty string if not.

Return ONLY valid JSON, no markdown, no explanation:
{
  "channels": [
    {
      "channelName": "...",
      "customChannelName": "",
      "format": "...",
      "totalBudget": 0,
      "percentOfInvestment": 0,
      "flights": [
        { "startDate": "${year}-01-06", "endDate": "${year}-03-30", "monthlySpend": { "${year}-1": 0, "${year}-2": 0, "${year}-3": 0 } }
      ]
    }
  ]
}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const xlsxFile    = formData.get('file') as File | null;
  const screenshotFile = formData.get('screenshot') as File | null;
  const yearParam   = formData.get('year') as string | null;
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

  if (!xlsxFile && !screenshotFile) {
    return NextResponse.json({ error: 'Provide at least one file (Excel and/or screenshot).' }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // ── Step 1: Parse XLSX (auto-detect rows, runs in parallel with vision) ──────
  const xlsxPromise = xlsxFile
    ? autoParseXlsx(xlsxFile, year, anthropic).catch(() => [] as ParsedChannel[])
    : Promise.resolve([] as ParsedChannel[]);

  // ── Step 2: Screenshot vision Pass 1 — enumerate filled cells ───────────────
  let visionDescription = '';
  if (screenshotFile) {
    const imgBytes = await screenshotFile.arrayBuffer();
    const imgBase64 = Buffer.from(imgBytes).toString('base64');
    const mimeType = (screenshotFile.type || 'image/png') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const validMimes = ['image/jpeg','image/png','image/gif','image/webp'];
    if (!validMimes.includes(mimeType)) {
      return NextResponse.json({ error: 'Unsupported image type. Use PNG, JPG, GIF or WEBP.' }, { status: 400 });
    }

    try {
      const [xlsxChannels, visionRes] = await Promise.all([
        xlsxPromise,
        anthropic.messages.create({
          model: 'claude-opus-4-7',
          max_tokens: 6000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: imgBase64 } },
              { type: 'text', text: buildVisionPrompt() },
            ],
          }],
        }),
      ]);

      visionDescription = visionRes.content.find(b => b.type === 'text')?.text ?? '';

      // ── Step 3: Reconcile XLSX data + vision description ─────────────────────
      if (!visionDescription.trim()) {
        // Vision failed — fall back to XLSX only
        return NextResponse.json({ channels: xlsxChannels, source: 'xlsx-only' });
      }

      if (xlsxChannels.length === 0) {
        // XLSX failed — fall back to screenshot-only (re-run structure pass)
        const yearMatch = visionDescription.match(/\b(20\d{2})\b/);
        const detectedYear = yearMatch ? parseInt(yearMatch[1]) : year;
        const structPrompt = buildStructurePromptFallback(visionDescription, detectedYear);
        const structRes = await anthropic.messages.create({
          model: 'claude-opus-4-7', max_tokens: 8192,
          messages: [{ role: 'user', content: structPrompt }],
        });
        const structText = structRes.content.find(b => b.type === 'text')?.text ?? '';
        const parsed = tryParseJSON<{ channels: ParsedChannel[] }>(structText);
        return NextResponse.json({ channels: parsed?.channels ?? [], source: 'screenshot-only' });
      }

      // Both sources available — reconcile
      const reconcileRes = await anthropic.messages.create({
        model: 'claude-opus-4-7', max_tokens: 8192,
        messages: [{ role: 'user', content: buildReconcilePrompt(xlsxChannels, visionDescription, year) }],
      });

      const reconcileText = reconcileRes.content.find(b => b.type === 'text')?.text ?? '';
      const merged = tryParseJSON<{ channels: ParsedChannel[] }>(reconcileText);

      if (!merged?.channels?.length) {
        // Reconciliation failed — return whichever source has more channels
        return NextResponse.json({ channels: xlsxChannels.length >= 1 ? xlsxChannels : [], source: 'xlsx-fallback' });
      }

      return NextResponse.json({ channels: merged.channels, source: 'combined' });

    } catch (err: any) {
      console.error('parse-combined error:', err);
      return NextResponse.json({ error: err.message ?? 'Failed to analyse files' }, { status: 500 });
    }
  }

  // Screenshot not provided — XLSX only
  const xlsxChannels = await xlsxPromise;
  if (xlsxChannels.length === 0) {
    return NextResponse.json({ error: 'Could not extract channels from the Excel file.' }, { status: 422 });
  }
  return NextResponse.json({ channels: xlsxChannels, source: 'xlsx-only' });
}

// ── Fallback: screenshot-only structure pass ──────────────────────────────────

function buildStructurePromptFallback(description: string, year: number): string {
  const firstMonday = (() => {
    const d = new Date(year, 0, 1); const day = d.getDay(); const add = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
    d.setDate(1 + add); return `${year}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const lastMonday = (() => {
    const d = new Date(year, 11, 31); const day = d.getDay(); d.setDate(31 - (day === 0 ? 6 : day - 1));
    return `${year}-12-${String(d.getDate()).padStart(2,'0')}`;
  })();

  return `Convert this media plan description to structured JSON. Plan year: ${year}.

${description}

Channel names must be exactly one of: ${STANDARD_CHANNELS.join(', ')}
OOH sub-types: OOH - BUS BACKS, OOH - BUS SHELTERS, OOH - BILLBOARDS, OOH - DIGITAL BILLBOARDS, OOH - TRANSIT, OOH - POSTERS, OOH - STREET FURNITURE, OOH - LETTERBOX DROPS, OOH - OUTDOOR
FILLED: ORGANIC → startDate "${firstMonday}", endDate "${lastMonday}", totalBudget 0, monthlySpend {}
monthlySpend keys: "YYYY-M". Dates: YYYY-MM-DD.

Return ONLY valid JSON:
{"channels":[{"channelName":"...","customChannelName":"","format":"...","totalBudget":0,"percentOfInvestment":0,"flights":[{"startDate":"...","endDate":"...","monthlySpend":{}}]}]}`;
}

function tryParseJSON<T>(text: string): T | null {
  try { return JSON.parse(text.trim()); } catch { /* */ }
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```\s*$/i,'').trim()); } catch { /* */ }
  const m = text.match(/\{[\s\S]*\}/); if (m) try { return JSON.parse(m[0]); } catch { /* */ }
  return null;
}
