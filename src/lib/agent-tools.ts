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
    name: 'get_agency_playbooks',
    description: 'Fetch the agency\'s internal playbooks, process docs, SOPs, and blueprint documents. Use this whenever asked about agency processes, how we operate, onboarding procedures, billing processes, reporting templates, or any internal documentation.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['process', 'sop', 'strategy', 'brand_guidelines', 'onboarding', 'reporting', 'billing', 'compliance', 'other'],
          description: 'Filter by document category. Omit to return all playbooks.',
        },
        search: {
          type: 'string',
          description: 'Optional keyword to filter documents by name.',
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
    description: "Update a channel's planned budget for one whole calendar month in a client's media plan. Use only when the user's request is genuinely month-scoped (e.g. \"set Google's June budget to $5,000\"). If the user gives ANY specific dates, a date range, or says \"w/c\" / \"week commencing\" (e.g. \"$10,000 on Google from Sep 7th to 21st\", \"100 on meta during w/c 31 Aug until 6 Sep\"), use update_media_plan_flight instead — do not force a date-range request into a monthly bucket just because it happens to fall mostly within one month. Works even if the channel isn't in the plan yet or the plan is empty — it creates the channel (and a flight spanning the given month) automatically rather than erroring. Month must be in YYYY-MM format (e.g. \"2026-06\" for June 2026).",
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
    name: 'update_media_plan_flight',
    description: "Set a channel's budget for a specific week-commencing (W/C) date range — a single flight/burst — rather than a whole calendar month. Use this whenever the user gives specific dates or a W/C range (e.g. \"$10,000 on Google from W/C Sep 7th to Sep 28th\"), including when the channel isn't in the plan yet or the plan is empty — this tool creates the channel automatically and never errors on an unrecognised channel name. start_week and end_week should both be Mondays (week-commencing dates); if the user's dates aren't Mondays, snap each to its week-commencing Monday yourself. If an existing flight on this channel overlaps the given range, it will be replaced (dates + budget updated); otherwise a new flight is added alongside the channel's existing flights.",
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
        start_week: {
          type: 'string',
          description: 'Week-commencing start date, YYYY-MM-DD, must be a Monday.',
        },
        end_week: {
          type: 'string',
          description: 'Week-commencing end date, YYYY-MM-DD, must be a Monday. Inclusive — the flight runs through the Sunday of this week (end_week + 6 days).',
        },
        budget: {
          type: 'number',
          description: 'Total budget for this flight, in dollars.',
        },
        monthly_spend: {
          type: 'object',
          description: 'How the total budget splits across calendar months the flight touches, as { "YYYY-M": amount }. Distribute proportionally by the number of weeks in each month across start_week to end_week inclusive — the same way you would for set_media_plan_channels. Values must sum to exactly `budget`. If the flight sits entirely within one month, this is just { "YYYY-M": budget }.',
        },
      },
      required: ['client_name', 'channel_name', 'start_week', 'end_week', 'budget', 'monthly_spend'],
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

  // ── Invoice & Reports ─────────────────────────────────────────────────────────
  {
    name: 'generate_invoice',
    description: 'Generate an invoice for a client for a given date range. Returns spend per channel, commission, and total. Use when asked to create, generate, or prepare an invoice.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD' },
        spend_type: { type: 'string', enum: ['actual', 'planned'], description: 'Use actual for real spend, planned for media plan budgets. Default: actual.' },
      },
      required: ['client_name', 'start_date', 'end_date'],
    },
  },
  {
    name: 'generate_report',
    description: 'Generate a performance report for a client for a given date range. Returns a summary of health, spend, channel performance, and action points. Use when asked to create, generate, or prepare a report.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD' },
        sections: {
          type: 'array',
          items: { type: 'string', enum: ['summary', 'spend', 'channels', 'ga4', 'actions'] },
          description: 'Which sections to include. Omit for all sections.',
        },
      },
      required: ['client_name', 'start_date', 'end_date'],
    },
  },

  // ── Media plan onboarding (Tier 1 write) ─────────────────────────────────────
  {
    name: 'set_media_plan_channels',
    description: "Replace the ENTIRE media plan for a client with multiple channels at once — e.g. onboarding a new client with several channels, or the user pastes/describes a full plan. Deletes any channel not included in this call. Never use this to add or update a single channel, even a brand-new one that isn't in the plan yet — use update_media_plan_flight for that instead, it creates missing channels automatically without touching anything else.",
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'The client name (partial match is fine).',
        },
        channels: {
          type: 'array',
          description: 'Array of channels extracted from the user\'s description.',
          items: {
            type: 'object',
            properties: {
              channelName: {
                type: 'string',
                description: 'Standard channel name e.g. "Meta Ads", "Google Ads", "LinkedIn Ads", "OOH", "EDM / Email".',
              },
              customChannelName: {
                type: 'string',
                description: 'Only set if channelName is "Other" — the user\'s original channel name.',
              },
              format: {
                type: 'string',
                description: 'Ad format or placement detail e.g. "Search + Shopping", "Feed + Stories". Empty string if not specified.',
              },
              totalBudget: {
                type: 'number',
                description: 'Total budget in dollars across all flights for this channel.',
              },
              flights: {
                type: 'array',
                description: 'One or more flight periods for this channel.',
                items: {
                  type: 'object',
                  properties: {
                    startDate: { type: 'string', description: 'YYYY-MM-DD — start of flight.' },
                    endDate: { type: 'string', description: 'YYYY-MM-DD — end of flight.' },
                    monthlySpend: {
                      type: 'object',
                      description: 'Spend per calendar month in YYYY-MM format e.g. {"2026-01": 10000, "2026-02": 10000}. If unknown, distribute totalBudget evenly.',
                    },
                  },
                  required: ['startDate', 'endDate', 'monthlySpend'],
                },
              },
            },
            required: ['channelName', 'totalBudget', 'flights'],
          },
        },
      },
      required: ['client_name', 'channels'],
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
// Excludes create_client and update_media_plan_budget/update_media_plan_flight (too high-risk for bot commands)
export const BOT_TOOL_DEFINITIONS: Anthropic.Tool[] = TOOL_DEFINITIONS.filter(
  t => !['create_client', 'update_media_plan_budget', 'update_media_plan_flight', 'get_live_meta_campaigns', 'get_client_intelligence'].includes(t.name)
);
