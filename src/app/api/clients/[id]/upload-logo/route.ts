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

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Prefer service role key for storage (bypasses RLS, can create buckets)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const storageClient = serviceRoleKey
      ? createSupabaseAdmin(supabaseUrl, serviceRoleKey)
      : supabase;

    // Create bucket if it doesn't exist
    const { error: bucketError } = await storageClient.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024, // 5MB
    });
    // Ignore "already exists" errors
    if (bucketError && !bucketError.message.includes('already exists')) {
      console.warn('Bucket creation warning:', bucketError.message);
    }

    const ext = file.name.split('.').pop() || 'png';
    const path = `${clientId}/logo.${ext}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await storageClient.storage
      .from(BUCKET_NAME)
      .upload(path, bytes, { contentType: file.type, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = storageClient.storage.from(BUCKET_NAME).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (error: any) {
    console.error('Logo upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
