import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import type { ParsedChannel } from '../parse-screenshot/route';

const STANDARD_CHANNELS = [
  'Meta Ads','Google Ads','Display Ads','Native Ads','LinkedIn Ads','TikTok Ads',
  'Instagram Ads','YouTube Ads','Snapchat Ads','Reddit Ads',
  'Instagram (Organic)','Facebook (Organic)','LinkedIn (Organic)',
  'EDM / Email','OOH','Radio','Linear TV','SVOD','BVOD','Other',
];

const OOH_SUBTYPES: Record<string, string> = {
  'bus back': 'OOH - BUS BACKS', 'bus backs': 'OOH - BUS BACKS',
  'bus shelter': 'OOH - BUS SHELTERS', 'bus shelters': 'OOH - BUS SHELTERS',
  'billboard': 'OOH - BILLBOARDS', 'billboards': 'OOH - BILLBOARDS',
  'digital billboard': 'OOH - DIGITAL BILLBOARDS', 'dooh': 'OOH - DIGITAL BILLBOARDS',
  'transit': 'OOH - TRANSIT', 'transport': 'OOH - TRANSIT',
  'poster': 'OOH - POSTERS', 'posters': 'OOH - POSTERS',
  'street furniture': 'OOH - STREET FURNITURE',
  'letterbox': 'OOH - LETTERBOX DROPS', 'letterbox drop': 'OOH - LETTERBOX DROPS',
  'outdoor': 'OOH - OUTDOOR',
};

function isColoredFill(argb: string | undefined): boolean {
  if (!argb) return false;
  const hex = argb.toUpperCase();
  if (hex.startsWith('00')) return false;
  if (hex === 'FFFFFFFF') return false;
  if (hex.length < 6) return false;
  const r = parseInt(hex.slice(-6, -4), 16);
  const g = parseInt(hex.slice(-4, -2), 16);
  const b = parseInt(hex.slice(-2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.92;
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
  if (cell.type === ExcelJS.ValueType.Formula) {
    v = (cell.value as ExcelJS.CellFormulaValue)?.result;
  }
  if (typeof v === 'number' && v >= 100) return Math.round(v);
  if (typeof v === 'string') {
    const clean = v.replace(/[$,\s]/g, '');
    const n = parseFloat(clean);
    if (!isNaN(n) && n >= 100) return Math.round(n);
  }
  return null;
}

function parseFlexibleDate(raw: string, year: number): Date | null {
  const months: Record<string, number> = {
    jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12
  };
  const s = raw.trim().toLowerCase();
  // "5 jan" or "5/jan" or "5-jan"
  let m = s.match(/^(\d{1,2})[\/\- ]([a-z]{3,})$/);
  if (m) {
    const mon = months[m[2].slice(0,3)];
    if (mon) return new Date(year, mon-1, parseInt(m[1]));
  }
  // "jan 5" or "jan/5"
  m = s.match(/^([a-z]{3,})[\/\- ](\d{1,2})$/);
  if (m) {
    const mon = months[m[1].slice(0,3)];
    if (mon) return new Date(year, mon-1, parseInt(m[2]));
  }
  // "5/1" or "5-1" (day/month)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const day = parseInt(m[1]), mon = parseInt(m[2]);
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) return new Date(year, mon-1, day);
  }
  return null;
}

function buildMonthlySpend(
  startDate: Date,
  endDate: Date,
  totalBudget: number,
  cellSpendMap: Map<number, number>, // colNumber → $ amount
  dateColMap: Map<number, Date>
): Record<string, number> {
  const monthlySpend: Record<string, number> = {};

  if (cellSpendMap.size > 1) {
    // Multiple spend cells: map each to its calendar month
    for (const [col, amount] of cellSpendMap) {
      const d = dateColMap.get(col);
      if (!d) continue;
      const key = `${d.getFullYear()}-${d.getMonth()+1}`;
      monthlySpend[key] = (monthlySpend[key] ?? 0) + amount;
    }
    return monthlySpend;
  }

  // Single or no spend cell: distribute proportionally by week count per month
  const weekCounts: Record<string, number> = {};
  let totalWeeks = 0;
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const key = `${cur.getFullYear()}-${cur.getMonth()+1}`;
    weekCounts[key] = (weekCounts[key] ?? 0) + 1;
    totalWeeks++;
    cur.setDate(cur.getDate() + 7);
  }

  if (totalWeeks === 0 || totalBudget === 0) return {};

  let running = 0;
  const entries = Object.entries(weekCounts);
  entries.forEach(([key, weeks], i) => {
    if (i === entries.length - 1) {
      monthlySpend[key] = totalBudget - running;
    } else {
      const share = Math.round((weeks / totalWeeks) * totalBudget);
      monthlySpend[key] = share;
      running += share;
    }
  });

  return monthlySpend;
}

async function mapChannelNames(
  rawNames: string[],
  anthropic: Anthropic
): Promise<Array<{ channelName: string; customChannelName: string }>> {
  if (rawNames.length === 0) return [];

  const prompt = `Map each raw channel name to the closest standard media channel name from this list:
${STANDARD_CHANNELS.join(', ')}

OOH sub-types → use "OOH - [SUBTYPE]" format exactly:
OOH - BUS BACKS, OOH - BUS SHELTERS, OOH - BILLBOARDS, OOH - DIGITAL BILLBOARDS,
OOH - TRANSIT, OOH - POSTERS, OOH - STREET FURNITURE, OOH - LETTERBOX DROPS, OOH - OUTDOOR

Rules:
- If the name clearly matches a standard channel, use it exactly
- If OOH/outdoor subtype, use the OOH - SUBTYPE format
- If organic social, use "Instagram (Organic)", "Facebook (Organic)", or "LinkedIn (Organic)"
- If no match: channelName = "Other", put the original name in customChannelName
- customChannelName is empty string unless channelName is "Other"

Input (JSON array of raw names):
${JSON.stringify(rawNames)}

Return ONLY a JSON array in the same order as the input, no explanation:
[{"channelName":"...","customChannelName":""}]`;

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content.find(b => b.type === 'text')?.text ?? '';
  let parsed: Array<{ channelName: string; customChannelName: string }> | null = null;

  try { parsed = JSON.parse(text.trim()); } catch { /* fall through */ }
  if (!parsed) {
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try { parsed = JSON.parse(stripped); } catch { /* fall through */ }
  }
  if (!parsed) {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) try { parsed = JSON.parse(m[0]); } catch { /* fall through */ }
  }

  // Fallback: use raw names as "Other"
  if (!parsed || !Array.isArray(parsed)) {
    return rawNames.map(n => ({ channelName: 'Other', customChannelName: n }));
  }

  // Validate each entry is a known channel or OOH subtype
  return parsed.map((entry, i) => {
    const cn = entry?.channelName ?? 'Other';
    const isStandard = STANDARD_CHANNELS.includes(cn) || cn.startsWith('OOH - ');
    if (!isStandard) return { channelName: 'Other', customChannelName: rawNames[i] };
    return { channelName: cn, customChannelName: entry?.customChannelName ?? '' };
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const yearParam = formData.get('year') as string | null;
  const dateHeaderRowParam = formData.get('dateHeaderRow') as string | null;
  const channelRowsParam = formData.get('channelRows') as string | null;
  const detailColParam = formData.get('detailColumnIndex') as string | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
  const dateHeaderRow = dateHeaderRowParam ? parseInt(dateHeaderRowParam) : 1;
  const channelRows: number[] = channelRowsParam ? JSON.parse(channelRowsParam) : [];
  const detailColIndex: number | null = (detailColParam && detailColParam !== 'null')
    ? parseInt(detailColParam) : null;

  if (channelRows.length === 0) {
    return NextResponse.json({ error: 'No channel rows selected.' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as Buffer);
  } catch {
    return NextResponse.json({ error: 'Could not read the Excel file.' }, { status: 400 });
  }

  // Pick best sheet (most data)
  let ws = workbook.worksheets[0];
  let bestScore = 0;
  for (const sheet of workbook.worksheets.slice(0, 3)) {
    let score = 0;
    sheet.eachRow({ includeEmpty: false }, (row) => { score += row.actualCellCount; });
    if (score > bestScore) { bestScore = score; ws = sheet; }
  }

  // Build merged cell ranges
  const mergedRanges: Array<{
    startRow: number; endRow: number; startCol: number; endCol: number;
  }> = [];
  const mergeCells = (ws as any).model?.merges as string[] | undefined;
  if (mergeCells) {
    for (const range of mergeCells) {
      const [start, end] = range.split(':');
      if (!start || !end) continue;
      mergedRanges.push({
        startRow: cellRowFromRef(start), endRow: cellRowFromRef(end),
        startCol: cellColFromRef(start), endCol: cellColFromRef(end),
      });
    }
  }

  function getMasterCell(rowNum: number, colNum: number): ExcelJS.Cell {
    for (const mr of mergedRanges) {
      if (rowNum >= mr.startRow && rowNum <= mr.endRow &&
          colNum >= mr.startCol && colNum <= mr.endCol) {
        return ws.getCell(mr.startRow, mr.startCol);
      }
    }
    return ws.getCell(rowNum, colNum);
  }

  function getMasterFillArgb(rowNum: number, colNum: number): string | undefined {
    const master = getMasterCell(rowNum, colNum);
    const fill = master.fill as ExcelJS.Fill | undefined;
    if (fill && fill.type === 'pattern') return (fill as any).fgColor?.argb as string | undefined;
    return undefined;
  }

  // Build date column map from header row
  const dateColMap = new Map<number, Date>(); // colNumber → snapped Monday
  const headerRow = ws.getRow(dateHeaderRow);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
    let d: Date | null = null;
    const v = cell.value;
    if (v instanceof Date && !isNaN(v.getTime())) {
      d = v;
    } else if (typeof v === 'number' && v > 1 && v < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const candidate = new Date(excelEpoch.getTime() + v * 86400000);
      if (!isNaN(candidate.getTime())) d = candidate;
    } else if (typeof v === 'string') {
      d = parseFlexibleDate(v, year);
    }
    if (d && !isNaN(d.getTime())) {
      // Force year
      d = new Date(year, d.getMonth(), d.getDate());
      dateColMap.set(colNum, snapToMonday(d));
    }
  });

  if (dateColMap.size === 0) {
    return NextResponse.json({ error: 'Could not read date columns from the specified header row.' }, { status: 400 });
  }

  const dateCols = Array.from(dateColMap.keys()).sort((a, b) => a - b);
  const firstDateCol = dateCols[0];
  const lastDateCol  = dateCols[dateCols.length - 1];

  // Helper: is (row, col) a merge slave (not the top-left master)?
  function isMergeSlave(rowNum: number, colNum: number): boolean {
    return mergedRanges.some(mr =>
      rowNum >= mr.startRow && rowNum <= mr.endRow &&
      colNum >= mr.startCol && colNum <= mr.endCol &&
      !(mr.startRow === rowNum && mr.startCol === colNum)
    );
  }

  // Per-channel extraction
  interface RawFlight {
    startDate: Date;
    endDate: Date;
    totalBudget: number;
    cellSpendMap: Map<number, number>;
  }

  const rawChannels: Array<{
    rawName: string;
    formatText: string;
    flights: RawFlight[];
  }> = [];

  for (const rowNum of channelRows) {
    const labelCell = ws.getCell(rowNum, 1);
    const rawName = String(labelCell.value ?? '').trim();
    if (!rawName) continue;

    const formatText = detailColIndex !== null
      ? String(ws.getCell(rowNum, detailColIndex + 1).value ?? '').trim()
      : '';

    // Collect merged ranges that start on this row within the date range
    const rowMerges = mergedRanges.filter(mr =>
      mr.startRow === rowNum &&
      mr.startCol >= firstDateCol &&
      mr.startCol <= lastDateCol
    );

    // Build a set of columns covered by merges
    const mergeBlocks: Array<{ startCol: number; endCol: number; masterCell: ExcelJS.Cell }> = [];
    for (const mr of rowMerges) {
      const masterCell = ws.getCell(mr.startRow, mr.startCol);
      const fill = masterCell.fill as ExcelJS.Fill | undefined;
      const argb = fill && fill.type === 'pattern' ? (fill as any).fgColor?.argb as string | undefined : undefined;
      if (isColoredFill(argb)) {
        mergeBlocks.push({ startCol: mr.startCol, endCol: mr.endCol, masterCell });
      }
    }

    // Collect individual colored cells (not merge slaves)
    type CellBlock = { col: number; argb: string; dollar: number | null };
    const individualCells: CellBlock[] = [];
    for (const col of dateCols) {
      if (isMergeSlave(rowNum, col)) continue;
      if (mergeBlocks.some(mb => col >= mb.startCol && col <= mb.endCol)) continue;
      const cell = ws.getCell(rowNum, col);
      const argb = getMasterFillArgb(rowNum, col);
      if (isColoredFill(argb)) {
        individualCells.push({ col, argb: argb!, dollar: extractDollarAmount(cell) });
      }
    }

    // Group individual cells into consecutive runs (gap > 1 uncoloured col = new flight)
    const flights: RawFlight[] = [];

    // From merge blocks first
    for (const mb of mergeBlocks) {
      const masterCell = mb.masterCell;
      const startDate = dateColMap.get(mb.startCol);
      // Find the closest date col at or before endCol
      let endDateCol = mb.endCol;
      while (endDateCol > mb.startCol && !dateColMap.has(endDateCol)) endDateCol--;
      const endDate = dateColMap.get(endDateCol);
      if (!startDate || !endDate) continue;

      const flightEnd = new Date(endDate);
      flightEnd.setDate(flightEnd.getDate() + 6); // through Sunday of end week

      const cellSpendMap = new Map<number, number>();
      const dollar = extractDollarAmount(masterCell);
      if (dollar !== null) cellSpendMap.set(mb.startCol, dollar);

      // Also scan each col in merge range for additional spend cells
      for (let c = mb.startCol; c <= mb.endCol; c++) {
        if (c === mb.startCol) continue;
        const d = extractDollarAmount(ws.getCell(rowNum, c));
        if (d !== null) {
          const colKey = dateColMap.has(c) ? c : mb.startCol;
          cellSpendMap.set(colKey, (cellSpendMap.get(colKey) ?? 0) + d);
        }
      }

      const totalBudget = Array.from(cellSpendMap.values()).reduce((s, v) => s + v, 0);
      flights.push({ startDate, endDate: flightEnd, totalBudget, cellSpendMap });
    }

    // From individual colored cells — group into runs
    if (individualCells.length > 0) {
      let runStart = individualCells[0];
      let runEnd   = individualCells[0];
      const runCells: CellBlock[] = [individualCells[0]];

      const commitRun = () => {
        const startDate = dateColMap.get(runStart.col);
        const endDate   = dateColMap.get(runEnd.col);
        if (!startDate || !endDate) return;
        const flightEnd = new Date(endDate);
        flightEnd.setDate(flightEnd.getDate() + 6);
        const cellSpendMap = new Map<number, number>();
        for (const cb of runCells) {
          if (cb.dollar !== null) cellSpendMap.set(cb.col, cb.dollar);
        }
        const totalBudget = Array.from(cellSpendMap.values()).reduce((s, v) => s + v, 0);
        flights.push({ startDate, endDate: flightEnd, totalBudget, cellSpendMap });
      };

      for (let i = 1; i < individualCells.length; i++) {
        const prev = individualCells[i-1];
        const curr = individualCells[i];
        // Find how many date columns lie between prev and curr
        const prevIdx = dateCols.indexOf(prev.col);
        const currIdx = dateCols.indexOf(curr.col);
        const gap = currIdx - prevIdx - 1; // number of date cols skipped
        if (gap >= 2) {
          commitRun();
          runStart = curr;
          runCells.length = 0;
        }
        runEnd = curr;
        runCells.push(curr);
      }
      commitRun();
    }

    rawChannels.push({ rawName, formatText, flights });
  }

  // Map channel names with AI
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const rawNames = rawChannels.map(c => c.rawName);
  const mappedNames = await mapChannelNames(rawNames, anthropic);

  // Calculate total budget across all channels
  const grandTotal = rawChannels.reduce((sum, ch) =>
    sum + ch.flights.reduce((s, f) => s + f.totalBudget, 0), 0
  );

  // Assemble ParsedChannel[]
  const channels: ParsedChannel[] = rawChannels.map((ch, i) => {
    const { channelName, customChannelName } = mappedNames[i] ?? { channelName: 'Other', customChannelName: ch.rawName };
    const channelBudget = ch.flights.reduce((s, f) => s + f.totalBudget, 0);

    const parsedFlights = ch.flights.map(f => ({
      startDate: toISO(f.startDate),
      endDate: toISO(f.endDate),
      monthlySpend: buildMonthlySpend(f.startDate, f.endDate, f.totalBudget, f.cellSpendMap, dateColMap),
    }));

    // Ensure at least one flight if none were found
    if (parsedFlights.length === 0) {
      const firstDate = dateColMap.get(firstDateCol)!;
      parsedFlights.push({
        startDate: toISO(firstDate),
        endDate: toISO(firstDate),
        monthlySpend: {},
      });
    }

    return {
      channelName,
      customChannelName: customChannelName || '',
      format: ch.formatText,
      totalBudget: channelBudget,
      percentOfInvestment: grandTotal > 0 ? Math.round((channelBudget / grandTotal) * 100) : 0,
      flights: parsedFlights,
    };
  });

  return NextResponse.json({ channels });
}
