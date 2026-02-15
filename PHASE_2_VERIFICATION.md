# Phase 2: Health Calculation Logic - Verification

**Date:** February 9, 2026  
**Status:** ✅ COMPLETE

---

## File Created

**Location:** `src/lib/health/calculations.ts` (490 lines)

---

## Functions Implemented

### 1. Main Calculation Functions

#### ✅ `calculateChannelHealth(channelId: string): Promise<ChannelHealth>`

**Logic Flow:**
1. ✅ Fetches channel details from database
2. ✅ Gets channel start date from associated media plan
3. ✅ Counts overdue tasks (`due_date < today AND !completed`)
4. ✅ Counts upcoming tasks (within next 3 days)
5. ✅ Calculates budget variance from weekly_plans
6. ✅ Checks if all setup tasks are completed
7. ✅ Applies traffic light rules:
   - **RED:** overdue >= 2 OR (setup incomplete AND days < 3) OR budget >120% OR <80%
   - **AMBER:** overdue = 1 OR (upcoming >= 2 AND days < 3) OR (setup incomplete AND days < 7) OR budget 110-120% OR 80-90%
   - **GREEN:** everything else

**Return Type:**
```typescript
{
  channelId: string;
  status: 'red' | 'amber' | 'green';
  reasons: string[];
  metrics: {
    overdueTasks: number;
    upcomingTasks: number;
    budgetVariance: number;
    setupComplete: boolean;
    daysToStart: number | null;
  };
}
```

---

#### ✅ `calculateClientHealth(clientId: string): Promise<ClientHealthStatus | null>`

**Logic Flow:**
1. ✅ Fetches all channels for the client
2. ✅ Calls `calculateChannelHealth()` for each channel
3. ✅ Determines worst status (red > amber > green)
4. ✅ Aggregates metrics:
   - Total overdue tasks across all channels
   - Total at-risk tasks (due within 7 days)
   - Sum of total budgets from active media_plans
   - Sum of total spend from weekly_plans
5. ✅ Calculates budget health percentage
6. ✅ Finds next critical date (earliest upcoming due_date)
7. ✅ Upserts to `client_health_status` table
8. ✅ Returns the updated ClientHealthStatus object

**Database Operations:**
- Queries: `channels`, `media_plans`, `weekly_plans`, `client_tasks`
- Upsert: `client_health_status` (with conflict resolution on `client_id`)

---

#### ✅ `refreshAllClientHealth(): Promise<RefreshAllResult>`

**Logic Flow:**
1. ✅ Fetches all client IDs from database
2. ✅ Iterates through each client
3. ✅ Calls `calculateClientHealth(clientId)` for each
4. ✅ Logs progress and results to console
5. ✅ Returns summary with counts and errors

**Return Type:**
```typescript
{
  updated: number;
  errors: Array<{ clientId: string; error: string }>;
}
```

**Console Output:**
- Progress log for each client
- Success: "✓ Updated health for client [id]: [status]"
- Error: "✗ Failed to update health for client [id]"
- Summary: "Refresh complete: X updated, Y errors"

---

### 2. Helper Functions

#### ✅ `getOverdueTasksForClient(clientId: string): Promise<number>`
- Queries `client_tasks` where `completed = false`
- Filters: `due_date < today OR next_due_date < today`
- Returns count of overdue tasks
- Error handling: returns 0 on error (graceful degradation)

#### ✅ `getUpcomingTasksForClient(clientId: string, days: number): Promise<number>`
- Queries `client_tasks` where `completed = false`
- Filters: `due_date` or `next_due_date` between today and today + days
- Returns count of upcoming tasks
- Used for at-risk calculation (days = 7)

#### ✅ `getBudgetVarianceForChannel(channelId: string): Promise<number>`
- Queries `weekly_plans` for the channel
- Sums `budget_planned` and `budget_actual`
- Returns `(actual / planned) * 100`
- Returns 100% (neutral) if no data or error

#### ✅ `isChannelSetupComplete(channelId: string): Promise<boolean>`
- Queries `client_tasks` where `task_type = 'setup'` and `channel_id = channelId`
- Returns `true` if all setup tasks are completed
- Returns `true` (assume complete) if no tasks or error

#### ✅ `daysUntilDate(targetDate: string | null): number | null`
- Calculates days between today and target date
- Returns `null` if date is in past or null
- Used for "days until channel start" calculation

---

## Error Handling

### Graceful Degradation Strategy

✅ **All functions handle errors without breaking:**
- Database errors are logged to console
- Functions return safe defaults (0, true, 100%, green)
- Client health calculation continues even if individual channels fail
- Batch refresh continues even if individual clients fail

### Error Logging

✅ **Comprehensive logging:**
```typescript
console.error('Error fetching channels:', channelError);
console.error('Exception in calculateChannelHealth:', err);
console.log(`✓ Updated health for client ${client.id}: ${health.status}`);
console.log(`Refresh complete: ${result.updated} updated, ${result.errors.length} errors`);
```

---

## Database Queries

### Supabase Client Usage

✅ **Uses `@/lib/supabase/client` consistently**
```typescript
import { supabase } from '@/lib/supabase/client';
```

### Query Patterns

✅ **Filter by date:**
```typescript
.or(`due_date.lt.${today},next_due_date.lt.${today}`)
```

✅ **Range queries:**
```typescript
.or(
  `and(due_date.gte.${todayStr},due_date.lte.${futureStr}),` +
  `and(next_due_date.gte.${todayStr},next_due_date.lte.${futureStr})`
)
```

✅ **Upsert with conflict resolution:**
```typescript
.upsert(healthStatus, { onConflict: 'client_id' })
```

✅ **Join queries:**
```typescript
.select('id, plan_id')
.eq('client_id', clientId)
```

---

## Type Safety

### TypeScript Interfaces

✅ **Exported types:**
```typescript
export interface ChannelHealthMetrics {
  overdueTasks: number;
  upcomingTasks: number;
  budgetVariance: number;
  setupComplete: boolean;
  daysToStart: number | null;
}

export interface ChannelHealth {
  channelId: string;
  status: HealthStatus;
  reasons: string[];
  metrics: ChannelHealthMetrics;
}

export interface RefreshAllResult {
  updated: number;
  errors: Array<{ clientId: string; error: string }>;
}
```

✅ **Uses database types:**
```typescript
import type { ClientHealthStatus, ClientTask, HealthStatus } from '@/types/database';
```

---

## Traffic Light Rules Implementation

### RED (Critical) ✅
- `overdueCount >= 2` → "X overdue tasks"
- `!setupComplete && daysToStart < 3` → "Setup incomplete with X days until launch"
- `budgetVariance > 120` → "Budget overspend: X%"
- `budgetVariance < 80` → "Budget underspend: X%"

### AMBER (Warning) ✅
- `overdueCount === 1` → "1 overdue task"
- `upcomingCount >= 2 && daysToStart < 3` → "X tasks due within 3 days of launch"
- `!setupComplete && daysToStart >= 3 && daysToStart < 7` → "Setup incomplete with X days until launch"
- `budgetVariance 110-120` → "Budget slightly over: X%"
- `budgetVariance 80-90` → "Budget slightly under: X%"

### GREEN (Healthy) ✅
- Default state
- Reason: "All metrics healthy"

### Status Inheritance ✅
- Client status = worst channel status
- Red > Amber > Green
- Implemented in `calculateClientHealth()`

---

## Testing Recommendations

### Unit Tests (to be added in future)

**Test cases for `calculateChannelHealth()`:**
```typescript
it('should return RED when 2+ tasks are overdue')
it('should return RED when setup incomplete <3 days to start')
it('should return RED when budget variance >120%')
it('should return AMBER when 1 task is overdue')
it('should return AMBER when setup incomplete <7 days to start')
it('should return GREEN when all metrics healthy')
```

**Test cases for `calculateClientHealth()`:**
```typescript
it('should inherit RED status if any channel is red')
it('should aggregate metrics across all channels')
it('should upsert to client_health_status table')
it('should handle clients with no channels')
```

**Test cases for `refreshAllClientHealth()`:**
```typescript
it('should process all clients')
it('should continue on individual failures')
it('should return summary with counts')
```

### Manual Testing

**To test locally:**
```typescript
// In a test file or API route:
import { calculateClientHealth, refreshAllClientHealth } from '@/lib/health/calculations';

// Test single client
const health = await calculateClientHealth('client-uuid-here');
console.log(health);

// Test all clients
const result = await refreshAllClientHealth();
console.log(result);
```

---

## Next Steps

### Phase 3: API Endpoints

**Required API routes to create:**
1. `GET /api/agency/clients` - Fetch all clients with health
2. `GET /api/agency/metrics` - Summary metrics
3. `GET /api/clients/[id]/health` - Client health detail
4. `POST /api/clients/[id]/health/refresh` - Manual refresh
5. `POST /api/agency/health/refresh-all` - Refresh all

These endpoints will use the functions from this file.

---

## Compilation Status

✅ **No TypeScript errors**  
✅ **No linter errors**  
✅ **All imports resolve correctly**  
✅ **Functions are properly typed**

---

## File Summary

| Metric | Value |
|--------|-------|
| Total Lines | 490 |
| Main Functions | 3 |
| Helper Functions | 5 |
| Type Definitions | 3 |
| Error Handlers | Comprehensive |
| Database Queries | ~15 |

---

## Acceptance Criteria

- ✅ `calculateChannelHealth()` implemented with all logic
- ✅ `calculateClientHealth()` implemented with aggregation
- ✅ `refreshAllClientHealth()` implemented with batch processing
- ✅ Helper functions for overdue, upcoming, budget, setup
- ✅ Uses Supabase client from `@/lib/supabase/client`
- ✅ Error handling is graceful and logged
- ✅ TypeScript types are correct
- ✅ No compilation errors

**Status:** READY FOR PHASE 3 (API Endpoints)

---

**Document Version:** 1.0  
**Last Updated:** February 9, 2026
