'use client';

import { useState, useRef } from 'react';
import { COLOR, FONT_HEAD, FONT_BODY } from './tokens';

export interface ShareModalProps {
  shareUrl: string | null;
  shareEnabled: boolean;
  onClose: () => void;
  onToggleEnabled: () => void;
  loading?: boolean;
}

export function ShareModal({ shareUrl, shareEnabled, onClose, onToggleEnabled, loading }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const copyLink = () => {
    if (!shareUrl) return;
    try { navigator.clipboard.writeText(shareUrl); } catch { /* clipboard unavailable */ }
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, fontFamily: FONT_BODY }}
      onClick={onClose}
    >
      <div style={{ background: COLOR.bg, borderRadius: 8, padding: 32, width: 440, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 22, marginBottom: 6 }}>Share with client</div>
        <div style={{ fontSize: 13.5, color: COLOR.mutedSecondary, marginBottom: 22, lineHeight: 1.5 }}>
          Anyone with this link can view a read-only version of this hub. Sections you&apos;ve hidden from the client view stay hidden.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: COLOR.card, border: `1px solid ${COLOR.cardBorder}`, borderRadius: 6, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Anyone with the link</div>
            <div style={{ fontSize: 12, color: COLOR.muted }}>{shareEnabled ? 'Link is active' : 'Link is disabled'}</div>
          </div>
          <button
            onClick={onToggleEnabled}
            disabled={loading || !shareUrl}
            aria-label="Toggle link"
            style={{ width: 38, height: 21, borderRadius: 11, border: 'none', cursor: loading ? 'wait' : 'pointer', position: 'relative', padding: 0, background: shareEnabled ? COLOR.accent : '#C9BEA9' }}
          >
            <span style={{ position: 'absolute', top: 2, left: shareEnabled ? 19 : 2, width: 17, height: 17, borderRadius: '50%', background: COLOR.card, transition: 'left 0.15s', display: 'block' }} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <div style={{ flex: 1, padding: '11px 14px', background: COLOR.card, border: `1px solid ${COLOR.cardBorder}`, borderRadius: 6, fontSize: 13, color: '#4A443C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {shareUrl ?? 'Generating link…'}
          </div>
          <button
            onClick={copyLink}
            disabled={!shareUrl}
            style={{ background: COLOR.ink, color: COLOR.bg, border: 'none', borderRadius: 6, padding: '0 18px', fontSize: 13, fontWeight: 600, cursor: shareUrl ? 'pointer' : 'default' }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>

        <button onClick={onClose} style={{ width: '100%', background: 'none', border: `1px solid #D9D2C4`, borderRadius: 6, padding: 11, fontSize: 13.5, cursor: 'pointer', color: COLOR.ink }}>
          Done
        </button>
      </div>
    </div>
  );
}
