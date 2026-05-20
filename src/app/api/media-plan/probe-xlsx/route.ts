import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';

export interface CandidateRow {
  rowNumber: number;
  labelText: string;
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

function isColoredFill(argb: string | undefined): boolean {
  if (!argb) return false;
  const hex = argb.toUpperCase();
  if (hex.startsWith('00')) return false;        // transparent
  if (hex === 'FFFFFFFF') return false;           // white
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

function formatDateLabel(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function isDateLike(cell: ExcelJS.Cell): { isDate: boolean; date: Date | null } {
  const v = cell.value;
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
    await workbook.xlsx.load(bytes as Buffer);
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

  function getMasterFill(rowNum: number, colNum: number): string | undefined {
    for (const mr of mergedRanges) {
      if (rowNum >= mr.startRow && rowNum <= mr.endRow && colNum >= mr.startCol && colNum <= mr.endCol) {
        const masterCell = ws.getCell(mr.startRow, mr.startCol);
        const fill = masterCell.fill as ExcelJS.Fill | undefined;
        if (fill && fill.type === 'pattern') {
          return (fill as any).fgColor?.argb as string | undefined;
        }
      }
    }
    return undefined;
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

    // Get label from first non-date column
    const labelCell = ws.getCell(rn, 1);
    const rawLabel = String(labelCell.value ?? '').trim();
    if (!rawLabel || /^\d+(\.\d+)?$/.test(rawLabel)) continue; // skip blank or purely numeric

    // Check for colored or merged cells in the date range
    let hasColoredCells = false;
    let hasMergedCells = false;
    const colorSamples: string[] = [];

    for (let c = firstDateCol; c <= lastDateCol; c++) {
      const cell = ws.getCell(rn, c);

      // Check own fill
      const fill = cell.fill as ExcelJS.Fill | undefined;
      const ownArgb = fill && fill.type === 'pattern' ? (fill as any).fgColor?.argb as string | undefined : undefined;

      // Check master fill (if this cell is part of a merge)
      const masterArgb = getMasterFill(rn, c);

      const argb = ownArgb || masterArgb;
      if (isColoredFill(argb)) {
        hasColoredCells = true;
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
    detectedYear,
    dateHeaderRowNumber,
    dateHeaders: dateHeaders.slice(0, 60), // cap for payload size
    candidateRows,
    warnings,
    labelColumns,
  };

  return NextResponse.json({ probe: result });
}
