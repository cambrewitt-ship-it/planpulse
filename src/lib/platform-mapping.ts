/**
 * Platform name mapping utilities
 * 
 * Our internal database uses 'meta-ads' for Meta/Facebook advertising platform
 * Nango uses 'facebook' as the provider config key
 * 
 * These utilities ensure consistent translation between the two naming conventions.
 */

// Internal platform names (used in our database)
export type InternalPlatform = 'google-ads' | 'meta-ads';

// Nango provider config keys
export type NangoPlatform = 'google-ads' | 'facebook';

/**
 * Convert internal platform name to Nango provider config key
 * @param internalPlatform - Our internal platform name
 * @returns Nango provider config key
 */
export function toNangoPlatform(internalPlatform: InternalPlatform | string): NangoPlatform {
  if (internalPlatform === 'meta-ads') {
    return 'facebook';
  }
  if (internalPlatform === 'google-ads') {
    return 'google-ads';
  }
  // Fallback: if already a Nango platform name, return as-is
  return internalPlatform as NangoPlatform;
}

/**
 * Convert Nango provider config key to internal platform name
 * @param nangoPlatform - Nango provider config key
 * @returns Our internal platform name
 */
export function toInternalPlatform(nangoPlatform: NangoPlatform | string): InternalPlatform {
  if (nangoPlatform === 'facebook') {
    return 'meta-ads';
  }
  if (nangoPlatform === 'google-ads') {
    return 'google-ads';
  }
  // Fallback: if already internal platform name, return as-is
  return nangoPlatform as InternalPlatform;
}

/**
 * Get display name for a platform
 * @param platform - Internal or Nango platform name
 * @returns Human-readable display name
 */
export function getPlatformDisplayName(platform: string): string {
  const internalPlatform = toInternalPlatform(platform);
  
  const displayNames: Record<InternalPlatform, string> = {
    'google-ads': 'Google Ads',
    'meta-ads': 'Meta Ads (Facebook)',
  };
  
  return displayNames[internalPlatform] || platform;
}

