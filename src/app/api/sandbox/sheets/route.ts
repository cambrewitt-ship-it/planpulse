import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, 'sandbox-sheets', 20, 60);
  if (limited) return limited;

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    await (workbook.xlsx.load as any)(Buffer.from(bytes));
  } catch {
    return NextResponse.json({ error: 'Could not read the Excel file.' }, { status: 400 });
  }

  const sheets = workbook.worksheets.map(ws => ws.name);
  return NextResponse.json({ sheets });
}
