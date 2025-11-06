// src/app/api/integrations/check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(req: NextRequest) {
  const { provider, clientId } = await req.json();

  try {
    // Check if integration exists in your database
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('client_id', clientId)
      .eq('provider', provider)
      .single();

    if (error || !data) {
      return NextResponse.json({ connected: false });
    }

    // You could also verify with Nango here using the secret key
    // But for now, trust your database
    return NextResponse.json({
      connected: true,
      connectionId: data.connection_id,
      lastSync: data.last_sync
    });
  } catch (error) {
    return NextResponse.json({ connected: false });
  }
}