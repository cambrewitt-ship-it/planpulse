'use client';

import { useState, useRef, useEffect } from 'react';

interface ManualSpendSliderProps {
  planned: number;
  actual: number;
  onChange: (value: number) => void;
  accentColor?: string; // hex, e.g. '#4A7C59'
  flightStart?: Date | string | null;
  flightEnd?: Date | string | null;
}

function fmt(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

export default function ManualSpendSlider({ planned, actual, onChange, accentColor = '#4A6580', flightStart, flightEnd }: ManualSpendSliderProps) {
  // When no planned budget is set, use a sensible default so the slider can still be dragged.
  const max = planned > 0 ? Math.max(planned * 1.25, actual * 1.1) : Math.max(actual * 1.5, 5000);

  // Planned spend progress bar — based on flight elapsed time
  let plannedBarPct = 0;
  let expectedSpend = 0;
  const showPlannedBar = !!(flightStart && flightEnd && planned > 0);
  if (showPlannedBar) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(flightStart!); start.setHours(0, 0, 0, 0);
    const end = new Date(flightEnd!); end.setHours(0, 0, 0, 0);
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const daysElapsed = Math.max(0, Math.min(totalDays, Math.round((today.getTime() - start.getTime()) / 86400000)));
    plannedBarPct = Math.min(100, (daysElapsed / totalDays) * 100);
    expectedSpend = planned * (plannedBarPct / 100);
  }
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const pct = planned > 0 ? Math.round((actual / planned) * 100) : 0;
  const fillPct = Math.min(100, (actual / max) * 100);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commitEdit() {
    const parsed = parseFloat(inputVal.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed) && parsed >= 0) onChange(parsed);
    setEditing(false);
  }

  // Compute $500 tick marks — cap at 80 ticks to avoid excessive DOM nodes
  const tickInterval = max > 40000 ? 1000 : 500;
  const tickCount = Math.min(80, Math.floor(max / tickInterval));
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * tickInterval).filter(v => v <= max);

  // Label interval — show numbers only at major breakpoints
  const labelInterval = max <= 5000 ? 1000 : max <= 20000 ? 5000 : max <= 50000 ? 10000 : 20000;

  function fmtTick(v: number): string {
    if (v === 0) return '$0';
    if (v >= 1000) return `$${v / 1000}k`;
    return `$${v}`;
  }

  return (
    <div style={{
      borderTop: '0.5px solid #E8E4DC',
      padding: '8px 14px 10px',
      background: '#FAFAF8',
    }}>
      {/* Planned spend progress bar */}
      {showPlannedBar && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Planned Spend
            </div>
            <div style={{ fontSize: 10, color: '#8A8578', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              <span style={{ fontWeight: 600 }}>{fmt(expectedSpend)}</span>
              <span style={{ color: '#C5C0B8' }}> of {fmt(planned)}</span>
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: '#E8E4DC', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, height: '100%',
              width: `${plannedBarPct}%`,
              background: accentColor,
              opacity: 0.45,
              borderRadius: 99,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Actual spend row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Label */}
      <div style={{ flexShrink: 0, width: 72 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Actual Spend
        </div>
        {planned > 0 && (
          <div style={{ fontSize: 10, color: pct > 100 ? '#A0442A' : '#8A8578', fontWeight: pct > 100 ? 600 : 400, marginTop: 1 }}>
            {pct}% of plan
          </div>
        )}
      </div>

      {/* Slider track + ticks */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Track area — tall enough for the thumb handle */}
        <div style={{ position: 'relative', height: 20 }}>
          {/* Background track */}
          <div style={{
            height: 6, borderRadius: 99, background: '#E8E4DC',
            position: 'absolute', top: '50%', left: 0, right: 0,
            transform: 'translateY(-50%)', overflow: 'hidden',
          }}>
            {/* Fill */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 0,
              width: `${fillPct}%`,
              background: pct > 100 ? '#A0442A' : accentColor,
              borderRadius: 99,
              transition: 'width 0.2s',
            }} />
            {/* Planned marker */}
            {planned > 0 && (
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${Math.min(100, (planned / max) * 100)}%`,
                width: 2, background: '#C5C0B8',
                transform: 'translateX(-50%)',
              }} title="Planned" />
            )}
          </div>

          {/* Draggable thumb handle */}
          <div style={{
              position: 'absolute',
              top: '50%',
              left: `${fillPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: pct > 100 ? '#A0442A' : accentColor,
              border: '2.5px solid #fff',
              boxShadow: '0 1px 5px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)',
              pointerEvents: 'none',
              zIndex: 1,
              transition: 'left 0.15s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2.5,
            }}>
              <div style={{ width: 6, height: 1, background: 'rgba(255,255,255,0.75)', borderRadius: 1 }} />
              <div style={{ width: 6, height: 1, background: 'rgba(255,255,255,0.75)', borderRadius: 1 }} />
            </div>

          {/* Range input — invisible but interactive */}
          <input
            type="range"
            min={0}
            max={max}
            step={tickInterval}
            value={actual}
            onChange={e => onChange(parseFloat(e.target.value))}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              opacity: 0, cursor: 'ew-resize', margin: 0, zIndex: 2,
            }}
          />
        </div>

        {/* $500 tick marks + labels */}
        <div style={{ position: 'relative', height: 16, marginTop: 2 }}>
          {ticks.map(v => {
            const isMajor = v % labelInterval === 0;
            const isActive = v === actual;
            const pos = (v / max) * 100;
            const tickColor = isActive
              ? (pct > 100 ? '#A0442A' : accentColor)
              : isMajor ? '#C5C0B8' : '#DEDAD4';
            return (
              <div key={v} style={{ position: 'absolute', left: `${pos}%`, top: 0, transform: 'translateX(-50%)' }}>
                {/* Tick line */}
                <div style={{
                  width: isMajor ? 1.5 : 1,
                  height: isMajor ? 5 : 3,
                  background: tickColor,
                  borderRadius: 1,
                  margin: '0 auto',
                }} />
                {/* Label on major ticks */}
                {isMajor && (
                  <div style={{
                    marginTop: 2,
                    fontSize: 9,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? (pct > 100 ? '#A0442A' : accentColor) : '#B5B0A5',
                    whiteSpace: 'nowrap',
                    transform: pos === 0 ? 'translateX(0)' : pos >= 95 ? 'translateX(-100%)' : 'translateX(-50%)',
                    userSelect: 'none',
                    lineHeight: 1,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}>
                    {fmtTick(v)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Value — click to type */}
      <div style={{ flexShrink: 0, minWidth: 64, textAlign: 'right' }}>
        {editing ? (
          <input
            ref={inputRef}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            style={{
              width: 72, fontSize: 13, fontWeight: 600, color: '#1C1917',
              border: '0.5px solid #D5D0C5', borderRadius: 4,
              padding: '2px 5px', textAlign: 'right',
              background: '#fff', outline: 'none', fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
            placeholder="0"
          />
        ) : (
          <button
            onClick={() => { setInputVal(actual > 0 ? String(actual) : ''); setEditing(true); }}
            title="Click to enter amount"
            style={{
              background: 'none', border: 'none', cursor: 'text', padding: '2px 4px',
              fontSize: 13, fontWeight: 600,
              color: actual > 0 ? '#1C1917' : '#C5C0B8',
              fontFamily: "'DM Sans', system-ui, sans-serif",
              borderRadius: 4,
              textDecoration: 'none',
            }}
          >
            {actual > 0 ? fmt(actual) : '+ Add spend'}
          </button>
        )}
        {planned > 0 && (
          <div style={{ fontSize: 10, color: '#B5B0A5', marginTop: 1 }}>of {fmt(planned)}</div>
        )}
      </div>
      </div>{/* end actual spend row */}
    </div>
  );
}
