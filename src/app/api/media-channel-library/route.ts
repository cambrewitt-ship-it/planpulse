import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

// GET - Fetch all media channel library entries
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('media_channel_library')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching media channel library:', error);
      return NextResponse.json(
        { error: 'Failed to fetch media channel library' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('Error in GET /api/media-channel-library:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new media channel library entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, notes, channel_type } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: 'title is required' },
        { status: 400 }
      );
    }

    if (!channel_type || !channel_type.trim()) {
      return NextResponse.json(
        { error: 'channel_type is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('media_channel_library')
      .insert({
        title: title.trim(),
        notes: notes?.trim() || null,
        channel_type: channel_type.trim()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating media channel library entry:', error);
      return NextResponse.json(
        { error: 'Failed to create media channel library entry' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error in POST /api/media-channel-library:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update a media channel library entry
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, notes } = body;

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

    const updateData: any = {};
    if (title !== undefined) {
      if (!title.trim()) {
        return NextResponse.json(
          { error: 'title cannot be empty' },
          { status: 400 }
        );
      }
      updateData.title = title.trim();
    }
    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null;
    }

    const { data, error } = await supabase
      .from('media_channel_library')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating media channel library entry:', error);
      return NextResponse.json(
        { error: 'Failed to update media channel library entry' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error in PUT /api/media-channel-library:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a media channel library entry
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
      .from('media_channel_library')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting media channel library entry:', error);
      return NextResponse.json(
        { error: 'Failed to delete media channel library entry' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/media-channel-library:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

