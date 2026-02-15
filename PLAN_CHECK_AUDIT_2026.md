# Plan Check Application - Comprehensive Audit
**Date:** February 9, 2026  
**Purpose:** Pre-development audit for Master Agency Dashboard feature

---

## 1. CURRENT ARCHITECTURE

### 1.1 Database Schema

#### Core Tables

**clients**
- Fields: `id`, `name`, `notes`, `created_at`, `updated_at`
- Purpose: Store client/customer information
- Notes: Has notes field added via `20251123_add_notes_to_clients.sql`

**media_plans**
- Fields: `id`, `client_id`, `name`, `start_date`, `end_date`, `total_budget`, `status`, `created_at`, `updated_at`
- Status values: `'draft' | 'active' | 'completed'`
- Budget stored in cents (integer)
- Foreign key: `client_id` → `clients.id`

**channels**
- Fields: `id`, `client_id`, `plan_id`, `channel`, `detail`, `type`, `created_at`
- Type values: `'paid' | 'organic' | 'both'`
- Foreign keys: `client_id` → `clients.id`, `plan_id` → `media_plans.id`
- Purpose: Individual marketing channels within a media plan

**weekly_plans**
- Fields: `id`, `channel_id`, `week_commencing`, `week_number`, `budget_planned`, `budget_actual`, `posts_planned`, `posts_actual`, `created_at`
- Foreign key: `channel_id` → `channels.id`
- Purpose: Weekly budget and performance tracking per channel

#### Task/Action Items System

**action_points**
- Fields: `id`, `channel_type`, `text`, `completed`, `category`, `frequency`, `due_date`, `created_at`, `updated_at`
- Category values: `'SET UP' | 'HEALTH CHECK'` (recently updated from `'ONGOING'`)
- Frequency values: `'daily' | 'weekly' | 'fortnightly' | 'monthly'` (optional, for HEALTH CHECK items)
- Purpose: Task management per channel type (e.g., "Meta Ads", "Google Ads")
- Note: Uses `channel_type` (string) NOT `channel_id` - tasks are template-based, not per channel instance
- Migration: `20260208_update_action_points_health_check.sql` (most recent)

#### Ad Platform Connections

**ad_platform_connections**
- Fields: `id`, `user_id`, `client_id`, `platform`, `connection_id`, `connection_status`, `created_at`, `updated_at`
- Platform values: `'google-ads' | 'meta-ads' | 'linkedin-ads' | 'google-analytics'`
- Connection status: `'active' | 'expired' | 'error'`
- Purpose: Track Nango OAuth connections per user/client/platform
- Migration: `20251113_add_client_id_to_ad_platform_connections.sql`

**google_ads_accounts**
- Fields: `id`, `user_id`, `connection_id`, `customer_id`, `account_name`, `is_active`, `created_at`, `updated_at`
- Purpose: Store Google Ads accounts linked by users
- Migration: `20251117_add_google_ads_accounts.sql`

**meta_ads_accounts**
- Fields: `id`, `user_id`, `account_id`, `account_name`, `is_active`, `created_at`, `updated_at`
- Purpose: Store Meta (Facebook/Instagram) Ads accounts
- Migration: `20251118_add_meta_ads_accounts.sql`

**google_analytics_accounts**
- Fields: `id`, `user_id`, `property_id`, `property_name`, `account_id`, `account_name`, `is_active`, `created_at`, `updated_at`
- Purpose: Store Google Analytics 4 properties
- Migration: `20251124_add_google_analytics_accounts.sql`

#### Media Plan Builder (Draft State)

**client_media_plan_builder**
- Fields: `id`, `client_id`, `channels` (JSONB), `commission`, `created_at`, `updated_at`
- Purpose: Store draft media plan builder state before publishing
- Unique constraint on `client_id`
- Migration: `20251121_add_client_media_plan_builder.sql`

**media_channel_library**
- Fields: `id`, `title`, `notes`, `channel_type`, `created_at`, `updated_at`
- Purpose: Global library/templates for media channels
- Migration: `20251122_add_media_channel_library.sql`

### 1.2 Database Relationships

```
clients (1) ──→ (many) media_plans
clients (1) ──→ (many) channels
clients (1) ──→ (1) client_media_plan_builder

media_plans (1) ──→ (many) channels

channels (1) ──→ (many) weekly_plans

users (auth.users) (1) ──→ (many) ad_platform_connections
users (auth.users) (1) ──→ (many) google_ads_accounts
users (auth.users) (1) ──→ (many) meta_ads_accounts
users (auth.users) (1) ──→ (many) google_analytics_accounts
```

### 1.3 Authentication Setup

**Provider:** Supabase Auth
- Package: `@supabase/auth-helpers-nextjs` (v0.10.0)
- Client setup: `src/lib/supabase/client.ts`
- Uses `createClientComponentClient` for client components
- Uses `createRouteHandlerClient` for API routes
- Authentication methods: Email/Password (standard Supabase)

**Auth Routes:**
- `/auth/login` - Login page (`src/app/auth/login/page.tsx`)
- `/auth/signup` - Signup page (`src/app/auth/signup/page.tsx`)

**Row Level Security (RLS):**
- Enabled on all tables
- Policies check `auth.uid() = user_id` or `auth.role() = 'authenticated'`
- Client-scoped data doesn't appear to have multi-tenancy RLS (all authenticated users can see all clients)

---

## 2. EXISTING PAGES & ROUTES

### 2.1 Main Application Pages

#### Dashboard/Home
- **Route:** `/dashboard`
- **File:** `src/app/dashboard/page.tsx`
- **Purpose:** Main client list page
- **Features:**
  - Lists all clients in a grid
  - ActionPointsTodoList component (sticky sidebar)
  - Link to Library
  - Create new client button
  - Each client card links to `/clients/[id]/new-client-dashboard`

#### Client Dashboards
- **Route:** `/clients/[id]/dashboard`
- **File:** `src/app/clients/[id]/dashboard/page.tsx`
- **Purpose:** Legacy client dashboard (simpler view)
- **Features:**
  - Client stats cards (total plans, total budget)
  - List of media plans for client
  - AdPlatformConnector component
  - Links to plan dashboards

- **Route:** `/clients/[id]/new-client-dashboard`
- **File:** `src/app/clients/[id]/new-client-dashboard/page.tsx`
- **Purpose:** Enhanced client dashboard (primary view)
- **Features:**
  - Client name/notes editing
  - Media Plan Builder (MediaPlanGrid component)
  - Active plan display
  - TodoSection with action points
  - AdPlatformConnector for OAuth integrations
  - Cost per metric charts (CAC analysis)
  - Date range picker for analytics

#### Plan Dashboard
- **Route:** `/plans/[id]/dashboard`
- **File:** `src/app/plans/[id]/dashboard/page.tsx`
- **Purpose:** Detailed media plan view with channel tracking
- **Features:**
  - Plan editing mode (PlanEditForm)
  - Media channel rows with spend tracking
  - Health checklist per channel
  - Time series charts (spend/pacing)
  - Action calendar
  - Summary cards (total budget, spent, pacing)
  - Integration with live ad spend data (Google Ads, Meta)

#### Library
- **Route:** `/library`
- **File:** `src/app/library/page.tsx`
- **Purpose:** Media channel library/templates

#### Client Creation
- **Route:** `/clients/create`
- **File:** `src/app/clients/create/page.tsx`
- **Purpose:** Create new client

### 2.2 API Routes

#### Action Points
- `GET /api/action-points?channel_type=<type>` - Fetch action points by channel type
- `POST /api/action-points` - Create action point
- `PUT /api/action-points` - Update action point (toggle completed, etc.)
- `DELETE /api/action-points?id=<id>` - Delete action point
- **File:** `src/app/api/action-points/route.ts`

#### Google Ads Integration
- `GET /api/ads/google-ads/accounts` - Get linked accounts
- `GET /api/ads/google-ads/get-accounts` - Get accounts for connection
- `POST /api/ads/google-ads/save-account` - Save account
- `DELETE /api/ads/google-ads/delete-account` - Remove account
- `GET /api/ads/google-ads/diagnose` - Diagnostic endpoint
- **Directory:** `src/app/api/ads/google-ads/`

#### Meta Ads Integration
- `GET /api/ads/meta/accounts` - Get ad accounts
- `GET /api/ads/meta/discover-accounts` - Discover accounts from connection
- `POST /api/ads/meta/save-accounts` - Save accounts
- `DELETE /api/ads/meta/delete-account` - Remove account
- `POST /api/ads/meta/fetch-spend` - Fetch spend data
- **Directory:** `src/app/api/ads/meta/`

#### Google Analytics Integration
- `GET /api/ads/google-analytics/accounts` - Get properties
- `GET /api/ads/google-analytics/get-accounts` - Get properties for connection
- `POST /api/ads/google-analytics/save-accounts` - Save properties
- `DELETE /api/ads/google-analytics/delete-account` - Remove property
- `POST /api/ads/google-analytics/fetch-data` - Fetch GA4 metrics
- `GET /api/ads/google-analytics/event-names` - Get available event names
- **Directory:** `src/app/api/ads/google-analytics/`

#### Ad Spend Fetching
- `POST /api/ads/fetch-spend` - Fetch ad spend across platforms
- **File:** `src/app/api/ads/fetch-spend/route.ts`

#### Connections
- `GET /api/connections/status` - Get connection status for client
- `GET /api/connections/user-status` - Get user's connection status
- `POST /api/connections/channel-account` - Link channel to ad account
- **Directory:** `src/app/api/connections/`

#### Integrations (Nango OAuth)
- `POST /api/integrations/sync` - Manually sync connection
- `POST /api/integrations/disconnect` - Disconnect integration
- `POST /api/nango/session-token` - Get Nango session token for OAuth
- `POST /api/nango/webhook` - Webhook for Nango events
- **Directory:** `src/app/api/integrations/` and `src/app/api/nango/`

#### Media Plan Builder
- `POST /api/clients/[id]/media-plan-builder` - Save/update media plan builder
- **File:** `src/app/api/clients/[id]/media-plan-builder/route.ts`

#### Media Channel Library
- `GET /api/media-channel-library` - Get library entries
- (Other CRUD operations likely in same file)
- **File:** `src/app/api/media-channel-library/route.ts`

### 2.3 Navigation Structure

**Current Flow:**
1. User logs in → redirected to `/dashboard`
2. Dashboard shows all clients + To Do List sidebar
3. Click client → `/clients/[id]/new-client-dashboard`
4. Client dashboard has:
   - Media Plan Builder (to create plans)
   - Active plan display
   - Todo section
   - Ad platform connections
5. Click plan → `/plans/[id]/dashboard`
6. Plan dashboard has detailed channel tracking

**No master agency dashboard exists yet** - this is the gap.

---

## 3. DATA FLOW

### 3.1 Client Data Flow

**Fetching:**
- `getClients()` in `src/lib/db/plans.ts`
- Queries `clients` table via Supabase client
- Used in: Dashboard, ActionPointsTodoList

**Creating:**
- `createClient(name)` in `src/lib/db/plans.ts`
- Inserts into `clients` table

**Updating:**
- `updateClient(clientId, name, notes)` in `src/lib/db/plans.ts`
- Updates `clients` table

### 3.2 Media Plan Data Flow

**Fetching:**
- `getMediaPlans(clientId)` - Get all plans for a client
- `getPlanById(planId)` - Get full plan with channels and weekly_plans
- Both in `src/lib/db/plans.ts`

**Creating:**
- `createMediaPlan(clientId, channels)` in `src/lib/db/plans.ts`
- Process:
  1. Calculate plan dates and budget from channels
  2. Insert `media_plans` row
  3. For each channel: insert `channels` row
  4. For each channel: generate and insert `weekly_plans` rows

**Updating:**
- `updateMediaPlanWithChannels(planId, clientId, planUpdates, channels)`
- Complex: handles channel additions, deletions, updates
- Manages cascading updates to `weekly_plans`

**Deleting:**
- `deleteMediaPlan(planId)`
- Cascades to channels and weekly_plans

### 3.3 Media Plan Builder Data Flow

**Draft State:**
- `saveClientMediaPlanBuilder(clientId, data)` - Save draft
- `getClientMediaPlanBuilder(clientId)` - Retrieve draft
- Data stored as JSONB in `client_media_plan_builder` table
- Channels contain "flights" with date ranges

**Publishing:**
- When user clicks "Publish", draft channels are converted to actual media plan
- Calls `createMediaPlan()` or `updateMediaPlanWithChannels()`

### 3.4 Ad Spend Data Integration

**Google Ads:**
- User connects via Nango OAuth
- Accounts stored in `google_ads_accounts`
- Spend fetched via `/api/ads/fetch-spend` or Google Ads API proxy
- Uses `fetchChannelSpendData()` in `src/lib/api/spend-data-integration.ts`

**Meta Ads:**
- Similar OAuth flow via Nango
- Accounts in `meta_ads_accounts`
- Spend fetched via Meta Marketing API

**Google Analytics:**
- OAuth via Nango
- Properties in `google_analytics_accounts`
- Metrics (users, sessions, events) fetched via GA4 Data API
- Used for CAC calculations in `src/lib/api/analytics-data-integration.ts`

**Pacing Calculations:**
- `calculatePacingScore()` in `src/lib/utils/pacing-calculations.ts`
- Compares actual vs planned spend
- Returns percentage and status (`on-track`, `over-pacing`, `under-pacing`)

### 3.5 Action Points Data Flow

**Fetching:**
- API: `GET /api/action-points?channel_type=<type>`
- Returns all action points for a channel type (e.g., "Meta Ads")

**Creating/Updating/Deleting:**
- API routes handle CRUD operations
- Used in:
  - `ActionPointsTodoList` component (dashboard sidebar)
  - `TodoSection` component (client dashboard)
  - `MediaChannelHealthChecklist` component (plan dashboard)

**Key Insight:**
- Action points are tied to `channel_type` (string) not `channel_id`
- They're templates that apply to any channel of that type
- To track per-client or per-channel tasks, we'd need a different approach

### 3.6 State Management

**Approach:** React State (no Redux/Zustand)
- Client-side state with `useState` and `useEffect`
- Data fetching on mount
- Optimistic updates in some places (e.g., ActionPointsTodoList)
- Auto-save for Media Plan Builder (debounced)

---

## 4. UI COMPONENTS

### 4.1 UI Library

**Shadcn/ui (New York style)**
- Configured via `components.json`
- Base color: neutral
- Uses CSS variables for theming
- Icon library: lucide-react
- Components in: `src/components/ui/`

**Styling:**
- Tailwind CSS v4
- Next.js 16 with App Router
- React 19

### 4.2 Reusable UI Components

Located in `src/components/ui/`:

**Core Components (Shadcn):**
- `card.tsx` - Card, CardHeader, CardTitle, CardContent, CardFooter
- `button.tsx` - Button variants
- `input.tsx` - Text inputs
- `textarea.tsx` - Multi-line text
- `select.tsx` - Dropdown select
- `checkbox.tsx` - Checkboxes
- `badge.tsx` - Status badges
- `tabs.tsx` - Tab navigation
- `dialog.tsx` - Modal dialogs
- `dropdown-menu.tsx` - Dropdown menus
- `label.tsx` - Form labels
- `progress.tsx` - Progress bars
- `date-range-picker.tsx` - Date range selection

**Custom Dashboard Components:**
- `media-plan-summary-cards.tsx` - Summary metrics cards
- `media-channel-row.tsx` - Expandable channel row with spend data
- `media-channel-spend-chart.tsx` - Spend visualization
- `media-channel-health-checklist.tsx` - Health check tasks per channel
- `action-calendar.tsx` - Calendar view for action points
- `media-plan-time-series-chart.tsx` - Time series charts for pacing
- `cac-chart.tsx` - Cost per acquisition/metric charts
- `unified-analytics-chart.tsx` - Combined analytics visualization

### 4.3 Feature Components

Located in `src/components/`:

**Action Point Management:**
- `ActionPointsTodoList.tsx` - Sidebar todo list (dashboard)
- `TodoSection.tsx` - Client-specific todo section

**Media Planning:**
- `MediaChannels.tsx` - Channel list with live spend integration
- `MediaChannelCard.tsx` - Individual channel card
- `media-plan-builder/media-plan-grid.tsx` - Interactive media plan builder grid

**Plan Entry:**
- `plan-entry/PlanEditForm.tsx` - Form to edit media plan
- `plan-entry/WeekCommencingCalendar.tsx` - Calendar for week selection
- `RollingCalendar.tsx` - Rolling week calendar

**Integrations:**
- `AdPlatformConnector.tsx` - OAuth connection manager for ad platforms
- `IntegrationManager.tsx` - Integration management UI
- `integrations/check/` - Integration health checks

**Navigation:**
- `navigation/TopBar.tsx` - Top navigation bar
- `Footer.tsx` - Footer component

### 4.4 Design System

**Colors:**
- Primary: Neutral-based (as per Shadcn "New York" style)
- Accent colors: Blue (Google), Pink (Meta), Blue-700 (LinkedIn)
- Status colors: Green (on-track), Red (over), Yellow (under)

**Typography:**
- Uses Tailwind's default font stack
- Heading sizes: text-3xl (page titles), text-2xl (section headers), text-lg (card titles)

**Layout Patterns:**
- Grid-based (grid-cols-1, md:grid-cols-2, lg:grid-cols-3)
- Card-based interface
- Sticky sidebars (todo list)
- Expandable rows (channel details)

**Charts:**
- Library: Recharts (v3.4.1)
- Types: LineChart, BarChart, AreaChart
- Responsive with ResponsiveContainer

---

## 5. KEY GAPS FOR AGENCY DASHBOARD

### 5.1 Missing Data Models

**Client Health Status:**
- No aggregated health score per client
- No overall status (red/amber/green)
- Currently have action points, but no rollup

**Aggregated Metrics:**
- No table for client-level metrics (total spend across all plans/channels)
- No historical tracking of health status
- No alerts or notification system

**User/Team Management:**
- No concept of "agency" or "team"
- No user roles (admin, account manager, viewer)
- All users see all clients (no tenancy)

**Client Relationships:**
- No `account_manager_id` field on clients
- No client categories/tags
- No client status (active, paused, churned)

### 5.2 Database Tables to Add

**Recommended New Tables:**

1. **client_health_status**
   - Fields: `id`, `client_id`, `status` (red/amber/green), `last_checked`, `action_points_count`, `overdue_tasks`, `budget_health`, `pacing_health`
   - Purpose: Store computed health status for traffic light system

2. **client_metrics** (optional, could be computed)
   - Fields: `id`, `client_id`, `period_start`, `period_end`, `total_budget`, `total_spend`, `active_channels`, `completed_tasks`, `overdue_tasks`
   - Purpose: Historical metrics for trending

3. **teams** (for multi-tenancy, future)
   - Fields: `id`, `name`, `created_at`

4. **team_members** (for multi-tenancy, future)
   - Fields: `id`, `team_id`, `user_id`, `role`

5. **client_team_assignments** (for multi-tenancy, future)
   - Fields: `id`, `client_id`, `team_id`, `account_manager_user_id`

### 5.3 Missing Features for Traffic Light System

**Health Check Logic:**
- No centralized health calculation
- Need to define criteria for red/amber/green:
  - **Green:** All setup tasks done, health checks on schedule, pacing 90-110%, no overdue tasks
  - **Amber:** Minor issues (1-2 overdue tasks, pacing 80-120%, some health checks missed)
  - **Red:** Major issues (3+ overdue tasks, pacing <80% or >120%, setup incomplete)

**Aggregation:**
- Need background job or API endpoint to compute health status
- Could be real-time (computed on load) or batch (computed periodically)

**Dashboard Widgets:**
- No component for traffic light grid
- No filtering by health status
- No quick actions (e.g., "View issues" button)

### 5.4 New Pages/Routes Needed

**Master Agency Dashboard:**
- Route: `/agency` or `/` (replace current dashboard)
- Features:
  - Grid of all clients with traffic light status
  - Filter by status (red/amber/green)
  - Sort by name, status, budget, last activity
  - Quick stats (total clients, total budget, clients by status)
  - Click client → goes to client dashboard

**Client Detail Quick View:**
- Modal or slide-over from agency dashboard
- Shows key metrics without full navigation

### 5.5 API Endpoints to Add

**Health Status:**
- `GET /api/clients/health` - Get health status for all clients
- `GET /api/clients/[id]/health` - Get health details for one client
- `POST /api/clients/[id]/health/refresh` - Recalculate health status

**Aggregated Data:**
- `GET /api/agency/metrics` - Overall agency metrics (total clients, budget, etc.)
- `GET /api/agency/clients?status=red` - Filtered client list

### 5.6 Action Point System Enhancements

**Current Limitation:**
- Action points are per `channel_type`, not per client or channel
- All "Meta Ads" channels share the same action point templates

**For Agency Dashboard:**
- Need client-specific or channel-specific task tracking
- Possible solutions:
  1. Add `client_id` and `channel_id` fields to `action_points` (nullable, for instances)
  2. Create new `client_tasks` table separate from `action_points` templates
  3. Use `action_points` as templates, create instances when channel is added

**Recommended:**
- Create `client_tasks` table:
  - Fields: `id`, `client_id`, `channel_id`, `task_type` (setup/health), `text`, `completed`, `due_date`, `frequency`, `last_completed`, `created_at`
  - This allows per-client tracking while keeping `action_points` as templates

---

## 6. TECHNOLOGY STACK SUMMARY

**Framework:**
- Next.js 16.0.1 (App Router)
- React 19.2.0
- TypeScript 5

**Database & Auth:**
- Supabase (PostgreSQL)
- `@supabase/supabase-js` v2.79.0
- `@supabase/auth-helpers-nextjs` v0.10.0

**Styling:**
- Tailwind CSS v4
- Shadcn/ui (New York style)
- Lucide React (icons)

**Charts:**
- Recharts v3.4.1

**Date Handling:**
- date-fns v4.1.0

**OAuth Integrations:**
- Nango (@nangohq/frontend, @nangohq/node)
- Platforms: Google Ads, Meta Ads, Google Analytics

**Other:**
- clsx, tailwind-merge for class utilities
- class-variance-authority for component variants

---

## 7. NEXT STEPS FOR AGENCY DASHBOARD

### 7.1 Phase 1: Data Model & Health Logic

1. Create migration for `client_health_status` table
2. Create migration for `client_tasks` table (if separating from action_points)
3. Implement health calculation logic in `src/lib/health/calculations.ts`
4. Create API endpoints for health status

### 7.2 Phase 2: Backend APIs

1. `GET /api/clients/health` - Returns all clients with health status
2. `GET /api/clients/[id]/health` - Detailed health breakdown
3. `GET /api/agency/metrics` - Summary metrics
4. Potentially add caching (Redis/Vercel KV) for expensive calculations

### 7.3 Phase 3: UI Components

1. Create `AgencyDashboardGrid` component
2. Create `ClientHealthCard` component (with traffic light)
3. Create health filter/sort controls
4. Add quick stats cards
5. Implement click → client dashboard navigation

### 7.4 Phase 4: Integration

1. Update routing (decide if `/` or `/agency` or replace `/dashboard`)
2. Update navigation to include agency dashboard link
3. Test with real data
4. Add loading states and error handling

---

## 8. FILE PATHS REFERENCE

### Key Files for Development

**Database:**
- Schema types: `src/types/database.ts`
- Database functions: `src/lib/db/plans.ts`
- Supabase client: `src/lib/supabase/client.ts`
- Migrations: `supabase/migrations/`

**Pages:**
- Main dashboard: `src/app/dashboard/page.tsx`
- Client dashboard: `src/app/clients/[id]/new-client-dashboard/page.tsx`
- Plan dashboard: `src/app/plans/[id]/dashboard/page.tsx`

**Components:**
- UI primitives: `src/components/ui/`
- Todo list: `src/components/ActionPointsTodoList.tsx`
- Media channels: `src/components/MediaChannels.tsx`

**API:**
- Action points: `src/app/api/action-points/route.ts`
- Ad integrations: `src/app/api/ads/`
- Connections: `src/app/api/connections/`

**Utilities:**
- Pacing calculations: `src/lib/utils/pacing-calculations.ts`
- Analytics integration: `src/lib/api/analytics-data-integration.ts`
- Spend integration: `src/lib/api/spend-data-integration.ts`

---

## 9. RECOMMENDATIONS

### 9.1 Immediate Priorities

1. **Define Health Criteria:** Agree on exact rules for red/amber/green before building
2. **Create Data Model:** Add `client_health_status` and `client_tasks` tables
3. **Build Health Calculator:** Centralized function to compute health from various signals
4. **API First:** Build and test health APIs before UI

### 9.2 Design Decisions Needed

1. **Task Tracking:** Use existing `action_points` or create new `client_tasks`?
2. **Health Calculation:** Real-time or cached?
3. **Dashboard Route:** Replace `/dashboard` or add new route?
4. **Multi-tenancy:** Plan for future team/agency support now or defer?

### 9.3 Code Quality

**Strengths:**
- Clean component structure
- Type safety with TypeScript
- Good separation of concerns (db layer, API routes, components)

**Areas to Improve:**
- Add error boundaries
- Add loading skeletons (some exist, could be more consistent)
- Consider adding tests (none currently)
- Some repetition in API route auth checks (could extract middleware)

---

## END OF AUDIT

This audit provides a comprehensive snapshot of the Plan Check application as of February 9, 2026. The application has a solid foundation with client management, media planning, ad integration, and task tracking. The main gaps for building an agency dashboard are:

1. **Health status tracking and calculation**
2. **Aggregated client metrics**
3. **Agency-level dashboard page**
4. **Enhanced task tracking per client/channel**

All necessary building blocks (auth, database, UI components, charting) are in place. The new feature can be built incrementally without major refactoring.
