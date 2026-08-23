'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ClientHubData } from '@/lib/client-hub/get-hub-data';
import type { SectionMetaItem } from '@/lib/client-hub/section-meta';
import { COLOR, FONT_HEAD, FONT_BODY, SECTION_META, SECTION_KEYS, fmtDate, sectionTitleStyle } from './tokens';
import { MetricsSnapshot, PerformanceCharts, Pacing, Goals, Brief, Notes, Documents, SpendTable } from './client-hub-sections';
import { ShareModal } from './share-modal';
import { TimeframeSelector, ConversionSelector, RefreshDataButton, type DateRange } from './client-hub-controls';
import type { ConversionPlatform } from '@/lib/client-hub/get-hub-data';
import { TrendBuilderSection } from './trend-builder-section';
import { CreativesSection } from './creatives-section';
import { DemographicsSection } from './demographics-section';
import { FunnelSection } from './funnel-section';
import { CostPerSection } from './cost-per-section';
import { CpaTrendSection } from './cpa-trend-section';

export interface ClientHubShareLink {
  token: string;
  is_enabled: boolean;
}

export interface ClientHubViewProps {
  data: ClientHubData;
  sections: Record<string, boolean>;
  sectionOrder?: string[];
  editable: boolean;
  onToggleSection?: (key: string, visible: boolean) => void;
  onReorderSections?: (order: string[]) => void;
  shareLink?: ClientHubShareLink | null;
  onEnsureShareLink?: () => void;
  onToggleShareEnabled?: (enabled: boolean) => void;
  shareOrigin?: string;
  onPeriodChange?: (range: DateRange | null) => void;
  onConversionChange?: (platform: ConversionPlatform, actionType: string | null, label: string) => void;
  onRefreshData?: () => void;
  isRefreshingData?: boolean;
  onClientNameChange?: (name: string) => void;
  /** Set on the public token-gated view so section data fetches go through the token-scoped routes. */
  publicToken?: string;
}

function SortableSectionRow({
  item, visible, draggable, onToggle,
}: { item: SectionMetaItem; visible: boolean; draggable: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key, disabled: !draggable });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    padding: '9px 8px', borderRadius: 4,
    background: isDragging ? COLOR.sidebarPanel : 'transparent',
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {draggable && (
          <button
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder section"
            style={{ background: 'transparent', border: 'none', padding: 0, display: 'flex', flexShrink: 0, cursor: 'grab', color: COLOR.sidebarMuted, touchAction: 'none' }}
          >
            <GripVertical size={14} />
          </button>
        )}
        <a href={`#section-${item.key}`} style={{ color: COLOR.sidebarText, textDecoration: 'none', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</a>
      </div>
      {draggable && (
        <button
          onClick={onToggle}
          aria-label="Toggle section visibility"
          style={{ width: 32, height: 18, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative', padding: 0, flexShrink: 0, background: visible ? COLOR.accent : '#4A443C' }}
        >
          <span style={{ position: 'absolute', top: 2, left: visible ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: COLOR.bg, transition: 'left 0.15s', display: 'block' }} />
        </button>
      )}
    </div>
  );
}

export function ClientHubView({
  data, sections, sectionOrder, editable, onToggleSection, onReorderSections,
  shareLink, onEnsureShareLink, onToggleShareEnabled, shareOrigin,
  onPeriodChange, onConversionChange, onRefreshData, isRefreshingData, onClientNameChange, publicToken,
}: ClientHubViewProps) {
  const [localEditMode, setLocalEditMode] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const editMode = editable && localEditMode;

  const [order, setOrder] = useState<string[]>(sectionOrder ?? SECTION_KEYS);
  useEffect(() => { setOrder(sectionOrder ?? SECTION_KEYS); }, [sectionOrder]);
  const sectionByKey = new Map(SECTION_META.map(item => [item.key, item]));

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const oldIndex = prev.indexOf(active.id as string);
      const newIndex = prev.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      onReorderSections?.(next);
      return next;
    });
  };

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(data.client.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editingName) setNameInput(data.client.name); }, [data.client.name, editingName]);
  useEffect(() => { if (editingName) nameInputRef.current?.focus(); }, [editingName]);

  const commitNameEdit = () => {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === data.client.name) {
      setNameInput(data.client.name);
      return;
    }
    onClientNameChange?.(trimmed);
  };

  const [localAgencyLogoUrl, setLocalAgencyLogoUrl] = useState<string | null>(null);
  const [agencyLogoUploading, setAgencyLogoUploading] = useState(false);
  const agencyLogoInputRef = useRef<HTMLInputElement>(null);
  const agencyLogoUrl = data.agency?.logo_url ?? localAgencyLogoUrl;

  const handleAgencyLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAgencyLogoUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/settings/agency/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, contentType: file.type || 'image/png', ext }),
      });
      if (res.ok) {
        const { url } = await res.json();
        setLocalAgencyLogoUrl(url);
      }
    } catch {
      /* silent — user can retry */
    } finally {
      setAgencyLogoUploading(false);
      if (agencyLogoInputRef.current) agencyLogoInputRef.current.value = '';
    }
  };

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
        background: COLOR.bg, color: COLOR.ink, display: 'flex', alignItems: 'center',
        padding: '0 24px', boxSizing: 'border-box',
        borderBottom: `1px solid ${COLOR.cardBorder}`,
      }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', width: 26, height: 26, borderRadius: 7, border: `2px solid ${COLOR.ink}`, overflow: 'hidden', flexShrink: 0 }}>
            <img src="/favicon.ico" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </span>
          <span style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 700, color: COLOR.ink }}>PlanPulse</span>
        </a>
      </div>

      <div style={{ display: 'flex', minHeight: '100vh', background: COLOR.bg }}>

        <div style={{
          width: 260, flexShrink: 0, background: COLOR.sidebar, color: COLOR.bg, position: 'fixed',
          top: TOPBAR_HEIGHT, left: 0, bottom: 0, overflowY: 'auto', padding: '24px 20px 24px',
          display: 'flex', flexDirection: 'column', gap: 26, boxSizing: 'border-box',
        }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                {order.map(key => {
                  const item = sectionByKey.get(key);
                  if (!item) return null;
                  return (
                    <SortableSectionRow
                      key={key}
                      item={item}
                      visible={sections[key]}
                      draggable={editMode}
                      onToggle={() => onToggleSection?.(key, !sections[key])}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                {data.client.logo_url ? (
                  <img src={data.client.logo_url} alt={`${data.client.name} logo`} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: COLOR.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD, fontSize: 20, color: COLOR.bg, flexShrink: 0 }}>
                    {data.client.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {editMode && editingName ? (
                  <input
                    ref={nameInputRef}
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onBlur={commitNameEdit}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitNameEdit(); }
                      if (e.key === 'Escape') { setNameInput(data.client.name); setEditingName(false); }
                    }}
                    style={{
                      fontWeight: 600, fontSize: 22, color: COLOR.ink, fontFamily: FONT_BODY,
                      background: 'transparent', border: `1px solid ${COLOR.cardBorder}`, borderRadius: 4,
                      padding: '2px 6px', outline: 'none', minWidth: 0,
                    }}
                  />
                ) : (
                  <div
                    onClick={editMode ? () => setEditingName(true) : undefined}
                    title={editMode ? 'Click to rename client' : undefined}
                    style={{
                      fontWeight: 600, fontSize: 22, color: COLOR.ink,
                      cursor: editMode ? 'pointer' : 'default',
                      borderBottom: editMode ? `1px dashed ${COLOR.cardBorder}` : 'none',
                    }}
                  >
                    {data.client.name}
                  </div>
                )}
              </div>
              <h1 style={{ fontFamily: FONT_HEAD, fontSize: 38, margin: 0, fontWeight: 400 }}>Performance overview</h1>
              <div style={{ fontSize: 14, color: COLOR.muted, marginTop: 7, marginBottom: 10 }}>
                {fmtDate(data.period.start)} &ndash; {fmtDate(data.period.end)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                {onPeriodChange && <TimeframeSelector onChange={onPeriodChange} />}
                {editable && onRefreshData && (
                  <RefreshDataButton isRefreshing={!!isRefreshingData} onClick={onRefreshData} />
                )}
              </div>
            </div>

            {agencyLogoUrl ? (
              <img src={agencyLogoUrl} alt={data.agency?.name ? `${data.agency.name} logo` : 'Agency logo'} style={{ height: 48, maxWidth: 180, objectFit: 'contain', flexShrink: 0 }} />
            ) : editable ? (
              <>
                <input
                  ref={agencyLogoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAgencyLogoUpload}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => agencyLogoInputRef.current?.click()}
                  disabled={agencyLogoUploading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 6px', height: 48,
                    background: 'transparent', border: `1px dashed ${COLOR.cardBorder}`, borderRadius: 100,
                    cursor: agencyLogoUploading ? 'default' : 'pointer', fontFamily: FONT_BODY, boxSizing: 'border-box', flexShrink: 0,
                  }}
                >
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: COLOR.divider, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: COLOR.muted, flexShrink: 0 }}>+</span>
                  <span style={{ fontSize: 12.5, color: COLOR.muted }}>
                    {agencyLogoUploading ? 'Uploading…' : 'Add agency logo'}
                  </span>
                </button>
              </>
            ) : null}
          </div>

          {order.map(key => {
            switch (key) {
              case 'snapshot':
                return !show('snapshot') ? null : (
                  <div key={key} id="section-snapshot" style={{ marginBottom: 44, ...sectionOutline('snapshot') }}>
                    {isHidden('snapshot') && <HiddenBadge />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                      <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Overview</h2>
                      {editMode && onConversionChange && (
                        <ConversionSelector
                          clientId={data.client.id}
                          platform={data.conversion.platform}
                          actionType={data.conversion.actionType}
                          label={data.conversion.label}
                          onChange={onConversionChange}
                        />
                      )}
                    </div>
                    <MetricsSnapshot metrics={data.metrics} />
                  </div>
                );

              case 'cpaTrend':
                return !show('cpaTrend') ? null : (
                  <div key={key} id="section-cpaTrend" style={{ marginBottom: 44, ...sectionOutline('cpaTrend') }}>
                    {isHidden('cpaTrend') && <HiddenBadge />}
                    <CpaTrendSection clientId={data.client.id} token={publicToken} editable={editMode} />
                  </div>
                );

              case 'charts':
                return !show('charts') ? null : (
                  <div key={key} id="section-charts" style={{ marginBottom: 44, ...sectionOutline('charts') }}>
                    {isHidden('charts') && <HiddenBadge />}
                    <PerformanceCharts monthlyTrend={data.monthlyTrend} channelActuals={data.channelActuals} leadsLabel={data.conversion.label} />
                  </div>
                );

              case 'funnels':
                return !show('funnels') ? null : (
                  <div key={key} id="section-funnels" style={{ marginBottom: 44, ...sectionOutline('funnels') }}>
                    {isHidden('funnels') && <HiddenBadge />}
                    <FunnelSection clientId={data.client.id} token={publicToken} editable={editMode} client={data.client} />
                  </div>
                );

              case 'costPerMetric':
                return !show('costPerMetric') ? null : (
                  <div key={key} id="section-costPerMetric" style={{ marginBottom: 44, ...sectionOutline('costPerMetric') }}>
                    {isHidden('costPerMetric') && <HiddenBadge />}
                    <CostPerSection clientId={data.client.id} token={publicToken} editable={editMode} />
                  </div>
                );

              case 'trends':
                return !show('trends') ? null : (
                  <div key={key} id="section-trends" style={{ marginBottom: 44, ...sectionOutline('trends') }}>
                    {isHidden('trends') && <HiddenBadge />}
                    <TrendBuilderSection clientId={data.client.id} token={publicToken} editable={editMode} />
                  </div>
                );

              case 'demographics':
                return !show('demographics') ? null : (
                  <div key={key} id="section-demographics" style={{ marginBottom: 44, ...sectionOutline('demographics') }}>
                    {isHidden('demographics') && <HiddenBadge />}
                    <DemographicsSection clientId={data.client.id} token={publicToken} editable={editMode} />
                  </div>
                );

              case 'pacing':
                return !show('pacing') || !data.pacing ? null : (
                  <div key={key} id="section-pacing" style={{ marginBottom: 44, ...sectionOutline('pacing') }}>
                    {isHidden('pacing') && <HiddenBadge />}
                    <Pacing pacing={data.pacing} />
                  </div>
                );

              case 'goals':
                return !show('goals') || data.goals.length === 0 ? null : (
                  <div key={key} id="section-goals" style={{ marginBottom: 44, ...sectionOutline('goals') }}>
                    {isHidden('goals') && <HiddenBadge />}
                    <Goals goals={data.goals} />
                  </div>
                );

              case 'brief':
                return !show('brief') || !data.brief ? null : (
                  <div key={key} id="section-brief" style={{ marginBottom: 44, ...sectionOutline('brief') }}>
                    {isHidden('brief') && <HiddenBadge />}
                    <Brief brief={data.brief} />
                  </div>
                );

              case 'notes':
                return !show('notes') ? null : (
                  <div key={key} id="section-notes" style={{ marginBottom: 44, ...sectionOutline('notes') }}>
                    {isHidden('notes') && <HiddenBadge />}
                    <Notes notes={data.notes} />
                  </div>
                );

              case 'documents':
                return !show('documents') || data.documents.length === 0 ? null : (
                  <div key={key} id="section-documents" style={{ marginBottom: 44, ...sectionOutline('documents') }}>
                    {isHidden('documents') && <HiddenBadge />}
                    <Documents documents={data.documents} />
                  </div>
                );

              case 'spend':
                return !show('spend') || data.spendRows.length === 0 ? null : (
                  <div key={key} id="section-spend" style={{ marginBottom: 44, ...sectionOutline('spend') }}>
                    {isHidden('spend') && <HiddenBadge />}
                    <SpendTable rows={data.spendRows} />
                  </div>
                );

              case 'creatives':
                return !show('creatives') ? null : (
                  <div key={key} id="section-creatives" style={{ marginBottom: 44, ...sectionOutline('creatives') }}>
                    {isHidden('creatives') && <HiddenBadge />}
                    <CreativesSection clientId={data.client.id} token={publicToken} editable={editMode} />
                  </div>
                );

              default:
                return null;
            }
          })}

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
