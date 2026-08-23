/**
 * Shared config/constants for the Client Hub CPA trend widget's settings
 * gear — which platform and conversion event feed the CPA calculation.
 * Used by the authenticated config route, the authenticated series route,
 * and the public token-gated series route.
 */

export interface CpaTrendConfig {
  platform: 'all' | 'meta-ads' | 'google-ads';
  /** Named conversion event (Meta action_type or Google conversion action name) to filter to, when platform is a single platform. */
  event: string | null;
}

export const DEFAULT_CPA_TREND_WIDGET: CpaTrendConfig = { platform: 'all', event: null };

export const VALID_CPA_PLATFORMS = ['all', 'meta-ads', 'google-ads'];
