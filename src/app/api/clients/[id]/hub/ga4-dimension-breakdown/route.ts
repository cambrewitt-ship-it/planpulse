import { NextRequest, NextResponse } from 'next/server';
import { subDays, format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import { getGA4DimensionExplorer } from '@/lib/client-hub/get-ga4-report';
import { isValidDimension, DEFAULT_DIMENSION } from '@/lib/client-hub/ga4-constants';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

/** Dimension Explorer row data — a cache read only, called whenever the Traffic section's dimension dropdown changes. */
export async function GET(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const dimensionParam = req.nextUrl.searchParams.get('dimension') ?? DEFAULT_DIMENSION;
  const dimension = isValidDimension(dimensionParam) ? dimensionParam : DEFAULT_DIMENSION;

  const today = new Date();
  const start = req.nextUrl.searchParams.get('start') ?? format(subDays(today, 29), 'yyyy-MM-dd');
  const end = req.nextUrl.searchParams.get('end') ?? format(today, 'yyyy-MM-dd');

  const rows = await getGA4DimensionExplorer(supabase, clientId, dimension, { start, end });
  return NextResponse.json({ period: { start, end }, dimension, rows });
}
