/**
 * Live GA4 standard-metrics fetch + persist, shared by the on-demand API
 * route (src/app/api/ads/google-analytics/fetch-data/route.ts, standard
 * date-series mode) and the 6-hour refresh cron
 * (src/app/api/cron/refresh-ad-data/route.ts).
 *
 * Only the date-dimension "standard metrics" query mode is covered here —
 * the event-name-discovery mode (dimension=eventName, used to populate the
 * event picker dropdown) stays live-only in the route, since it's a
 * discovery aid rather than data the dashboard charts need cached.
 *
 * Unlike Google Ads / Meta, GA4 previously had no working cache write path
 * at all (google_analytics_metrics existed but only an unused sync-metrics
 * route wrote to it) — this fetch now upserts into it, mirroring the shape
 * that route already used.
 */

import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { markSynced } from '@/lib/ads/sync-status';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const METRIC_MAPPING: Record<string, string> = {
  activeUsers: 'activeUsers',
  conversions: 'conversions',
  totalUsers: 'totalUsers',
  sessions: 'sessions',
  screenPageViews: 'screenPageViews',
  eventCount: 'eventCount',
  newUsers: 'newUsers',
  engagementRate: 'engagementRate',
  averageSessionDuration: 'averageSessionDuration',
  bounceRate: 'bounceRate',
  keyEvents: 'conversions',
};

export interface GA4DataRow {
  propertyId: string;
  propertyName: string;
  date: string;
  [metric: string]: string | number;
}

export interface GA4SyncResult {
  success: boolean;
  data: GA4DataRow[];
  propertiesProcessed: number;
  error?: string;
  errors?: Array<{ propertyId: string; error: string }>;
}

/**
 * Fetches live GA4 standard metrics for one connection's properties, saves
 * them to google_analytics_metrics, and stamps the connection's
 * last_synced_at.
 */
export async function syncGA4Data(params: {
  supabase: AnySupabase;
  nango: Nango;
  userId: string;
  clientId: string | null;
  connectionId: string;
  connectionRowId: string;
  startDate: string;
  endDate: string;
  requestedMetrics?: string[];
  eventName?: string | null;
  propertyId?: string | null;
}): Promise<GA4SyncResult> {
  const {
    supabase, nango, userId, clientId, connectionId, connectionRowId,
    startDate, endDate, eventName, propertyId,
  } = params;
  const requestedMetrics = params.requestedMetrics || [
    'activeUsers', 'eventCount', 'conversions', 'totalUsers', 'sessions', 'screenPageViews',
  ];

  let nangoConnection;
  try {
    nangoConnection = await nango.getConnection(toNangoPlatform('google-analytics'), connectionId);
  } catch (nangoError: any) {
    return {
      success: false,
      data: [],
      propertiesProcessed: 0,
      error: `Failed to retrieve OAuth credentials: ${nangoError.message}`,
    };
  }

  const accessToken = (nangoConnection.credentials as any)?.access_token as string;
  if (!accessToken) {
    return {
      success: false,
      data: [],
      propertiesProcessed: 0,
      error: 'No access token found in Nango connection. Please reconnect your Google Analytics account.',
    };
  }

  let propertiesQuery = supabase
    .from('google_analytics_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (propertyId) propertiesQuery = propertiesQuery.eq('property_id', propertyId);

  const { data: gaAccounts, error: accountsError } = await propertiesQuery;

  if (accountsError || !gaAccounts || gaAccounts.length === 0) {
    return {
      success: false,
      data: [],
      propertiesProcessed: 0,
      error: propertyId
        ? `No active property found with ID: ${propertyId}`
        : 'No active Google Analytics properties found for this user.',
    };
  }

  const ga4Metrics = requestedMetrics.map((m) => METRIC_MAPPING[m] || m).filter(Boolean);

  const allData: GA4DataRow[] = [];
  const errors: Array<{ propertyId: string; error: string }> = [];

  await Promise.all(gaAccounts.map(async (account: any) => {
    const propId = account.property_id;

    try {
      const requestBody: any = {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: ga4Metrics.map((m: string) => ({ name: m })),
      };

      if (eventName && ga4Metrics.includes('eventCount')) {
        requestBody.dimensionFilter = {
          filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: eventName } },
        };
      }

      const response = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `GA4 Data API error: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText.substring(0, 200) || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.rows && Array.isArray(data.rows)) {
        const metricHeaderMap = new Map<string, number>();
        if (data.metricHeaders && Array.isArray(data.metricHeaders)) {
          data.metricHeaders.forEach((header: any, index: number) => {
            if (header?.name) metricHeaderMap.set(header.name, index);
          });
        }

        for (const row of data.rows) {
          const dateValue = row.dimensionValues?.[0]?.value || '';
          const formattedDate = dateValue.length === 8 && !dateValue.includes('-')
            ? `${dateValue.substring(0, 4)}-${dateValue.substring(4, 6)}-${dateValue.substring(6, 8)}`
            : dateValue;

          const dataPoint: GA4DataRow = {
            propertyId: propId,
            propertyName: account.property_name || propId,
            date: formattedDate,
          };

          if (row.metricValues && Array.isArray(row.metricValues)) {
            ga4Metrics.forEach((metric: string) => {
              const metricIndex = metricHeaderMap.get(metric);
              const raw = metricIndex !== undefined ? row.metricValues[metricIndex]?.value : undefined;
              dataPoint[metric] = raw !== undefined ? (parseFloat(raw) || 0) : 0;
            });
          }

          allData.push(dataPoint);
        }
      }
    } catch (error: any) {
      errors.push({ propertyId: propId, error: error.message });
    }
  }));

  // Aggregate by date across properties (matches the route's existing behavior)
  const aggregated = new Map<string, GA4DataRow>();
  for (const point of allData) {
    const existing = aggregated.get(point.date) ?? { propertyId: point.propertyId, propertyName: point.propertyName, date: point.date };
    for (const metric of ga4Metrics) {
      existing[metric] = (Number(existing[metric]) || 0) + (Number(point[metric]) || 0);
    }
    aggregated.set(point.date, existing);
  }
  const finalData = Array.from(aggregated.values()).sort((a, b) => a.date.localeCompare(b.date));

  if (finalData.length === 0 && errors.length > 0) {
    return {
      success: false,
      data: [],
      propertiesProcessed: gaAccounts.length,
      error: errors.map((e) => e.error).join('; '),
      errors,
    };
  }

  // Persist to the cache table — one row per (date, metric_name), mirroring
  // the shape the (previously unused) sync-metrics route already wrote.
  if (finalData.length > 0) {
    try {
      const gaPropId = gaAccounts[0].property_id;
      const insertRows: any[] = [];
      for (const point of finalData) {
        for (const metric of ga4Metrics) {
          if (point[metric] === undefined) continue;
          insertRows.push({
            user_id: userId,
            client_id: clientId || null,
            property_id: gaPropId,
            date: point.date,
            metric_name: metric,
            metric_value: point[metric],
            users_count: 0,
          });
        }
      }
      if (insertRows.length > 0) {
        const { error: upsertError } = await supabase
          .from('google_analytics_metrics')
          .upsert(insertRows, { onConflict: 'user_id,property_id,date,metric_name' });
        if (upsertError) console.error('Failed to persist GA4 metrics:', upsertError);
      }
    } catch (saveError) {
      console.error('Failed to persist GA4 metrics:', saveError);
    }
  }

  await markSynced(supabase, connectionRowId);

  return {
    success: true,
    data: finalData,
    propertiesProcessed: gaAccounts.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}
