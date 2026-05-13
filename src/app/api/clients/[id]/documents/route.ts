import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

// If no storage bucket exists yet in the project, one will be created dynamically.
// Placeholder bucket name: "client-documents" (matches the pattern of "client-logos").
const BUCKET_NAME = 'client-documents';

const VALID_FILE_TYPES = ['contract', 'brief', 'rate_card', 'brand_guidelines', 'media_schedule', 'other'];

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

// GET — list documents for this client
export async function GET(_req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: docs, error } = await supabase
    .from('client_documents')
    .select('*')
    .eq('client_id', clientId)
    .order('uploaded_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve uploader names
  const userIds = [...new Set((docs || []).map(d => d.uploaded_by).filter(Boolean))];
  let authorMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: ams } = await supabase
      .from('account_managers')
      .select('user_id, name')
      .in('user_id', userIds);
    for (const am of ams || []) {
      if (am.user_id) authorMap[am.user_id] = am.name;
    }
  }

  const enriched = (docs || []).map(d => ({
    ...d,
    uploader_name: d.uploaded_by ? (authorMap[d.uploaded_by] ?? 'Team member') : 'Team member',
  }));

  return NextResponse.json({ documents: enriched });
}

// POST — upload a document file
export async function POST(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const fileType = (formData.get('file_type') as string | null) ?? 'other';

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const safeFileType = VALID_FILE_TYPES.includes(fileType) ? fileType : 'other';

  // Use service role key for storage (bypasses RLS, can create buckets) — same pattern as logo upload
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
  const storageClient = serviceRoleKey
    ? createSupabaseAdmin(supabaseUrl, serviceRoleKey)
    : supabase;

  // Ensure bucket exists
  const { error: bucketError } = await storageClient.storage.createBucket(BUCKET_NAME, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
  });
  const bucketReady = !bucketError || (
    bucketError.message.toLowerCase().includes('already exist') ||
    bucketError.message.toLowerCase().includes('duplicate') ||
    (bucketError as any).statusCode === '409' ||
    (bucketError as any).statusCode === 409
  );
  if (!bucketReady) {
    const hint = !serviceRoleKey
      ? ' — add SUPABASE_SERVICE_ROLE_KEY to .env.local, or create the "client-documents" bucket manually in Supabase Storage'
      : '';
    return NextResponse.json({ error: `Could not create storage bucket: ${bucketError!.message}${hint}` }, { status: 500 });
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${clientId}/${timestamp}_${safeName}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await storageClient.storage
    .from(BUCKET_NAME)
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // Generate a signed URL (documents are private, not public)
  const { data: signed, error: signedError } = await storageClient.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7-day signed URL

  const fileUrl = signed?.signedUrl ?? path;

  // Save metadata to client_documents
  const { data: doc, error: dbError } = await supabase
    .from('client_documents')
    .insert({
      client_id: clientId,
      file_name: file.name,
      file_url: fileUrl,
      file_type: safeFileType,
      uploaded_by: session.user.id,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Resolve uploader name
  const { data: am } = await supabase
    .from('account_managers')
    .select('name')
    .eq('user_id', session.user.id)
    .maybeSingle();

  return NextResponse.json({
    document: { ...doc, uploader_name: am?.name ?? 'Team member', _storagePath: path },
  }, { status: 201 });
}
