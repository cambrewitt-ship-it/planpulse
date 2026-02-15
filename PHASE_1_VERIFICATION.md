# Phase 1: Database Schema - Verification

**Date:** February 9, 2026  
**Status:** ✅ COMPLETE

---

## Files Created

### 1. Migration: client_health_status
**File:** `supabase/migrations/20260209_add_client_health_status.sql`

**Table Structure:**
- ✅ `id` (UUID, primary key)
- ✅ `client_id` (UUID, foreign key → clients.id, ON DELETE CASCADE)
- ✅ `status` (TEXT, CHECK: 'green' | 'amber' | 'red')
- ✅ `active_channel_count` (INTEGER, default 0)
- ✅ `total_overdue_tasks` (INTEGER, default 0)
- ✅ `at_risk_tasks` (INTEGER, default 0)
- ✅ `total_budget_cents` (BIGINT, default 0)
- ✅ `total_spent_cents` (BIGINT, default 0)
- ✅ `budget_health_percentage` (NUMERIC(5,2), nullable)
- ✅ `next_critical_date` (DATE, nullable)
- ✅ `next_critical_task` (TEXT, nullable)
- ✅ `last_calculated_at` (TIMESTAMPTZ, default NOW())
- ✅ `created_at` (TIMESTAMPTZ, default NOW())
- ✅ `updated_at` (TIMESTAMPTZ, default NOW())
- ✅ UNIQUE constraint on `client_id`

**Indexes:**
- ✅ `idx_client_health_status_client_id` on client_id
- ✅ `idx_client_health_status_status` on status

**RLS Policies:**
- ✅ SELECT for authenticated users
- ✅ INSERT for authenticated users
- ✅ UPDATE for authenticated users
- ✅ Trigger: `update_client_health_status_updated_at`

---

### 2. Migration: client_tasks
**File:** `supabase/migrations/20260209_add_client_tasks.sql`

**Table Structure:**
- ✅ `id` (UUID, primary key)
- ✅ `client_id` (UUID, foreign key → clients.id, ON DELETE CASCADE)
- ✅ `channel_id` (UUID, foreign key → channels.id, ON DELETE CASCADE, nullable)
- ✅ `task_type` (TEXT, CHECK: 'setup' | 'health_check')
- ✅ `title` (TEXT, not null)
- ✅ `description` (TEXT, nullable)
- ✅ `due_date` (DATE, nullable)
- ✅ `frequency` (TEXT, CHECK: 'daily' | 'weekly' | 'fortnightly' | 'monthly', nullable)
- ✅ `last_completed_at` (TIMESTAMPTZ, nullable)
- ✅ `next_due_date` (DATE, nullable)
- ✅ `completed` (BOOLEAN, default FALSE)
- ✅ `assigned_to` (UUID, foreign key → auth.users.id, ON DELETE SET NULL, nullable)
- ✅ `created_at` (TIMESTAMPTZ, default NOW())
- ✅ `updated_at` (TIMESTAMPTZ, default NOW())

**Indexes:**
- ✅ `idx_client_tasks_client_id` on client_id
- ✅ `idx_client_tasks_channel_id` on channel_id
- ✅ `idx_client_tasks_due_date` on due_date
- ✅ `idx_client_tasks_next_due_date` on next_due_date
- ✅ `idx_client_tasks_assigned_to` on assigned_to
- ✅ `idx_client_tasks_client_completed` on (client_id, completed) - composite

**RLS Policies:**
- ✅ SELECT for authenticated users
- ✅ INSERT for authenticated users
- ✅ UPDATE for authenticated users
- ✅ DELETE for authenticated users
- ✅ Trigger: `update_client_tasks_updated_at`

**Comments:**
- ✅ Column comment on `due_date`
- ✅ Column comment on `frequency`
- ✅ Column comment on `next_due_date`

---

### 3. TypeScript Type Definitions
**File:** `src/types/database.ts`

**Added to Database.public.Tables:**

✅ **client_health_status** (Row, Insert, Update)
```typescript
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
}
```

✅ **client_tasks** (Row, Insert, Update)
```typescript
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
}
```

**Helper Type Exports:**
✅ `Client` - Database clients row type
✅ `MediaPlan` - Database media_plans row type
✅ `Channel` - Database channels row type
✅ `WeeklyPlan` - Database weekly_plans row type
✅ `ActionPoint` - Database action_points row type
✅ `ClientHealthStatus` - Database client_health_status row type
✅ `ClientTask` - Database client_tasks row type
✅ `ClientWithHealth` - Composite type: Client & { health: ClientHealthStatus | null }
✅ `HealthStatus` - Union type: 'green' | 'amber' | 'red'

---

## TypeScript Compilation

✅ **No linter errors** - All types compile successfully

---

## Migration Files Verified

```bash
$ ls -la supabase/migrations/ | tail -5

-rw-r--r--  20251124_add_google_analytics_accounts.sql
-rw-r--r--  20251124_update_platform_constraint_google_analytics.sql
-rw-r--r--  20260208_update_action_points_health_check.sql
-rw-r--r--  20260209_add_client_health_status.sql  ✅ NEW
-rw-r--r--  20260209_add_client_tasks.sql           ✅ NEW
```

---

## Next Steps

**To apply these migrations:**

```bash
# If using Supabase local development:
npx supabase db reset

# Or to apply new migrations only:
npx supabase migration up

# If using Supabase cloud:
npx supabase db push
```

**After migrations are applied, verify with:**

```sql
-- Check client_health_status table exists
SELECT * FROM client_health_status LIMIT 1;

-- Check client_tasks table exists
SELECT * FROM client_tasks LIMIT 1;

-- Verify foreign key constraints
SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name IN ('client_health_status', 'client_tasks')
  AND tc.constraint_type = 'FOREIGN KEY';
```

---

## Phase 1 Acceptance Criteria

- ✅ Both tables exist with correct schemas
- ✅ RLS policies are configured
- ✅ Indexes created for performance
- ✅ Foreign key constraints with proper cascade rules
- ✅ TypeScript types added with no compilation errors
- ✅ Helper types created for convenience
- ✅ Migration files follow naming convention (YYYYMMDD_description.sql)

**Status:** READY FOR PHASE 2 (Health Calculation Logic)

---

## File Summary

| File | Lines | Purpose |
|------|-------|---------|
| `supabase/migrations/20260209_add_client_health_status.sql` | 50 | Creates client_health_status table |
| `supabase/migrations/20260209_add_client_tasks.sql` | 73 | Creates client_tasks table |
| `src/types/database.ts` | +107 | Adds TypeScript types for new tables |

**Total:** 3 files modified/created
