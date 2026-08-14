import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── Colours from spec ───────────────────────────────────────────────────────
const NAVY   = '#16305A';
const GOLD   = '#D4AF37';
const BODY   = '#182236';
const SEC    = '#33394a';
const MUTED  = '#5b6472';
const LABEL  = '#9aa2b0';
const HAIR   = '#e4e7ed';

// pt helpers (spec sizes are in px at 96dpi; 1pt = 1.333px)
const px = (p: number) => p / 1.333;

function fmtCurrency(v: number) {
  return '$' + v.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-NZ', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// Auto-generate invoice number from end date
function invoiceNumber(end_date: string) {
  return `INV-${end_date.replace(/-/g, '').slice(0, 8)}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const start_date = searchParams.get('start_date');
  const end_date   = searchParams.get('end_date');
  const spend_type = (searchParams.get('spend_type') ?? 'actual') as 'actual' | 'planned';

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  // Fetch client, agency settings, and media plan in parallel.
  // agency_settings and billing_address may not exist yet if migration hasn't run — degrade gracefully.
  const [clientRes, agencyRes, mediaPlanRes] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', clientId).eq('user_id', session.user.id).maybeSingle(),
    supabase.from('agency_settings').select('*').eq('user_id', session.user.id).maybeSingle(),
    supabase.from('client_media_plan_builder').select('channels, commission').eq('client_id', clientId).maybeSingle(),
  ]);

  if (!clientRes.data) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // Try to get billing_address separately — ignore if column doesn't exist yet
  let billingAddress = '';
  try {
    const { data: clientFull } = await (supabase as any).from('clients').select('billing_address').eq('id', clientId).maybeSingle();
    billingAddress = clientFull?.billing_address ?? '';
  } catch { /* column not yet in DB */ }

  const client    = { ...clientRes.data, billing_address: billingAddress };
  const agency    = agencyRes.data ?? {};
  const mediaPlan = mediaPlanRes.data;
  const commission = mediaPlan?.commission ?? 0;

  // ── Build channel rows ───────────────────────────────────────────────────
  const channels: Array<{ name: string; net: number; gross: number; commission: number }> = [];

  if (spend_type === 'planned') {
    const rawChannels: any[] = (mediaPlan?.channels as any[]) ?? [];
    const [sy, sm, sd] = start_date.split('-').map(Number);
    const [ey, em, ed] = end_date.split('-').map(Number);

    for (const ch of rawChannels) {
      let total = 0;
      let yr = sy, mo = sm;
      while (yr < ey || (yr === ey && mo <= em)) {
        const dim = new Date(yr, mo, 0).getDate();
        const ms = (yr === sy && mo === sm) ? sd : 1;
        const me = (yr === ey && mo === em) ? ed : dim;
        const frac = (me - ms + 1) / dim;
        const key = `${yr}-${String(mo).padStart(2, '0')}`;
        const keyAlt = `${yr}-${mo}`;
        for (const f of ch.flights ?? []) {
          if (f.monthlySpend) {
            total += Number(f.monthlySpend[key] ?? f.monthlySpend[keyAlt] ?? 0) * frac;
          }
        }
        mo++; if (mo > 12) { mo = 1; yr++; }
      }
      if (total > 0) {
        const gross = commission > 0 && commission < 100 ? total / (1 - commission / 100) : total;
        const net   = Math.round(total * 100) / 100;
        const gr    = Math.round(gross * 100) / 100;
        channels.push({ name: ch.channelName || 'Unknown', net, gross: gr, commission: Math.round((gr - net) * 100) / 100 });
      }
    }
  } else {
    const { data: metrics } = await supabase
      .from('ad_performance_metrics')
      .select('platform, spend')
      .eq('client_id', clientId)
      .gte('date', start_date)
      .lte('date', end_date)
      .not('campaign_id', 'like', 'manual-override-%');

    const byPlatform = new Map<string, number>();
    for (const m of metrics ?? []) {
      byPlatform.set(m.platform, (byPlatform.get(m.platform) ?? 0) + Number(m.spend || 0));
    }

    const platformLabels: Record<string, string> = {
      'meta-ads': 'Meta Ads', 'google-ads': 'Google Ads',
      'linkedin-ads': 'LinkedIn Ads', 'tiktok-ads': 'TikTok Ads',
    };

    for (const [platform, net] of byPlatform) {
      if (net > 0) {
        const gross = commission > 0 && commission < 100 ? net / (1 - commission / 100) : net;
        const n = Math.round(net * 100) / 100;
        const g = Math.round(gross * 100) / 100;
        channels.push({ name: platformLabels[platform] ?? platform, net: n, gross: g, commission: Math.round((g - n) * 100) / 100 });
      }
    }
  }

  const totalNet        = channels.reduce((s, c) => s + c.net, 0);
  const totalGross      = channels.reduce((s, c) => s + c.gross, 0);
  const totalCommission = channels.reduce((s, c) => s + c.commission, 0);

  // ── Fetch logo as base64 if available ────────────────────────────────────
  let logoBase64: string | null = null;
  let logoFormat: 'PNG' | 'JPEG' = 'PNG';
  if ((agency as any).logo_url) {
    try {
      const logoRes = await fetch((agency as any).logo_url);
      if (logoRes.ok) {
        const ct = logoRes.headers.get('content-type') ?? '';
        logoFormat = ct.includes('jpeg') || ct.includes('jpg') ? 'JPEG' : 'PNG';
        const buf = await logoRes.arrayBuffer();
        logoBase64 = Buffer.from(buf).toString('base64');
      }
    } catch { /* logo unavailable — skip */ }
  }

  // ── Build PDF ─────────────────────────────────────────────────────────────
  const { default: jsPDF } = await import('jspdf');

  // Letter page, mm units
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();   // 215.9
  const H = doc.internal.pageSize.getHeight();  // 279.4
  const ML = 16.51;  // 0.65in left margin
  const MT = 15.24;  // 0.6in top margin
  const CW = W - ML * 2; // content width

  const set = (size: number, weight: 'bold' | 'normal', color: string) => {
    doc.setFontSize(px(size));
    doc.setFont('helvetica', weight);
    doc.setTextColor(color);
  };

  let y = MT;

  // ── Header row ────────────────────────────────────────────────────────────
  // Logo (14mm × 14mm ≈ 52px)
  const LOGO_SIZE = 14;
  if (logoBase64) {
    doc.addImage(logoBase64, logoFormat, ML, y, LOGO_SIZE, LOGO_SIZE);
  }

  const agencyTextX = logoBase64 ? ML + LOGO_SIZE + 3.7 : ML;

  // Agency name
  set(17, 'bold', NAVY);
  doc.text((agency as any).agency_name || '', agencyTextX, y + 6);

  // Address + contact
  const agencyContact = [(agency as any).agency_address, [(agency as any).agency_email, (agency as any).agency_phone].filter(Boolean).join('  ·  ')].filter(Boolean).join('\n');
  if (agencyContact) {
    set(10.5, 'normal', MUTED);
    const contactLines = agencyContact.split('\n');
    contactLines.forEach((line: string, i: number) => {
      doc.text(line, agencyTextX, y + 11 + i * 4);
    });
  }

  // INVOICE label — right aligned
  set(26, 'bold', NAVY);
  doc.text('INVOICE', W - ML, y + 9, { align: 'right' });

  // Invoice number
  const invNum = invoiceNumber(end_date);
  set(11, 'normal', MUTED);
  doc.text(invNum, W - ML, y + 15, { align: 'right' });

  y += Math.max(LOGO_SIZE, 18) + 2;

  // ── Gold divider ─────────────────────────────────────────────────────────
  y += 5.8; // ~22px top margin
  doc.setFillColor(GOLD);
  doc.rect(ML, y, CW, 0.8, 'F'); // 3px ≈ 0.8mm
  y += 0.8 + 5.3; // bar + ~20px bottom margin

  // ── Three-column meta ─────────────────────────────────────────────────────
  const COL = (CW - 12) / 3; // 3 cols with 2×6mm gaps
  const col2X = ML + COL + 6;
  const col3X = ML + (COL + 6) * 2;

  // Label style helper
  const drawLabel = (text: string, x: number, cy: number) => {
    set(9.5, 'bold', LABEL);
    doc.setCharSpace(0.4);
    doc.text(text.toUpperCase(), x, cy);
    doc.setCharSpace(0);
  };

  // Bill To
  drawLabel('Bill To', ML, y);
  y += 4;
  set(13, 'bold', NAVY);
  doc.text(client.name, ML, y);
  if ((client as any).billing_address) {
    set(11, 'normal', MUTED);
    doc.text((client as any).billing_address, ML, y + 4.5);
  }

  // Invoice Details (right of bill-to)
  const metaY = y - 4;
  drawLabel('Invoice Details', col2X, metaY);
  const metaRows = [
    ['Issue date', fmtDate(new Date().toISOString().split('T')[0])],
    ['Due date',   fmtDate((() => { const d = new Date(); d.setDate(d.getDate() + ((agency as any).invoice_due_days ?? 14)); return d.toISOString().split('T')[0]; })())],
    ['PO number',  '—'],
  ];
  set(11, 'normal', MUTED);
  metaRows.forEach(([lbl, val], i) => {
    const ry = metaY + 4 + i * 5.5;
    doc.text(lbl, col2X, ry);
    set(11, 'bold', SEC);
    doc.text(val, col2X + COL * 0.55, ry);
    set(11, 'normal', MUTED);
  });

  // Campaign Period
  drawLabel('Campaign Period', col3X, metaY);
  set(11, 'normal', SEC);
  const periodLines = [
    `${fmtDate(start_date)} – ${fmtDate(end_date)}`,
    `Spend type: ${spend_type === 'actual' ? 'Actual' : 'Planned'}`,
    `Commission: ${commission}%`,
  ];
  periodLines.forEach((line, i) => {
    doc.text(line, col3X, metaY + 4 + i * 5.5);
  });

  y += 22; // enough room for the meta block

  // ── Line items table ──────────────────────────────────────────────────────
  y += 7; // 28px margin-top

  // Column widths: 2fr 2fr 0.6fr 1fr 1fr 1fr → total 7.6fr
  const fr = CW / 7.6;
  const tCols = [fr * 2, fr * 2, fr * 0.6, fr, fr, fr];
  const tHeaders = ['Media Channel', 'Details', 'Qty', 'Rate (Net)', 'Commission', 'Gross'];
  const tAligns: ('left' | 'right')[] = ['left', 'left', 'right', 'right', 'right', 'right'];

  // Header row
  set(9.5, 'bold', NAVY);
  doc.setCharSpace(0.3);
  let tx = ML;
  tHeaders.forEach((h, i) => {
    const textX = tAligns[i] === 'right' ? tx + tCols[i] : tx;
    doc.text(h.toUpperCase(), textX, y, { align: tAligns[i] === 'right' ? 'right' : 'left' });
    tx += tCols[i];
  });
  doc.setCharSpace(0);
  y += 3;

  // Header bottom border (1.5px ≈ 0.53mm)
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.53);
  doc.line(ML, y, ML + CW, y);
  y += 3;

  // Data rows
  for (const ch of channels) {
    if (y > H - MT - 30) { doc.addPage(); y = MT; }

    const rowY = y + 9 * 0.3528; // 9px top padding in mm
    tx = ML;

    // Channel (bold body)
    set(11, 'bold', BODY);
    const nameLines = doc.splitTextToSize(ch.name, tCols[0] - 2);
    doc.text(nameLines, tx, rowY);
    tx += tCols[0];

    // Details (muted, empty for agent-generated)
    tx += tCols[1];

    // Qty
    set(11, 'normal', SEC);
    doc.text('1', tx + tCols[2], rowY, { align: 'right' });
    tx += tCols[2];

    // Rate (Net)
    doc.text(fmtCurrency(ch.net), tx + tCols[3], rowY, { align: 'right' });
    tx += tCols[3];

    // Commission
    doc.text(fmtCurrency(ch.commission), tx + tCols[4], rowY, { align: 'right' });
    tx += tCols[4];

    // Gross (bold navy)
    set(11, 'bold', NAVY);
    doc.text(fmtCurrency(ch.gross), tx + tCols[5], rowY, { align: 'right' });

    y += Math.max(9 * 0.3528 * 2, nameLines.length * 4.5) + 3.18; // row height

    // Row border (1px ≈ 0.35mm)
    doc.setDrawColor(HAIR);
    doc.setLineWidth(0.35);
    doc.line(ML, y, ML + CW, y);
  }

  // ── Totals block (right-aligned, min-width ~69mm) ────────────────────────
  y += 6.35; // ~18px margin
  const totW  = 69;
  const totX  = ML + CW - totW;
  const totLW = 40; // label column width within totals

  const totRows: [string, string][] = [
    ['Net Spend', fmtCurrency(totalNet)],
    [`Commission (${commission}%)`, fmtCurrency(totalCommission)],
  ];

  set(11.5, 'normal', MUTED);
  totRows.forEach(([lbl, val]) => {
    doc.text(lbl, totX, y);
    set(11.5, 'normal', SEC);
    doc.text(val, totX + totW, y, { align: 'right' });
    set(11.5, 'normal', MUTED);
    y += 5.5;
  });

  // Total Due row — border top + bold
  y += 3;
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.53);
  doc.line(totX, y, totX + totW, y);
  y += 4.5;

  set(14, 'bold', NAVY);
  doc.text('Total Due', totX, y);
  set(16, 'bold', NAVY);
  doc.text(fmtCurrency(totalGross), totX + totW, y, { align: 'right' });

  // ── Footer (pinned near bottom) ───────────────────────────────────────────
  const footerY = H - MT - 20;
  doc.setDrawColor(HAIR);
  doc.setLineWidth(0.35);
  doc.line(ML, footerY - 4, ML + CW, footerY - 4);

  const halfW = (CW - 10.6) / 2;

  // Payment details
  drawLabel('Payment Details', ML, footerY);
  set(10.5, 'normal', MUTED);
  const payLines = [
    (agency as any).bank_name,
    (agency as any).bank_account_name ? `Account name: ${(agency as any).bank_account_name}` : '',
    (agency as any).bank_account_number ? `Account number: ${(agency as any).bank_account_number}` : '',
    `Reference: ${invNum}`,
  ].filter(Boolean);
  payLines.forEach((line, i) => {
    doc.text(line, ML, footerY + 4 + i * 4.2);
  });

  // Notes
  const notesX = ML + halfW + 10.6;
  drawLabel('Notes', notesX, footerY);
  if ((agency as any).invoice_notes) {
    set(10.5, 'normal', MUTED);
    const noteLines = doc.splitTextToSize((agency as any).invoice_notes, halfW);
    doc.text(noteLines, notesX, footerY + 4);
  }

  // ── Output ────────────────────────────────────────────────────────────────
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  const fileName  = `Invoice_${client.name.replace(/\s+/g, '_')}_${start_date}_${end_date}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
    },
  });
}
