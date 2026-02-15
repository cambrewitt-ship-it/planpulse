import { FunnelConfig, FunnelStage, MediaPlanFunnel } from './funnel';

// POST /api/funnels - Create new funnel
export interface CreateFunnelRequest {
  channelId: string;
  name: string;
  config: FunnelConfig;
}

export interface CreateFunnelResponse {
  success: boolean;
  funnel?: MediaPlanFunnel;
  error?: string;
  details?: string;
}

// GET /api/funnels?channelId={id} - List funnels
export interface ListFunnelsResponse {
  success: boolean;
  funnels?: MediaPlanFunnel[];
  error?: string;
  details?: string;
}

// GET /api/funnels/[funnelId] - Get single funnel
export interface GetFunnelResponse {
  success: boolean;
  funnel?: MediaPlanFunnel;
  error?: string;
  details?: string;
}

// PUT /api/funnels/[funnelId] - Update funnel
export interface UpdateFunnelRequest {
  name?: string;
  config?: FunnelConfig;
}

export interface UpdateFunnelResponse {
  success: boolean;
  funnel?: MediaPlanFunnel;
  error?: string;
  details?: string;
}

// DELETE /api/funnels/[funnelId] - Delete funnel
export interface DeleteFunnelResponse {
  success: boolean;
  message?: string;
  error?: string;
  details?: string;
}

// GET /api/funnels/[funnelId]/calculate - Calculate funnel with live data
export interface CalculateFunnelResponse {
  success: boolean;
  funnel?: {
    id: string;
    channelId: string;
    name: string;
    config: FunnelConfig;
    dateRange: { startDate: string; endDate: string };
    totalCost: number;
    stages: FunnelStage[];
  };
  dataFetchStatus?: {
    meta: boolean;
    google: boolean;
    ga4Standard: boolean;
    ga4Events: boolean;
  };
  error?: string;
  details?: string;
}

// Error response (common to all endpoints)
export interface FunnelAPIError {
  success: false;
  error: string;
  details?: string;
}
