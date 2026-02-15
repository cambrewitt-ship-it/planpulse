# Funnel System Setup Instructions

## Quick Start

### 1. Install Dependencies

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities html2canvas
```

### 2. Apply Database Migration

The migration file already exists at `supabase/migrations/20260215_add_funnel_tables.sql`

Apply it:
```bash
# If using Supabase CLI
supabase migration up

# Or apply directly in Supabase Dashboard
# Copy contents of the migration file and run in SQL Editor
```

### 3. Verify Shadcn/UI Components

Ensure these components are installed:
- Dialog
- Button
- Input
- Label
- Select
- Card
- Tabs
- Badge
- Skeleton
- Tooltip
- AlertDialog

If missing, install via:
```bash
npx shadcn-ui@latest add dialog button input label select card tabs badge skeleton tooltip alert-dialog
```

### 4. Access the Funnel Dashboard

#### From Client Dashboard (Recommended)
1. Navigate to client dashboard: `/clients/[clientId]/new-client-dashboard`
2. Look for the "Cost Per X Overview" section
3. Click the **"View Funnels"** button next to the section title
4. Select a channel to view/create funnels

#### Direct Channel Access
Navigate to:
```
/dashboard/client/[channelId]/media-plan
```

Replace `[channelId]` with your actual channel UUID.

## Files Created

### Database
- ✅ `supabase/migrations/20260215_add_funnel_tables.sql`

### Types
- ✅ `lib/types/funnel.ts` - Core funnel types
- ✅ `lib/types/funnel-api.ts` - API request/response types

### Utilities
- ✅ `lib/utils/funnel-calculations.ts` - Calculation logic
- ✅ `lib/hooks/use-funnels.ts` - React hook for funnel management

### Components
- ✅ `components/funnel-chart.tsx` - Visual funnel display
- ✅ `components/funnel-builder-modal.tsx` - Funnel creation/editing

### API Routes
- ✅ `src/app/api/funnels/route.ts` - List/Create
- ✅ `src/app/api/funnels/[funnelId]/route.ts` - Get/Update/Delete
- ✅ `src/app/api/funnels/[funnelId]/calculate/route.ts` - Calculate with live data
- ✅ `src/app/api/ads/google-analytics/list-events/route.ts` - Fetch GA4 events for autocomplete

### Pages
- ✅ `src/app/dashboard/client/[id]/media-plan/page.tsx` - Channel funnel dashboard
- ✅ `src/app/clients/[id]/funnels/page.tsx` - Client-level funnel overview
- ✅ `src/app/clients/[id]/new-client-dashboard/page.tsx` - **UPDATED** with "View Funnels" button

### API Updates
- ✅ `src/app/api/ads/google-analytics/fetch-data/route.ts` - Enhanced with `eventNames` support

### Documentation
- ✅ `docs/FUNNEL_INTEGRATION_GUIDE.md` - Complete integration guide
- ✅ `FUNNEL_SETUP_INSTRUCTIONS.md` - This file

## Testing the Integration

### 1. Create a Test Funnel

1. Navigate to `/dashboard/client/[channelId]/media-plan`
2. Click "Create Funnel"
3. Choose a template or create custom stages:
   - Stage 1: Meta Ads → Impressions
   - Stage 2: Meta Ads → Clicks
   - Stage 3: GA4 → Event: `first_open`
   - Stage 4: GA4 → Event: `purchase`
4. Set date range (last 30 days recommended)
5. Click "Save Funnel"

### 2. Calculate Funnel

1. Select your date range
2. Click "Recalculate"
3. Wait for data to be fetched from all platforms
4. View the visual funnel chart

### 3. Export Data

1. Click "Download as PNG" to save chart image
2. Click "Copy to Clipboard" to get text metrics

## Prerequisites

Before using the funnel system, ensure:

- [ ] Meta Ads account connected via Nango
- [ ] Google Ads account connected via Nango (if using)
- [ ] Google Analytics 4 property connected
- [ ] GA4 Data API enabled in Google Cloud Console
- [ ] At least one `media_plan_channel` exists in database
- [ ] Ad platform connections are active and working

## Troubleshooting

### Module not found errors
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities html2canvas
```

### Shadcn components missing
```bash
npx shadcn-ui@latest add dialog button input card select tabs
```

### GA4 events not showing
- Events must have occurred in last 30 days
- Check GA4 property is correctly configured
- Verify GA4 Data API is enabled

### "Channel not found" error
- Ensure `channelId` in URL exists in `media_plan_channels` table
- Verify you own the channel (RLS check)

### Calculation returns no data
- Check date range has actual data
- Verify ad platform connections are active
- Review server logs for API errors
- Ensure GA4 Data API quota not exceeded

## Architecture Summary

```
User creates funnel in UI
    ↓
FunnelBuilderModal
    ↓
POST /api/funnels → media_plan_funnels table
    ↓
User clicks "Calculate"
    ↓
GET /api/funnels/[id]/calculate
    ↓
Parallel fetch:
  - Meta API
  - Google Ads API  
  - GA4 Standard Metrics API
  - GA4 Events API (with eventNames param)
    ↓
calculateFunnelMetrics() utility
    ↓
FunnelChart component renders results
```

## Data Sources by Stage Type

| Source | Metrics Available |
|--------|------------------|
| **Meta Ads** | impressions, clicks, link_clicks, conversions, spend |
| **Google Ads** | impressions, clicks, conversions, spend |
| **GA4 Standard** | activeUsers, totalUsers, sessions, conversions, screenPageViews |
| **GA4 Events** | Any custom event (e.g., first_open, purchase, add_to_cart) |

## Next Steps

1. Run the database migration
2. Install npm dependencies
3. Navigate to the funnel dashboard page
4. Create your first funnel using a template
5. Calculate and view results
6. Export or share your funnel metrics

## Support

For issues or questions:
- Check `docs/FUNNEL_INTEGRATION_GUIDE.md` for detailed documentation
- Review API route logs in terminal
- Verify all prerequisites are met
- Check Supabase logs for database errors

## Security Notes

- All API routes verify user authentication
- Channel ownership is checked before any operations
- JSONB config stored safely in database
- No sensitive data in client-side state
- RLS policies apply to all database operations
