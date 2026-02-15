# GA4 Event Autocomplete for Funnel Builder

## Overview

Enhanced the funnel builder with intelligent GA4 event autocomplete that fetches the top 50 events from the last 30 days and displays them with event counts.

## Files Created/Modified

### New API Route
- ✅ `/src/app/api/ads/google-analytics/list-events/route.ts`

### Updated Components
- ✅ `/components/funnel-builder-modal.tsx`

## Features Implemented

### 1. New API Endpoint: `/api/ads/google-analytics/list-events`

**Method**: `POST`

**Request Body**:
```json
{
  "propertyId": "optional-property-id",
  "clientId": "optional-client-id"
}
```

**Response**:
```json
{
  "success": true,
  "events": [
    { "name": "first_open", "count": 5432 },
    { "name": "purchase", "count": 1234 },
    { "name": "add_to_cart", "count": 890 }
  ],
  "propertiesProcessed": 1
}
```

**Functionality**:
- Queries GA4 Data API for last 30 days (`30daysAgo` to `today`)
- Returns top 50 events ordered by event count (descending)
- Aggregates counts across multiple GA4 properties if applicable
- Uses Nango for OAuth authentication
- Includes proper error handling and logging

### 2. Enhanced Funnel Builder UI

#### Combobox Component (Shadcn)
Replaced basic input with autocomplete combobox:

```tsx
<Popover>
  <PopoverTrigger>
    {stage.eventName || "Select event or type custom..."}
  </PopoverTrigger>
  <PopoverContent>
    <Command>
      <CommandInput placeholder="Search events or type custom..." />
      <CommandItem>
        event_name (count)
      </CommandItem>
    </Command>
  </PopoverContent>
</Popover>
```

**Features**:
- Searchable dropdown with fuzzy matching
- Displays event counts: `"first_open (4,342 events)"`
- Keyboard navigation support
- Visual checkmark for selected event

#### Custom Event Support
- If typed event not in top 50, shows button: "Use custom event: '{name}'"
- Allows free-form input for any event name
- No restriction to autocomplete list

#### Event Preview
Shows context-aware feedback:

**✅ Event Found** (Green):
```
✓ This event occurred 4,342 times in the last 30 days
```

**⚠️ Event Not Found** (Amber):
```
⚠️ Custom event "my_event" not found in top 50 events from last 30 days
This event may have zero occurrences or didn't rank in top 50
```

### 3. Validation Enhancements

#### Real-time Validation
- Checks if event exists in fetched list
- Warns about events with 0 count
- Warns about custom events not in top 50
- Distinguishes between errors (blocking) and warnings (non-blocking)

#### Error Messages
```typescript
// Blocking errors
"Stage 3: Event name is required for custom events"
"Stage 3: Display name is required"

// Non-blocking warnings
"Stage 3: Event 'my_event' not found in top 50 events (may have low/zero count)"
"Stage 3: Event 'test_event' has 0 occurrences in last 30 days"
```

### 4. Caching & Performance

#### State Management
- Events cached in React state (`ga4Events`)
- Single fetch on modal open
- No repeated API calls during session
- Refreshes when modal reopens

#### Loading States
- "Loading events..." indicator
- Combobox disabled during load
- Graceful degradation if fetch fails

## User Experience Flow

### 1. Creating Funnel with GA4 Event
1. User opens Funnel Builder
2. API automatically fetches top 50 events (background)
3. User selects "GA4" as source
4. User selects "Custom Event" as metric
5. Combobox appears with autocomplete

### 2. Selecting Event
**Option A: From List**
1. Click combobox
2. See all events with counts
3. Type to filter (e.g., "purch")
4. Select "purchase (1,234 events)"
5. Green confirmation shown

**Option B: Custom Event**
1. Click combobox
2. Type custom event name (e.g., "my_custom_event")
3. Click "Use custom event: 'my_custom_event'"
4. Amber warning shown (not in top 50)
5. Can still save funnel

### 3. Validation on Save
1. User clicks "Save Funnel"
2. System validates all stages
3. Shows warnings for low-count events
4. Allows save with warnings
5. Blocks save if required fields missing

## GA4 API Query Details

```javascript
// API Request Structure
{
  property: `properties/${propertyId}`,
  dateRanges: [
    {
      startDate: '30daysAgo',  // GA4 relative date
      endDate: 'today'
    }
  ],
  dimensions: [
    { name: 'eventName' }
  ],
  metrics: [
    { name: 'eventCount' }
  ],
  orderBys: [
    {
      metric: { metricName: 'eventCount' },
      desc: true
    }
  ],
  limit: 50  // Top 50 events
}
```

## Security & Authentication

- ✅ User authentication required
- ✅ GA4 connection verified
- ✅ Nango OAuth for access tokens
- ✅ Property ownership validated
- ✅ No client-side API keys

## Error Handling

### API Errors
```json
{
  "success": false,
  "error": "Google Analytics not connected",
  "errorDetails": "No active connection found"
}
```

### Client-Side Graceful Degradation
- If API fails, autocomplete shows empty
- User can still type custom event names
- Warning shown: "Failed to load events"
- Funnel creation still possible

## Testing

### Manual Testing Steps
1. **Verify Event List**:
   - Open Funnel Builder
   - Add GA4 stage with custom event
   - Verify combobox shows events
   - Check counts match GA4 dashboard

2. **Test Search**:
   - Type "first" → should filter to `first_open`
   - Type "purchase" → should show purchase-related events
   - Verify real-time filtering

3. **Test Custom Events**:
   - Type non-existent event: "my_test_123"
   - Click "Use custom event"
   - Verify amber warning appears
   - Verify funnel saves successfully

4. **Test Validation**:
   - Try to save without event name → error
   - Use event with 0 count → warning (but saves)
   - Use custom event → warning (but saves)

### API Testing
```bash
# Test with curl
curl -X POST http://localhost:3000/api/ads/google-analytics/list-events \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{}'

# Expected response
{
  "success": true,
  "events": [
    { "name": "first_open", "count": 5432 },
    { "name": "screen_view", "count": 4321 }
  ],
  "propertiesProcessed": 1
}
```

## Troubleshooting

### Events Not Loading
**Symptoms**: Combobox shows "Loading events..." indefinitely

**Solutions**:
1. Check GA4 connection is active
2. Verify GA4 Data API is enabled
3. Check browser console for errors
4. Verify property has data in last 30 days

### No Events in List
**Symptoms**: Combobox shows empty list

**Possible Causes**:
- GA4 property has no events in last 30 days
- GA4 Data API quota exceeded
- Property not yet sending data

**Workaround**: Use custom event input

### Event Counts Don't Match GA4
**Reason**: API uses last 30 days (`30daysAgo` to `today`), not calendar month

**Solution**: Counts are correct for rolling 30-day window

## Future Enhancements

- [ ] Cache events per property ID
- [ ] Add date range selector for event counts
- [ ] Show event parameters in dropdown
- [ ] Filter by event category
- [ ] Export event list to CSV
- [ ] Real-time event count validation during calculation

## Related Documentation

- [Funnel Integration Guide](./FUNNEL_INTEGRATION_GUIDE.md)
- [Funnel Setup Instructions](../FUNNEL_SETUP_INSTRUCTIONS.md)
- [GA4 Data API Documentation](https://developers.google.com/analytics/devguides/reporting/data/v1)
