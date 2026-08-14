'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Plus, Trash2, Check, Clock, AlertCircle, Play, ChevronRight, ExternalLink,
  Bot, ReceiptText, BarChart2, CalendarRange, ListChecks, ClipboardList,
  TrendingUp, FileText, PenLine, Users, Zap, Target,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const AGENT_ICON_COLOR = '#7B1F2C';

const AGENT_ICONS: Record<string, LucideIcon> = {
  ReceiptText,
  BarChart2,
  CalendarRange,
  ListChecks,
  ClipboardList,
  Bot,
  TrendingUp,
  FileText,
  PenLine,
  Users,
  Zap,
  Target,
};

const ICON_LABELS: Record<string, string> = {
  ReceiptText: 'Invoice',
  BarChart2: 'Analytics',
  CalendarRange: 'Calendar',
  ListChecks: 'Tasks',
  ClipboardList: 'Reports',
  Bot: 'Bot',
  TrendingUp: 'Trending',
  FileText: 'Document',
  PenLine: 'Editor',
  Users: 'Clients',
  Zap: 'Automation',
  Target: 'Goals',
};

const EMOJI_ICON_FALLBACK: Record<string, string> = {
  '🧾': 'ReceiptText',
  '📊': 'BarChart2',
  '📅': 'CalendarRange',
  '✅': 'ListChecks',
  '📋': 'ClipboardList',
};

function AgentIcon({ name, size = 20 }: { name?: string | null; size?: number }) {
  const resolved = (name && EMOJI_ICON_FALLBACK[name]) ? EMOJI_ICON_FALLBACK[name] : name;
  const Icon = (resolved && AGENT_ICONS[resolved]) ? AGENT_ICONS[resolved] : Bot;
  return <Icon size={size} style={{ color: AGENT_ICON_COLOR, flexShrink: 0 }} />;
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {Object.keys(AGENT_ICONS).map(name => {
        const Icon = AGENT_ICONS[name];
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            title={ICON_LABELS[name]}
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: selected ? `2px solid ${AGENT_ICON_COLOR}` : '1.5px solid #E0DCD4',
              background: selected ? '#FBF0F2' : '#FDFCF8',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.1s',
            }}
          >
            <Icon size={16} style={{ color: AGENT_ICON_COLOR }} />
          </button>
        );
      })}
    </div>
  );
}
import type { UserAgent, AgentRun, AgentAuditStep, AgentOutputLink } from '@/types/database';
import { TEMPLATE_TOOL_GROUPS, AGENT_TEMPLATE_SEEDS, ALL_TOOL_NAMES } from '@/lib/agent-templates';
import { TOOL_LABELS } from '@/lib/agent-audit';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange(!checked); }}
      style={{
        width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', position: 'relative',
        background: checked ? '#4A6580' : '#D1D5DB', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14,
        borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block',
      }} />
    </button>
  );
}

const TOOL_DESCRIPTIONS: Record<string, string> = {
  get_daily_briefing: 'Full briefing across all clients with health and overdue tasks',
  get_action_points: 'Outstanding action points grouped by client and due date',
  get_client_status: 'Health status and spend variance for all or specific clients',
  get_channel_library: 'Channel specs and best practices from the agency library',
  get_agency_playbooks: 'Internal SOPs, processes, and strategy documents',
  get_channel_performance: 'Per-channel spend pacing, KPIs, and performance metrics',
  get_client_intelligence: 'Client brief, goals, notes, and documents',
  get_live_meta_campaigns: 'Live campaign data directly from the Meta Ads API',
  complete_action_point: 'Mark a task as complete for a specific client',
  create_client: 'Onboard a new client into the platform',
  create_action_point: 'Add a new recurring health check or setup task',
  update_media_plan_budget: 'Adjust a channel budget for a specific month',
  set_media_plan_channels: 'Replace the full media plan from a description',
  generate_invoice: 'Generate an invoice for a client by date range',
  generate_report: 'Generate a performance report for a client',
};

function ToolSelector({ enabled, onChange }: { enabled: string[]; onChange: (tools: string[]) => void }) {
  const toggle = (tool: string) => {
    onChange(enabled.includes(tool) ? enabled.filter(t => t !== tool) : [...enabled, tool]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(Object.entries(TEMPLATE_TOOL_GROUPS) as [string, readonly string[]][]).map(([group, tools]) => (
        <div key={group}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{group}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tools.map(tool => (
              <label key={tool} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '6px 8px', borderRadius: 8, background: enabled.includes(tool) ? '#F0EDE8' : 'transparent', transition: 'background 0.1s' }}>
                <input
                  type="checkbox"
                  checked={enabled.includes(tool)}
                  onChange={() => toggle(tool)}
                  style={{ marginTop: 2, accentColor: '#4A6580', flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: '#1C1917' }}>{TOOL_LABELS[tool] ?? tool}</div>
                  <div style={{ fontSize: 11.5, color: '#8A8578', lineHeight: 1.3, marginTop: 1 }}>{TOOL_DESCRIPTIONS[tool] ?? ''}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RunsTable({ runs }: { runs: AgentRun[] }) {
  if (!runs.length) return (
    <div style={{ fontSize: 12.5, color: '#8A8578', textAlign: 'center', padding: '16px 0' }}>No runs yet</div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {runs.map(run => (
        <div key={run.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid #F0EDE8' }}>
          <div style={{ flexShrink: 0 }}>
            {run.status === 'completed' ? <Check size={12} style={{ color: '#4A7C59' }} /> : run.status === 'error' ? <AlertCircle size={12} style={{ color: '#CC4B37' }} /> : <Clock size={12} style={{ color: '#8A8578' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.user_message}</div>
            <div style={{ fontSize: 11, color: '#8A8578' }}>
              {new Date(run.started_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {' · '}{run.audit_trail?.length ?? 0} steps
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RunAgentDialog({ agent }: { agent: UserAgent }) {
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState('');
  const [clientName, setClientName] = useState('');
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [auditSteps, setAuditSteps] = useState<AgentAuditStep[]>([]);
  const [outputLinks, setOutputLinks] = useState<AgentOutputLink[]>([]);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [done, setDone] = useState(false);
  const font: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

  useEffect(() => {
    if (open && clients.length === 0) {
      fetch('/api/agency/clients').then(r => r.ok ? r.json() : null).then(data => {
        const list = Array.isArray(data) ? data : (data?.clients ?? []);
        setClients(list.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }).catch(() => {});
    }
  }, [open, clients.length]);

  const reset = () => {
    setTask('');
    setClientName('');
    setOutput('');
    setAuditSteps([]);
    setOutputLinks([]);
    setDone(false);
    setRunning(false);
    setAuditExpanded(false);
  };

  const run = async () => {
    const prompt = clientName.trim()
      ? `${task.trim()} — client: ${clientName.trim()}`
      : task.trim();
    if (!prompt) return;
    setRunning(true);
    setOutput('');
    setAuditSteps([]);
    setOutputLinks([]);
    setDone(false);

    try {
      const res = await fetch('/api/agency/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          agentId: agent.id,
        }),
      });
      if (!res.ok) throw new Error('Request failed');
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(part.slice(6));
            if (event.type === 'text') setOutput(prev => prev + event.text);
            else if (event.type === 'audit_step') setAuditSteps(prev => [...prev, event.step]);
            else if (event.type === 'output_links') setOutputLinks(event.links);
            else if (event.type === 'done') setDone(true);
          } catch { /* ignore */ }
        }
      }
    } catch {
      setOutput('Something went wrong. Please try again.');
    } finally {
      setRunning(false);
      setDone(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" style={{ display: 'flex', alignItems: 'center', gap: 6, borderColor: '#4A6580', color: '#4A6580' }}>
          <Play size={12} />
          Run Agent
        </Button>
      </DialogTrigger>
      <DialogContent style={{ maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', ...font }}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AgentIcon name={agent.icon} size={18} />
            <span>Run {agent.name}</span>
          </DialogTitle>
        </DialogHeader>

        {!running && !done ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <div>
              <Label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>Client (optional)</Label>
              {clients.length > 0 ? (
                <select
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E0DCD4', fontSize: 13, background: '#FDFCF8', color: '#1C1917', ...font }}
                >
                  <option value="">All clients / not client-specific</option>
                  {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              ) : (
                <Input
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="e.g. Acme Corp (or leave blank for all clients)"
                />
              )}
            </div>
            <div>
              <Label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>Task / Instruction *</Label>
              <Textarea
                value={task}
                onChange={e => setTask(e.target.value)}
                placeholder={getDefaultPrompt(agent)}
                rows={4}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }}
              />
              <div style={{ fontSize: 11, color: '#8A8578', marginTop: 4 }}>Cmd/Ctrl+Enter to run</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={run} disabled={!task.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Play size={13} />
                Run
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {/* Audit trail */}
            {auditSteps.length > 0 && (
              <div style={{ marginBottom: 12, border: '0.5px solid #E0DCD4', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => setAuditExpanded(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 12px', background: '#F7F5F2', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#5C564F' }}
                >
                  {auditExpanded ? <ChevronRight size={12} style={{ transform: 'rotate(90deg)' }} /> : <ChevronRight size={12} />}
                  {auditSteps.length} step{auditSteps.length !== 1 ? 's' : ''}
                  {running && <span style={{ marginLeft: 4, color: '#8A8578', fontWeight: 400 }}>· running…</span>}
                </button>
                {auditExpanded && (
                  <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {auditSteps.map((step, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: step.is_write ? '#CC785C' : '#A0998F', flexShrink: 0, marginTop: 4 }} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#1C1917' }}>{step.label}</div>
                          <div style={{ fontSize: 11.5, color: '#8A8578' }}>{step.summary}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Streaming output */}
            {(output || running) && (
              <div style={{ background: '#F7F5F2', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: '#3C3732', minHeight: 60, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {output || (running ? <span style={{ color: '#A0998F' }}>Thinking…</span> : null)}
                {running && <span style={{ display: 'inline-block', width: 2, height: '0.85em', background: '#8A8578', marginLeft: 1, verticalAlign: 'text-bottom', animation: 'briefingCursor 0.7s step-end infinite' }} />}
              </div>
            )}

            {/* Output links */}
            {outputLinks.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {outputLinks.map((link, i) => (
                  <a
                    key={i}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 20, border: '0.5px solid #D5D0C5', background: '#F7F5F2', color: '#4A6580', fontSize: 12.5, fontWeight: 500, textDecoration: 'none' }}
                  >
                    <ExternalLink size={11} />
                    {link.label}
                  </a>
                ))}
              </div>
            )}

            {/* Done actions */}
            {done && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                <Button variant="outline" onClick={reset}>Run again</Button>
                <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getDefaultPrompt(agent: UserAgent): string {
  switch (agent.template_slug) {
    case 'invoice_generator': return 'Generate an invoice for [client name] for last month';
    case 'performance_analyst': return 'Analyse channel performance for [client name] this month';
    case 'media_plan_editor': return 'Review and update the media plan for [client name]';
    case 'action_points_manager': return 'Show me all overdue action points and mark any completed ones as done';
    case 'report_creator': return 'Create a performance report for [client name] this month';
    default: return `Run ${agent.name} on the specified client`;
  }
}

function NewAgentDialog({ onCreated }: { onCreated: (agent: UserAgent) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'template' | 'form'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [icon, setIcon] = useState('Bot');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep('template');
    setSelectedTemplate(null);
    setName('');
    setDescription('');
    setSystemPrompt('');
    setEnabledTools([]);
    setIcon('Bot');
  };

  const selectTemplate = (idx: number | null) => {
    setSelectedTemplate(idx);
    if (idx === null) {
      setName('');
      setDescription('');
      setSystemPrompt('');
      setEnabledTools([]);
      setIcon('Bot');
    } else {
      const t = AGENT_TEMPLATE_SEEDS[idx];
      setName(t.name);
      setDescription(t.description ?? '');
      setSystemPrompt(t.system_prompt);
      setEnabledTools([...(t.enabled_tools ?? [])]);
      setIcon(t.icon ?? 'Bot');
    }
    setStep('form');
  };

  const save = async () => {
    if (!name.trim() || !systemPrompt.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, system_prompt: systemPrompt.trim(), enabled_tools: enabledTools, icon }),
      });
      if (!res.ok) throw new Error('Failed');
      const { agent } = await res.json();
      onCreated(agent);
      setOpen(false);
      reset();
    } catch {
      alert('Failed to create agent.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} />
          New Agent
        </Button>
      </DialogTrigger>
      <DialogContent style={{ maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>{step === 'template' ? 'Create Agent' : 'Configure Agent'}</DialogTitle>
        </DialogHeader>

        {step === 'template' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <p style={{ fontSize: 13, color: '#5C564F', marginBottom: 4 }}>Start from a template or build from scratch.</p>
            {AGENT_TEMPLATE_SEEDS.map((t, i) => (
              <button
                key={i}
                onClick={() => selectTemplate(i)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, border: '0.5px solid #E0DCD4', background: '#FDFCF8', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F0EDE8'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#FDFCF8'; }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FBF0F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AgentIcon name={t.icon} size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1917' }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: '#8A8578', marginTop: 2 }}>{t.description}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                    {(t.enabled_tools ?? []).map(tool => (
                      <span key={tool} style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 8, background: '#F0EDE8', color: '#5C564F' }}>{TOOL_LABELS[tool] ?? tool}</span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
            <button
              onClick={() => selectTemplate(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '0.5px dashed #D5D0C5', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#5C564F', transition: 'background 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F7F5F2'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Plus size={16} style={{ color: '#8A8578' }} />
              Start from scratch
            </button>
          </div>
        )}

        {step === 'form' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <button onClick={() => setStep('template')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#8A8578', padding: 0 }}>← Back to templates</button>

            <div>
              <Label style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Invoice Generator" />
            </div>
            <div>
              <Label style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Icon</Label>
              <IconPicker value={icon} onChange={setIcon} />
            </div>

            <div>
              <Label style={{ fontSize: 12 }}>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of what this agent does" />
            </div>

            <div>
              <Label style={{ fontSize: 12 }}>System Prompt *</Label>
              <Textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="You are an agent that helps with…"
                rows={8}
                style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              />
            </div>

            <div>
              <Label style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>Available Tools</Label>
              <ToolSelector enabled={enabledTools} onChange={setEnabledTools} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
              <Button onClick={save} disabled={saving || !name.trim() || !systemPrompt.trim()}>
                {saving ? 'Creating…' : 'Create Agent'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSystemPrompt, setEditSystemPrompt] = useState('');
  const [editEnabledTools, setEditEnabledTools] = useState<string[]>([]);
  const [editIcon, setEditIcon] = useState('');
  const [dirty, setDirty] = useState(false);

  const selected = agents.find(a => a.id === selectedId) ?? null;

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const { agents: data } = await res.json();
        setAgents(data ?? []);
        // Seed templates on first load
        await fetch('/api/agents/seed-templates', { method: 'POST' }).then(async r => {
          if (r.ok) {
            const { seeded } = await r.json();
            if (seeded > 0) {
              const r2 = await fetch('/api/agents');
              if (r2.ok) { const d = await r2.json(); setAgents(d.agents ?? []); }
            }
          }
        }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const loadRuns = useCallback(async (agentId: string) => {
    const res = await fetch(`/api/agents/${agentId}/runs?limit=10`);
    if (res.ok) { const { runs: data } = await res.json(); setRuns(data ?? []); }
    else setRuns([]);
  }, []);

  const selectAgent = useCallback((agent: UserAgent) => {
    setSelectedId(agent.id);
    setEditName(agent.name);
    setEditDescription(agent.description ?? '');
    setEditSystemPrompt(agent.system_prompt);
    setEditEnabledTools([...agent.enabled_tools]);
    setEditIcon(agent.icon ?? 'Bot');
    setDirty(false);
    setRuns([]);
    loadRuns(agent.id);
  }, [loadRuns]);

  const saveAgent = async () => {
    if (!selectedId || !editName.trim() || !editSystemPrompt.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          system_prompt: editSystemPrompt.trim(),
          enabled_tools: editEnabledTools,
          icon: editIcon || null,
        }),
      });
      if (res.ok) {
        const { agent } = await res.json();
        setAgents(prev => prev.map(a => a.id === agent.id ? agent : a));
        setDirty(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (agent: UserAgent) => {
    const res = await fetch(`/api/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: !agent.is_enabled }),
    });
    if (res.ok) {
      const { agent: updated } = await res.json();
      setAgents(prev => prev.map(a => a.id === updated.id ? updated : a));
    }
  };

  const deleteAgent = async () => {
    if (!selectedId) return;
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/${selectedId}`, { method: 'DELETE' });
      if (res.ok) {
        setAgents(prev => prev.filter(a => a.id !== selectedId));
        setSelectedId(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  const markDirty = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  const font: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', ...font }}>
      {/* Left panel */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '0.5px solid #E8E4DC', background: '#FDFCF8', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '0.5px solid #F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1C1917' }}>Agents</div>
            <div style={{ fontSize: 12, color: '#8A8578', marginTop: 1 }}>{agents.length} agent{agents.length !== 1 ? 's' : ''}</div>
          </div>
          <NewAgentDialog onCreated={agent => {
            setAgents(prev => [...prev, agent]);
            selectAgent(agent);
          }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {loading ? (
            <div style={{ padding: '20px 8px', fontSize: 12.5, color: '#8A8578', textAlign: 'center' }}>Loading agents…</div>
          ) : agents.length === 0 ? (
            <div style={{ padding: '20px 8px', fontSize: 12.5, color: '#8A8578', textAlign: 'center' }}>No agents yet. Create one to get started.</div>
          ) : (
            agents.map(agent => (
              <div
                key={agent.id}
                onClick={() => selectAgent(agent)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: 'pointer', background: selectedId === agent.id ? '#F0EDE8' : 'transparent', marginBottom: 2, transition: 'background 0.1s' }}
                onMouseEnter={e => { if (selectedId !== agent.id) e.currentTarget.style.background = '#F7F5F2'; }}
                onMouseLeave={e => { if (selectedId !== agent.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FBF0F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AgentIcon name={agent.icon} size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
                  {agent.description && (
                    <div style={{ fontSize: 11.5, color: '#8A8578', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{agent.description}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {agent.is_template && (
                    <Badge variant="secondary" style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 6 }}>Template</Badge>
                  )}
                  <Toggle checked={agent.is_enabled} onChange={() => toggleEnabled(agent)} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FFFFFF' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#A0998F' }}>
            <Bot size={40} style={{ color: '#D5D0C5' }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: '#5C564F' }}>Select an agent to edit</div>
            <div style={{ fontSize: 12.5, color: '#8A8578' }}>Or create a new one from the panel on the left</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            {/* Agent header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#FBF0F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AgentIcon name={editIcon} size={24} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1C1917' }}>{editName || 'Untitled Agent'}</div>
                  {selected.is_template && <Badge variant="secondary" style={{ fontSize: 10, marginTop: 4 }}>Template</Badge>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <RunAgentDialog agent={selected} />
                {dirty && (
                  <Button onClick={saveAgent} disabled={saving} size="sm">
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={deleteAgent} disabled={deleting} style={{ color: '#CC4B37', borderColor: '#FBCFC8' }}>
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>

            {/* Edit fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 680 }}>
              <div>
                <Label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>Name</Label>
                <Input
                  value={editName}
                  onChange={e => markDirty(setEditName)(e.target.value)}
                  placeholder="Agent name"
                />
              </div>
              <div>
                <Label style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Icon</Label>
                <IconPicker value={editIcon} onChange={v => markDirty(setEditIcon)(v)} />
              </div>

              <div>
                <Label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>Description</Label>
                <Input
                  value={editDescription}
                  onChange={e => markDirty(setEditDescription)(e.target.value)}
                  placeholder="Short description of this agent's purpose"
                />
              </div>

              <div>
                <Label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>System Prompt</Label>
                <Textarea
                  value={editSystemPrompt}
                  onChange={e => markDirty(setEditSystemPrompt)(e.target.value)}
                  rows={12}
                  style={{ fontFamily: 'monospace', fontSize: 12.5, resize: 'vertical', lineHeight: 1.6 }}
                  placeholder="You are an agent that…"
                />
              </div>

              <div>
                <Label style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                  Available Tools
                  <span style={{ color: '#8A8578', fontWeight: 400, marginLeft: 6 }}>
                    ({editEnabledTools.length} of {ALL_TOOL_NAMES.length} selected)
                  </span>
                </Label>
                <div style={{ border: '0.5px solid #E8E4DC', borderRadius: 10, padding: '12px 14px', background: '#FDFCF8' }}>
                  <ToolSelector
                    enabled={editEnabledTools}
                    onChange={tools => markDirty(setEditEnabledTools)(tools)}
                  />
                </div>
              </div>

              {/* Recent runs */}
              <div>
                <Label style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>Recent Runs</Label>
                <div style={{ border: '0.5px solid #E8E4DC', borderRadius: 10, padding: '12px 14px', background: '#FDFCF8' }}>
                  <RunsTable runs={runs} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
