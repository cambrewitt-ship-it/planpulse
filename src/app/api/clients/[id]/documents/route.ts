import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

const BUCKET_NAME = 'client-documents';

// Extract plain text from uploaded file bytes so the AI can read the content.
async function extractText(bytes: ArrayBuffer, fileName: string): Promise<string | null> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'pdf') {
    try {
      // pdf-parse is CommonJS — use require via dynamic import interop
      const mod = await import('pdf-parse');
      const pdfParse = (mod as any).default ?? mod;
      const result = await pdfParse(Buffer.from(bytes));
      return (result.text as string)?.trim() || null;
    } catch {
      return null;
    }
  }

  if (ext === 'docx') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return result.value?.trim() || null;
    } catch {
      return null;
    }
  }

  if (['txt', 'csv', 'md'].includes(ext)) {
    return Buffer.from(bytes).toString('utf-8').trim() || null;
  }

  return null;
}

const VALID_FILE_TYPES = ['contract', 'brief', 'rate_card', 'brand_guidelines', 'media_schedule', 'biz_info', 'tov', 'handover_notes', 'other'];

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

// POST — upload a document file OR save text content
export async function POST(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Text document path
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await req.json();
    const { text_content, file_type, file_name } = body as { text_content?: string; file_type?: string; file_name?: string };
    if (!text_content?.trim()) return NextResponse.json({ error: 'text_content is required' }, { status: 400 });
    if (!file_name?.trim()) return NextResponse.json({ error: 'file_name is required' }, { status: 400 });
    const safeFileType = VALID_FILE_TYPES.includes(file_type ?? '') ? file_type! : 'other';
    const { data: doc, error } = await supabase
      .from('client_documents')
      .insert({
        client_id: clientId,
        file_name: file_name.trim(),
        file_url: '',
        file_type: safeFileType,
        text_content: text_content.trim(),
        is_text_doc: true,
        uploaded_by: session.user.id,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: am } = await supabase.from('account_managers').select('name').eq('user_id', session.user.id).maybeSingle();
    return NextResponse.json({ document: { ...doc, uploader_name: am?.name ?? 'Team member' } }, { status: 201 });
  }

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

  // Extract text for AI readability (PDF, DOCX, TXT, CSV)
  const extractedText = await extractText(bytes, file.name);

  const { error: uploadError } = await storageClient.storage
    .from(BUCKET_NAME)
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // Generate a signed URL (documents are private, not public)
  const { data: signed } = await storageClient.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7-day signed URL

  const fileUrl = signed?.signedUrl ?? path;

  // Save metadata to client_documents — include extracted text if available
  const { data: doc, error: dbError } = await supabase
    .from('client_documents')
    .insert({
      client_id: clientId,
      file_name: file.name,
      file_url: fileUrl,
      file_type: safeFileType,
      text_content: extractedText ?? null,
      is_text_doc: false,
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
