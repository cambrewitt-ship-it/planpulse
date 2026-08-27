import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import type { SandboxPlan, PlanRow, Week, CustomColumn } from '@/components/sandbox/types';

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

// Marks which rows should show their own CHANNEL label — mirrors
// computeRowSpans() in plan-grid.tsx: consecutive rows sharing a non-empty
// channel print the name once, at the top of the run.
function computeChannelGroupStarts(rows: PlanRow[]): boolean[] {
  return rows.map((row, i) => i === 0 || !row.channel || row.channel !== rows[i - 1].channel);
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

  const customColumns: CustomColumn[] = plan.customColumns ?? [];
  const fees = plan.fees ?? [];

  const monthCols = monthKeysForWeeks(plan.weeks);
  const monthKeys = monthCols.map(m => m.key);

  const rowsWithTotals = plan.rows.map(row => {
    const monthly = rowMonthlyTotals(row, plan.weeks, monthKeys);
    const total = Object.values(monthly).reduce((a, b) => a + b, 0);
    return { row, monthly, total };
  });

  const monthSubtotals: Record<string, number> = {};
  for (const key of monthKeys) monthSubtotals[key] = 0;
  for (const { monthly } of rowsWithTotals) {
    for (const key of monthKeys) monthSubtotals[key] += monthly[key] ?? 0;
  }

  const channelGroupStart = computeChannelGroupStarts(plan.rows);

  const feesTotal = fees.reduce((s, f) => s + f.amount, 0);
  const grandTotal = rowsWithTotals.reduce((s, r) => s + r.total, 0) + feesTotal;

  const [agencyLogo, clientLogo] = await Promise.all([
    fetchLogo(plan.agencyLogoUrl),
    fetchLogo(plan.clientLogoUrl),
  ]);

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

  // ── Branding band — agency logo (left) / client logo (right), only drawn
  // when there's something to show, so the common unbranded case looks
  // identical to before ─────────────────────────────────────────────────────
  const LOGO_SIZE = 16;
  const hasAgencySide = !!agencyLogo || !!plan.agencyName;
  const hasClientSide = !!clientLogo || !!plan.clientName;

  if (hasAgencySide || hasClientSide) {
    if (hasAgencySide) {
      if (agencyLogo) {
        doc.addImage(agencyLogo.data, agencyLogo.format, ML, y, LOGO_SIZE, LOGO_SIZE);
        if (plan.agencyName) {
          set(8, 'bold', SEC);
          doc.text(plan.agencyName, ML, y + LOGO_SIZE + 4);
        }
      } else if (plan.agencyName) {
        set(11, 'bold', NAVY);
        doc.text(plan.agencyName, ML, y + LOGO_SIZE / 2 + 3);
      }
    }
    if (hasClientSide) {
      const rightX = ML + CW;
      if (clientLogo) {
        doc.addImage(clientLogo.data, clientLogo.format, rightX - LOGO_SIZE, y, LOGO_SIZE, LOGO_SIZE);
        if (plan.clientName) {
          set(8, 'bold', SEC);
          doc.text(plan.clientName, rightX, y + LOGO_SIZE + 4, { align: 'right' });
        }
      } else if (plan.clientName) {
        set(11, 'bold', NAVY);
        doc.text(plan.clientName, rightX, y + LOGO_SIZE / 2 + 3, { align: 'right' });
      }
    }
    y += LOGO_SIZE + 8;
  }

  // ── Title / objective / subtitle ──────────────────────────────────────────
  set(20, 'bold', NAVY);
  doc.text(plan.title || 'Media Plan', ML, y + 6);
  y += 6;

  if (plan.objective) {
    y += 6;
    set(9.5, 'normal', SEC);
    doc.text(doc.splitTextToSize(plan.objective, CW)[0], ML, y);
  }

  y += 6;
  set(10, 'normal', MUTED);
  const subLine = [plan.asAtLabel, `Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`]
    .filter(Boolean).join('  ·  ');
  doc.text(subLine, ML, y);

  y += 10;
  doc.setFillColor(GOLD);
  doc.rect(ML, y, CW, 0.8, 'F');
  y += 6;

  // ── Table columns: Channel | custom columns | Total | one per month ──────
  const nameW = 40, customColW = 28, totalW = 24;
  const leftFixedW = nameW + customColW * customColumns.length;
  const totalColX = ML + leftFixedW; // left edge of the TOTAL column
  const monthW = Math.max(14, (CW - leftFixedW - totalW) / Math.max(1, monthCols.length));

  const drawHeaderRow = () => {
    set(8.5, 'bold', NAVY);
    doc.setCharSpace(0.2);
    let x = ML;
    doc.text('CHANNEL', x, y); x += nameW;
    for (const col of customColumns) {
      doc.text(doc.splitTextToSize(col.name.toUpperCase(), customColW - 2)[0], x, y);
      x += customColW;
    }
    doc.text('TOTAL', x + totalW - 1, y, { align: 'right' }); x += totalW;
    for (const m of monthCols) {
      doc.text(m.label, x + monthW - 1, y, { align: 'right' });
      x += monthW;
    }
    doc.setCharSpace(0);
    y += 3;
    doc.setDrawColor(NAVY);
    doc.setLineWidth(0.4);
    doc.line(ML, y, ML + CW, y);
    y += 5;
  };

  const checkPage = () => {
    if (y > H - MT - 24) {
      doc.addPage();
      y = MT;
      drawHeaderRow();
    }
  };

  drawHeaderRow();

  rowsWithTotals.forEach(({ row, monthly, total }, rowIdx) => {
    checkPage();
    let x = ML;

    if (channelGroupStart[rowIdx]) {
      set(9.5, 'bold', BODY);
      doc.text(doc.splitTextToSize(row.channel || '—', nameW - 2)[0], x, y);
    }
    x += nameW;

    set(9, 'normal', MUTED);
    for (const col of customColumns) {
      const val = row.customFields?.[col.id] ?? '';
      doc.text(doc.splitTextToSize(val, customColW - 2)[0], x, y);
      x += customColW;
    }

    set(9.5, 'bold', NAVY);
    doc.text(fmtCurrency(total), x + totalW - 1, y, { align: 'right' });
    x += totalW;

    set(9, 'normal', SEC);
    for (const m of monthCols) {
      doc.text(fmtCurrency(monthly[m.key] ?? 0), x + monthW - 1, y, { align: 'right' });
      x += monthW;
    }

    y += 6;
    doc.setDrawColor(HAIR);
    doc.setLineWidth(0.3);
    const isGroupEnd = rowIdx === plan.rows.length - 1 || channelGroupStart[rowIdx + 1];
    if (isGroupEnd) doc.line(ML, y - 2, ML + nameW, y - 2);
    doc.line(ML + nameW, y - 2, ML + CW, y - 2);
  });

  // ── Fees ───────────────────────────────────────────────────────────────
  if (fees.length > 0) {
    y += 2;
    set(8.5, 'bold', LABEL);
    doc.text('NON-MEDIA FEES', ML, y);
    y += 6;
    for (const fee of fees) {
      checkPage();
      set(9.5, 'normal', SEC);
      doc.text(fee.name, ML, y);
      set(9.5, 'bold', NAVY);
      doc.text(fmtCurrency(fee.amount), totalColX + totalW - 1, y, { align: 'right' });
      y += 6;
    }

    checkPage();
    doc.setDrawColor(HAIR);
    doc.setLineWidth(0.3);
    doc.line(ML, y - 3, ML + CW, y - 3);
    set(9.5, 'bold', SEC);
    doc.text('TOTAL NON-MEDIA FEES', ML, y);
    set(9.5, 'bold', NAVY);
    doc.text(fmtCurrency(feesTotal), totalColX + totalW - 1, y, { align: 'right' });
    y += 6;
  }

  // ── Grand total ────────────────────────────────────────────────────────
  checkPage();
  y += 4;
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.53);
  doc.line(ML, y, ML + CW, y);
  y += 7;
  set(13, 'bold', NAVY);
  doc.text(fees.length > 0 ? 'Total Media Plan' : 'Total', ML, y);
  doc.text(fmtCurrency(grandTotal), totalColX + totalW - 1, y, { align: 'right' });

  set(10, 'bold', MUTED);
  let mx = totalColX + totalW;
  for (const m of monthCols) {
    doc.text(fmtCurrency(monthSubtotals[m.key] ?? 0), mx + monthW - 1, y, { align: 'right' });
    mx += monthW;
  }

  // ── Footer — generated date + page numbers on every page ─────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    set(8, 'normal', LABEL);
    doc.text(`Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, ML, H - 8);
    doc.text(`Page ${p} of ${totalPages}`, ML + CW, H - 8, { align: 'right' });
  }

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  const fileName = `${(plan.title || 'Media_Plan').replace(/\s+/g, '_')}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
