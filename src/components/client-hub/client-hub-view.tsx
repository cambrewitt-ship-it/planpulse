'use client';

import { useEffect, useState } from 'react';
import type { ClientHubData } from '@/lib/client-hub/get-hub-data';
import { COLOR, FONT_HEAD, FONT_BODY, SECTION_META, fmtDate, sectionTitleStyle } from './tokens';
import { MetricsSnapshot, PerformanceCharts, Pacing, Goals, Brief, Notes, Documents, SpendTable } from './client-hub-sections';
import { ShareModal } from './share-modal';
import { TimeframeSelector, ConversionSelector, type DateRange } from './client-hub-controls';

export interface ClientHubShareLink {
  token: string;
  is_enabled: boolean;
}

export interface ClientHubViewProps {
  data: ClientHubData;
  sections: Record<string, boolean>;
  editable: boolean;
  onToggleSection?: (key: string, visible: boolean) => void;
  shareLink?: ClientHubShareLink | null;
  onEnsureShareLink?: () => void;
  onToggleShareEnabled?: (enabled: boolean) => void;
  shareOrigin?: string;
  onPeriodChange?: (range: DateRange | null) => void;
  onConversionChange?: (actionType: string | null, label: string) => void;
}

export function ClientHubView({
  data, sections, editable, onToggleSection,
  shareLink, onEnsureShareLink, onToggleShareEnabled, shareOrigin,
  onPeriodChange, onConversionChange,
}: ClientHubViewProps) {
  const [localEditMode, setLocalEditMode] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const editMode = editable && localEditMode;

  useEffect(() => {
    if (shareOpen && editable && !shareLink && onEnsureShareLink) onEnsureShareLink();
  }, [shareOpen, editable, shareLink, onEnsureShareLink]);

  const shareUrl = shareLink && shareOrigin ? `${shareOrigin}/hub/${shareLink.token}` : null;

  const show = (key: string) => editMode || sections[key];
  const isHidden = (key: string) => editMode && !sections[key];

  const sectionOutline = (key: string): React.CSSProperties =>
    isHidden(key) ? { outline: `2px dashed ${COLOR.hiddenOutline}`, outlineOffset: 8, opacity: 0.55 } : {};

  const TOPBAR_HEIGHT = 64;

  return (
    <div style={{ fontFamily: FONT_BODY, background: COLOR.bg, color: COLOR.ink, minHeight: '100vh' }}>

      <div style={{
        height: TOPBAR_HEIGHT, position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10,
        background: COLOR.sidebar, color: COLOR.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 24px', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {data.client.logo_url ? (
            <img src={data.client.logo_url} alt={`${data.client.name} logo`} style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: COLOR.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD, fontSize: 15, color: COLOR.bg, flexShrink: 0 }}>
              {data.client.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.2 }}>{data.client.name}</div>
        </div>

        {data.agency?.logo_url ? (
          <img src={data.agency.logo_url} alt={data.agency.name ? `${data.agency.name} logo` : 'Agency logo'} style={{ height: 30, maxWidth: 140, objectFit: 'contain', flexShrink: 0 }} />
        ) : data.agency?.name ? (
          <div style={{ fontFamily: FONT_HEAD, fontSize: 16, color: COLOR.bg, opacity: 0.85 }}>{data.agency.name}</div>
        ) : null}
      </div>

      <div style={{ display: 'flex', minHeight: '100vh', background: COLOR.bg }}>

        <div style={{
          width: 260, flexShrink: 0, background: COLOR.sidebar, color: COLOR.bg, position: 'fixed',
          top: TOPBAR_HEIGHT, left: 0, bottom: 0, overflowY: 'auto', padding: '24px 20px 24px',
          display: 'flex', flexDirection: 'column', gap: 26, boxSizing: 'border-box',
        }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {SECTION_META.map(item => {
              const visible = sections[item.key];
              return (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 8px', borderRadius: 4 }}>
                  <a href={`#section-${item.key}`} style={{ color: COLOR.sidebarText, textDecoration: 'none', fontSize: 13.5 }}>{item.label}</a>
                  {editMode && (
                    <button
                      onClick={() => onToggleSection?.(item.key, !visible)}
                      aria-label="Toggle section visibility"
                      style={{ width: 32, height: 18, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative', padding: 0, flexShrink: 0, background: visible ? COLOR.accent : '#4A443C' }}
                    >
                      <span style={{ position: 'absolute', top: 2, left: visible ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: COLOR.bg, transition: 'left 0.15s', display: 'block' }} />
                    </button>
                  )}
                </div>
              );
            })}
          </nav>

          {editable && (
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => setLocalEditMode(v => !v)}
                style={{ background: COLOR.sidebarPanel, color: COLOR.sidebarText, border: `1px solid ${COLOR.sidebarBorder}`, borderRadius: 4, padding: '10px 12px', fontSize: 13, fontFamily: FONT_BODY, cursor: 'pointer', textAlign: 'left' }}
              >
                {editMode ? 'Preview as client' : 'Back to edit view'}
              </button>
              <button
                onClick={() => setShareOpen(true)}
                style={{ background: COLOR.accent, color: COLOR.bg, border: 'none', borderRadius: 4, padding: '11px 12px', fontSize: 13.5, fontWeight: 600, fontFamily: FONT_BODY, cursor: 'pointer', textAlign: 'left' }}
              >
                Share with client →
              </button>
            </div>
          )}
        </div>

        <div style={{ marginLeft: 260, marginTop: TOPBAR_HEIGHT, flex: 1, padding: '40px 48px 90px', maxWidth: 1180, boxSizing: 'border-box' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 38, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: COLOR.muted, marginBottom: 6 }}>Client Hub &middot; {data.client.name}</div>
              <h1 style={{ fontFamily: FONT_HEAD, fontSize: 38, margin: 0, fontWeight: 400 }}>Performance overview</h1>
              <div style={{ fontSize: 14, color: COLOR.muted, marginTop: 7, marginBottom: 10 }}>
                {fmtDate(data.period.start)} &ndash; {fmtDate(data.period.end)}
              </div>
              {onPeriodChange && <TimeframeSelector onChange={onPeriodChange} />}
            </div>
            {data.pacing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: COLOR.divider, borderRadius: 100 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: COLOR.goodBright, display: 'inline-block' }} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{data.pacing.statusLabel}</span>
              </div>
            )}
          </div>

          {show('snapshot') && (
            <div id="section-snapshot" style={{ marginBottom: 44, ...sectionOutline('snapshot') }}>
              {isHidden('snapshot') && <HiddenBadge />}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Overview</h2>
                {editMode && onConversionChange && (
                  <ConversionSelector
                    actionType={data.conversion.actionType}
                    label={data.conversion.label}
                    available={data.conversion.available}
                    onChange={onConversionChange}
                  />
                )}
              </div>
              <MetricsSnapshot metrics={data.metrics} />
            </div>
          )}

          {show('charts') && (
            <div id="section-charts" style={{ marginBottom: 44, ...sectionOutline('charts') }}>
              {isHidden('charts') && <HiddenBadge />}
              <PerformanceCharts monthlyTrend={data.monthlyTrend} channelActuals={data.channelActuals} />
            </div>
          )}

          {show('pacing') && data.pacing && (
            <div id="section-pacing" style={{ marginBottom: 44, ...sectionOutline('pacing') }}>
              {isHidden('pacing') && <HiddenBadge />}
              <Pacing pacing={data.pacing} />
            </div>
          )}

          {show('goals') && data.goals.length > 0 && (
            <div id="section-goals" style={{ marginBottom: 44, ...sectionOutline('goals') }}>
              {isHidden('goals') && <HiddenBadge />}
              <Goals goals={data.goals} />
            </div>
          )}

          {show('brief') && data.brief && (
            <div id="section-brief" style={{ marginBottom: 44, ...sectionOutline('brief') }}>
              {isHidden('brief') && <HiddenBadge />}
              <Brief brief={data.brief} />
            </div>
          )}

          {show('notes') && (
            <div id="section-notes" style={{ marginBottom: 44, ...sectionOutline('notes') }}>
              {isHidden('notes') && <HiddenBadge />}
              <Notes notes={data.notes} />
            </div>
          )}

          {show('documents') && data.documents.length > 0 && (
            <div id="section-documents" style={{ marginBottom: 44, ...sectionOutline('documents') }}>
              {isHidden('documents') && <HiddenBadge />}
              <Documents documents={data.documents} />
            </div>
          )}

          {show('spend') && data.spendRows.length > 0 && (
            <div id="section-spend" style={{ ...sectionOutline('spend') }}>
              {isHidden('spend') && <HiddenBadge />}
              <SpendTable rows={data.spendRows} />
            </div>
          )}

        </div>
      </div>

      {shareOpen && editable && (
        <ShareModal
          shareUrl={shareUrl}
          shareEnabled={shareLink?.is_enabled ?? false}
          onClose={() => setShareOpen(false)}
          onToggleEnabled={() => onToggleShareEnabled?.(!(shareLink?.is_enabled ?? false))}
        />
      )}
    </div>
  );
}

function HiddenBadge() {
  return <div style={{ fontSize: 11, color: COLOR.accent, fontWeight: 600, marginBottom: 8 }}>HIDDEN FROM CLIENT VIEW</div>;
}
