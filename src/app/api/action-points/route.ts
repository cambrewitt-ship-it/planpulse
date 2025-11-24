import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

// GET - Fetch action points for a channel type
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelType = searchParams.get('channel_type');

    if (!channelType) {
      return NextResponse.json(
        { error: 'channel_type is required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('action_points')
      .select('*')
      .eq('channel_type', channelType)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching action points:', error);
      return NextResponse.json(
        { error: 'Failed to fetch action points' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('Error in GET /api/action-points:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new action point
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel_type, text, category, reset_frequency } = body;

    if (!channel_type || !text || !text.trim()) {
      return NextResponse.json(
        { error: 'channel_type and text are required' },
        { status: 400 }
      );
    }

    if (!category || !['SET UP', 'ONGOING'].includes(category)) {
      return NextResponse.json(
        { error: 'category must be either "SET UP" or "ONGOING"' },
        { status: 400 }
      );
    }

    if (category === 'ONGOING' && !reset_frequency) {
      return NextResponse.json(
        { error: 'reset_frequency is required for ONGOING action points' },
        { status: 400 }
      );
    }

    if (category === 'SET UP' && reset_frequency) {
      return NextResponse.json(
        { error: 'reset_frequency should not be set for SET UP action points' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('action_points')
      .insert({
        channel_type,
        text: text.trim(),
        category,
        reset_frequency: category === 'ONGOING' ? reset_frequency : null,
        completed: false
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating action point:', error);
      return NextResponse.json(
        { error: 'Failed to create action point' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error in POST /api/action-points:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update an action point
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, text, completed, category, reset_frequency } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updateData: any = {};
    if (text !== undefined) {
      if (!text.trim()) {
        return NextResponse.json(
          { error: 'text cannot be empty' },
          { status: 400 }
        );
      }
      updateData.text = text.trim();
    }
    if (completed !== undefined) {
      updateData.completed = completed;
    }
    if (category !== undefined) {
      if (!['SET UP', 'ONGOING'].includes(category)) {
        return NextResponse.json(
          { error: 'category must be either "SET UP" or "ONGOING"' },
          { status: 400 }
        );
      }
      updateData.category = category;
      
      // Handle reset_frequency based on category
      if (category === 'ONGOING') {
        if (!reset_frequency) {
          return NextResponse.json(
            { error: 'reset_frequency is required for ONGOING action points' },
            { status: 400 }
          );
        }
        updateData.reset_frequency = reset_frequency;
      } else {
        updateData.reset_frequency = null;
      }
    } else if (reset_frequency !== undefined) {
      // If category is not being updated but reset_frequency is, validate it
      updateData.reset_frequency = reset_frequency;
    }

    const { data, error } = await supabase
      .from('action_points')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating action point:', error);
      return NextResponse.json(
        { error: 'Failed to update action point' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error in PUT /api/action-points:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete an action point
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('action_points')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting action point:', error);
      return NextResponse.json(
        { error: 'Failed to delete action point' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/action-points:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

