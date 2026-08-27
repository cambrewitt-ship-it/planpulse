'use client';

import { Eye, EyeOff } from 'lucide-react';
import { COLOR, cardStyle } from './tokens';

export interface HideableCardProps {
  editable: boolean;
  hidden: boolean;
  onToggle: () => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/** Wraps one card within a section so it can be hidden from the client independently of the section. */
export function HideableCard({ editable, hidden, onToggle, style, children }: HideableCardProps) {
  if (!editable && hidden) return null;
  return (
    <div
      style={{
        ...cardStyle, padding: 20, position: 'relative', ...style,
        ...(hidden ? { outline: `2px dashed ${COLOR.hiddenOutline}`, outlineOffset: 4, opacity: 0.55 } : {}),
      }}
    >
      {editable && (
        <button
          onClick={onToggle}
          aria-label={hidden ? 'Show card to client' : 'Hide card from client'}
          title={hidden ? 'Hidden from client — click to show' : 'Hide this card from the client'}
          style={{
            position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', padding: 4,
            cursor: 'pointer', color: hidden ? COLOR.accent : COLOR.muted, display: 'inline-flex',
          }}
        >
          {hidden ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
        </button>
      )}
      {hidden && editable && (
        <div style={{ fontSize: 10.5, color: COLOR.accent, fontWeight: 600, marginBottom: 8 }}>HIDDEN FROM CLIENT VIEW</div>
      )}
      {children}
    </div>
  );
}
