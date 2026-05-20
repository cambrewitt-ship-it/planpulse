import Anthropic from '@anthropic-ai/sdk';

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  // ── Read tools ────────────────────────────────────────────────────────────────
  {
    name: 'get_daily_briefing',
    description: 'Get a full daily briefing: all clients, health status, overdue action points, upcoming tasks, and pacing issues. Use this for morning briefings or "how are we doing" questions.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_action_points',
    description: 'Get all outstanding action points with their calculated due dates. Returns overdue items, due-soon items, and all outstanding tasks grouped by client. Always use this when asked about tasks, to-dos, action points, or overdue items.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'Filter to a specific client by partial name match. Omit for all clients.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_client_status',
    description: 'Get health status, spend variance, and channel information for all clients or a specific client.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'Filter by partial client name. Omit for all clients.',
        },
        status_filter: {
          type: 'string',
          enum: ['red', 'amber', 'green'],
          description: 'Filter by health status. Omit for all.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_channel_library',
    description: 'Look up media channel specifications, best practices, and notes from the agency library.',
    input_schema: {
      type: 'object',
      properties: {
        channel_type: {
          type: 'string',
          description: 'Filter by channel type (e.g. "Facebook", "Google"). Omit for all entries.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_channel_performance',
    description: 'Get channel-level performance and spend health for a client. Returns per-channel: planned budget, actual spend, spend variance %, pacing status, and performance KPIs (impressions, clicks, CTR, conversions, CPC, CPM). Use this whenever asked about channel performance, spend pacing, channel health, or specific channel metrics.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'Filter to a specific client by partial name match. Omit for all clients.',
        },
        channel_name: {
          type: 'string',
          description: 'Filter to a specific channel (e.g. "Meta", "Google", "LinkedIn"). Omit for all channels.',
        },
        start_date: {
          type: 'string',
          description: 'Start of date range in YYYY-MM-DD format. Defaults to start of current month.',
        },
        end_date: {
          type: 'string',
          description: 'End of date range in YYYY-MM-DD format. Defaults to today.',
        },
      },
      required: [],
    },
  },

  // ── Write / action tools (Tier 1) ─────────────────────────────────────────────
  {
    name: 'complete_action_point',
    description: 'Mark a specific action point as complete for a client. Use when the user says something is done, finished, sorted, or no longer needed. Searches for the action point by partial text match. If multiple match, returns options for clarification.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'The client name (partial match is fine).',
        },
        action_point_description: {
          type: 'string',
          description: 'Partial text of the action point to complete (e.g. "health check", "pixel", "tracking setup").',
        },
        channel_type: {
          type: 'string',
          description: 'Optional: filter to a specific channel (e.g. "Meta", "Google"). Helps disambiguate if multiple action points match.',
        },
      },
      required: ['client_name', 'action_point_description'],
    },
  },
  {
    name: 'create_client',
    description: 'Create a new client in PlanPulse. Use when the user wants to onboard a new client or add a new client to the system.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'The name of the new client.',
        },
      },
      required: ['client_name'],
    },
  },
  {
    name: 'update_media_plan_budget',
    description: "Update a channel's planned budget for a specific month in a client's media plan. Use when the user wants to adjust, change, or set a budget for a channel. Month must be in YYYY-MM format (e.g. \"2026-06\" for June 2026).",
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'The client name (partial match is fine).',
        },
        channel_name: {
          type: 'string',
          description: 'The channel to update (e.g. "Meta", "Google Ads", "LinkedIn").',
        },
        month: {
          type: 'string',
          description: 'The month to update in YYYY-MM format (e.g. "2026-06").',
        },
        new_budget: {
          type: 'number',
          description: 'The new planned budget amount in dollars.',
        },
      },
      required: ['client_name', 'channel_name', 'month', 'new_budget'],
    },
  },
  {
    name: 'create_action_point',
    description: 'Create a new action point task that will appear for all clients running that channel. Use when the user wants to add a new recurring health check or a new setup task to the agency workflow.',
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The task description (e.g. "Check attribution window settings").',
        },
        channel_type: {
          type: 'string',
          description: 'The channel this applies to (e.g. "Meta Ads", "Google Ads", "LinkedIn Ads").',
        },
        category: {
          type: 'string',
          enum: ['SET UP', 'HEALTH CHECK'],
          description: 'SET UP for one-time pre-launch tasks, HEALTH CHECK for recurring checks.',
        },
        days_before_live_due: {
          type: 'number',
          description: 'SET UP only: how many days before channel launch the task is due.',
        },
        frequency: {
          type: 'string',
          enum: ['weekly', 'fortnightly', 'monthly'],
          description: 'HEALTH CHECK only: how often the task recurs.',
        },
      },
      required: ['text', 'channel_type', 'category'],
    },
  },

  // ── Client Intelligence Hub (Tier 2) ──────────────────────────────────────────
  {
    name: 'get_client_intelligence',
    description: "Fetch the Client Intelligence Hub data for a specific client: campaign brief (objectives, KPIs, budget, dates, target audience, brief body, lock status), campaign goals with floor/target/stretch and current actual values, handover notes and client intel (pinned first, then reverse-chronological), and documents on file. Use this whenever you need rich context about a specific client's campaign strategy, commitments, or background.",
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'The client name (partial match is fine).',
        },
      },
      required: ['client_name'],
    },
  },

  // ── Live ad platform data (Tier 3) ────────────────────────────────────────────
  {
    name: 'get_live_meta_campaigns',
    description: 'Fetch live campaign data directly from the Meta Ads API. Returns current campaign names, status, and account info. Use when asked about Meta campaigns, what campaigns are running, or to check live Meta campaign status.',
    input_schema: {
      type: 'object',
      properties: {
        status_filter: {
          type: 'string',
          enum: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'],
          description: 'Filter campaigns by effective status. Omit for all.',
        },
        account_name: {
          type: 'string',
          description: 'Filter to campaigns under a specific ad account by partial name match. Omit for all accounts.',
        },
      },
      required: [],
    },
  },
];

// Subset used by the Teams bot: read tools + safe write tools only
// Excludes create_client and update_media_plan_budget (too high-risk for bot commands)
export const BOT_TOOL_DEFINITIONS: Anthropic.Tool[] = TOOL_DEFINITIONS.filter(
  t => !['create_client', 'update_media_plan_budget', 'get_live_meta_campaigns', 'get_client_intelligence'].includes(t.name)
);
