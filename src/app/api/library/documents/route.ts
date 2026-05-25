import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

const BUCKET_NAME = 'library-documents';

const VALID_CATEGORIES = [
  'process', 'sop', 'brand_guidelines', 'billing', 'onboarding',
  'strategy', 'reporting', 'compliance', 'other',
];

async function extractText(bytes: ArrayBuffer, fileName: string): Promise<string | null> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'pdf') {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: Buffer.from(bytes) });
      const result = await parser.getText();
      return result.text?.trim() || null;
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
    try {
      return Buffer.from(bytes).toString('utf-8').trim() || null;
    } catch {
      return null;
    }
  }

  return null;
}

// GET — list all library documents for this agency
export async function GET(_req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: docs, error } = await supabase
    .from('library_documents')
    .select('id, file_name, file_url, doc_category, is_text_doc, uploaded_at, uploaded_by, text_content')
    .eq('user_id', session.user.id)
    .order('uploaded_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

// POST — upload a file or save pasted text
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = req.headers.get('content-type') ?? '';

  // Text / paste path
  if (contentType.includes('application/json')) {
    const body = await req.json();
    const { text_content, doc_category, file_name } = body as {
      text_content?: string; doc_category?: string; file_name?: string;
    };
    if (!text_content?.trim()) return NextResponse.json({ error: 'text_content is required' }, { status: 400 });
    if (!file_name?.trim()) return NextResponse.json({ error: 'file_name is required' }, { status: 400 });

    const safeCategory = VALID_CATEGORIES.includes(doc_category ?? '') ? doc_category! : 'other';
    const { data: doc, error } = await supabase
      .from('library_documents')
      .insert({
        user_id: session.user.id,
        file_name: file_name.trim(),
        file_url: '',
        doc_category: safeCategory,
        text_content: text_content.trim(),
        is_text_doc: true,
        uploaded_by: session.user.id,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ document: doc }, { status: 201 });
  }

  // File upload path
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const docCategory = (formData.get('doc_category') as string | null) ?? 'other';

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const safeCategory = VALID_CATEGORIES.includes(docCategory) ? docCategory : 'other';

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
    const storageClient = serviceRoleKey
      ? createSupabaseAdmin(supabaseUrl, serviceRoleKey)
      : supabase;

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
      return NextResponse.json({ error: `Could not create storage bucket: ${bucketError!.message}` }, { status: 500 });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${session.user.id}/${timestamp}_${safeName}`;
    const bytes = await file.arrayBuffer();

    const extractedText = await extractText(bytes, file.name);

    const { error: uploadError } = await storageClient.storage
      .from(BUCKET_NAME)
      .upload(storagePath, bytes, { contentType: file.type || 'application/octet-stream', upsert: false });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: signed } = await storageClient.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    const fileUrl = signed?.signedUrl ?? storagePath;

    const { data: doc, error: dbError } = await supabase
      .from('library_documents')
      .insert({
        user_id: session.user.id,
        file_name: file.name,
        file_url: fileUrl,
        doc_category: safeCategory,
        text_content: extractedText ?? null,
        is_text_doc: false,
        uploaded_by: session.user.id,
      })
      .select()
      .single();

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err: any) {
    console.error('[library/documents/upload] unexpected error:', err);
    return NextResponse.json({ error: err?.message ?? 'Upload failed' }, { status: 500 });
  }
}
