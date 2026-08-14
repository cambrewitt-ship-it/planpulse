import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

const BUCKET_NAME = 'agency-logos';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { data: base64, contentType, ext: rawExt } = body ?? {};

    if (!base64 || typeof base64 !== 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = (rawExt ?? 'png').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'png';
    const bytes = Buffer.from(base64, 'base64');

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
    const storageClient = serviceRoleKey
      ? createSupabaseAdmin(supabaseUrl, serviceRoleKey)
      : supabase;

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
      return NextResponse.json({ error: `Could not create storage bucket: ${bucketError!.message}` }, { status: 500 });
    }

    const path = `${session.user.id}/logo.${ext}`;

    const { error: uploadError } = await storageClient.storage
      .from(BUCKET_NAME)
      .upload(path, bytes, { contentType: contentType || 'application/octet-stream', upsert: true });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data } = storageClient.storage.from(BUCKET_NAME).getPublicUrl(path);
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

    const { error: dbError } = await supabase
      .from('agency_settings')
      .upsert({ user_id: session.user.id, logo_url: publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (dbError) console.error('Agency logo upload: DB update failed:', dbError.message);

    return NextResponse.json({ url: publicUrl });
  } catch (error: any) {
    console.error('Agency logo upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
