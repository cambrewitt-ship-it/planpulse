import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';
import type { SandboxPlan, Week, PlanRow, Flight } from '@/components/sandbox/types';
import { FLIGHT_COLORS } from '@/components/sandbox/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function colLetterToNum(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function refToRowCol(ref: string): { row: number; col: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!m) return { row: 0, col: 0 };
  return { row: parseInt(m[2]), col: colLetterToNum(m[1]) };
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? 1 : 1 - day;
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function parseFlexDate(raw: string, year: number): Date | null {
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const s = raw.trim().toLowerCase();
  let m = s.match(/^(\d{1,2})[-/ ]([a-z]{3})$/);
  if (m) {
    const mon = months[m[2]];
    if (mon) return new Date(year, mon - 1, parseInt(m[1]));
  }
  m = s.match(/^([a-z]{3})[-/ ](\d{1,2})$/);
  if (m) {
    const mon = months[m[1]];
    if (mon) return new Date(year, mon - 1, parseInt(m[2]));
  }
  return null;
}

// solidOnly: require pattern==='solid' (use for individual cells to exclude hatch/pattern fills)
function isFillColored(fill: ExcelJS.Fill | undefined, solidOnly = false): boolean {
  if (!fill || fill.type !== 'pattern') return false;
  const pf = fill as any;
  if (pf.pattern === 'none') return false;
  if (solidOnly && pf.pattern !== 'solid') return false;
  const fg = pf.fgColor;
  if (!fg) return false;
  if (fg.argb) {
    const hex = (fg.argb as string).toUpperCase();
    if (hex.startsWith('00')) return false; // transparent
    if (hex === 'FFFFFFFF') return false;   // pure white
    const r = parseInt(hex.slice(-6, -4), 16);
    const g = parseInt(hex.slice(-4, -2), 16);
    const b = parseInt(hex.slice(-2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.90; // tightened from 0.92
  }
  if (fg.theme !== undefined) {
    // Theme 0 (Background1) and 2 (Background2) are white/near-white in almost all themes
    if (fg.theme === 0 || fg.theme === 2) return false;
    return (fg.tint ?? 0) < 0.9;
  }
  if (fg.indexed !== undefined) {
    // 65 = no fill sentinel; 1 and 9 are both white in the OOXML indexed palette
    return fg.indexed !== 65 && fg.indexed !== 1 && fg.indexed !== 9;
  }
  return false;
}

function getFillHex(fill: ExcelJS.Fill | undefined): string | null {
  if (!fill || fill.type !== 'pattern') return null;
  const fg = (fill as any).fgColor;
  if (!fg) return null;
  if (fg.argb) {
    const hex = fg.argb.slice(-6).toUpperCase();
    return `#${hex}`;
  }
  return null;
}

function weekLabel(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()}-${months[d.getMonth()]}`;
}

function monthLabel(d: Date): string {
  return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
}

function id(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Column detection via Claude ───────────────────────────────────────────────

interface ColumnMap {
  dateHeaderRow: number;
  funnel: number | null;
  channel: number | null;
  detail: number | null;
  audience: number | null;
  budget: number | null;
  year: number;
  asAtLabel: string;
}

async function detectColumns(ws: ExcelJS.Worksheet, anthropic: Anthropic): Promise<ColumnMap> {
  // Build text snapshot of first 8 rows
  const lines: string[] = [];
  const maxRow = Math.min(ws.rowCount, 8);
  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell, colNum) => {
      let v = cell.value;
      if (v !== null && typeof v === 'object' && 'result' in (v as any)) {
        v = (v as any).result;
      }
      if (v instanceof Date) v = weekLabel(v);
      if (v !== null && v !== undefined && String(v).trim()) {
        cells.push(`col${colNum}="${String(v).trim()}"`);
      }
    });
    if (cells.length) lines.push(`Row ${r}: ${cells.join('  ')}`);
  }

  const prompt = `You are analyzing a media plan spreadsheet. Here are the first rows:

${lines.join('\n')}

Identify the structure. Return ONLY a JSON object (no prose):
{
  "dateHeaderRow": <row number containing week-start dates like "30-Mar", "6-Apr">,
  "funnel": <column number with funnel stage labels like "AWARENESS","CONVERSION", or null>,
  "channel": <column number with channel names like "META","LINKEDIN", or null>,
  "detail": <column number with ad format/detail like "APP INSTALLS","RETARGETING", or null>,
  "audience": <column number with audience descriptions, or null>,
  "budget": <column number with total investment/budget dollar amounts, or null>,
  "year": <year for the dates, e.g. 2025>,
  "asAtLabel": <"As At ..." label if present, else "">
}`;

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content.find(b => b.type === 'text')?.text ?? '';
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const obj = JSON.parse(clean);
    return {
      dateHeaderRow: obj.dateHeaderRow ?? 2,
      funnel: obj.funnel ?? null,
      channel: obj.channel ?? null,
      detail: obj.detail ?? null,
      audience: obj.audience ?? null,
      budget: obj.budget ?? null,
      year: obj.year ?? new Date().getFullYear(),
      asAtLabel: obj.asAtLabel ?? '',
    };
  } catch {
    // Fallback: assume standard layout
    return {
      dateHeaderRow: 2,
      funnel: 1, channel: 2, detail: 3, audience: 4, budget: 5,
      year: new Date().getFullYear(), asAtLabel: '',
    };
  }
}

// ── Main parse ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const yearParam = formData.get('year');
  const userYear = yearParam ? parseInt(String(yearParam), 10) : null;

  // Load workbook
  const bytes = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    await (workbook.xlsx.load as any)(Buffer.from(bytes));
  } catch {
    return NextResponse.json({ error: 'Could not read the Excel file.' }, { status: 400 });
  }

  // Pick most-data sheet
  let ws = workbook.worksheets[0];
  let bestScore = 0;
  for (const sheet of workbook.worksheets.slice(0, 3)) {
    let score = 0;
    sheet.eachRow({ includeEmpty: false }, row => { score += row.actualCellCount; });
    if (score > bestScore) { bestScore = score; ws = sheet; }
  }

  // Build merged range index
  const merges: Array<{ sr: number; er: number; sc: number; ec: number }> = [];
  const modelMerges = (ws as any).model?.merges as string[] | undefined;
  if (modelMerges) {
    for (const range of modelMerges) {
      const [start, end] = range.split(':');
      if (!start || !end) continue;
      const s = refToRowCol(start);
      const e = refToRowCol(end);
      merges.push({ sr: s.row, er: e.row, sc: s.col, ec: e.col });
    }
  }

  function masterCell(row: number, col: number): ExcelJS.Cell {
    for (const m of merges) {
      if (row >= m.sr && row <= m.er && col >= m.sc && col <= m.ec) {
        return ws.getCell(m.sr, m.sc);
      }
    }
    return ws.getCell(row, col);
  }

  function masterValue(row: number, col: number): string {
    let v = masterCell(row, col).value;
    if (v !== null && typeof v === 'object' && 'result' in (v as any)) v = (v as any).result;
    if (v instanceof Date) return weekLabel(v);
    return String(v ?? '').trim();
  }

  function isSlave(row: number, col: number): boolean {
    return merges.some(m =>
      row >= m.sr && row <= m.er && col >= m.sc && col <= m.ec &&
      !(m.sr === row && m.sc === col)
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const colMap = await detectColumns(ws, anthropic);
  if (userYear) colMap.year = userYear;

  // Build date column map from date header row with year-rollover-aware assignment.
  // We collect month/day first (in column order), then assign years sequentially so
  // a plan that starts in Dec of the previous year gets the right year on every column.
  const dateColMap = new Map<number, Date>(); // col → Monday Date
  {
    const rawColDates: Array<{ col: number; month: number; day: number }> = [];
    const dateRow = ws.getRow(colMap.dateHeaderRow);
    dateRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
      let v = cell.value;
      if (v !== null && typeof v === 'object' && 'result' in (v as any)) v = (v as any).result;
      let d: Date | null = null;
      if (v instanceof Date && !isNaN(v.getTime())) {
        d = v;
      } else if (typeof v === 'number' && v > 1 && v < 100000) {
        const candidate = new Date(new Date(1899, 11, 30).getTime() + v * 86400000);
        if (!isNaN(candidate.getTime())) d = candidate;
      } else if (typeof v === 'string') {
        d = parseFlexDate(v, colMap.year);
      }
      if (d && !isNaN(d.getTime())) {
        rawColDates.push({ col: colNum, month: d.getMonth(), day: d.getDate() });
      }
    });

    if (rawColDates.length > 0) {
      // If the plan starts in December before rolling into the new year (e.g. 28-Dec → 5-Jan),
      // the December weeks belong to year-1, not the plan year.
      let currentYear = colMap.year;
      if (rawColDates.length >= 2 && rawColDates[0].month === 11 && rawColDates[1].month < 6) {
        currentYear = colMap.year - 1;
      }
      let prevMonth = rawColDates[0].month;
      for (const { col, month, day } of rawColDates) {
        // Month dropped significantly → year rolled over (e.g. Dec→Jan)
        if (month < prevMonth - 3) currentYear++;
        prevMonth = month;
        const d = new Date(currentYear, month, day);
        if (!isNaN(d.getTime())) {
          dateColMap.set(col, toMonday(d));
        }
      }
    }
  }

  if (dateColMap.size === 0) {
    return NextResponse.json({ error: 'Could not identify date columns.' }, { status: 400 });
  }

  // Remove outlier trailing date columns (summary columns that look like dates)
  const allDateCols = Array.from(dateColMap.keys()).sort((a, b) => a - b);
  if (allDateCols.length >= 3) {
    const steps = allDateCols.slice(1).map((c, i) => c - allDateCols[i]).sort((a, b) => a - b);
    const med = steps[Math.floor(steps.length / 2)];
    for (let i = allDateCols.length - 1; i > 0; i--) {
      if (allDateCols[i] - allDateCols[i - 1] > med * 2) dateColMap.delete(allDateCols[i]);
      else break;
    }
  }

  const dateCols = Array.from(dateColMap.keys()).sort((a, b) => a - b);
  const firstDateCol = dateCols[0];
  const lastDateCol = dateCols[dateCols.length - 1];

  // Build weeks array
  const weekDates = dateCols.map(c => dateColMap.get(c)!);
  const weeks: Week[] = weekDates.map(d => {
    const thu = new Date(d.getTime() + 3 * 86400000); // Thursday determines the month
    return {
      weekStart: isoDate(d),
      label: weekLabel(d),
      month: monthLabel(thu),
      year: thu.getFullYear(),
    };
  });

  // Extract data rows
  const colorAssignMap = new Map<string, string>(); // channel → color
  let colorIdx = 0;

  function assignColor(channel: string): string {
    if (!colorAssignMap.has(channel)) {
      colorAssignMap.set(channel, FLIGHT_COLORS[colorIdx % FLIGHT_COLORS.length]);
      colorIdx++;
    }
    return colorAssignMap.get(channel)!;
  }

  const rows: PlanRow[] = [];
  const rowNums: number[] = []; // parallel array: Excel row number for each entry in rows[]

  for (let rowNum = colMap.dateHeaderRow + 1; rowNum <= ws.rowCount; rowNum++) {
    // Check if this row has any colored cells in the date range
    let hasColored = false;
    for (const col of dateCols) {
      if (isSlave(rowNum, col)) continue;
      const mc = masterCell(rowNum, col);
      if (isFillColored(mc.fill as ExcelJS.Fill)) { hasColored = true; break; }
    }

    // Also accept rows that have text in the channel column even without colored cells
    const channelText = colMap.channel ? masterValue(rowNum, colMap.channel) : '';
    const funnelText = colMap.funnel ? masterValue(rowNum, colMap.funnel) : '';

    if (!hasColored && !channelText && !funnelText) continue;

    // Skip rows that are likely totals
    const isTotal = /^total/i.test(channelText) || /^total/i.test(funnelText);
    if (isTotal) continue;

    const funnel = colMap.funnel ? masterValue(rowNum, colMap.funnel) : '';
    const channel = colMap.channel ? masterValue(rowNum, colMap.channel) : channelText;
    const detail = colMap.detail ? masterValue(rowNum, colMap.detail) : '';
    const audience = colMap.audience ? masterValue(rowNum, colMap.audience) : '';

    if (!channel && !funnel) continue;

    // Extract flights from colored runs
    const flights: Flight[] = [];
    const flightColor = getFillHex(ws.getCell(rowNum, firstDateCol).fill as ExcelJS.Fill) ??
      assignColor(channel || funnel);

    // Check merge-based flights on this row
    const rowMerges = merges.filter(m =>
      m.sr === rowNum && m.ec >= firstDateCol && m.sc <= lastDateCol
    );
    const processedCols = new Set<number>();

    for (const rm of rowMerges) {
      const mc = ws.getCell(rm.sr, rm.sc);
      if (!isFillColored(mc.fill as ExcelJS.Fill)) continue;

      // Find start/end date cols within the merge
      let startCol = Math.max(rm.sc, firstDateCol);
      while (startCol <= rm.ec && !dateColMap.has(startCol)) startCol++;
      let endCol = Math.min(rm.ec, lastDateCol);
      while (endCol > startCol && !dateColMap.has(endCol)) endCol--;

      const sd = dateColMap.get(startCol);
      const ed = dateColMap.get(endCol);
      if (!sd || !ed) continue;

      // Extract budget from master cell or label cols
      let budget = 0;
      let v = mc.value;
      if (v !== null && typeof v === 'object' && 'result' in (v as any)) v = (v as any).result;
      if (typeof v === 'number') budget = Math.round(v);
      else if (typeof v === 'string') {
        const n = parseFloat(v.replace(/[$,\s]/g, ''));
        if (!isNaN(n)) budget = Math.round(n);
      }

      // If no budget in cell, check budget column
      if (budget === 0 && colMap.budget) {
        const bv = masterCell(rowNum, colMap.budget).value;
        if (typeof bv === 'number') budget = Math.round(bv);
        else if (typeof bv === 'string') {
          const n = parseFloat((bv as string).replace(/[$,\s]/g, ''));
          if (!isNaN(n)) budget = Math.round(n);
        }
      }

      const color = getFillHex(mc.fill as ExcelJS.Fill) ?? assignColor(channel || funnel);
      flights.push({ id: id(), startWeek: isoDate(sd), endWeek: isoDate(ed), budget, color });

      for (let c = rm.sc; c <= rm.ec; c++) processedCols.add(c);
    }

    // Individual colored cells (not merge slaves, not already processed)
    interface CellInfo { col: number; date: Date; budget: number; color: string }
    const individuals: CellInfo[] = [];
    for (const col of dateCols) {
      if (processedCols.has(col) || isSlave(rowNum, col)) continue;
      const cell = ws.getCell(rowNum, col);
      if (!isFillColored(cell.fill as ExcelJS.Fill, true)) continue; // solidOnly for individual cells
      let budget = 0;
      let v = cell.value;
      if (v !== null && typeof v === 'object' && 'result' in (v as any)) v = (v as any).result;
      if (typeof v === 'number') budget = Math.round(v);
      else if (typeof v === 'string') {
        const n = parseFloat((v as string).replace(/[$,\s]/g, ''));
        if (!isNaN(n)) budget = Math.round(n);
      }
      const color = getFillHex(cell.fill as ExcelJS.Fill) ?? assignColor(channel || funnel);
      individuals.push({ col, date: dateColMap.get(col)!, budget, color });
    }

    // Group consecutive individual cells into flights
    if (individuals.length > 0) {
      let runStart = individuals[0];
      let runEnd = individuals[0];
      let runBudget = individuals[0].budget;

      const commitRun = () => {
        flights.push({
          id: id(),
          startWeek: isoDate(runStart.date),
          endWeek: isoDate(runEnd.date),
          budget: runBudget,
          color: runStart.color,
        });
      };

      for (let i = 1; i < individuals.length; i++) {
        const prev = individuals[i - 1];
        const curr = individuals[i];
        const prevIdx = dateCols.indexOf(prev.col);
        const currIdx = dateCols.indexOf(curr.col);
        if (currIdx - prevIdx > 2) {
          commitRun();
          runStart = curr;
          runBudget = 0;
        }
        runEnd = curr;
        runBudget += curr.budget;
      }
      commitRun();
    }

    // If flights found but budget still 0, check label/budget column
    if (flights.length > 0 && colMap.budget) {
      const totalFlightBudget = flights.reduce((s, f) => s + f.budget, 0);
      if (totalFlightBudget === 0) {
        const bv = masterCell(rowNum, colMap.budget).value;
        let labelBudget = 0;
        if (typeof bv === 'number') labelBudget = Math.round(bv);
        else if (typeof bv === 'string') {
          const n = parseFloat((bv as string).replace(/[$,\s]/g, ''));
          if (!isNaN(n)) labelBudget = Math.round(n);
        }
        if (labelBudget > 0) {
          const per = Math.round(labelBudget / flights.length);
          flights.forEach((f, i) => {
            f.budget = i === flights.length - 1 ? labelBudget - per * (flights.length - 1) : per;
          });
        }
      }
    }

    rows.push({ id: id(), funnel, channel, detail, audience, flights });
    rowNums.push(rowNum);
  }

  // Post-process: rows whose date cells are all vertical-merge slaves of an earlier row
  // (e.g. BIRTHDAYS / MONDAY & TUESDAYS below RETARGETING when MONEY MOMENTS is merged
  // across all three rows) get tagged with a flightGroupId so the grid can render a single
  // cell with rowspan across all group rows instead of stacked individual cells.
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].flights.length > 0) continue;
    if (rows[i].flightGroupId) continue; // already assigned
    const rn = rowNums[i];
    for (const mr of merges) {
      if (mr.sr >= rn || mr.er < rn || mr.ec < firstDateCol) continue;
      const masterIdx = rowNums.indexOf(mr.sr);
      if (masterIdx >= 0 && rows[masterIdx].flights.length > 0) {
        // Assign group to master (once) and to this slave
        if (!rows[masterIdx].flightGroupId) {
          const gid = id();
          rows[masterIdx] = { ...rows[masterIdx], flightGroupId: gid, isMasterRow: true };
        }
        const groupId = rows[masterIdx].flightGroupId!;
        rows[i] = { ...rows[i], flightGroupId: groupId, isMasterRow: false };
        break;
      }
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No data rows found. Check the file format.' }, { status: 400 });
  }

  const plan: SandboxPlan = {
    id: id(),
    title: file.name.replace(/\.(xlsx?|xls)$/i, ''),
    asAtLabel: colMap.asAtLabel,
    weeks,
    rows,
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json({ plan });
}
