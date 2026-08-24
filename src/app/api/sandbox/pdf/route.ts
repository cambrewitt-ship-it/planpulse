import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import type { SandboxPlan, PlanRow, Week } from '@/components/sandbox/types';

// ── Colours — same palette as the invoice PDF for brand consistency ─────────
const NAVY  = '#16305A';
const GOLD  = '#D4AF37';
const BODY  = '#182236';
const SEC   = '#33394a';
const MUTED = '#5b6472';
const LABEL = '#9aa2b0';
const HAIR  = '#e4e7ed';

const px = (p: number) => p / 1.333;

function fmtCurrency(v: number) {
  if (v === 0) return '—';
  return '$' + Math.round(v).toLocaleString();
}

function weekSpanForFlight(flight: { startWeek: string; endWeek: string }, weeks: Week[]): number {
  return weeks.filter(w => w.weekStart >= flight.startWeek && w.weekStart <= flight.endWeek).length;
}

// One entry per calendar month that appears in `weeks`, in order.
function monthKeysForWeeks(weeks: Week[]): Array<{ key: string; label: string }> {
  const seen = new Map<string, string>();
  for (const w of weeks) {
    const key = `${w.year}-${w.month}`;
    if (!seen.has(key)) seen.set(key, w.month);
  }
  return Array.from(seen.entries()).map(([key, month]) => ({ key, label: month }));
}

// Distributes each row's flight budgets evenly across the weeks they span,
// then buckets those weekly amounts into calendar months — same approach as
// weekTotals()/monthTotals() in plan-grid.tsx, just scoped to one row.
function rowMonthlyTotals(row: PlanRow, weeks: Week[], monthKeys: string[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const key of monthKeys) totals[key] = 0;

  for (const w of weeks) {
    const flight = row.flights.find(f => f.startWeek <= w.weekStart && w.weekStart <= f.endWeek);
    if (!flight) continue;
    const span = Math.max(1, weekSpanForFlight(flight, weeks));
    const key = `${w.year}-${w.month}`;
    totals[key] = (totals[key] ?? 0) + flight.budget / span;
  }
  return totals;
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

  const monthCols = monthKeysForWeeks(plan.weeks);
  const monthKeys = monthCols.map(m => m.key);

  const rowsWithTotals = plan.rows.map(row => {
    const monthly = rowMonthlyTotals(row, plan.weeks, monthKeys);
    const total = Object.values(monthly).reduce((a, b) => a + b, 0);
    return { row, monthly, total };
  });

  const feesTotal = (plan.fees ?? []).reduce((s, f) => s + f.amount, 0);
  const grandTotal = rowsWithTotals.reduce((s, r) => s + r.total, 0) + feesTotal;

  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 14;
  const MT = 14;
  const CW = W - ML * 2;

  const set = (size: number, weight: 'bold' | 'normal', color: string) => {
    doc.setFontSize(px(size));
    doc.setFont('helvetica', weight);
    doc.setTextColor(color);
  };

  let y = MT;

  set(20, 'bold', NAVY);
  doc.text(plan.title || 'Media Plan', ML, y + 6);
  set(10, 'normal', MUTED);
  const subLine = [plan.asAtLabel, `Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`]
    .filter(Boolean).join('  ·  ');
  doc.text(subLine, ML, y + 12);

  y += 16;
  doc.setFillColor(GOLD);
  doc.rect(ML, y, CW, 0.8, 'F');
  y += 6;

  // ── Table columns: Channel | Detail | one per month | Total ──────────────
  const nameW = 42, detailW = 34, totalW = 26;
  const monthW = Math.max(14, (CW - nameW - detailW - totalW) / Math.max(1, monthCols.length));

  const drawHeaderRow = () => {
    set(8.5, 'bold', NAVY);
    doc.setCharSpace(0.2);
    let x = ML;
    doc.text('CHANNEL', x, y); x += nameW;
    doc.text('DETAIL', x, y); x += detailW;
    for (const m of monthCols) {
      doc.text(m.label, x + monthW - 1, y, { align: 'right' });
      x += monthW;
    }
    doc.text('TOTAL', x + totalW - 1, y, { align: 'right' });
    doc.setCharSpace(0);
    y += 3;
    doc.setDrawColor(NAVY);
    doc.setLineWidth(0.4);
    doc.line(ML, y, ML + CW, y);
    y += 5;
  };

  const checkPage = () => {
    if (y > H - MT - 20) {
      doc.addPage();
      y = MT;
      drawHeaderRow();
    }
  };

  drawHeaderRow();

  for (const { row, monthly, total } of rowsWithTotals) {
    checkPage();
    let x = ML;
    set(9.5, 'bold', BODY);
    doc.text(doc.splitTextToSize(row.channel || '—', nameW - 2)[0], x, y); x += nameW;
    set(9, 'normal', MUTED);
    doc.text(doc.splitTextToSize(row.detail || '', detailW - 2)[0], x, y); x += detailW;
    set(9, 'normal', SEC);
    for (const m of monthCols) {
      doc.text(fmtCurrency(monthly[m.key] ?? 0), x + monthW - 1, y, { align: 'right' });
      x += monthW;
    }
    set(9.5, 'bold', NAVY);
    doc.text(fmtCurrency(total), x + totalW - 1, y, { align: 'right' });

    y += 6;
    doc.setDrawColor(HAIR);
    doc.setLineWidth(0.3);
    doc.line(ML, y - 2, ML + CW, y - 2);
  }

  // ── Fees ───────────────────────────────────────────────────────────────
  if ((plan.fees ?? []).length > 0) {
    y += 2;
    set(8.5, 'bold', LABEL);
    doc.text('NON-MEDIA FEES', ML, y);
    y += 6;
    for (const fee of plan.fees ?? []) {
      checkPage();
      set(9.5, 'normal', SEC);
      doc.text(fee.name, ML, y);
      set(9.5, 'bold', NAVY);
      doc.text(fmtCurrency(fee.amount), ML + nameW + detailW + monthW * monthCols.length + totalW - 1, y, { align: 'right' });
      y += 6;
    }
  }

  // ── Grand total ────────────────────────────────────────────────────────
  y += 4;
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.53);
  doc.line(ML, y, ML + CW, y);
  y += 7;
  set(13, 'bold', NAVY);
  doc.text('Total Media Plan', ML, y);
  set(15, 'bold', NAVY);
  doc.text(fmtCurrency(grandTotal), ML + CW, y, { align: 'right' });

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  const fileName = `${(plan.title || 'Media_Plan').replace(/\s+/g, '_')}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
