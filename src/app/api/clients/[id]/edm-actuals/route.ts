import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch all EDM actuals for a client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const clientId = resolvedParams.id;

    if (!clientId) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('edm_actuals')
      .select('*')
      .eq('client_id', clientId)
      .order('send_date', { ascending: false });

    if (error) {
      console.error('Error fetching edm actuals:', error);
      return NextResponse.json(
        { error: 'Failed to fetch edm actuals', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error in GET /api/clients/[id]/edm-actuals:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Log an EDM send
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const clientId = resolvedParams.id;

    if (!clientId) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { channel_name, send_date, subject, notes } = body;

    if (!channel_name || !send_date) {
      return NextResponse.json(
        { error: 'channel_name and send_date are required' },
        { status: 400 }
      );
    }

    // Upsert the record
    const { data, error } = await supabase
      .from('edm_actuals')
      .upsert(
        {
          client_id: clientId,
          channel_name,
          send_date,
          subject: subject || null,
          notes: notes || null,
        },
        {
          onConflict: 'client_id,channel_name,send_date',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Error upserting edm actuals:', error);
      return NextResponse.json(
        { error: 'Failed to save edm actuals', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error in POST /api/clients/[id]/edm-actuals:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
