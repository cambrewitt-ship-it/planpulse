// src/app/api/integrations/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { clientId, provider, connectionId } = await req.json();

  try {
    // Trigger a sync with Nango
    // This would normally use the Nango backend SDK
    const response = await fetch('https://api.nango.dev/sync/trigger', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NANGO_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        connectionId,
        sync: 'ad-spend-sync' // The sync script name
      })
    });

    if (!response.ok) {
      throw new Error('Failed to trigger sync');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Sync trigger failed:', error);
    return NextResponse.json(
      { error: 'Failed to trigger sync' },
      { status: 500 }
    );
  }
}