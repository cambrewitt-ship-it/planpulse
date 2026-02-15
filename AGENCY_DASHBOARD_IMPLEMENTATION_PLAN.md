# Master Agency Dashboard - Implementation Plan

**Date:** February 9, 2026  
**Status:** Planning Phase  
**Purpose:** Traffic light health status system for all clients

---

## EXECUTIVE SUMMARY

This plan details the implementation of a Master Agency Dashboard that displays all clients with color-coded health status (red/amber/green). The system will aggregate data from channels, action points, budgets, and tasks to provide at-a-glance agency oversight.

**Key Features:**
- Traffic light health status per client
- Aggregated metrics (budget, tasks, channels)
- Filterable/sortable client table
- Per-client health breakdown
- Automated health calculation

---

## 1. DATABASE SCHEMA DESIGN

### 1.1 New Tables

#### Table: `client_health_status`

Stores computed health metrics for each client.

```sql
CREATE TABLE client_health_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('green', 'amber', 'red')),
    active_channel_count INTEGER NOT NULL DEFAULT 0,
    total_overdue_tasks INTEGER NOT NULL DEFAULT 0,
    at_risk_tasks INTEGER NOT NULL DEFAULT 0,
    total_budget_cents BIGINT NOT NULL DEFAULT 0,
    total_spent_cents BIGINT NOT NULL DEFAULT 0,
    budget_health_percentage NUMERIC(5,2),
    next_critical_date DATE,
    next_critical_task TEXT,
    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(client_id)
);

CREATE INDEX idx_client_health_status_client_id ON client_health_status(client_id);
CREATE INDEX idx_client_health_status_status ON client_health_status(status);
CREATE INDEX idx_client_health_next_critical ON client_health_status(next_critical_date);
```

**Field Explanations:**
- `status`: Red/amber/green health indicator
- `active_channel_count`: Number of channels with active media plans
- `total_overdue_tasks`: Tasks past their due date
- `at_risk_tasks`: Tasks due within 7 days
- `total_budget_cents`: Sum of budgets across all active plans
- `total_spent_cents`: Sum of actual spend from weekly_plans
- `budget_health_percentage`: (spent / budget) * 100
- `next_critical_date`: Nearest upcoming deadline
- `next_critical_task`: Description of that deadline
- `last_calculated_at`: When health was last computed

#### Table: `client_tasks`

Per-client/per-channel task tracking (separate from action_points templates).

```sql
CREATE TABLE client_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL CHECK (task_type IN ('setup', 'health_check')),
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    frequency TEXT CHECK (frequency IN ('daily', 'weekly', 'fortnightly', 'monthly')),
    last_completed_at TIMESTAMPTZ,
    next_due_date DATE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_client_tasks_client_id ON client_tasks(client_id);
CREATE INDEX idx_client_tasks_channel_id ON client_tasks(channel_id);
CREATE INDEX idx_client_tasks_due_date ON client_tasks(due_date);
CREATE INDEX idx_client_tasks_next_due_date ON client_tasks(next_due_date);
CREATE INDEX idx_client_tasks_assigned_to ON client_tasks(assigned_to);
CREATE INDEX idx_client_tasks_completed ON client_tasks(completed);
```

**Field Explanations:**
- `task_type`: 'setup' = one-time pre-launch tasks, 'health_check' = recurring monitoring
- `due_date`: For setup tasks (fixed date)
- `frequency`: For health_check tasks (how often they recur)
- `next_due_date`: Computed next occurrence for recurring tasks
- `last_completed_at`: When task was last marked complete
- `channel_id`: Nullable - some tasks are client-level, not channel-specific

### 1.2 Migration Scripts

#### Migration: `20260209_create_client_health_status.sql`

```sql
-- Migration: Create client_health_status table
-- Purpose: Store computed health metrics for Master Agency Dashboard

CREATE TABLE client_health_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('green', 'amber', 'red')),
    active_channel_count INTEGER NOT NULL DEFAULT 0,
    total_overdue_tasks INTEGER NOT NULL DEFAULT 0,
    at_risk_tasks INTEGER NOT NULL DEFAULT 0,
    total_budget_cents BIGINT NOT NULL DEFAULT 0,
    total_spent_cents BIGINT NOT NULL DEFAULT 0,
    budget_health_percentage NUMERIC(5,2),
    next_critical_date DATE,
    next_critical_task TEXT,
    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(client_id)
);

CREATE INDEX idx_client_health_status_client_id ON client_health_status(client_id);
CREATE INDEX idx_client_health_status_status ON client_health_status(status);
CREATE INDEX idx_client_health_next_critical ON client_health_status(next_critical_date);

-- RLS Policies
ALTER TABLE client_health_status ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read all health status
CREATE POLICY "Authenticated users can read client health status"
    ON client_health_status
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Authenticated users can insert health status
CREATE POLICY "Authenticated users can insert client health status"
    ON client_health_status
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy: Authenticated users can update health status
CREATE POLICY "Authenticated users can update client health status"
    ON client_health_status
    FOR UPDATE
    TO authenticated
    USING (true);

-- Policy: Authenticated users can delete health status
CREATE POLICY "Authenticated users can delete client health status"
    ON client_health_status
    FOR DELETE
    TO authenticated
    USING (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_client_health_status_updated_at
    BEFORE UPDATE ON client_health_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

#### Migration: `20260209_create_client_tasks.sql`

```sql
-- Migration: Create client_tasks table
-- Purpose: Per-client/per-channel task tracking for health calculations

CREATE TABLE client_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL CHECK (task_type IN ('setup', 'health_check')),
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    frequency TEXT CHECK (frequency IN ('daily', 'weekly', 'fortnightly', 'monthly')),
    last_completed_at TIMESTAMPTZ,
    next_due_date DATE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_client_tasks_client_id ON client_tasks(client_id);
CREATE INDEX idx_client_tasks_channel_id ON client_tasks(channel_id);
CREATE INDEX idx_client_tasks_due_date ON client_tasks(due_date);
CREATE INDEX idx_client_tasks_next_due_date ON client_tasks(next_due_date);
CREATE INDEX idx_client_tasks_assigned_to ON client_tasks(assigned_to);
CREATE INDEX idx_client_tasks_completed ON client_tasks(completed);

-- RLS Policies
ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read all tasks
CREATE POLICY "Authenticated users can read client tasks"
    ON client_tasks
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Authenticated users can insert tasks
CREATE POLICY "Authenticated users can insert client tasks"
    ON client_tasks
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy: Authenticated users can update tasks
CREATE POLICY "Authenticated users can update client tasks"
    ON client_tasks
    FOR UPDATE
    TO authenticated
    USING (true);

-- Policy: Authenticated users can delete tasks
CREATE POLICY "Authenticated users can delete client tasks"
    ON client_tasks
    FOR DELETE
    TO authenticated
    USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_client_tasks_updated_at
    BEFORE UPDATE ON client_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add constraint: setup tasks should have due_date, health_check tasks should have frequency
-- (This is a soft rule - enforced in application logic, not database)
```

### 1.3 TypeScript Type Definitions

Add to `src/types/database.ts`:

```typescript
// Add to Database.public.Tables:

client_health_status: {
  Row: {
    id: string;
    client_id: string;
    status: 'green' | 'amber' | 'red';
    active_channel_count: number;
    total_overdue_tasks: number;
    at_risk_tasks: number;
    total_budget_cents: number;
    total_spent_cents: number;
    budget_health_percentage: number | null;
    next_critical_date: string | null;
    next_critical_task: string | null;
    last_calculated_at: string;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    client_id: string;
    status: 'green' | 'amber' | 'red';
    active_channel_count?: number;
    total_overdue_tasks?: number;
    at_risk_tasks?: number;
    total_budget_cents?: number;
    total_spent_cents?: number;
    budget_health_percentage?: number | null;
    next_critical_date?: string | null;
    next_critical_task?: string | null;
    last_calculated_at?: string;
  };
  Update: {
    id?: string;
    client_id?: string;
    status?: 'green' | 'amber' | 'red';
    active_channel_count?: number;
    total_overdue_tasks?: number;
    at_risk_tasks?: number;
    total_budget_cents?: number;
    total_spent_cents?: number;
    budget_health_percentage?: number | null;
    next_critical_date?: string | null;
    next_critical_task?: string | null;
    last_calculated_at?: string;
  };
};

client_tasks: {
  Row: {
    id: string;
    client_id: string;
    channel_id: string | null;
    task_type: 'setup' | 'health_check';
    title: string;
    description: string | null;
    due_date: string | null;
    frequency: 'daily' | 'weekly' | 'fortnightly' | 'monthly' | null;
    last_completed_at: string | null;
    next_due_date: string | null;
    completed: boolean;
    assigned_to: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    client_id: string;
    channel_id?: string | null;
    task_type: 'setup' | 'health_check';
    title: string;
    description?: string | null;
    due_date?: string | null;
    frequency?: 'daily' | 'weekly' | 'fortnightly' | 'monthly' | null;
    last_completed_at?: string | null;
    next_due_date?: string | null;
    completed?: boolean;
    assigned_to?: string | null;
  };
  Update: {
    id?: string;
    client_id?: string;
    channel_id?: string | null;
    task_type?: 'setup' | 'health_check';
    title?: string;
    description?: string | null;
    due_date?: string | null;
    frequency?: 'daily' | 'weekly' | 'fortnightly' | 'monthly' | null;
    last_completed_at?: string | null;
    next_due_date?: string | null;
    completed?: boolean;
    assigned_to?: string | null;
  };
};
```

---

## 2. HEALTH CALCULATION LOGIC

### 2.1 File Structure

Create: `src/lib/health/calculations.ts`

### 2.2 Health Status Criteria

#### Channel Health Rules

**RED (Critical Issues):**
- 2+ overdue tasks
- Setup incomplete AND <3 days until channel start date
- Budget variance >20% (over or under)
- 0 budget planned but channel is active
- No activity in last 30 days (for active channels)

**AMBER (Warning):**
- 1 overdue task
- 2+ tasks due within next 3 days
- Setup incomplete AND <7 days until channel start date
- Budget variance 10-20%
- At least 1 health check missed

**GREEN (Healthy):**
- No overdue tasks
- Setup complete OR start date >7 days away
- Budget variance <10%
- All health checks completed on schedule

#### Client Health Rules

**Status Inheritance:**
- Client status = worst channel status
- If ANY channel is RED → client is RED
- If ANY channel is AMBER (and none RED) → client is AMBER
- If ALL channels are GREEN → client is GREEN
- If client has no channels → status based on client-level tasks only

### 2.3 Function Specifications

#### `calculateChannelHealth(channelId: string): Promise<ChannelHealth>`

**Returns:**
```typescript
interface ChannelHealth {
  channelId: string;
  status: 'red' | 'amber' | 'green';
  reasons: string[];
  metrics: {
    overdueTaskCount: number;
    atRiskTaskCount: number;
    budgetVariancePercent: number;
    setupComplete: boolean;
    daysUntilStart: number | null;
    lastActivityDate: string | null;
  };
}
```

**Logic Steps:**
1. Fetch channel details (start_date, type, etc.)
2. Query client_tasks for this channel_id
3. Count overdue tasks (due_date < today OR next_due_date < today)
4. Count at-risk tasks (due_date/next_due_date within 7 days)
5. Calculate budget variance from weekly_plans (sum actual vs sum planned)
6. Check if setup tasks are complete
7. Calculate days until channel start_date
8. Apply red/amber/green rules
9. Return status with reasons array

#### `calculateClientHealth(clientId: string): Promise<ClientHealthStatus>`

**Returns:**
```typescript
interface ClientHealthStatus {
  clientId: string;
  status: 'red' | 'amber' | 'green';
  activeChannelCount: number;
  totalOverdueTasks: number;
  atRiskTasks: number;
  totalBudgetCents: number;
  totalSpentCents: number;
  budgetHealthPercentage: number | null;
  nextCriticalDate: string | null;
  nextCriticalTask: string | null;
  channelHealthDetails: ChannelHealth[];
}
```

**Logic Steps:**
1. Fetch all channels for client with active media_plans
2. For each channel, call calculateChannelHealth()
3. Determine client status (worst channel status)
4. Aggregate metrics:
   - activeChannelCount = number of channels
   - totalOverdueTasks = sum across all channels
   - atRiskTasks = sum across all channels
   - totalBudgetCents = sum of all media_plans.total_budget for active plans
   - totalSpentCents = sum of all weekly_plans.budget_actual for those plans
5. Find next critical date (earliest due_date or next_due_date across all tasks)
6. Return aggregated health status

#### `refreshClientHealth(clientId: string): Promise<void>`

**Logic:**
1. Call calculateClientHealth(clientId)
2. Upsert into client_health_status table:
   - If record exists for client_id, UPDATE
   - If not, INSERT
3. Set last_calculated_at = NOW()

#### `refreshAllClientHealth(): Promise<void>`

**Logic:**
1. Fetch all client IDs from clients table
2. For each client, call refreshClientHealth(clientId)
3. Log results (success/failure count)
4. Can be triggered by cron job or manual API call

### 2.4 Helper Functions

```typescript
// Calculate budget variance percentage
function calculateBudgetVariance(planned: number, actual: number): number {
  if (planned === 0) return 0;
  return ((actual - planned) / planned) * 100;
}

// Check if date is within X days
function isWithinDays(date: Date, days: number): boolean {
  const diffMs = date.getTime() - new Date().getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
}

// Get next due date for recurring task
function calculateNextDueDate(
  lastCompleted: Date | null,
  frequency: 'daily' | 'weekly' | 'fortnightly' | 'monthly'
): Date {
  const baseDate = lastCompleted || new Date();
  // Add frequency interval to baseDate
  // Return next occurrence
}

// Count overdue tasks
function countOverdueTasks(tasks: ClientTask[]): number {
  const today = new Date();
  return tasks.filter(task => {
    if (task.completed) return false;
    const dueDate = task.due_date || task.next_due_date;
    if (!dueDate) return false;
    return new Date(dueDate) < today;
  }).length;
}
```

---

## 3. API ARCHITECTURE

### 3.1 Endpoint: `GET /api/agency/clients`

**Purpose:** Fetch all clients with health status

**File:** `src/app/api/agency/clients/route.ts`

**Query Parameters:**
- `status` (optional): Filter by health status ('red', 'amber', 'green')
- `sort` (optional): Sort field ('name', 'status', 'budget', 'updated_at')
- `order` (optional): Sort order ('asc', 'desc')

**Response:**
```typescript
{
  clients: Array<{
    id: string;
    name: string;
    notes: string | null;
    health: {
      status: 'red' | 'amber' | 'green';
      activeChannelCount: number;
      totalOverdueTasks: number;
      atRiskTasks: number;
      totalBudgetCents: number;
      totalSpentCents: number;
      budgetHealthPercentage: number | null;
      nextCriticalDate: string | null;
      nextCriticalTask: string | null;
      lastCalculatedAt: string;
    } | null;
    created_at: string;
    updated_at: string;
  }>;
}
```

**Logic:**
1. Get authenticated user
2. Query clients table
3. Left join client_health_status
4. Apply status filter if provided
5. Apply sorting
6. Return array

### 3.2 Endpoint: `GET /api/agency/metrics`

**Purpose:** Summary metrics for agency dashboard

**File:** `src/app/api/agency/metrics/route.ts`

**Response:**
```typescript
{
  totalClients: number;
  clientsByStatus: {
    red: number;
    amber: number;
    green: number;
    unknown: number; // clients without health status yet
  };
  totalBudgetCents: number;
  totalSpentCents: number;
  totalOverdueTasks: number;
  totalAtRiskTasks: number;
  lastUpdated: string;
}
```

**Logic:**
1. Get authenticated user
2. Count total clients
3. Count clients by health status (group by status)
4. Sum total_budget_cents and total_spent_cents across all client_health_status records
5. Sum total_overdue_tasks and at_risk_tasks
6. Return aggregated metrics

### 3.3 Endpoint: `GET /api/clients/[id]/health`

**Purpose:** Detailed health breakdown for one client

**File:** `src/app/api/clients/[id]/health/route.ts`

**Response:**
```typescript
{
  client: {
    id: string;
    name: string;
  };
  health: {
    status: 'red' | 'amber' | 'green';
    activeChannelCount: number;
    totalOverdueTasks: number;
    atRiskTasks: number;
    totalBudgetCents: number;
    totalSpentCents: number;
    budgetHealthPercentage: number | null;
    nextCriticalDate: string | null;
    nextCriticalTask: string | null;
    lastCalculatedAt: string;
  };
  channels: Array<{
    id: string;
    channel: string;
    detail: string;
    status: 'red' | 'amber' | 'green';
    reasons: string[];
    metrics: {
      overdueTaskCount: number;
      atRiskTaskCount: number;
      budgetVariancePercent: number;
    };
  }>;
  tasks: Array<{
    id: string;
    title: string;
    taskType: 'setup' | 'health_check';
    dueDate: string | null;
    nextDueDate: string | null;
    completed: boolean;
    isOverdue: boolean;
    isAtRisk: boolean;
  }>;
}
```

**Logic:**
1. Get authenticated user
2. Fetch client by ID
3. Fetch client_health_status record
4. Call calculateClientHealth(id) to get detailed breakdown
5. Fetch all client_tasks for this client
6. Return comprehensive health data

### 3.4 Endpoint: `POST /api/clients/[id]/health/refresh`

**Purpose:** Manually trigger health recalculation for one client

**File:** `src/app/api/clients/[id]/health/route.ts`

**Request Body:** None

**Response:**
```typescript
{
  success: true;
  health: {
    status: 'red' | 'amber' | 'green';
    // ... full health status object
  };
}
```

**Logic:**
1. Get authenticated user
2. Validate client_id exists
3. Call refreshClientHealth(client_id)
4. Return updated health status

### 3.5 Endpoint: `POST /api/agency/health/refresh-all`

**Purpose:** Recalculate health for all clients (admin/cron trigger)

**File:** `src/app/api/agency/health/refresh-all/route.ts`

**Response:**
```typescript
{
  success: true;
  processedCount: number;
  failedCount: number;
  duration: number; // milliseconds
}
```

**Logic:**
1. Get authenticated user (consider adding admin check later)
2. Call refreshAllClientHealth()
3. Return summary stats

---

## 4. UI COMPONENT ARCHITECTURE

### 4.1 Page Component: `AgencyDashboard`

**Location:** `src/app/agency/page.tsx`

**Layout:**
```
+------------------------------------------------------------------+
| Top Navigation Bar                                               |
+------------------------------------------------------------------+
|                                                                  |
|  Agency Dashboard                                    [Refresh]   |
|                                                                  |
|  +-------------+  +-------------+  +-------------+  +---------+  |
|  | Total       |  | Red: 3      |  | Amber: 5    |  | Green: |  |
|  | Clients: 20 |  | Critical    |  | Warning     |  | 12 OK  |  |
|  +-------------+  +-------------+  +-------------+  +---------+  |
|                                                                  |
|  +-------------+  +-------------+                                |
|  | Overdue     |  | At Risk     |                                |
|  | Tasks: 15   |  | Tasks: 28   |                                |
|  +-------------+  +-------------+                                |
|                                                                  |
|  Filter: [All ▼]  Sort: [Name ▼]  Search: [________]            |
|                                                                  |
|  +------------------------------------------------------------+  |
|  | CLIENT TABLE                                               |  |
|  | Status | Client Name      | Channels | Overdue | At Risk |  |
|  |--------|------------------|----------|---------|---------|  |
|  |   🔴   | Acme Corp        |    3     |    5    |    8    |  |
|  |   🟢   | TechStart Inc    |    2     |    0    |    1    |  |
|  |   🟡   | BuildCo          |    4     |    2    |    5    |  |
|  +------------------------------------------------------------+  |
|                                                                  |
+------------------------------------------------------------------+
```

**State Management:**
```typescript
const [clients, setClients] = useState<ClientWithHealth[]>([]);
const [metrics, setMetrics] = useState<AgencyMetrics | null>(null);
const [loading, setLoading] = useState(true);
const [statusFilter, setStatusFilter] = useState<'all' | 'red' | 'amber' | 'green'>('all');
const [sortBy, setSortBy] = useState<'name' | 'status' | 'budget'>('name');
const [searchQuery, setSearchQuery] = useState('');
```

**Data Fetching:**
```typescript
useEffect(() => {
  async function loadData() {
    const [clientsRes, metricsRes] = await Promise.all([
      fetch('/api/agency/clients'),
      fetch('/api/agency/metrics')
    ]);
    setClients(await clientsRes.json());
    setMetrics(await metricsRes.json());
    setLoading(false);
  }
  loadData();
}, []);
```

### 4.2 Component: `AgencyMetricsCards`

**Location:** `src/components/agency/AgencyMetricsCards.tsx`

**Props:**
```typescript
interface AgencyMetricsCardsProps {
  metrics: {
    totalClients: number;
    clientsByStatus: {
      red: number;
      amber: number;
      green: number;
      unknown: number;
    };
    totalOverdueTasks: number;
    totalAtRiskTasks: number;
  };
}
```

**Layout:**
- Grid of 6 cards (3 columns on desktop, 2 on tablet, 1 on mobile)
- Use existing `Card` component from shadcn
- Each card: large number + label + optional icon
- Cards for status counts: include colored circle indicator

**Example Card:**
```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-sm font-medium text-muted-foreground">
      Critical Clients
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div className="flex items-center space-x-2">
      <div className="h-3 w-3 rounded-full bg-red-500" />
      <span className="text-3xl font-bold">{metrics.clientsByStatus.red}</span>
    </div>
  </CardContent>
</Card>
```

### 4.3 Component: `ClientHealthTable`

**Location:** `src/components/agency/ClientHealthTable.tsx`

**Props:**
```typescript
interface ClientHealthTableProps {
  clients: Array<{
    id: string;
    name: string;
    health: ClientHealthStatus | null;
  }>;
  onClientClick: (clientId: string) => void;
}
```

**Features:**
- Table with sortable columns
- Click row → navigate to `/clients/[id]/new-client-dashboard`
- Mobile: switch to card layout (stacked)
- Empty state: "No clients found" with call-to-action

**Columns:**
1. **Status** - Traffic light (TrafficLight component)
2. **Client Name** - Bold, clickable
3. **Active Channels** - Number badge
4. **Overdue Tasks** - Red text if >0
5. **At Risk Tasks** - Amber text if >0
6. **Budget Health** - Percentage (green <90%, amber 90-110%, red >110%)
7. **Next Critical** - Date + task title (truncated)

**Desktop Table:**
```tsx
<table className="w-full">
  <thead>
    <tr>
      <th>Status</th>
      <th>Client</th>
      <th>Channels</th>
      <th>Overdue</th>
      <th>At Risk</th>
      <th>Budget</th>
      <th>Next Critical</th>
    </tr>
  </thead>
  <tbody>
    {clients.map(client => (
      <tr
        key={client.id}
        onClick={() => onClientClick(client.id)}
        className="cursor-pointer hover:bg-muted"
      >
        <td><TrafficLight status={client.health?.status} /></td>
        <td className="font-semibold">{client.name}</td>
        <td>{client.health?.activeChannelCount || 0}</td>
        <td className={client.health?.totalOverdueTasks > 0 ? 'text-red-600' : ''}>
          {client.health?.totalOverdueTasks || 0}
        </td>
        {/* ... more cells */}
      </tr>
    ))}
  </tbody>
</table>
```

**Mobile Card Layout:**
```tsx
<div className="space-y-4">
  {clients.map(client => (
    <Card key={client.id} onClick={() => onClientClick(client.id)}>
      <CardHeader className="flex flex-row items-center space-x-3">
        <TrafficLight status={client.health?.status} />
        <CardTitle>{client.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>Channels: {client.health?.activeChannelCount}</div>
          <div>Overdue: {client.health?.totalOverdueTasks}</div>
          {/* ... more fields */}
        </div>
      </CardContent>
    </Card>
  ))}
</div>
```

### 4.4 Component: `TrafficLight`

**Location:** `src/components/agency/TrafficLight.tsx`

**Props:**
```typescript
interface TrafficLightProps {
  status: 'red' | 'amber' | 'green' | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}
```

**Variants:**
- `sm`: 12px circle (for table cells)
- `md`: 16px circle (default)
- `lg`: 24px circle (for cards, headers)

**Colors:**
- Green: `#22c55e` (Tailwind green-500)
- Amber: `#f59e0b` (Tailwind amber-500)
- Red: `#ef4444` (Tailwind red-500)
- Null/undefined: `#9ca3af` (Tailwind gray-400)

**Implementation:**
```tsx
export function TrafficLight({ status, size = 'md', showLabel = false }: TrafficLightProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-6 w-6',
  };

  const colorClasses = {
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    green: 'bg-green-500',
  };

  const color = status ? colorClasses[status] : 'bg-gray-400';

  return (
    <div className="flex items-center space-x-2">
      <div className={`rounded-full ${sizeClasses[size]} ${color}`} />
      {showLabel && status && (
        <span className="text-sm capitalize">{status}</span>
      )}
    </div>
  );
}
```

### 4.5 Component: `ClientHealthDetail`

**Location:** `src/components/agency/ClientHealthDetail.tsx`

**Purpose:** Detailed health breakdown (used in modal or dedicated page)

**Props:**
```typescript
interface ClientHealthDetailProps {
  clientId: string;
}
```

**Sections:**
1. **Overall Health Card** - Large traffic light + status summary
2. **Metrics Grid** - Budget health, task counts, channel count
3. **Channel Health List** - Each channel with its own traffic light + reasons
4. **Task List** - All tasks grouped by status (overdue, at-risk, upcoming, complete)

**Fetches:** `GET /api/clients/[id]/health`

---

## 5. IMPLEMENTATION PHASES

### Phase 1: Database Setup ✓

**Goal:** Create tables and types

**Tasks:**
1. Create migration `20260209_create_client_health_status.sql`
2. Create migration `20260209_create_client_tasks.sql`
3. Run migrations locally: `npx supabase migration up`
4. Add TypeScript types to `src/types/database.ts`
5. Verify tables exist in Supabase dashboard

**Acceptance Criteria:**
- Both tables exist with correct schemas
- RLS policies are active
- TypeScript has no compilation errors
- Can insert/query test data manually

**Estimated Time:** 1 hour

---

### Phase 2: Health Calculation Logic ✓

**Goal:** Implement core health calculation functions

**Tasks:**
1. Create `src/lib/health/calculations.ts`
2. Implement helper functions:
   - `countOverdueTasks()`
   - `calculateBudgetVariance()`
   - `isWithinDays()`
3. Implement `calculateChannelHealth(channelId)`
4. Implement `calculateClientHealth(clientId)`
5. Implement `refreshClientHealth(clientId)`
6. Implement `refreshAllClientHealth()`
7. Add unit tests (optional but recommended)

**Acceptance Criteria:**
- Functions compile without errors
- Can call `calculateClientHealth()` with test client ID
- Returns expected health status object
- Correctly identifies red/amber/green based on test data

**Estimated Time:** 2-3 hours

---

### Phase 3: API Endpoints ✓

**Goal:** Expose health data via REST APIs

**Tasks:**
1. Create `src/app/api/agency/clients/route.ts`
   - Implement GET handler
   - Add status filtering
   - Add sorting
2. Create `src/app/api/agency/metrics/route.ts`
   - Implement GET handler
   - Aggregate metrics across all clients
3. Create `src/app/api/clients/[id]/health/route.ts`
   - Implement GET handler (detail view)
   - Implement POST handler (refresh)
4. Create `src/app/api/agency/health/refresh-all/route.ts`
   - Implement POST handler
5. Test all endpoints with Postman/curl

**Acceptance Criteria:**
- All endpoints return 200 on success
- Data structure matches TypeScript interfaces
- Filtering and sorting work correctly
- Refresh endpoints update database

**Estimated Time:** 2-3 hours

---

### Phase 4: UI Components - Foundation ✓

**Goal:** Build reusable UI components

**Tasks:**
1. Create `src/components/agency/TrafficLight.tsx`
   - Implement size variants
   - Test with different statuses
2. Create `src/components/agency/AgencyMetricsCards.tsx`
   - Use shadcn Card component
   - Display metrics in grid
   - Add loading skeleton
3. Test components with Storybook or in isolation

**Acceptance Criteria:**
- TrafficLight renders correctly in all sizes
- MetricsCards display mock data correctly
- Components are responsive
- Loading states work

**Estimated Time:** 1-2 hours

---

### Phase 5: UI Components - Table ✓

**Goal:** Build client health table

**Tasks:**
1. Create `src/components/agency/ClientHealthTable.tsx`
2. Implement desktop table layout
3. Implement mobile card layout (responsive)
4. Add sorting controls
5. Add click handlers
6. Add empty state
7. Add loading skeleton

**Acceptance Criteria:**
- Table displays client data correctly
- Sorting works on each column
- Clicking row navigates to client dashboard
- Responsive: switches to cards on mobile
- Loading skeleton shows while fetching

**Estimated Time:** 2-3 hours

---

### Phase 6: Page Integration ✓

**Goal:** Create agency dashboard page and wire up components

**Tasks:**
1. Create `src/app/agency/page.tsx`
2. Fetch data from `/api/agency/clients` and `/api/agency/metrics`
3. Render AgencyMetricsCards with metrics data
4. Render ClientHealthTable with clients data
5. Add page header with title and refresh button
6. Add status filter dropdown
7. Add search input
8. Implement client click → navigate to `/clients/[id]/new-client-dashboard`
9. Add loading state (show skeletons)
10. Add error state

**Acceptance Criteria:**
- Page loads and displays real data
- Metrics cards show correct counts
- Table shows all clients with health status
- Filter by status works
- Search filters clients by name
- Clicking client navigates correctly
- Loading and error states work

**Estimated Time:** 2-3 hours

---

### Phase 7: Navigation & Polish ✓

**Goal:** Integrate into app navigation and add finishing touches

**Tasks:**
1. Update `src/components/navigation/TopBar.tsx` to include "Agency" link
2. Decide: Replace `/dashboard` or keep both?
   - Option A: Replace `/dashboard` route with agency dashboard
   - Option B: Keep both, add link in navigation
3. Add auto-refresh (every 5 minutes) to agency dashboard page
4. Add manual refresh button with loading indicator
5. Add tooltips to explain traffic light statuses
6. Test with multiple clients (create seed data if needed)
7. Responsive design review on mobile/tablet
8. Add keyboard navigation (arrow keys in table)
9. Add "View Details" button to expand health info inline (optional)

**Acceptance Criteria:**
- Navigation includes agency dashboard link
- Auto-refresh works without flickering
- Manual refresh button provides feedback
- Tooltips explain red/amber/green criteria
- Works on mobile, tablet, desktop
- Keyboard navigation works

**Estimated Time:** 2-3 hours

---

### Phase 8: Advanced Features (Optional) ✓

**Goal:** Add nice-to-have features

**Tasks:**
1. Export to CSV functionality
2. Bulk actions (e.g., "Refresh all clients")
3. Health status history (trending over time)
4. Email alerts for status changes (red → amber, etc.)
5. Add account manager field to clients table
6. Filter by account manager
7. Add client tags/categories
8. Scheduled health refresh (cron job)

**Acceptance Criteria:**
- Each feature works independently
- No performance degradation
- User can opt-in to email alerts

**Estimated Time:** 3-5 hours per feature

---

## 6. QUESTIONS TO RESOLVE

### Question 1: Account Manager Field

**Should we add `account_manager_id` to the `clients` table?**

**Options:**
- **A:** Yes, add `account_manager_id UUID REFERENCES auth.users(id)` to clients
  - Pros: Easy to filter by account manager, shows "Assigned To" in table
  - Cons: Requires migration, need UI to assign managers
- **B:** No, defer to later phase
  - Pros: Simpler initial implementation
  - Cons: Can't filter by manager

**Recommendation:** Add in Phase 1 (database setup) - it's a simple field that adds value immediately.

**Migration snippet:**
```sql
ALTER TABLE clients
ADD COLUMN account_manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_clients_account_manager ON clients(account_manager_id);
```

---

### Question 2: Dashboard Route

**Should agency dashboard replace `/dashboard` or be a new route `/agency`?**

**Options:**
- **A:** Replace `/dashboard` (route becomes the new default)
  - Pros: One dashboard to maintain, clear default landing page
  - Cons: Lose the existing todo list sidebar view
- **B:** New route `/agency`, keep existing `/dashboard`
  - Pros: Preserve existing functionality, users can choose
  - Cons: Two similar dashboards to maintain
- **C:** Replace `/dashboard` but integrate ActionPointsTodoList into new agency dashboard
  - Pros: Best of both worlds
  - Cons: Slightly more complex layout

**Recommendation:** Option C - Replace `/dashboard` with agency dashboard, add ActionPointsTodoList as a collapsible sidebar or secondary view.

---

### Question 3: Health Calculation Timing

**Do we want real-time health calculation or cached/scheduled?**

**Options:**
- **A:** Real-time calculation on every page load
  - Pros: Always up-to-date, no stale data
  - Cons: Slower page load (multiple queries per client), expensive at scale
- **B:** Cached with manual refresh
  - Pros: Fast page load, user controls freshness
  - Cons: Data can be stale, requires user action
- **C:** Background scheduled refresh (cron job every 5-15 minutes)
  - Pros: Balance of freshness and performance, automatic
  - Cons: Need cron infrastructure (Vercel Cron, external service)
- **D:** Hybrid: Calculate on page load + cache for 5 minutes, refresh in background
  - Pros: Best user experience, always reasonably fresh
  - Cons: Most complex implementation

**Recommendation:** Start with Option B (cached + manual refresh) in Phase 1-7. Add Option C (cron) in Phase 8.

---

### Question 4: Task Tracking System

**Should we use existing `action_points` table or create separate `client_tasks`?**

**Current Situation:**
- `action_points` is template-based (by `channel_type`)
- All "Meta Ads" channels share the same action points
- No per-client or per-channel task instances

**Options:**
- **A:** Create new `client_tasks` table (as outlined in this plan)
  - Pros: Clean separation, per-client tracking, keeps templates intact
  - Cons: Need to duplicate data from action_points to client_tasks
- **B:** Add `client_id` and `channel_id` columns to `action_points`
  - Pros: Single table, simpler queries
  - Cons: Conflates templates with instances, harder to distinguish
- **C:** Keep templates in `action_points`, create `client_task_instances` table
  - Pros: Explicit template vs instance separation
  - Cons: More complex relationships

**Recommendation:** Option A (create `client_tasks`) - clearest separation of concerns, easiest to reason about.

**Migration Strategy:**
1. Create `client_tasks` table
2. Write migration to populate it: For each channel, copy relevant action_points as client_tasks
3. Going forward, when a channel is created, instantiate tasks from action_points templates

---

## 7. SUCCESS METRICS

**How do we know the agency dashboard is working?**

1. **Functional Metrics:**
   - All clients display with correct health status
   - Health status updates when underlying data changes
   - Page loads in <2 seconds with 50 clients
   - Filtering and sorting work correctly

2. **User Metrics (post-launch):**
   - Agency managers can identify at-risk clients in <10 seconds
   - Reduced time to respond to client issues
   - Increased visibility into portfolio health

3. **Data Accuracy:**
   - Health status matches manual review of client data
   - No false positives/negatives in red/amber classification
   - Next critical date always shows earliest deadline

---

## 8. TECHNICAL CONSIDERATIONS

### 8.1 Performance

**Potential Bottlenecks:**
- Calculating health for 100+ clients in real-time
- Complex joins across clients → media_plans → channels → weekly_plans → client_tasks

**Optimizations:**
1. **Caching:** Store calculated health in `client_health_status` table (already planned)
2. **Indexes:** Add indexes on foreign keys, status, dates (already included in migrations)
3. **Pagination:** If client count >100, add pagination to table
4. **Lazy loading:** Load health details only when row is expanded
5. **Database views:** Consider creating a materialized view for common queries

### 8.2 Scalability

**Future Growth:**
- 500+ clients per agency
- Multiple agencies (multi-tenancy)
- Historical health tracking (daily snapshots)

**Plan:**
- Phase 1-7: Optimized for <100 clients
- Phase 8: Add pagination, cron-based refresh, consider Redis caching
- Future: Add tenancy model (teams table, client_team_assignments)

### 8.3 Security

**Row Level Security (RLS):**
- Current: All authenticated users see all clients
- Future: Add team-based RLS when multi-tenancy is implemented

**API Authentication:**
- All API routes check for authenticated user via Supabase
- No additional authorization currently (all users = admin)
- Future: Add role-based access control

### 8.4 Error Handling

**Graceful Degradation:**
- If health calculation fails for one client, continue with others
- Show "Unknown" status instead of breaking UI
- Log errors to console/monitoring service
- Display user-friendly error messages

**Retry Logic:**
- API calls should retry on network failure (use fetch with retry)
- Background health refresh should handle partial failures

---

## 9. TESTING STRATEGY

### 9.1 Unit Tests

**Test Health Calculation Logic:**
```typescript
// src/lib/health/__tests__/calculations.test.ts

describe('calculateChannelHealth', () => {
  it('should return RED status when 2+ tasks are overdue', async () => {
    // Mock channel with 2 overdue tasks
    const health = await calculateChannelHealth(mockChannelId);
    expect(health.status).toBe('red');
    expect(health.reasons).toContain('2 overdue tasks');
  });

  it('should return GREEN status when all tasks are on track', async () => {
    // Mock healthy channel
    const health = await calculateChannelHealth(mockChannelId);
    expect(health.status).toBe('green');
  });
});
```

### 9.2 Integration Tests

**Test API Endpoints:**
```typescript
// src/app/api/agency/clients/__tests__/route.test.ts

describe('GET /api/agency/clients', () => {
  it('should return all clients with health status', async () => {
    const response = await fetch('/api/agency/clients');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.clients).toBeInstanceOf(Array);
  });

  it('should filter by status', async () => {
    const response = await fetch('/api/agency/clients?status=red');
    const data = await response.json();
    expect(data.clients.every(c => c.health.status === 'red')).toBe(true);
  });
});
```

### 9.3 Manual Testing Checklist

**Pre-launch Checklist:**
- [ ] Create test clients with varying health statuses
- [ ] Verify traffic lights display correct colors
- [ ] Test filtering (all, red, amber, green)
- [ ] Test sorting (name, status, budget)
- [ ] Test search functionality
- [ ] Test refresh button
- [ ] Test navigation to client dashboard
- [ ] Test on mobile (iPhone, Android)
- [ ] Test on tablet (iPad)
- [ ] Test on desktop (Chrome, Firefox, Safari)
- [ ] Test with slow network (throttle to 3G)
- [ ] Test with no clients (empty state)
- [ ] Test with 50+ clients (performance)

---

## 10. DEPLOYMENT PLAN

### 10.1 Pre-deployment

1. **Code Review:** Review all code changes
2. **Run Tests:** Ensure all tests pass
3. **Database Backup:** Backup production database before migrations
4. **Migration Dry Run:** Test migrations on staging database

### 10.2 Deployment Steps

1. **Push Migrations:**
   ```bash
   npx supabase db push
   ```
2. **Verify Tables:** Check Supabase dashboard for new tables
3. **Initial Health Calculation:**
   ```bash
   curl -X POST https://yourapp.com/api/agency/health/refresh-all
   ```
4. **Deploy Frontend:** Push code to Vercel/production
5. **Verify Deployment:** Visit `/agency` and check data loads correctly

### 10.3 Post-deployment

1. **Monitor Logs:** Check for errors in Vercel logs
2. **Performance Check:** Measure page load time
3. **User Feedback:** Gather feedback from agency managers
4. **Iterate:** Fix any bugs or UX issues

### 10.4 Rollback Plan

If issues arise:
1. **Frontend Rollback:** Revert to previous Vercel deployment
2. **Database Rollback:** Drop new tables (if necessary):
   ```sql
   DROP TABLE IF EXISTS client_tasks;
   DROP TABLE IF EXISTS client_health_status;
   ```
3. **Restore Backup:** If data corruption, restore from backup

---

## 11. FUTURE ENHANCEMENTS

**Post-MVP Features:**

1. **Historical Trending:**
   - Track health status over time
   - Show graphs of health changes
   - Alert when client status degrades

2. **Email Notifications:**
   - Daily digest of red clients
   - Alerts when client goes from green → red
   - Weekly summary report

3. **Advanced Filtering:**
   - Filter by account manager
   - Filter by industry/category
   - Filter by budget range
   - Custom saved filters

4. **Bulk Actions:**
   - Assign multiple clients to account manager
   - Bulk refresh health status
   - Export selected clients to CSV

5. **Predictive Analytics:**
   - Predict which clients will go red
   - Recommend actions to prevent issues
   - ML-based risk scoring

6. **Multi-tenancy:**
   - Multiple agencies in one instance
   - Team-based permissions
   - Agency-level settings

7. **Mobile App:**
   - Native iOS/Android app
   - Push notifications for critical clients
   - Offline support

---

## 12. APPENDIX

### 12.1 Color Palette

**Traffic Light Colors:**
```
Green:  #22c55e (Tailwind green-500)
Amber:  #f59e0b (Tailwind amber-500)
Red:    #ef4444 (Tailwind red-500)
Gray:   #9ca3af (Tailwind gray-400, for unknown)
```

**Status Backgrounds (subtle):**
```
Green:  #f0fdf4 (Tailwind green-50)
Amber:  #fffbeb (Tailwind amber-50)
Red:    #fef2f2 (Tailwind red-50)
```

### 12.2 Sample Health Calculation

**Example Client: Acme Corp**

**Active Channels:**
1. Meta Ads (Facebook/Instagram)
   - Setup: Complete
   - Overdue tasks: 1 (health check missed)
   - Budget: $5,000 planned, $5,200 spent (104%)
   - Status: **AMBER** (1 overdue task, slight over-pacing)

2. Google Ads (Search)
   - Setup: Complete
   - Overdue tasks: 0
   - Budget: $8,000 planned, $7,800 spent (97.5%)
   - Status: **GREEN**

3. LinkedIn Ads
   - Setup: Incomplete (3 days until launch)
   - Overdue tasks: 2 (setup tasks not done)
   - Budget: $3,000 planned, $0 spent
   - Status: **RED** (setup incomplete, critical deadline)

**Client Health:**
- Status: **RED** (worst channel = red)
- Active channels: 3
- Total overdue: 3
- At risk: 5 (including tasks due in next 7 days)
- Budget: $16,000 total, $13,000 spent (81%)
- Next critical: 2026-02-12 (LinkedIn launch, 3 days away)

### 12.3 Sample API Response

**GET /api/agency/clients**

```json
{
  "clients": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Acme Corp",
      "notes": "Major client, requires weekly check-ins",
      "health": {
        "status": "red",
        "activeChannelCount": 3,
        "totalOverdueTasks": 3,
        "atRiskTasks": 5,
        "totalBudgetCents": 1600000,
        "totalSpentCents": 1300000,
        "budgetHealthPercentage": 81.25,
        "nextCriticalDate": "2026-02-12",
        "nextCriticalTask": "Complete LinkedIn Ads setup",
        "lastCalculatedAt": "2026-02-09T10:30:00Z"
      },
      "created_at": "2025-11-01T00:00:00Z",
      "updated_at": "2026-02-08T14:22:00Z"
    }
  ]
}
```

---

## END OF IMPLEMENTATION PLAN

This plan provides a complete roadmap for building the Master Agency Dashboard feature. Each phase can be executed as a single atomic prompt session, following the ATOMIC-PROMPT MODE workflow.

**Next Steps:**
1. Review this plan
2. Answer the 4 questions in Section 6
3. Proceed phase-by-phase, starting with Phase 1 (Database Setup)

**Estimated Total Time:** 15-20 hours across all phases

---

**Document Version:** 1.0  
**Last Updated:** February 9, 2026  
**Status:** Ready for Review
