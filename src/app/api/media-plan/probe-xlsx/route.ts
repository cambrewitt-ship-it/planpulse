import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';

export interface CandidateRow {
  rowNumber: number;
  labelText: string;
  sectionLabel: string; // col-1 section label when labelText comes from col 2+
  hasColoredCells: boolean;
  hasMergedCells: boolean;
  colorSamples: string[];
  isLikelyTotals: boolean;
}

export interface ProbeResult {
  detectedYear: number | null;
  dateHeaderRowNumber: number;
  dateHeaders: Array<{ colNumber: number; label: string; isoDate: string | null }>;
  candidateRows: CandidateRow[];
  warnings: string[];
  // Non-date columns found to the left of the date range (for format/detail selection)
  labelColumns: Array<{ colNumber: number; header: string }>;
}

function isFillColored(fill: ExcelJS.Fill | undefined): boolean {
  if (!fill || fill.type !== 'pattern') return false;
  const pf = fill as any;
  if (pf.pattern === 'none') return false;
  const fg = pf.fgColor;
  if (!fg) return false;

  // Explicit ARGB color
  if (fg.argb) {
    const hex = (fg.argb as string).toUpperCase();
    if (hex.startsWith('00')) return false;   // transparent
    if (hex === 'FFFFFFFF') return false;      // white
    if (hex.length < 6) return false;
    const r = parseInt(hex.slice(-6, -4), 16);
    const g2 = parseInt(hex.slice(-4, -2), 16);
    const b = parseInt(hex.slice(-2), 16);
    const luminance = (0.299 * r + 0.587 * g2 + 0.114 * b) / 255;
    return luminance < 0.92;
  }

  // Theme color — tint ≥ 0.9 approaches white (uncolored)
  if (fg.theme !== undefined) {
    const tint = fg.tint ?? 0;
    return tint < 0.9;
  }

  // Indexed color — index 65 = "no fill"
  if (fg.indexed !== undefined) {
    return fg.indexed !== 65;
  }

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

function formatDateLabel(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function isDateLike(cell: ExcelJS.Cell): { isDate: boolean; date: Date | null } {
  let v: any = cell.value;
  // Unwrap formula result — formula cells return { formula, result } not the value directly
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && 'result' in v) {
    v = (v as ExcelJS.CellFormulaValue).result;
  }
  if (v instanceof Date && !isNaN(v.getTime())) return { isDate: true, date: v };
  if (typeof v === 'number' && v > 1 && v < 100000) {
    // Excel date serial
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + v * 86400000);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1990) return { isDate: true, date: d };
  }
  if (typeof v === 'string') {
    // Match common date patterns: "5 Jan", "12/Jan", "Jan 5", "5/1", "12-Feb"
    const m = v.match(/^(\d{1,2})[\/\- ]([A-Za-z]{3,})$/) ||
              v.match(/^([A-Za-z]{3,})[\/\- ](\d{1,2})$/) ||
              v.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return { isDate: true, date: null };
  }
  return { isDate: false, date: null };
}

// Pick the best sheet: the one with the most candidate channel rows
async function pickBestWorksheet(workbook: ExcelJS.Workbook): Promise<ExcelJS.Worksheet> {
  let best: ExcelJS.Worksheet = workbook.worksheets[0];
  let bestScore = 0;
  for (const ws of workbook.worksheets.slice(0, 3)) {
    let score = 0;
    ws.eachRow({ includeEmpty: false }, (row) => { score += row.actualCellCount; });
    if (score > bestScore) { bestScore = score; best = ws; }
  }
  return best;
}

export async function POST(request: NextRequest) {
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
  const clientYear = yearParam ? parseInt(yearParam) : null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error ExcelJS types expect legacy non-generic Buffer
    await workbook.xlsx.load(Buffer.from(bytes));
  } catch {
    return NextResponse.json({ error: 'Could not read the Excel file. Please ensure it is a valid .xlsx file.' }, { status: 400 });
  }

  if (workbook.worksheets.length === 0) {
    return NextResponse.json({ error: 'The Excel file has no sheets.' }, { status: 400 });
  }

  const ws = await pickBestWorksheet(workbook);
  const warnings: string[] = [];

  // Build merged cell lookup: (row, col) → master (row, col)
  const mergedRanges: Array<{ row: number; startCol: number; endCol: number; startRow: number; endRow: number }> = [];
  const mergeCells = (ws as any).model?.merges as string[] | undefined;
  if (mergeCells) {
    for (const range of mergeCells) {
      const [start, end] = range.split(':');
      if (!start || !end) continue;
      mergedRanges.push({
        startRow: cellRowFromRef(start),
        row: cellRowFromRef(start),
        startCol: cellColFromRef(start),
        endCol: cellColFromRef(end),
        endRow: cellRowFromRef(end),
      });
    }
  }

  function getMasterFill(rowNum: number, colNum: number): ExcelJS.Fill | undefined {
    for (const mr of mergedRanges) {
      if (rowNum >= mr.startRow && rowNum <= mr.endRow && colNum >= mr.startCol && colNum <= mr.endCol) {
        return ws.getCell(mr.startRow, mr.startCol).fill as ExcelJS.Fill | undefined;
      }
    }
    return ws.getCell(rowNum, colNum).fill as ExcelJS.Fill | undefined;
  }

  function getMasterValue(rowNum: number, colNum: number): any {
    for (const mr of mergedRanges) {
      if (rowNum >= mr.startRow && rowNum <= mr.endRow && colNum >= mr.startCol && colNum <= mr.endCol) {
        return ws.getCell(mr.startRow, mr.startCol).value;
      }
    }
    return ws.getCell(rowNum, colNum).value;
  }

  // Step 1: Find date header row (scan rows 1–15)
  let dateHeaderRowNumber = 1;
  let bestDateCount = 0;
  let detectedYear: number | null = null;

  const maxScanRow = Math.min(ws.rowCount, 15);
  for (let rn = 1; rn <= maxScanRow; rn++) {
    const row = ws.getRow(rn);
    let dateCount = 0;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const { isDate, date } = isDateLike(cell);
      if (isDate) {
        dateCount++;
        if (date && !detectedYear) {
          const y = date.getFullYear();
          if (y >= 2020 && y <= 2040) detectedYear = y;
        }
      }
    });
    if (dateCount > bestDateCount) {
      bestDateCount = dateCount;
      dateHeaderRowNumber = rn;
    }
  }

  if (bestDateCount < 4) {
    warnings.push('We could not clearly detect a date header row. Please verify the year and channel rows below.');
  }

  // Step 2: Extract date columns from header row
  const dateHeaders: ProbeResult['dateHeaders'] = [];
  const dateColSet = new Set<number>();
  const headerRow = ws.getRow(dateHeaderRowNumber);

  headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
    const { isDate, date } = isDateLike(cell);
    if (isDate) {
      dateColSet.add(colNum);
      let isoDate: string | null = null;
      let label = String(cell.value ?? '').trim();
      if (date) {
        const yr = clientYear ?? detectedYear ?? new Date().getFullYear();
        isoDate = `${yr}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        label = formatDateLabel(date);
      }
      dateHeaders.push({ colNumber: colNum, label, isoDate });
    }
  });

  const firstDateCol = dateHeaders.length > 0 ? Math.min(...dateHeaders.map(d => d.colNumber)) : 3;
  const lastDateCol  = dateHeaders.length > 0 ? Math.max(...dateHeaders.map(d => d.colNumber)) : ws.columnCount;

  // Step 3: Find non-date label columns (left of first date col)
  const labelColumns: ProbeResult['labelColumns'] = [];
  for (let c = 1; c < firstDateCol; c++) {
    const headerCell = ws.getCell(dateHeaderRowNumber, c);
    const val = String(headerCell.value ?? '').trim();
    labelColumns.push({ colNumber: c, header: val || `Column ${c}` });
  }

  // Step 4: Detect candidate channel rows
  const candidateRows: CandidateRow[] = [];

  for (let rn = dateHeaderRowNumber + 1; rn <= ws.rowCount; rn++) {
    const row = ws.getRow(rn);

    // Get label — use getMasterValue so merge-slave cells return the master's text.
    // For multi-column plans (3+ label cols) prefer col 2 as the channel name
    // since col 1 is typically a merged section header (e.g. "BRAND AWARENESS")
    const col1Label = String(getMasterValue(rn, 1) ?? '').trim();
    let rawLabel = col1Label;
    let sectionLabel = '';
    if (labelColumns.length >= 3 && labelColumns[1]) {
      const col2Label = String(getMasterValue(rn, labelColumns[1].colNumber) ?? '').trim();
      if (col2Label && col2Label !== col1Label) {
        rawLabel = col2Label;
        sectionLabel = col1Label;
      }
    }
    if (!rawLabel || /^\d+(\.\d+)?$/.test(rawLabel)) continue; // skip blank or purely numeric

    // Check for colored or merged cells in the date range
    let hasColoredCells = false;
    let hasMergedCells = false;
    const colorSamples: string[] = [];

    for (let c = firstDateCol; c <= lastDateCol; c++) {
      // getMasterFill handles merge lookup automatically; it now returns the full Fill object
      const masterFill = getMasterFill(rn, c);
      if (isFillColored(masterFill)) {
        hasColoredCells = true;
        // Keep an ARGB sample if available (for UI hints only)
        const argb = (masterFill as any)?.fgColor?.argb as string | undefined;
        if (colorSamples.length < 3 && argb) colorSamples.push(argb);
      }

      // Check if this column is part of a merged range on this row
      const isMergedHere = mergedRanges.some(mr =>
        mr.startRow <= rn && rn <= mr.endRow &&
        mr.startCol <= c && c <= mr.endCol &&
        (mr.startCol !== c || mr.startRow !== rn)
      );
      if (isMergedHere) hasMergedCells = true;
    }

    // Also count merges that start on this row in the date range
    const rowMerges = mergedRanges.filter(mr =>
      mr.startRow === rn && mr.startCol >= firstDateCol && mr.startCol <= lastDateCol
    );
    if (rowMerges.length > 0) hasMergedCells = true;

    const isLikelyTotals = /total|grand total|sum|subtotal/i.test(rawLabel);

    candidateRows.push({
      rowNumber: rn,
      labelText: rawLabel,
      sectionLabel,
      hasColoredCells,
      hasMergedCells,
      colorSamples,
      isLikelyTotals,
    });
  }

  if (candidateRows.length === 0) {
    warnings.push('No channel rows were detected. Your file may use a different layout.');
  }

  const result: ProbeResult = {
    detectedYear: detectedYear ?? clientYear ?? new Date().getFullYear(),
    dateHeaderRowNumber,
    dateHeaders: dateHeaders.slice(0, 60), // cap for payload size
    candidateRows,
    warnings,
    labelColumns,
  };

  return NextResponse.json({ probe: result });
}
