import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch action points, optionally filtered by channel_type and/or client_id
// When client_id is provided, merges per-client completion state
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelType = searchParams.get('channel_type');
    const clientId = searchParams.get('client_id');

    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query = supabase
      .from('action_points')
      .select('*')
      .order('created_at', { ascending: true });

    if (channelType) {
      query = query.eq('channel_type', channelType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching action points:', error);
      return NextResponse.json(
        { error: 'Failed to fetch action points' },
        { status: 500 }
      );
    }

    // If client_id provided, overlay per-client completion state
    if (clientId && data && data.length > 0) {
      const actionPointIds = data.map((ap: any) => ap.id);

      const { data: completions } = await supabase
        .from('client_action_point_completions')
        .select('action_point_id, completed, completed_at, assigned_to')
        .eq('client_id', clientId)
        .in('action_point_id', actionPointIds);

      const completionMap = new Map(
        (completions || []).map((c: any) => [c.action_point_id, { completed: c.completed, completedAt: c.completed_at || null, assignedTo: c.assigned_to || null }])
      );

      const merged = data.map((ap: any) => {
        const comp = completionMap.get(ap.id);
        return {
          ...ap,
          completed: comp ? comp.completed : false,
          completed_at: comp ? comp.completedAt : null,
          assigned_to: comp ? comp.assignedTo : null,
        };
      });

      return NextResponse.json({ data: merged });
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
    const { channel_type, text, category, frequency, due_date, days_before_live_due } = body;

    if (!channel_type || !text || !text.trim()) {
      return NextResponse.json(
        { error: 'channel_type and text are required' },
        { status: 400 }
      );
    }

    if (!category || !['SET UP', 'HEALTH CHECK'].includes(category)) {
      return NextResponse.json(
        { error: 'category must be either "SET UP" or "HEALTH CHECK"' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const insertData: any = {
      channel_type,
      text: text.trim(),
      category,
      completed: false,
    };

    if (category === 'HEALTH CHECK' && frequency) {
      insertData.frequency = frequency;
    }

    // Prefer days_before_live_due for SET UP templates; due_date is legacy
    if (category === 'SET UP') {
      if (days_before_live_due !== undefined && days_before_live_due !== null) {
        insertData.days_before_live_due = days_before_live_due;
      } else if (due_date) {
        insertData.due_date = due_date;
      }
    }

    const { data, error } = await supabase
      .from('action_points')
      .insert(insertData)
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

// PUT - Update an action point (template fields) and/or per-client completion
// If client_id is provided, writes to client_action_point_completions for completed changes
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, text, completed, category, frequency, due_date, days_before_live_due, client_id, assigned_to } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // If client_id provided: write to per-client completions table (supports completed and/or assigned_to)
    if (client_id !== undefined && (completed !== undefined || assigned_to !== undefined)) {
      const upsertPayload: Record<string, unknown> = {
        client_id,
        action_point_id: id,
      };
      if (completed !== undefined) {
        upsertPayload.completed = completed;
        upsertPayload.completed_at = completed ? new Date().toISOString() : null;
      }
      if (assigned_to !== undefined) {
        upsertPayload.assigned_to = assigned_to;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: upsertData, error: upsertError } = await (supabase as any)
        .from('client_action_point_completions')
        .upsert(upsertPayload, { onConflict: 'client_id,action_point_id' })
        .select();

      if (upsertError) {
        console.error('Error upserting client completion:', {
          error: upsertError,
          client_id,
          action_point_id: id,
          completed,
          message: upsertError.message,
          code: upsertError.code,
          hint: upsertError.hint,
          details: upsertError.details
        });
        return NextResponse.json(
          { 
            error: 'Failed to update completion',
            details: upsertError.message || 'Unknown database error',
            code: upsertError.code,
            hint: upsertError.hint
          },
          { status: 500 }
        );
      }

      // Return the action point with the updated completion state
      const { data: ap, error: fetchError } = await supabase
        .from('action_points')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching action point after update:', fetchError);
        return NextResponse.json(
          { 
            error: 'Failed to fetch updated action point',
            details: fetchError.message
          },
          { status: 500 }
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return NextResponse.json({ data: { ...(ap as any), completed } });
    }

    // Otherwise update the template fields on action_points
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
      if (!['SET UP', 'HEALTH CHECK'].includes(category)) {
        return NextResponse.json(
          { error: 'category must be either "SET UP" or "HEALTH CHECK"' },
          { status: 400 }
        );
      }
      updateData.category = category;
    }
    if (frequency !== undefined) {
      updateData.frequency = frequency;
    }
    if (due_date !== undefined) {
      updateData.due_date = due_date;
    }
    if (days_before_live_due !== undefined) {
      updateData.days_before_live_due = days_before_live_due;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
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
      { 
        error: 'Internal server error',
        details: error.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete an action point template
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

    const supabase = await createClient();

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
