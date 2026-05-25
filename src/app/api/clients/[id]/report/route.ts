import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let reqBody: any;
  try { reqBody = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { start_date, end_date, sections = ['summary', 'spend', 'channels', 'actions'], format = 'pdf' } = reqBody as {
    start_date: string;
    end_date: string;
    sections?: string[];
    format?: 'pdf' | 'json';
  };

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  // Fetch report data via the data route
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const sectionsStr = sections.join(',');

  const dataRes = await fetch(
    `${origin}/api/clients/${clientId}/report-data?start_date=${start_date}&end_date=${end_date}&sections=${sectionsStr}`,
    { headers: { cookie: cookieHeader } }
  );

  if (!dataRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch report data' }, { status: 500 });
  }

  const data = await dataRes.json();

  if (format === 'json') {
    return NextResponse.json(data);
  }

  // Build PDF with jsPDF (dynamic import to avoid SSR issues)
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = margin;

  const BRAND = '#1C1917';
  const MUTED = '#78716C';
  const ACCENT = '#D97706';

  function checkPage(needed = 10) {
    if (y + needed > pageH - margin) { doc.addPage(); y = margin; }
  }

  function heading(text: string, size = 14) {
    checkPage(12);
    doc.setFontSize(size);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BRAND);
    doc.text(text, margin, y);
    y += size * 0.5 + 4;
  }

  function drawText(text: string, size = 10, color = BRAND) {
    checkPage(8);
    doc.setFontSize(size);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.45 + 1.5);
  }

  function rule(color = '#E8E4DC') {
    checkPage(4);
    doc.setDrawColor(color);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  }

  // ── Cover page ─────────────────────────────────────────────────────────────
  doc.setFillColor('#1C1917');
  doc.rect(0, 0, pageW, 40, 'F');
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#FFFFFF');
  doc.text('PlanPulse', margin, 22);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Performance Report', margin, 31);

  y = 55;
  heading(data.client.name, 20);
  drawText(`${start_date}  →  ${end_date}`, 11, MUTED);
  y += 4;

  const statusEmoji: Record<string, string> = { green: 'Green', amber: 'Amber', red: 'Red' };
  const healthStatus = statusEmoji[data.health.status] ?? data.health.status;
  drawText(`Health: ${healthStatus}  |  Budget: ${data.health.budget_health_pct != null ? data.health.budget_health_pct.toFixed(0) + '%' : 'N/A'}  |  Overdue tasks: ${data.health.total_overdue_tasks}`, 10, MUTED);
  y += 6;
  rule();

  // ── AI summary ─────────────────────────────────────────────────────────────
  if (data.ai_summary && sections.includes('summary')) {
    y += 2;
    heading('Executive Summary', 13);
    drawText(data.ai_summary, 10, MUTED);
    y += 6;
    rule();
  }

  // ── Spend overview ─────────────────────────────────────────────────────────
  if (sections.includes('spend') && data.spend?.channels?.length) {
    y += 2;
    heading('Spend Overview', 13);

    const colW = [60, 30, 30, 30, 26];
    const headers = ['Channel', 'Planned', 'Actual', 'Variance', 'Pacing'];
    let x = margin;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BRAND);
    headers.forEach((h, i) => { doc.text(h, x, y); x += colW[i]; });
    y += 6;
    rule('#D5D0C5');

    doc.setFont('helvetica', 'normal');
    for (const ch of data.spend.channels) {
      checkPage(8);
      x = margin;
      const fmt = (n: number | null) => n != null ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';
      const varStr = ch.variance_pct != null ? `${ch.variance_pct > 0 ? '+' : ''}${ch.variance_pct}%` : '—';
      const pacingColor = ch.pacing_status === 'overpacing' ? '#B45309'
        : ch.pacing_status === 'underpacing' ? '#B91C1C'
        : ch.pacing_status === 'on track' ? '#15803D' : MUTED;

      doc.setTextColor(BRAND);
      doc.text(doc.splitTextToSize(ch.name, colW[0] - 2)[0], x, y); x += colW[0];
      doc.text(fmt(ch.planned), x, y); x += colW[1];
      doc.text(fmt(ch.actual), x, y); x += colW[2];
      doc.text(varStr, x, y); x += colW[3];
      doc.setTextColor(pacingColor);
      doc.text(ch.pacing_status, x, y);
      doc.setTextColor(BRAND);
      y += 7;
    }

    const totalActual = data.spend.channels.reduce((s: number, c: any) => s + (c.actual ?? 0), 0);
    const totalPlanned = data.spend.channels.reduce((s: number, c: any) => s + (c.planned ?? 0), 0);
    rule('#D5D0C5');
    x = margin;
    doc.setFont('helvetica', 'bold');
    doc.text('Total', x, y); x += colW[0];
    doc.text(`$${totalPlanned.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, x, y); x += colW[1];
    doc.text(`$${totalActual.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, x, y);
    y += 8;
    rule();
  }

  // ── Channel performance table ───────────────────────────────────────────────
  if (sections.includes('channels') && data.spend?.channels?.some((c: any) => c.impressions != null)) {
    y += 2;
    heading('Channel Performance', 13);

    const colW = [50, 26, 26, 20, 22, 26];
    const headers = ['Channel', 'Impressions', 'Clicks', 'CTR %', 'CPC', 'Conversions'];
    let x = margin;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BRAND);
    headers.forEach((h, i) => { doc.text(h, x, y); x += colW[i]; });
    y += 6;
    rule('#D5D0C5');

    doc.setFont('helvetica', 'normal');
    for (const ch of data.spend.channels) {
      if (ch.impressions == null && ch.clicks == null) continue;
      checkPage(8);
      x = margin;
      const fmt = (n: number | null, dec = 0) => n != null ? n.toLocaleString('en-US', { maximumFractionDigits: dec }) : '—';
      doc.text(doc.splitTextToSize(ch.name, colW[0] - 2)[0], x, y); x += colW[0];
      doc.text(fmt(ch.impressions), x, y); x += colW[1];
      doc.text(fmt(ch.clicks), x, y); x += colW[2];
      doc.text(ch.ctr != null ? `${ch.ctr}%` : '—', x, y); x += colW[3];
      doc.text(ch.cpc != null ? `$${fmt(ch.cpc, 2)}` : '—', x, y); x += colW[4];
      doc.text(fmt(ch.conversions), x, y);
      y += 7;
    }
    y += 2;
    rule();
  }

  // ── Action points summary ──────────────────────────────────────────────────
  if (sections.includes('actions')) {
    y += 2;
    heading('Action Points', 13);
    drawText(`Completed: ${data.action_points.completed_count}  |  Outstanding: ${data.action_points.outstanding_count}  |  Overdue: ${data.action_points.overdue_count}`, 10, MUTED);
    y += 3;

    if (data.action_points.overdue_items?.length) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(BRAND);
      doc.text('Overdue items:', margin, y); y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(MUTED);
      for (const ap of data.action_points.overdue_items) {
        checkPage(7);
        doc.text(`• ${ap.text} (${ap.channel ?? '—'}) — due ${ap.due_date}`, margin + 4, y);
        y += 6;
      }
    }
    y += 4;
    rule();
  }

  // ── Media plan snapshot ────────────────────────────────────────────────────
  if (sections.includes('summary') && data.media_plan?.channels?.length) {
    y += 2;
    heading('Media Plan Snapshot', 13);

    const colW = [70, 35, 35, 36];
    const headers = ['Channel', 'Budget', 'Start', 'End'];
    let x = margin;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BRAND);
    headers.forEach((h, i) => { doc.text(h, x, y); x += colW[i]; });
    y += 6;
    rule('#D5D0C5');

    doc.setFont('helvetica', 'normal');
    for (const ch of data.media_plan.channels) {
      if (!ch.budget) continue;
      checkPage(8);
      x = margin;
      doc.text(doc.splitTextToSize(ch.name, colW[0] - 2)[0], x, y); x += colW[0];
      doc.text(`$${Number(ch.budget).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, x, y); x += colW[1];
      doc.text(ch.start ?? '—', x, y); x += colW[2];
      doc.text(ch.end ?? '—', x, y);
      y += 7;
    }
  }

  // ── Footer on each page ────────────────────────────────────────────────────
  const pageCount = (doc.internal as any).pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED);
    doc.text(`${data.client.name} — Performance Report — Generated ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`, margin, pageH - 10);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin - 20, pageH - 10);
  }

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Report_${data.client.name.replace(/\s+/g, '_')}_${start_date}_${end_date}.pdf"`,
    },
  });
}
