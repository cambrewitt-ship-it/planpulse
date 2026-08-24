import type { AgentAuditStep, AgentOutputLink } from '@/types/database';

export type { AgentAuditStep, AgentOutputLink };

export const TOOL_LABELS: Record<string, string> = {
  get_daily_briefing: 'Read daily briefing',
  get_action_points: 'Read action points',
  get_channel_library: 'Read channel library',
  get_agency_playbooks: 'Read agency playbooks',
  get_channel_performance: 'Read channel performance',
  get_client_intelligence: 'Read client intelligence',
  get_live_meta_campaigns: 'Fetch live Meta campaigns',
  complete_action_point: 'Complete action point',
  create_client: 'Create client',
  create_action_point: 'Create action point',
  update_media_plan_budget: 'Update media plan budget',
  update_media_plan_flight: 'Update media plan flight',
  set_media_plan_channels: 'Set media plan channels',
  generate_invoice: 'Generate invoice',
  generate_report: 'Generate report',
};

export const WRITE_TOOLS = [
  'complete_action_point',
  'create_client',
  'create_action_point',
  'update_media_plan_budget',
  'update_media_plan_flight',
  'set_media_plan_channels',
  'generate_invoice',
  'generate_report',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildAuditSummary(toolName: string, input: any, result: any): string {
  try {
    switch (toolName) {
      case 'get_daily_briefing': {
        const clientCount = result?.clients?.length ?? result?.summary?.total_clients ?? '?';
        return `Read briefing across ${clientCount} clients`;
      }
      case 'get_action_points': {
        const overdue = result?.overdue?.length ?? 0;
        const dueSoon = result?.due_soon?.length ?? 0;
        const client = input?.client_name ? ` for ${input.client_name}` : '';
        return `Found ${overdue} overdue and ${dueSoon} due-soon tasks${client}`;
      }
      case 'get_channel_library': {
        const entries = result?.channels ?? result ?? [];
        const count = Array.isArray(entries) ? entries.length : '?';
        return `Read ${count} channel library entries`;
      }
      case 'get_agency_playbooks': {
        const docs = result?.documents ?? result ?? [];
        const count = Array.isArray(docs) ? docs.length : '?';
        return `Read ${count} playbook${Number(count) !== 1 ? 's' : ''}`;
      }
      case 'get_channel_performance': {
        const channels = result?.channels ?? [];
        const n = Array.isArray(channels) ? channels.length : '?';
        const client = input?.client_name ? ` for ${input.client_name}` : '';
        const dateRange = input?.start_date && input?.end_date
          ? ` (${input.start_date} – ${input.end_date})`
          : '';
        return `Read performance data for ${n} channel${Number(n) !== 1 ? 's' : ''}${client}${dateRange}`;
      }
      case 'get_client_intelligence': {
        const clientName = result?.client?.name ?? input?.client_name ?? 'client';
        const parts = [];
        if (result?.brief) parts.push('brief');
        if (result?.goals?.length) parts.push('goals');
        if (result?.notes?.length) parts.push('notes');
        if (result?.documents?.length) parts.push('documents');
        return `Read intelligence for ${clientName}${parts.length ? ` (${parts.join(', ')})` : ''}`;
      }
      case 'get_live_meta_campaigns': {
        const campaigns = result?.campaigns ?? result ?? [];
        const count = Array.isArray(campaigns) ? campaigns.length : '?';
        const status = input?.status_filter ? ` ${input.status_filter}` : '';
        return `Fetched ${count}${status} Meta campaign${Number(count) !== 1 ? 's' : ''} from API`;
      }
      case 'complete_action_point': {
        const task = input?.action_point_description ?? 'task';
        const client = input?.client_name ?? 'client';
        return `Completed "${task}" for ${client}`;
      }
      case 'create_client': {
        const name = input?.client_name ?? result?.name ?? 'new client';
        return `Created client "${name}"`;
      }
      case 'create_action_point': {
        const text = input?.text ?? 'task';
        const channel = input?.channel_type ?? '';
        return `Created action point "${text}"${channel ? ` for ${channel}` : ''}`;
      }
      case 'update_media_plan_budget': {
        const channel = input?.channel_name ?? 'channel';
        const month = input?.month ?? '';
        const client = input?.client_name ?? 'client';
        const newBudget = input?.new_budget != null ? `$${Number(input.new_budget).toLocaleString()}` : '';
        return `Updated ${channel} budget${month ? ` for ${month}` : ''} to ${newBudget} (${client})`;
      }
      case 'update_media_plan_flight': {
        const channel = input?.channel_name ?? 'channel';
        const client = input?.client_name ?? 'client';
        const budget = input?.budget != null ? `$${Number(input.budget).toLocaleString()}` : '';
        const range = input?.start_week && input?.end_week ? ` for W/C ${input.start_week} – ${input.end_week}` : '';
        return `Set ${channel} to ${budget}${range} (${client})`;
      }
      case 'set_media_plan_channels': {
        const channels = input?.channels ?? [];
        const count = Array.isArray(channels) ? channels.length : '?';
        const client = input?.client_name ?? 'client';
        return `Set ${count} channel${Number(count) !== 1 ? 's' : ''} on media plan for ${client}`;
      }
      case 'generate_invoice': {
        const client = input?.client_name ?? result?.client ?? 'client';
        const total = result?.total_gross ?? result?.total ?? result?.summary?.total_gross;
        const totalStr = total != null ? `: $${Number(total).toLocaleString()} gross` : '';
        return `Generated invoice for ${client}${totalStr}`;
      }
      case 'generate_report': {
        const client = input?.client_name ?? 'client';
        const dateRange = input?.start_date && input?.end_date
          ? ` (${input.start_date} – ${input.end_date})`
          : '';
        return `Generated report for ${client}${dateRange}`;
      }
      default:
        return `Called ${toolName}`;
    }
  } catch {
    return TOOL_LABELS[toolName] ?? toolName;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildOutputLinks(toolName: string, input: any, result: any, contextClientId: string | null): AgentOutputLink[] {
  const clientId = contextClientId ?? result?.client_id ?? result?.client?.id;
  if (!clientId) return [];

  switch (toolName) {
    case 'generate_invoice': {
      const start = result?.date_range?.start;
      const end = result?.date_range?.end;
      const spendType = result?.spend_type ?? 'actual';
      if (start && end) {
        return [{ label: 'Download Invoice PDF', href: `/api/clients/${clientId}/invoice/pdf?start_date=${start}&end_date=${end}&spend_type=${spendType}`, target: '_blank' }];
      }
      return [{ label: 'View Invoice', href: `/clients/${clientId}/dashboard` }];
    }
    case 'generate_report':
      return [{ label: 'View Report', href: `/clients/${clientId}/dashboard` }];
    case 'update_media_plan_budget':
    case 'update_media_plan_flight':
    case 'set_media_plan_channels':
      return [{ label: 'Open Media Plan', href: `/clients/${clientId}/dashboard?view=media-plan` }];
    default:
      return [];
  }
}
