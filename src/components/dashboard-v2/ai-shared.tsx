import { Loader2 } from 'lucide-react';

export const TOOL_LABELS: Record<string, string> = {
  get_client_intelligence: 'Reading client intel…',
  get_channel_performance: 'Checking channel performance…',
  get_action_points: 'Loading action points…',
  complete_action_point: 'Completing action point…',
  update_media_plan_budget: 'Updating budget…',
  update_manual_spend: 'Updating actual spend…',
  toggle_ooh_checklist: 'Updating OOH checklist…',
  get_daily_briefing: 'Loading daily briefing…',
  get_client_status: 'Checking client status…',
  get_channel_library: 'Reading channel library…',
  get_agency_playbooks: 'Reading agency playbooks…',
  create_action_point: 'Creating action point…',
  create_client: 'Creating client…',
  set_media_plan_channels: 'Updating media plan…',
  generate_invoice: 'Generating invoice…',
  generate_report: 'Generating report…',
  get_live_meta_campaigns: 'Checking live Meta campaigns…',
};

export function OverviewSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Loader2 size={12} style={{ color: '#9C8F84', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#9C8F84', fontFamily: "'Inter', system-ui, sans-serif" }}>Generating overview…</span>
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
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.65, color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <div key={i} style={{ fontWeight: 700, fontSize: 11, color: '#5C5450', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: i > 0 ? 10 : 0, marginBottom: 2 }}>{line.slice(4)}</div>;
        if (line.startsWith('## ')) return <div key={i} style={{ fontWeight: 700, fontSize: 13, color: '#1C1917', marginTop: i > 0 ? 10 : 0, marginBottom: 3 }}>{line.slice(3)}</div>;
        if (line.startsWith('# ')) return <div key={i} style={{ fontWeight: 700, fontSize: 14, color: '#1C1917', marginTop: i > 0 ? 12 : 0, marginBottom: 4 }}>{line.slice(2)}</div>;
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 7, marginTop: 3, paddingLeft: 2 }}>
              <span style={{ color: '#9C8F84', flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (line === '') return <div key={i} style={{ height: 5 }} />;
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
