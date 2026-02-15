# Agency Dashboard Seed Data Guide

**Migration:** `20260209_seed_agency_dashboard_test_data.sql`  
**Purpose:** Create realistic test data for agency dashboard testing

---

## What Gets Created

### 10 Test Clients

Distributed to produce varied health statuses:
- **3 RED clients** (critical issues)
- **4 AMBER clients** (warnings)
- **3 GREEN clients** (healthy)

---

## Client Breakdown

### 🔴 RED Clients (3)

#### 1. TechCorp Solutions
- **Issues:** 3 overdue tasks, 130% over budget
- **Channels:** Meta Ads, Google Search, LinkedIn (3)
- **Overdue tasks:**
  - Review Meta Ads (5 days overdue)
  - Optimize Google Search (3 days overdue)
  - Complete LinkedIn setup (2 days overdue)

#### 2. Retail Plus
- **Issues:** Setup incomplete, channel starts in 2 days
- **Channels:** Meta Ads, Google Shopping (2)
- **Incomplete setup tasks:**
  - Set up Meta pixel (due tomorrow)
  - Create ad creatives (due tomorrow)
  - Configure product feed (due today)

#### 3. HealthCare Group
- **Issues:** 2 overdue tasks, 140% over budget (severely)
- **Channels:** Meta Ads, Display Network (2)
- **Overdue tasks:**
  - Adjust budget allocation (7 days overdue)
  - Review display performance (4 days overdue)

---

### 🟠 AMBER Clients (4)

#### 4. BuildRight Construction
- **Issues:** 1 overdue task
- **Channels:** Google Search, Meta Ads (2)
- **Tasks:** Weekly performance check (1 day overdue)

#### 5. FoodHub Delivery
- **Issues:** 3 tasks due within 2-3 days
- **Channels:** Meta Ads, Google Search, Display (3)
- **Upcoming tasks:**
  - Review conversion rates (2 days)
  - Update bid strategies (2 days)
  - Refresh display creatives (3 days)

#### 6. EduTech Academy
- **Issues:** Slightly over budget (115%)
- **Channels:** Meta Ads, Google Search (2)
- **Budget:** Planned vs actual shows 115% spend rate

#### 7. FinServe Partners
- **Issues:** Setup incomplete, starts in 5 days
- **Channels:** LinkedIn Ads, Google Display (2)
- **Setup tasks:** Due in 4 days (still time, but amber warning)

---

### 🟢 GREEN Clients (3)

#### 8. TravelNow Agency
- **Status:** All healthy
- **Channels:** Meta Ads, Google Search (2)
- **Budget:** 95-105% pacing (perfect)
- **Tasks:** All completed or well-timed

#### 9. GreenEnergy Co
- **Status:** Perfect pacing
- **Channels:** Meta Ads, Google Search (2)
- **Budget:** ~101% pacing
- **Tasks:** Setup complete, next check in 20 days

#### 10. FitLife Wellness
- **Status:** No issues
- **Channels:** Meta Ads, Google Search (2)
- **Budget:** ~98% pacing
- **Tasks:** All on track

---

## Data Statistics

| Category | Count |
|----------|-------|
| **Clients** | 10 |
| **Media Plans** | 10 (all active) |
| **Channels** | 22 total |
| **Weekly Plans** | 14 (for budget tracking) |
| **Client Tasks** | 28 total |

### Budget Distribution

| Client | Total Budget | Spend % | Status |
|--------|-------------|---------|--------|
| TechCorp | $50,000 | 130% | 🔴 Over |
| HealthCare | $100,000 | 140% | 🔴 Way Over |
| EduTech | $40,000 | 115% | 🟠 Slightly Over |
| TravelNow | $150,000 | 98-102% | 🟢 Perfect |
| GreenEnergy | $70,000 | 101% | 🟢 Perfect |
| FitLife | $60,000 | 98% | 🟢 Perfect |

### Task Distribution

| Task Status | Count |
|-------------|-------|
| Completed | 7 |
| Overdue (1-7 days) | 8 |
| Due today/tomorrow | 3 |
| Due in 2-3 days | 3 |
| Due in 4-5 days | 3 |
| Due in 10+ days | 4 |

---

## How to Use

### 1. Apply Migration

```bash
# If using Supabase CLI
npx supabase migration up

# Or apply via Supabase dashboard
# Upload the migration file
```

### 2. Calculate Health Status

The migration creates the base data. To populate `client_health_status`:

**Option A: Load the dashboard**
- Navigate to `/agency`
- Page will calculate health on-the-fly for missing clients

**Option B: Use API endpoints**
```bash
# Refresh all clients at once
curl -X POST http://localhost:3000/api/agency/health/refresh-all

# Or refresh individual clients
curl -X POST http://localhost:3000/api/clients/c1000000-0000-0000-0000-000000000001/health
```

**Option C: Manual calculation (in code)**
```typescript
import { refreshAllClientHealth } from '@/lib/health/calculations';

await refreshAllClientHealth();
```

### 3. View Results

Navigate to `/agency` to see:
- 10 clients in the table
- Metrics cards showing:
  - Total: 10 clients
  - Red: 3
  - Amber: 4
  - Green: 3
- Various budget, task, and channel counts

---

## Testing Scenarios

### Test Filters

1. **All Clients** - Should show all 10
2. **Red Only** - Should show 3 (TechCorp, Retail, HealthCare)
3. **Red + Amber** - Should show 7
4. **Green Only** - Should show 3 (TravelNow, GreenEnergy, FitLife)

### Test Sorting

1. **By Status** - Red clients first, then amber, then green
2. **By Name** - Alphabetical order
3. **By Channels** - FoodHub (3) at top
4. **By Overdue** - TechCorp (3) at top
5. **By Budget** - HealthCare (140%) at top

### Test Data Display

**Badges:**
- Red badges for overdue tasks (8 tasks total)
- Amber badges for at-risk tasks
- Outline badges for channel counts

**Progress Bars:**
- Should show various percentages (95%-140%)
- Over 100% should fill completely

**Dates:**
- Next critical dates should format correctly
- Task names should display below dates

---

## Cleanup

To remove test data:

```sql
-- Delete all test clients (cascades to related records)
DELETE FROM clients WHERE name IN (
  'TechCorp Solutions',
  'Retail Plus',
  'HealthCare Group',
  'BuildRight Construction',
  'FoodHub Delivery',
  'EduTech Academy',
  'FinServe Partners',
  'TravelNow Agency',
  'GreenEnergy Co',
  'FitLife Wellness'
);
```

Or rollback the migration:
```bash
# Rollback to before this migration
npx supabase migration down
```

---

## Expected Health Calculation Results

When health is calculated, you should see:

### Red Clients (3)

**TechCorp Solutions:**
- Status: RED
- Reasons:
  - "3 overdue tasks"
  - "Budget overspend: 130%"
- Metrics:
  - Overdue: 3
  - At Risk: 0
  - Budget: 130%

**Retail Plus:**
- Status: RED
- Reasons:
  - "Setup incomplete with 2 days until launch"
- Metrics:
  - Overdue: 0
  - At Risk: 3 (all setup tasks)
  - Setup: Incomplete

**HealthCare Group:**
- Status: RED
- Reasons:
  - "2 overdue tasks"
  - "Budget overspend: 140%"
- Metrics:
  - Overdue: 2
  - Budget: 140%

### Amber Clients (4)

**BuildRight Construction:**
- Status: AMBER
- Reasons: "1 overdue task"
- Metrics: Overdue: 1

**FoodHub Delivery:**
- Status: AMBER
- Reasons: "3 tasks due within 3 days"
- Metrics: At Risk: 3

**EduTech Academy:**
- Status: AMBER
- Reasons: "Budget slightly over: 115%"
- Metrics: Budget: 115%

**FinServe Partners:**
- Status: AMBER
- Reasons: "Setup incomplete with 5 days until launch"
- Metrics: Setup incomplete, 5 days to start

### Green Clients (3)

All should show:
- Status: GREEN
- Reasons: "All metrics healthy"
- All metrics within acceptable ranges

---

## Troubleshooting

### Health Status Not Calculating

**Problem:** `client_health_status` table is empty

**Solution:**
```bash
# Trigger calculation via API
curl -X POST http://localhost:3000/api/agency/health/refresh-all
```

### Wrong Health Colors

**Problem:** Client showing wrong status

**Check:**
1. Task due dates (are they actually overdue?)
2. Budget calculations (weekly_plans sum correctly?)
3. Channel start dates (relative to current date)

**Recalculate:**
```bash
curl -X POST http://localhost:3000/api/clients/[CLIENT_ID]/health
```

### No Data Showing

**Problem:** Tables appear empty

**Check:**
1. Migration ran successfully
2. RLS policies allow read access
3. User is authenticated
4. Browser console for errors

---

## Notes

- All IDs use prefix `c1`, `p1`, `ch1` for easy identification
- Dates are relative to `CURRENT_DATE` for consistent testing
- Budget amounts in cents (e.g., 5000000 = $50,000)
- Tasks without `next_due_date` use `due_date` for calculations
- Cleanup script included in migration (re-runnable)

---

**Created:** February 9, 2026  
**Version:** 1.0
