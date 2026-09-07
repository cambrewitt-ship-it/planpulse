import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { runCampaignAudit } from '@/lib/setup-auditor/evaluate';
import type { PlatformCampaign } from '@/types/setup-auditor';

// platform_campaigns isn't in the generated database.ts types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// POST /api/setup-auditor/campaigns/[id]/run — on-demand Setup Auditor run for one campaign
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
  if (!secretKey) return NextResponse.json({ error: 'Server misconfiguration: Nango not configured' }, { status: 500 });

  const { data: campaign, error } = await db
    .from('platform_campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  const nango = new Nango({ secretKey });
  const result = await runCampaignAudit(supabase, nango, campaign as PlatformCampaign);

  if (result.error) return NextResponse.json({ error: result.error, result }, { status: 502 });
  return NextResponse.json({ result });
}
