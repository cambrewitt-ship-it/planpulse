# Funnel System Navigation Guide

## User Journey

### 1. Starting Point: Client Dashboard

**URL**: `/clients/[clientId]/new-client-dashboard`

The client dashboard displays:
- Client information
- Media Plan Builder
- **Cost Per X Overview** section ← Entry point for funnels
- Ad Platform Connections

### 2. Accessing Funnels

#### Option A: From Cost Per X Section (Recommended)

```
Client Dashboard
    ↓
[View Funnels] button (next to "Cost Per X Overview" title)
    ↓
Client Funnels Overview
    ↓
Select Channel
    ↓
Channel Funnel Dashboard
```

**Visual Location**:
```
┌────────────────────────────────────────────┐
│ Cost Per X Overview  [View Funnels]       │
│                                            │
│ [Metric Selector] [Date Range] [Export]   │
│                                            │
│ ┌────────┐ ┌────────┐ ┌────────┐         │
│ │ Total  │ │ Total  │ │ Avg    │         │
│ │ Spend  │ │ Metric │ │ Cost   │         │
│ └────────┘ └────────┘ └────────┘         │
│                                            │
│ [Chart Area]                               │
└────────────────────────────────────────────┘
```

#### Option B: Direct Channel Access

If you know the channel ID:
```
Navigate directly to: /dashboard/client/[channelId]/media-plan
```

### 3. Client Funnels Overview Page

**URL**: `/clients/[clientId]/funnels`

**Features**:
- Lists all channels for the client
- Shows funnel count per channel
- Quick navigation to channel funnel dashboards
- Info card explaining funnel functionality

**Layout**:
```
┌─────────────────────────────────────────────┐
│ ← Back to Dashboard                         │
│                                             │
│ Conversion Funnels                          │
│ {Client Name} - View and manage funnels    │
└─────────────────────────────────────────────┘

┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Meta Ads     │ │ Google Ads   │ │ TikTok Ads   │
│ Facebook &   │ │ Search &     │ │ Video        │
│ Instagram    │ │ Display      │ │ Campaigns    │
│              │ │              │ │              │
│ [2 funnels]  │ │ [1 funnel]   │ │ [0 funnels]  │
│              │ │              │ │              │
│ [View        │ │ [View        │ │ [View        │
│  Funnels]    │ │  Funnels]    │ │  Funnels]    │
└──────────────┘ └──────────────┘ └──────────────┘

┌─────────────────────────────────────────────┐
│ ℹ️ About Conversion Funnels                │
│                                             │
│ Track user journeys across platforms...    │
└─────────────────────────────────────────────┘
```

### 4. Channel Funnel Dashboard

**URL**: `/dashboard/client/[channelId]/media-plan`

**Features**:
- Tabbed interface for multiple funnels
- Create/edit/delete funnels
- Date range selector
- Recalculate with live data
- Visual funnel chart
- Export options (PNG, clipboard)

**Layout**:
```
┌─────────────────────────────────────────────┐
│ ← Back                                      │
│                                             │
│ Conversion Funnels           [Create       │
│ Track marketing performance   Funnel]      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ [Funnel 1] [Funnel 2] [Funnel 3]           │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ E-commerce Funnel              [Edit] [Del] │
│ 5 stages • 22.90% overall conversion       │
│                                             │
│ [Start Date] [End Date] [Recalculate]      │
│ [Download PNG] [Copy to Clipboard]         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│              FUNNEL CHART                   │
│                                             │
│ ╔═══════════════════════════════════════╗  │
│ ║ Impressions        250,000            ║  │
│ ╠═══════════════════════════════════════╣  │
│ ║ 22.9% → Clicks     57,250             ║  │
│ ╠═════════════════════════════════════╣    │
│ ║ 4.5% → Page Views  2,576              ║  │
│ ╠═══════════════════════════════════╣      │
│ ║ 15.2% → Add Cart   392                ║  │
│ ╠═════════════════════════════════╣        │
│ ║ 28.8% → Purchase   113                ║  │
│ ╚═══════════════════════════════════╝      │
└─────────────────────────────────────────────┘
```

## Navigation Flow Diagram

```
                    ┌─────────────────────┐
                    │  Client Dashboard   │
                    │  (Cost Per X)       │
                    └──────────┬──────────┘
                               │
                     [View Funnels] button
                               │
                               ↓
                    ┌─────────────────────┐
                    │  Client Funnels     │
                    │  Overview           │
                    │  (All Channels)     │
                    └──────────┬──────────┘
                               │
                     Select Channel Card
                               │
                               ↓
                    ┌─────────────────────┐
                    │  Channel Funnel     │
                    │  Dashboard          │
                    │  (Create/View)      │
                    └──────────┬──────────┘
                               │
                     [Create Funnel] button
                               │
                               ↓
                    ┌─────────────────────┐
                    │  Funnel Builder     │
                    │  Modal              │
                    │  (Configure)        │
                    └──────────┬──────────┘
                               │
                     [Save] → [Recalculate]
                               │
                               ↓
                    ┌─────────────────────┐
                    │  Funnel Chart       │
                    │  Visualization      │
                    │  (Live Data)        │
                    └─────────────────────┘
```

## URL Structure

```
/clients/[clientId]/new-client-dashboard
    │
    └── /clients/[clientId]/funnels
            │
            └── /dashboard/client/[channelId]/media-plan
```

## Key Features by Page

### Client Dashboard
✅ Quick access via "View Funnels" button  
✅ Integrated with Cost Per X section  
✅ Context-aware placement  

### Client Funnels Overview
✅ Multi-channel view  
✅ Funnel count badges  
✅ Quick channel selection  
✅ Educational info card  

### Channel Funnel Dashboard
✅ Full CRUD operations  
✅ Visual funnel charts  
✅ Live data calculation  
✅ Export capabilities  
✅ Date range filtering  

## Implementation Notes

### Button Integration
The "View Funnels" button is placed:
- **Location**: Next to "Cost Per X Overview" section title
- **Position**: Between title and metric selectors
- **Icon**: Filter icon for visual clarity
- **Style**: Outline button to not compete with primary actions

### Routing
- Client Dashboard → Client Funnels: `/clients/[id]/funnels`
- Client Funnels → Channel Dashboard: `/dashboard/client/[channelId]/media-plan`
- Breadcrumb navigation with back buttons on all pages

### Responsive Design
All pages are responsive:
- Mobile: Stacked cards, full-width buttons
- Tablet: 2-column channel grid
- Desktop: 3-column channel grid

## User Experience Considerations

1. **Progressive Disclosure**: Start broad (all channels) → narrow (specific channel)
2. **Context Preservation**: Back buttons maintain user context
3. **Visual Hierarchy**: Clear CTAs at each level
4. **Empty States**: Helpful messages when no funnels exist
5. **Loading States**: Skeleton screens and spinners
6. **Error Handling**: Graceful degradation with error messages

## Future Enhancements

- [ ] Quick create funnel from client overview
- [ ] Inline funnel preview cards
- [ ] Recent funnels section on client dashboard
- [ ] Funnel performance summary on overview page
- [ ] Direct link to funnel from notification/alert system
