import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { getClientMediaPlanBuilder, saveClientMediaPlanBuilder } from '@/lib/db/plans';

// GET - Fetch media plan builder data for a client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Handle both sync and async params (Next.js 16 compatibility)
    const resolvedParams = await Promise.resolve(params);
    const clientId = resolvedParams.id;

    if (!clientId) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await getClientMediaPlanBuilder(clientId, supabase);

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error in GET /api/clients/[id]/media-plan-builder:', error);
    
    // Check if the error is because the table doesn't exist
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return NextResponse.json(
        { 
          error: 'Database table not found', 
          details: 'Please run the migration: supabase/migrations/20251121_add_client_media_plan_builder.sql',
          message: error.message 
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error', details: error.message, code: error.code },
      { status: 500 }
    );
  }
}

// POST - Save media plan builder data for a client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Handle both sync and async params (Next.js 16 compatibility)
    const resolvedParams = await Promise.resolve(params);
    const clientId = resolvedParams.id;
    
    console.log('POST /api/clients/[id]/media-plan-builder - clientId:', clientId);
    
    let body;
    try {
      body = await request.json();
    } catch (e) {
      console.error('Error parsing request body:', e);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const { channels, commission } = body;
    console.log('Request body:', { channelsCount: channels?.length, commission });

    if (!clientId) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    if (channels === undefined || commission === undefined) {
      return NextResponse.json(
        { error: 'channels and commission are required', received: { hasChannels: channels !== undefined, hasCommission: commission !== undefined } },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Verify Supabase client is properly initialized
    if (!supabase) {
      console.error('Supabase client not initialized');
      return NextResponse.json(
        { error: 'Database connection failed', details: 'Supabase client not initialized' },
        { status: 500 }
      );
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('Error getting session:', sessionError);
      return NextResponse.json(
        { error: 'Authentication error', details: sessionError.message },
        { status: 401 }
      );
    }
    if (!session?.user) {
      console.error('Unauthorized: No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Saving media plan builder data for client:', clientId);
    
    // Validate channels data structure
    if (channels && !Array.isArray(channels)) {
      return NextResponse.json(
        { error: 'channels must be an array' },
        { status: 400 }
      );
    }
    
    // Validate commission
    if (typeof commission !== 'number' || isNaN(commission)) {
      return NextResponse.json(
        { error: 'commission must be a valid number' },
        { status: 400 }
      );
    }
    
    try {
      const result = await saveClientMediaPlanBuilder(clientId, {
        channels: channels || [],
        commission: commission || 0,
      }, supabase);

      console.log('Successfully saved media plan builder data');
      return NextResponse.json({ data: result });
    } catch (dbError: any) {
      console.error('Database error in saveClientMediaPlanBuilder:', dbError);
      // Re-throw to be caught by outer catch block
      throw dbError;
    }
  } catch (error: any) {
    console.error('Error in POST /api/clients/[id]/media-plan-builder:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack,
      name: error.name,
      cause: error.cause
    });
    
    // Check if the error is because the table doesn't exist
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return NextResponse.json(
        { 
          error: 'Database table not found', 
          details: 'Please run the migration: supabase/migrations/20251121_add_client_media_plan_builder.sql',
          message: error.message 
        },
        { status: 500 }
      );
    }
    
    // Check for fetch errors (network/connection issues)
    if (error.message?.includes('fetch failed') || error.name === 'TypeError' && error.message?.includes('fetch')) {
      return NextResponse.json(
        { 
          error: 'Database connection failed', 
          details: 'Unable to connect to the database. Please check your Supabase configuration and network connection.',
          message: error.message,
          hint: 'Verify that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set correctly'
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error.message, 
        code: error.code,
        hint: error.hint 
      },
      { status: 500 }
    );
  }
}

