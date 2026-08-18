import { Loader2 } from 'lucide-react';

// Marks the boundary between the internal summary and the client-facing update
// in an AI-generated overview. Kept in sync with the backend prompt in ai-agent/route.ts.
export const CLIENT_FACING_DELIMITER = '===CLIENT-FACING===';

export function splitOverview(content: string): { internal: string; client: string } | null {
  const parts = content.split(CLIENT_FACING_DELIMITER);
  if (parts.length < 2) return null;
  return { internal: parts[0].trim(), client: parts.slice(1).join(CLIENT_FACING_DELIMITER).trim() };
}

export const TOOL_LABELS: Record<string, string> = {
  get_client_intelligence: 'Reading client intel…',
  get_channel_performance: 'Checking channel performance…',
  get_action_points: 'Loading action points…',
  complete_action_point: 'Completing action point…',
  update_media_plan_budget: 'Updating budget…',
  update_manual_spend: 'Updating actual spend…',
  toggle_ooh_checklist: 'Updating OOH checklist…',
  get_daily_briefing: 'Loading daily briefing…',
  get_channel_library: 'Reading channel library…',
  get_agency_playbooks: 'Reading agency playbooks…',
  create_action_point: 'Creating action point…',
  create_client: 'Creating client…',
  set_media_plan_channels: 'Updating media plan…',
  generate_invoice: 'Generating invoice…',
  generate_report: 'Generating report…',
  get_live_meta_campaigns: 'Checking live Meta campaigns…',
};

// Apple × Moleskine tokens — kept local so this renderer stays self-contained.
const RED = 'oklch(42% 0.16 25)';
const INK = '#1C1917';
const GRAPHITE = '#5C5450';
const BORDER_SOFT = 'oklch(90% 0.01 75)';
const serifFont = "'Source Serif 4', Georgia, serif";
const sansFont = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
const monoFont = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function OverviewSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Loader2 size={12} style={{ color: '#9C8F84', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#9C8F84', fontFamily: sansFont }}>Generating overview…</span>
      </div>
      {[75, 55, 68, 42].map((w, i) => (
        <div key={i} style={{
          height: 9, width: `${w}%`, borderRadius: 4,
          background: 'linear-gradient(90deg, #EDE9E3 25%, #F5F3F0 50%, #EDE9E3 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
        }} />
      ))}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>
    </div>
  );
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  let sectionMode: 'default' | 'attention' = 'default';
  let listCounter = 0;
  let noteMode = false;

  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.65, color: INK, fontFamily: sansFont }}>
      {lines.map((line, i) => {
        if (line === '') {
          noteMode = false;
          return <div key={i} style={{ height: 5 }} />;
        }

        if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
          const level = line.startsWith('### ') ? 3 : line.startsWith('## ') ? 2 : 1;
          const label = line.slice(level + 1);
          noteMode = false;

          if (/needs attention/i.test(label)) {
            sectionMode = 'attention';
            listCounter = 0;
            return (
              <div key={i} style={{
                marginTop: i > 0 ? 14 : 0, marginBottom: 6, paddingTop: 8,
                borderTop: `2px solid ${RED}`,
                fontFamily: serifFont, fontWeight: 600, fontSize: 13.5, color: INK,
              }}>
                {label}
              </div>
            );
          }
          sectionMode = 'default';
          return (
            <div key={i} style={{
              fontFamily: serifFont, fontWeight: 700,
              fontSize: level === 1 ? 14.5 : level === 2 ? 13.5 : 12,
              color: INK,
              marginTop: i > 0 ? (level === 3 ? 10 : 12) : 0,
              marginBottom: level === 3 ? 2 : 4,
            }}>
              {label}
            </div>
          );
        }

        // Blockquotes render as quoted/summary text — italic serif.
        if (line.startsWith('> ')) {
          noteMode = false;
          return (
            <div key={i} style={{
              fontFamily: serifFont, fontStyle: 'italic', color: GRAPHITE, fontSize: 12.5,
              marginTop: 4, paddingLeft: 10, borderLeft: `2px solid ${BORDER_SOFT}`,
            }}>
              {renderInline(line.slice(2))}
            </div>
          );
        }

        // "Recommended next step" is called out as a marginal note, not an alert box.
        const stepMatch = /^\*{0,2}recommended next steps?\*{0,2}:?\s*(.*)$/i.exec(
          line.replace(/^[-•]\s+/, '').trim()
        );
        if (stepMatch) {
          noteMode = true;
          const rest = stepMatch[1]?.trim();
          return (
            <div key={i} style={{ marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${RED}` }}>
              <div style={{
                fontFamily: sansFont, fontWeight: 600, fontSize: 10, color: RED,
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: rest ? 2 : 0,
              }}>
                Recommended next step
              </div>
              {rest && (
                <div style={{ fontFamily: serifFont, fontStyle: 'italic', fontSize: 12.5, color: GRAPHITE }}>
                  {renderInline(rest)}
                </div>
              )}
            </div>
          );
        }

        if (line.startsWith('- ') || line.startsWith('• ')) {
          noteMode = false;
          const content = line.slice(2);
          if (sectionMode === 'attention') {
            listCounter += 1;
            return (
              <div key={i} style={{ display: 'flex', gap: 8, marginTop: 5, alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0, width: 16, height: 16, borderRadius: '50%', marginTop: 1,
                  border: `1.5px solid ${RED}`, color: RED, fontFamily: monoFont,
                  fontSize: 9.5, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {listCounter}
                </span>
                <span>{renderInline(content)}</span>
              </div>
            );
          }
          return (
            <div key={i} style={{ display: 'flex', gap: 7, marginTop: 3, paddingLeft: 2 }}>
              <span style={{ color: '#9C8F84', flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{renderInline(content)}</span>
            </div>
          );
        }

        if (noteMode) {
          return (
            <div key={i} style={{
              paddingLeft: 12, borderLeft: `2px solid ${RED}`, marginTop: 2,
              fontFamily: serifFont, fontStyle: 'italic', fontSize: 12.5, color: GRAPHITE,
            }}>
              {renderInline(line)}
            </div>
          );
        }

        return <div key={i} style={{ marginTop: 1 }}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

export function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} style={{ fontWeight: 600 }}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}
