import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

const BUCKET_NAME = 'client-logos';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const clientId = resolvedParams.id;

    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { data: base64, contentType, ext: rawExt } = body ?? {};

    if (!base64 || typeof base64 !== 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = (rawExt ?? 'png').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'png';
    const bytes = Buffer.from(base64, 'base64');

    // Prefer service role key for storage (bypasses RLS, can create buckets)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
    const storageClient = serviceRoleKey
      ? createSupabaseAdmin(supabaseUrl, serviceRoleKey)
      : supabase;

    // Ensure bucket exists — create if missing, ignore if already exists
    const { error: bucketError } = await storageClient.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
    });
    const alreadyExists = !bucketError || (
      bucketError.message.toLowerCase().includes('already exist') ||
      bucketError.message.toLowerCase().includes('duplicate') ||
      (bucketError as any).statusCode === '409' ||
      (bucketError as any).statusCode === 409
    );
    if (!alreadyExists) {
      const hint = !serviceRoleKey
        ? ' — add SUPABASE_SERVICE_ROLE_KEY to .env.local, or create the "client-logos" bucket manually in Supabase Storage'
        : '';
      return NextResponse.json({ error: `Could not create storage bucket: ${bucketError!.message}${hint}` }, { status: 500 });
    }

    const path = `${clientId}/logo.${ext}`;

    const { error: uploadError } = await storageClient.storage
      .from(BUCKET_NAME)
      .upload(path, bytes, { contentType: contentType || 'application/octet-stream', upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = storageClient.storage.from(BUCKET_NAME).getPublicUrl(path);
    const publicUrl = data.publicUrl;

    // Update logo_url — no user_id filter; RLS enforces access for authenticated users.
    // If this fails, the client will still save the URL via a separate DB call.
    const { error: dbError } = await supabase
      .from('clients')
      .update({ logo_url: publicUrl })
      .eq('id', clientId);

    if (dbError) {
      console.error('Logo upload route: DB update failed:', dbError.message);
    }

    // Always return the URL so callers can save it themselves if the DB update above failed.
    return NextResponse.json({ url: publicUrl });
  } catch (error: any) {
    console.error('Logo upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
