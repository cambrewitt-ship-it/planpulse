// API endpoints for account managers
// GET: Fetch all account managers
// POST: Create a new account manager

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface AccountManager {
  id: string;
  name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/account-managers
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('account_managers')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching account managers:', error);
      return NextResponse.json({ error: 'Failed to fetch account managers' }, { status: 500 });
    }

    return NextResponse.json({ accountManagers: data || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/account-managers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/account-managers
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, email } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('account_managers')
      .insert({
        name: name.trim(),
        email: email && typeof email === 'string' ? email.trim() || null : null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating account manager:', error);
      
      // Check for unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'An account manager with this name already exists' },
          { status: 409 }
        );
      }
      
      return NextResponse.json({ error: 'Failed to create account manager' }, { status: 500 });
    }

    return NextResponse.json({ accountManager: data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/account-managers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
