import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { SandboxPlan, PlanRow, Week, Flight, CustomColumn } from '@/components/sandbox/types';

// ── Colours — same palette as the invoice PDF for brand consistency ─────────
const NAVY  = '#16305A';
const GOLD  = '#D4AF37';
const BODY  = '#182236';
const SEC   = '#33394a';
const MUTED = '#5b6472';
const LABEL = '#9aa2b0';
const HAIR  = '#e4e7ed';

// Font sizes throughout are specified "CSS px"-style for readability, then
// converted to PDF points here — matches the convention already used across
// the app's other jsPDF exports (invoice, performance report).
const px = (p: number) => p / 1.333;

function fmtCurrency(v: number) {
  if (v === 0) return '—';
  return '$' + Math.round(v).toLocaleString();
}

function flightAtWeek(row: PlanRow, weekStart: string): Flight | null {
  return row.flights.find(f => f.startWeek <= weekStart && weekStart <= f.endWeek) ?? null;
}

function weekSpanForFlight(flight: { startWeek: string; endWeek: string }, weeks: Week[]): number {
  return weeks.filter(w => w.weekStart >= flight.startWeek && w.weekStart <= flight.endWeek).length;
}

// One entry per calendar month that appears in `weeks`, in order, with how
// many consecutive week-columns belong to it — mirrors groupWeeksByMonth()
// in plan-grid.tsx, used here to size the month header colSpans.
function groupWeeksByMonth(weeks: Week[]): Array<{ month: string; year: number; count: number }> {
  const groups: Array<{ month: string; year: number; count: number }> = [];
  for (const w of weeks) {
    const last = groups[groups.length - 1];
    if (last && last.month === w.month && last.year === w.year) last.count++;
    else groups.push({ month: w.month, year: w.year, count: 1 });
  }
  return groups;
}

// Per-week spend across all media rows (fees excluded) — mirrors weekTotals()
// in plan-grid.tsx. A flight's budget is attributed evenly across the weeks
// it spans.
function weekTotals(rows: PlanRow[], weeks: Week[]): number[] {
  return weeks.map(w =>
    rows.reduce((sum, row) => {
      const f = flightAtWeek(row, w.weekStart);
      return sum + (f ? f.budget / Math.max(1, weekSpanForFlight(f, weeks)) : 0);
    }, 0)
  );
}

// The on-screen grid always generates a full calendar year of weeks (so
// there's room to drag-create flights into any month), but the export only
// needs the months that actually have spend in them — trims `weeks` down to
// the full calendar months spanning the earliest flight start through the
// latest flight end. Whole months only (never a partial month at either
// edge), so the header never shows an oddly-truncated month. Falls back to
// the untrimmed weeks when the plan has no flights yet.
function trimWeeksToActiveMonths(rows: PlanRow[], weeks: Week[]): Week[] {
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  for (const row of rows) {
    for (const f of row.flights) {
      if (minStart === null || f.startWeek < minStart) minStart = f.startWeek;
      if (maxEnd === null || f.endWeek > maxEnd) maxEnd = f.endWeek;
    }
  }
  if (minStart === null || maxEnd === null || weeks.length === 0) return weeks;

  let loIdx = weeks.findIndex(w => w.weekStart >= minStart!);
  if (loIdx === -1) loIdx = 0;
  let hiIdx = -1;
  for (let i = 0; i < weeks.length; i++) if (weeks[i].weekStart <= maxEnd!) hiIdx = i;
  if (hiIdx === -1) hiIdx = weeks.length - 1;

  const loMonth = weeks[loIdx].month, loYear = weeks[loIdx].year;
  const hiMonth = weeks[hiIdx].month, hiYear = weeks[hiIdx].year;
  while (loIdx > 0 && weeks[loIdx - 1].month === loMonth && weeks[loIdx - 1].year === loYear) loIdx--;
  while (hiIdx < weeks.length - 1 && weeks[hiIdx + 1].month === hiMonth && weeks[hiIdx + 1].year === hiYear) hiIdx++;

  return weeks.slice(loIdx, hiIdx + 1);
}

// Marks which rows start a new visual group for a given field — consecutive
// rows sharing a non-empty value print it once, at the top of the run, and
// are visually merged (no divider drawn between them). Used for both the
// COMMS (funnel) and CHANNEL columns.
function computeGroupStarts(rows: PlanRow[], keyFn: (r: PlanRow) => string): boolean[] {
  return rows.map((row, i) => {
    const val = keyFn(row);
    return i === 0 || !val || val !== keyFn(rows[i - 1]);
  });
}

function setFont(doc: import('jspdf').jsPDF, size: number, weight: 'bold' | 'normal', color: string) {
  doc.setFontSize(px(size));
  doc.setFont('helvetica', weight);
  doc.setTextColor(color);
}

// Wraps text to the given column width using the supplied doc's current font
// metrics — never truncates, so long cell values (e.g. a long audience
// description) always render in full across multiple lines.
function wrapText(doc: import('jspdf').jsPDF, text: string, maxWidthMM: number, size: number, weight: 'bold' | 'normal'): string[] {
  setFont(doc, size, weight, '#000000');
  const lines = doc.splitTextToSize(String(text ?? ''), Math.max(4, maxWidthMM)) as string[];
  return lines.length > 0 ? lines : [''];
}

// Draws a block of pre-wrapped lines top-anchored within a cell/row.
function drawWrappedLines(doc: import('jspdf').jsPDF, lines: string[], x: number, rowTop: number, lineH: number, opts?: { align?: 'left' | 'right' | 'center' }) {
  lines.forEach((line, i) => {
    if (line) doc.text(line, x, rowTop + lineH * (i + 1), opts);
  });
}

// Fills a rect with a 45°-diagonal white-stripe hatch over the given colour —
// the organic-row treatment, matching the on-screen repeating-linear-gradient
// (plan-grid.tsx) without depending on jsPDF's clip()/graphics-state API:
// each stripe is a line of constant x+y, explicitly clipped by hand to the
// rect's bounds before drawing.
function drawHatchedRect(doc: import('jspdf').jsPDF, x: number, y: number, w: number, h: number, color: string) {
  doc.setFillColor(color);
  doc.rect(x, y, w, h, 'F');
  doc.setDrawColor('#ffffff');
  doc.setLineWidth(0.7);
  const step = 2.6;
  const cMin = x + y;
  const cMax = (x + w) + (y + h);
  for (let c = cMin; c <= cMax; c += step) {
    const x1 = Math.max(x, c - y - h);
    const x2 = Math.min(x + w, c - y);
    if (x1 < x2) doc.line(x1, c - x1, x2, c - x2);
  }
}

function drawEmptyWeekCell(doc: import('jspdf').jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(HAIR);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'S');
}

// Draws one row's weekly flight bars. Flights spanning multiple weeks are
// drawn as a single merged block (one budget label, not one per week) —
// mirrors renderWeekCells() in plan-grid.tsx, minus the interactive
// drag/resize concerns that don't apply to a static export. Rows that share
// a flightGroupId (a flight bar visually spanning several channel rows) are
// handled the same way: the master row draws one tall block covering every
// row in the group (its real, possibly-uneven combined height, since rows can
// now be taller than the base row height to fit wrapped text), and the other
// rows in the group simply skip drawing over the weeks it already covers.
function drawWeekCellsForRow(
  doc: import('jspdf').jsPDF,
  row: PlanRow,
  rowIdx: number,
  rows: PlanRow[],
  weeks: Week[],
  weekW: number,
  weeksStartX: number,
  rowTop: number,
  rowHeights: number[],
  flightGroups: Map<string, number[]>,
) {
  const rowH = rowHeights[rowIdx];

  if (row.flightGroupId && !row.isMasterRow) {
    const groupIdxs = flightGroups.get(row.flightGroupId) ?? [];
    const masterRow = rows[groupIdxs[0]];
    let i = 0;
    let x = weeksStartX;
    while (i < weeks.length) {
      const week = weeks[i];
      const covered = masterRow?.flights.find(f => week.weekStart >= f.startWeek && week.weekStart <= f.endWeek);
      if (covered) {
        let span = 0;
        while (i < weeks.length && weeks[i].weekStart <= covered.endWeek) { i++; span++; }
        x += span * weekW;
      } else {
        drawEmptyWeekCell(doc, x, rowTop, weekW, rowH);
        x += weekW; i++;
      }
    }
    return;
  }

  const flightRowSpan = (row.flightGroupId && row.isMasterRow)
    ? (flightGroups.get(row.flightGroupId)?.length ?? 1)
    : 1;
  const blockH = flightRowSpan > 1
    ? rowHeights.slice(rowIdx, rowIdx + flightRowSpan).reduce((a, b) => a + b, 0)
    : rowH;

  let i = 0;
  let x = weeksStartX;
  while (i < weeks.length) {
    const week = weeks[i];
    const flight = flightAtWeek(row, week.weekStart);
    const prevFlight = i > 0 ? flightAtWeek(row, weeks[i - 1].weekStart) : null;

    if (flight && flight !== prevFlight) {
      const span = weekSpanForFlight(flight, weeks);
      const blockW = span * weekW;

      if (row.isOrganic) {
        drawHatchedRect(doc, x, rowTop, blockW, blockH, flight.color);
      } else {
        doc.setFillColor(flight.color);
        doc.rect(x, rowTop, blockW, blockH, 'F');
      }
      doc.setDrawColor('#ffffff');
      doc.setLineWidth(0.3);
      doc.rect(x, rowTop, blockW, blockH, 'S');

      if (flight.budget > 0) {
        setFont(doc, 6.5, 'bold', '#ffffff');
        doc.text(fmtCurrency(flight.budget), x + blockW / 2, rowTop + blockH / 2 + 1.2, { align: 'center' });
      }

      x += blockW;
      i += span;
      continue;
    }

    if (flight) { x += weekW; i++; continue; }

    drawEmptyWeekCell(doc, x, rowTop, weekW, rowH);
    x += weekW;
    i++;
  }
}

async function fetchLogo(url?: string): Promise<{ data: string; format: 'PNG' | 'JPEG' } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    const format: 'PNG' | 'JPEG' = ct.includes('jpeg') || ct.includes('jpg') ? 'JPEG' : 'PNG';
    const buf = await res.arrayBuffer();
    return { data: Buffer.from(buf).toString('base64'), format };
  } catch {
    return null;
  }
}

// Column widths and the other layout constants that don't depend on row
// content (row heights are computed separately, after a text-measuring pass,
// since they depend on how each row's text wraps).
function computeColumnLayout(customColumns: CustomColumn[], hasComms: boolean) {
  const ML = 14, MT = 14, MB = 14, LOGO_SIZE = 16;
  const commsW = hasComms ? 34 : 0;
  const channelW = 34, customColW = 26, totalW = 24;
  const weekW = 8, HDR_H = 7, SUBTOTAL_ROW_H = 8, FEE_ROW_H = 7;
  const ROW_MIN_H = 7; // floor for a single-line row
  const LINE_H = 3.3;  // vertical space per wrapped text line
  const ROW_V_PAD = 3; // breathing room below the last wrapped line

  const leftFixedW = commsW + channelW + customColW * customColumns.length + totalW;

  return {
    ML, MT, MB, LOGO_SIZE,
    commsW, channelW, customColW, totalW, weekW,
    HDR_H, SUBTOTAL_ROW_H, FEE_ROW_H, ROW_MIN_H, LINE_H, ROW_V_PAD,
    leftFixedW,
  };
}

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, 'sandbox-pdf', 10, 60);
  if (limited) return limited;

  let body: { plan?: SandboxPlan };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const plan = body.plan;
  if (!plan || !Array.isArray(plan.rows) || !Array.isArray(plan.weeks)) {
    return NextResponse.json({ error: 'plan (with rows and weeks) is required' }, { status: 400 });
  }

  // Brand the export with the agency's logo/name from Settings whenever the
  // caller hasn't already supplied one — every PlanGrid host (dashboard,
  // builder, client-create) shares this one export route, so filling it in
  // here means none of them need to thread agency_settings through separately.
  if (!plan.agencyLogoUrl || !plan.agencyName) {
    try {
      const supabase = await createServerClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: agency } = await supabase
          .from('agency_settings')
          .select('agency_name, logo_url')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (agency) {
          plan.agencyLogoUrl = plan.agencyLogoUrl || agency.logo_url || undefined;
          plan.agencyName = plan.agencyName || agency.agency_name || undefined;
        }
      }
    } catch {
      // Non-fatal — export still works without agency branding.
    }
  }

  const customColumns: CustomColumn[] = plan.customColumns ?? [];
  const fees = plan.fees ?? [];
  const rows = plan.rows;
  const weeks = trimWeeksToActiveMonths(rows, plan.weeks);

  // COMMS is only shown when the plan actually uses the funnel field — most
  // plans don't, and an always-blank column just wastes space.
  const hasComms = rows.some(r => !!r.funnel?.trim());

  const monthGroups = groupWeeksByMonth(weeks);
  const baseYear = weeks[0]?.year;

  const perWeekTotals = weekTotals(rows, weeks);
  const monthTotals = (() => {
    let wi = 0;
    return monthGroups.map(mg => {
      let sum = 0;
      for (let i = 0; i < mg.count; i++) sum += perWeekTotals[wi++] ?? 0;
      return sum;
    });
  })();

  const mediaTotal = rows.reduce((s, r) => s + r.flights.reduce((a, f) => a + f.budget, 0), 0);
  const feesTotal = fees.reduce((s, f) => s + f.amount, 0);
  const grandTotal = mediaTotal + feesTotal;

  const funnelGroupStarts = computeGroupStarts(rows, r => r.funnel);
  const channelGroupStarts = computeGroupStarts(rows, r => r.channel);

  const flightGroups = new Map<string, number[]>();
  rows.forEach((row, i) => {
    if (row.flightGroupId) {
      if (!flightGroups.has(row.flightGroupId)) flightGroups.set(row.flightGroupId, []);
      flightGroups.get(row.flightGroupId)!.push(i);
    }
  });

  const [agencyLogo, clientLogo] = await Promise.all([
    fetchLogo(plan.agencyLogoUrl),
    fetchLogo(plan.clientLogoUrl),
  ]);

  const hasAgencySide = !!agencyLogo || !!plan.agencyName;
  const hasClientSide = !!clientLogo || !!plan.clientName;

  const C = computeColumnLayout(customColumns, hasComms);
  const { ML, MT, LOGO_SIZE, commsW, channelW, customColW, totalW, weekW, HDR_H, SUBTOTAL_ROW_H, FEE_ROW_H, ROW_MIN_H, LINE_H, ROW_V_PAD, leftFixedW } = C;
  const CW = leftFixedW + weeks.length * weekW;
  const totalWidth = ML * 2 + CW;

  const { default: jsPDF } = await import('jspdf');

  // ── Measuring pass ─────────────────────────────────────────────────────
  // splitTextToSize() only depends on font metrics, not page size, so a
  // throwaway doc can compute exactly how each row's text wraps — and
  // therefore how tall every row needs to be — before the real, correctly
  // sized page is constructed below.
  const measureDoc = new jsPDF({ unit: 'mm' });
  const rowContent = rows.map((row, i) => {
    const commsLines = (hasComms && funnelGroupStarts[i] && row.funnel)
      ? wrapText(measureDoc, row.funnel, commsW - 4, 8, 'bold')
      : [''];
    const channelLines = channelGroupStarts[i]
      ? wrapText(measureDoc, row.channel || '—', channelW - 4, 9, 'bold')
      : [''];
    const customLinesArr = customColumns.map(col =>
      wrapText(measureDoc, row.customFields?.[col.id] ?? '', customColW - 4, 8, 'normal')
    );
    const maxLines = Math.max(1, commsLines.length, channelLines.length, ...customLinesArr.map(l => l.length));
    const rowH = Math.max(ROW_MIN_H, maxLines * LINE_H + ROW_V_PAD);
    return { commsLines, channelLines, customLinesArr, rowH };
  });
  const rowHeights = rowContent.map(r => r.rowH);

  let titleH = 0;
  if (hasAgencySide || hasClientSide) titleH += LOGO_SIZE + 8;
  titleH += 6; // title line
  if (plan.objective) titleH += 6; // objective line
  titleH += 6 + 10 + 6; // subline gap, gap before gold bar, gap after gold bar

  const headerBlockH = HDR_H * 2 + 5; // two header rows + divider/gap
  const feesBlockH = fees.length > 0
    ? 2 + fees.length * FEE_ROW_H + (fees.length > 1 ? FEE_ROW_H : 0)
    : 0;
  const totalBlockH = 4 + 7; // gap+divider, then gap to the grand-total baseline
  const footerReserve = 20; // space for the "Generated" footer line + bottom margin
  const rowsTotalH = rowHeights.reduce((a, b) => a + b, 0);

  const totalHeight = MT + titleH + headerBlockH + rowsTotalH + SUBTOTAL_ROW_H
    + feesBlockH + totalBlockH + footerReserve;

  const doc = new jsPDF({
    unit: 'mm',
    format: [totalWidth, totalHeight],
    orientation: totalWidth >= totalHeight ? 'landscape' : 'portrait',
  });
  const H = totalHeight;

  let y = MT;

  // ── Branding band — client logo (left) / agency logo (right) ─────────────
  if (hasAgencySide || hasClientSide) {
    if (hasClientSide) {
      if (clientLogo) {
        doc.addImage(clientLogo.data, clientLogo.format, ML, y, LOGO_SIZE, LOGO_SIZE);
        if (plan.clientName) {
          setFont(doc, 8, 'bold', SEC);
          doc.text(plan.clientName, ML, y + LOGO_SIZE + 4);
        }
      } else if (plan.clientName) {
        setFont(doc, 11, 'bold', NAVY);
        doc.text(plan.clientName, ML, y + LOGO_SIZE / 2 + 3);
      }
    }
    if (hasAgencySide) {
      const rightX = ML + CW;
      if (agencyLogo) {
        doc.addImage(agencyLogo.data, agencyLogo.format, rightX - LOGO_SIZE, y, LOGO_SIZE, LOGO_SIZE);
        if (plan.agencyName) {
          setFont(doc, 8, 'bold', SEC);
          doc.text(plan.agencyName, rightX, y + LOGO_SIZE + 4, { align: 'right' });
        }
      } else if (plan.agencyName) {
        setFont(doc, 11, 'bold', NAVY);
        doc.text(plan.agencyName, rightX, y + LOGO_SIZE / 2 + 3, { align: 'right' });
      }
    }
    y += LOGO_SIZE + 8;
  }

  // ── Title / objective / subtitle ──────────────────────────────────────────
  setFont(doc, 20, 'bold', NAVY);
  doc.text(plan.title || 'Media Plan', ML, y + 6);
  y += 6;

  if (plan.objective) {
    y += 6;
    setFont(doc, 9.5, 'normal', SEC);
    doc.text(doc.splitTextToSize(plan.objective, CW)[0], ML, y);
  }

  y += 6;
  setFont(doc, 10, 'normal', MUTED);
  const subLine = [plan.asAtLabel, `Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`]
    .filter(Boolean).join('  ·  ');
  doc.text(subLine, ML, y);

  y += 10;
  doc.setFillColor(GOLD);
  doc.rect(ML, y, CW, 0.8, 'F');
  y += 6;

  // ── Column x-offsets ───────────────────────────────────────────────────
  const commsX = ML;
  const channelX = commsX + commsW;
  const customStartX = channelX + channelW;
  const totalX = customStartX + customColW * customColumns.length;
  const weeksStartX = totalX + totalW;

  // ── Grid header (2 rows: months, then weeks) ──────────────────────────────
  setFont(doc, 8.5, 'bold', NAVY);
  doc.setCharSpace(0.2);
  let mx = weeksStartX;
  for (const mg of monthGroups) {
    const mw = mg.count * weekW;
    doc.text(`${mg.month}${mg.year !== baseYear ? ' ' + mg.year : ''}`, mx + mw / 2, y + HDR_H - 2, { align: 'center' });
    mx += mw;
  }
  y += HDR_H;
  doc.setDrawColor(HAIR);
  doc.setLineWidth(0.3);
  doc.line(ML, y, ML + CW, y);

  if (hasComms) doc.text('COMMS', commsX + 2, y + HDR_H - 2);
  doc.text('CHANNEL', channelX + 2, y + HDR_H - 2);
  let ccx = customStartX;
  for (const col of customColumns) {
    doc.text(doc.splitTextToSize(col.name.toUpperCase(), customColW - 3)[0], ccx + 2, y + HDR_H - 2);
    ccx += customColW;
  }
  doc.text('TOTAL', totalX + totalW - 2, y + HDR_H - 2, { align: 'right' });

  setFont(doc, 6.5, 'normal', NAVY);
  let wx = weeksStartX;
  for (const w of weeks) {
    doc.text(w.label, wx + weekW / 2, y + HDR_H - 2, { align: 'center' });
    wx += weekW;
  }
  doc.setCharSpace(0);
  y += HDR_H;
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.5);
  doc.line(ML, y, ML + CW, y);
  y += 5;

  // ── Data rows ──────────────────────────────────────────────────────────
  rows.forEach((row, rowIdx) => {
    const rowTop = y;
    const rh = rowHeights[rowIdx];
    const { commsLines, channelLines, customLinesArr } = rowContent[rowIdx];

    if (hasComms && funnelGroupStarts[rowIdx] && row.funnel) {
      setFont(doc, 8, 'bold', BODY);
      drawWrappedLines(doc, commsLines, commsX + 2, rowTop, LINE_H);
    }

    if (channelGroupStarts[rowIdx]) {
      setFont(doc, 9, 'bold', BODY);
      drawWrappedLines(doc, channelLines, channelX + 2, rowTop, LINE_H);
    }

    setFont(doc, 8, 'normal', MUTED);
    let cx = customStartX;
    customColumns.forEach((_col, ci) => {
      drawWrappedLines(doc, customLinesArr[ci], cx + 2, rowTop, LINE_H);
      cx += customColW;
    });

    if (!row.flightGroupId || row.isMasterRow) {
      const rowTotal = row.flights.reduce((s, f) => s + f.budget, 0);
      setFont(doc, 9, 'bold', NAVY);
      doc.text(fmtCurrency(rowTotal), totalX + totalW - 3, rowTop + LINE_H, { align: 'right' });
    }

    drawWeekCellsForRow(doc, row, rowIdx, rows, weeks, weekW, weeksStartX, rowTop, rowHeights, flightGroups);

    y += rh;

    // Dividers: suppressed under COMMS/CHANNEL while inside a merged group
    // (so grouped rows read as one merged cell), always drawn everywhere else.
    const isFunnelGroupEnd = rowIdx === rows.length - 1 || funnelGroupStarts[rowIdx + 1];
    const isChannelGroupEnd = rowIdx === rows.length - 1 || channelGroupStarts[rowIdx + 1];
    doc.setDrawColor(HAIR);
    doc.setLineWidth(0.25);
    if (hasComms && isFunnelGroupEnd) doc.line(commsX, y, channelX, y);
    if (isChannelGroupEnd) doc.line(channelX, y, customStartX, y);
    doc.line(customStartX, y, ML + CW, y);
  });

  // ── Period-totals row (media spend, no fees) ──────────────────────────────
  doc.setFillColor('#f4f5f7');
  doc.rect(ML, y, CW, SUBTOTAL_ROW_H, 'F');
  setFont(doc, 9, 'bold', NAVY);
  doc.text(fmtCurrency(mediaTotal), totalX + totalW - 3, y + SUBTOTAL_ROW_H - 2.5, { align: 'right' });
  setFont(doc, 8.5, 'bold', SEC);
  let smx = weeksStartX;
  monthGroups.forEach((mg, mi) => {
    const mw = mg.count * weekW;
    doc.text(fmtCurrency(monthTotals[mi] ?? 0), smx + mw - 2, y + SUBTOTAL_ROW_H - 2.5, { align: 'right' });
    smx += mw;
  });
  y += SUBTOTAL_ROW_H;
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.4);
  doc.line(ML, y, ML + CW, y);

  // ── Fees ───────────────────────────────────────────────────────────────
  if (fees.length > 0) {
    y += 2;
    for (const fee of fees) {
      setFont(doc, 9, 'normal', SEC);
      doc.text(fee.name, ML, y + FEE_ROW_H - 2.5);
      setFont(doc, 9, 'bold', NAVY);
      doc.text(fmtCurrency(fee.amount), totalX + totalW - 3, y + FEE_ROW_H - 2.5, { align: 'right' });
      y += FEE_ROW_H;
    }
    if (fees.length > 1) {
      doc.setDrawColor(HAIR);
      doc.setLineWidth(0.3);
      doc.line(ML, y - 1, ML + CW, y - 1);
      setFont(doc, 9, 'bold', SEC);
      doc.text('TOTAL NON-MEDIA FEES', ML, y + FEE_ROW_H - 2.5);
      setFont(doc, 9, 'bold', NAVY);
      doc.text(fmtCurrency(feesTotal), totalX + totalW - 3, y + FEE_ROW_H - 2.5, { align: 'right' });
      y += FEE_ROW_H;
    }
  }

  // ── Grand total ────────────────────────────────────────────────────────
  y += 4;
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.53);
  doc.line(ML, y, ML + CW, y);
  y += 7;
  setFont(doc, 13, 'bold', NAVY);
  doc.text('TOTAL INVESTMENT', ML, y);
  doc.text(fmtCurrency(grandTotal), totalX + totalW - 3, y, { align: 'right' });

  // ── Footer ─────────────────────────────────────────────────────────────
  setFont(doc, 8, 'normal', LABEL);
  doc.text(`Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, ML, H - 8);

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  const fileName = `${(plan.title || 'Media_Plan').replace(/\s+/g, '_')}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
