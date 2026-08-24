'use client';

import { Check } from 'lucide-react';
import type { VisionExtraction } from '@/app/api/media-plan-agent/vision-extract/route';

// Same Apple × Moleskine tokens as media-plan-chat-panel.tsx, for visual consistency
const CARD_BG = 'oklch(98% 0.006 75)';
const PAPER_BG = 'oklch(96% 0.009 75)';
const INK = '#1C1917';
const GRAPHITE = '#5C5450';
const MUTED = '#8A8578';
const BORDER = 'oklch(89% 0.011 75)';
const BORDER_SOFT = 'oklch(92% 0.009 75)';
const GREEN = 'oklch(52% 0.13 150)';
const sansFont = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

interface ExtractionCardProps {
  extraction: VisionExtraction;
  applied?: boolean;
  onApply: () => void;
  onDismiss: () => void;
}

/** Preview of a vision-extract result — shared by the authenticated dashboard's
 *  media plan chat panel and the public builder's AI panel. Pure presentational,
 *  no client/agent dependency. */
export function ExtractionCard({ extraction, applied, onApply, onDismiss }: ExtractionCardProps) {
  return (
    <div style={{
      marginTop: 8, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden',
      background: PAPER_BG,
    }}>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
        {extraction.channels.map((ch, i) => {
          const name = ch.customChannelName || ch.channelName;
          const total = ch.flights.reduce((s, f) => s + Object.values(f.monthlySpend || {}).reduce((a, b) => a + b, 0), 0);
          return (
            <div key={i} style={{ fontSize: 12, fontFamily: sansFont }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: INK }}>
                <span>{name}{ch.isOrganic ? ' (Organic)' : ''}</span>
                <span>{formatMoney(total)}</span>
              </div>
              {ch.format && <div style={{ color: MUTED, fontSize: 11 }}>{ch.format}</div>}
              {ch.flights.map((f, fi) => (
                <div key={fi} style={{ color: GRAPHITE, fontSize: 11, marginLeft: 4 }}>
                  · {f.startDate} → {f.endDate}
                </div>
              ))}
              {ch.customFields && Object.keys(ch.customFields).length > 0 && (
                <div style={{ color: MUTED, fontSize: 10.5, marginLeft: 4 }}>
                  {Object.entries(ch.customFields).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                </div>
              )}
            </div>
          );
        })}

        {extraction.fees.length > 0 && (
          <div style={{ borderTop: `1px solid ${BORDER_SOFT}`, paddingTop: 6 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
              Fees
            </div>
            {extraction.fees.map((fee, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: INK }}>
                <span>{fee.name}</span>
                <span>{formatMoney(fee.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {extraction.customColumns.length > 0 && (
          <div style={{ fontSize: 11, color: MUTED }}>
            Custom columns: {extraction.customColumns.map(c => c.name).join(', ')}
          </div>
        )}

        {extraction.notes.length > 0 && (
          <div style={{ borderTop: `1px solid ${BORDER_SOFT}`, paddingTop: 6 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
              Anything else
            </div>
            {extraction.notes.map((n, i) => (
              <div key={i} style={{ fontSize: 11.5, color: GRAPHITE }}>· {n}</div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderTop: `1px solid ${BORDER_SOFT}` }}>
        {applied ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: GREEN, fontWeight: 500 }}>
            <Check size={13} /> Applied to plan
          </div>
        ) : (
          <>
            <button
              onClick={onApply}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 99, border: 'none',
                background: INK, color: CARD_BG, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', fontFamily: sansFont,
              }}
            >
              <Check size={12} /> Looks good, apply
            </button>
            <button
              onClick={onDismiss}
              style={{
                padding: '5px 12px', borderRadius: 99, border: `1px solid ${BORDER}`,
                background: CARD_BG, color: GRAPHITE, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', fontFamily: sansFont,
              }}
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}
