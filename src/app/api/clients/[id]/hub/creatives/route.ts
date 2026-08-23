import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

const BUCKET_NAME = 'client-hub-creatives';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

function adminOrSessionClient(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
  return serviceRoleKey ? createSupabaseAdmin(supabaseUrl, serviceRoleKey) : supabase;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('client_hub_creatives')
    .select('id, image_url, caption, display_order, uploaded_at')
    .eq('client_id', clientId)
    .order('display_order', { ascending: true })
    .order('uploaded_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ creatives: data });
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const clientId = await resolveId(params);
    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { data: base64, contentType, caption } = body ?? {};

    if (!base64 || typeof base64 !== 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    const ext = ALLOWED_CONTENT_TYPES[contentType];
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported image type. Use PNG, JPEG, WebP, or GIF.' }, { status: 400 });
    }

    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large (10MB max)' }, { status: 400 });
    }

    const storageClient = adminOrSessionClient(supabase);

    const { error: bucketError } = await storageClient.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: MAX_BYTES,
    });
    const alreadyExists = !bucketError || (
      bucketError.message.toLowerCase().includes('already exist') ||
      bucketError.message.toLowerCase().includes('duplicate')
    );
    if (!alreadyExists) {
      return NextResponse.json({ error: `Could not create storage bucket: ${bucketError!.message}` }, { status: 500 });
    }

    const path = `${clientId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await storageClient.storage
      .from(BUCKET_NAME)
      .upload(path, bytes, { contentType, upsert: false });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: urlData } = storageClient.storage.from(BUCKET_NAME).getPublicUrl(path);

    const { count } = await supabase
      .from('client_hub_creatives')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId);

    const { data: row, error: insertError } = await supabase
      .from('client_hub_creatives')
      .insert({
        client_id: clientId,
        image_url: urlData.publicUrl,
        caption: typeof caption === 'string' && caption.trim() ? caption.trim().slice(0, 200) : null,
        display_order: count ?? 0,
        uploaded_by: session.user.id,
      })
      .select('id, image_url, caption, display_order, uploaded_at')
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ creative: row });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: row } = await supabase
    .from('client_hub_creatives')
    .select('id, image_url')
    .eq('id', id)
    .eq('client_id', clientId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: deleteError } = await supabase.from('client_hub_creatives').delete().eq('id', id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // Best-effort storage cleanup — the row is already gone, so don't fail the request if this errors.
  const storageClient = adminOrSessionClient(supabase);
  const marker = `/${BUCKET_NAME}/`;
  const idx = row.image_url.indexOf(marker);
  if (idx !== -1) {
    const path = row.image_url.slice(idx + marker.length);
    await storageClient.storage.from(BUCKET_NAME).remove([path]).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
