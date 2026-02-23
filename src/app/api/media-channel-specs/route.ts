import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch specs for a media channel library entry
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaChannelLibraryId = searchParams.get('media_channel_library_id');

    if (!mediaChannelLibraryId) {
      return NextResponse.json(
        { error: 'media_channel_library_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('media_channel_specs')
      .select('*')
      .eq('media_channel_library_id', mediaChannelLibraryId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching media channel specs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch media channel specs' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('Error in GET /api/media-channel-specs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new spec
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { media_channel_library_id, spec_text } = body;

    if (!media_channel_library_id) {
      return NextResponse.json(
        { error: 'media_channel_library_id is required' },
        { status: 400 }
      );
    }

    if (!spec_text || !spec_text.trim()) {
      return NextResponse.json(
        { error: 'spec_text is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('media_channel_specs')
      .insert({
        media_channel_library_id,
        spec_text: spec_text.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating media channel spec:', error);
      return NextResponse.json(
        { error: 'Failed to create media channel spec' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error in POST /api/media-channel-specs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update a spec
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, spec_text } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    if (!spec_text || !spec_text.trim()) {
      return NextResponse.json(
        { error: 'spec_text is required and cannot be empty' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('media_channel_specs')
      .update({ spec_text: spec_text.trim() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating media channel spec:', error);
      return NextResponse.json(
        { error: 'Failed to update media channel spec' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error in PUT /api/media-channel-specs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a spec
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
      .from('media_channel_specs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting media channel spec:', error);
      return NextResponse.json(
        { error: 'Failed to delete media channel spec' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/media-channel-specs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
