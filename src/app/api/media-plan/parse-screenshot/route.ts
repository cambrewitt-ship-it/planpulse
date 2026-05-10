import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `You are a media planning expert. Analyze this media plan screenshot and extract all channels, budgets, and flight dates.

Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "channels": [
    {
      "channelName": "Meta Ads",
      "format": "Social Media",
      "totalBudget": 15000,
      "percentOfInvestment": 30,
      "flights": [
        {
          "startDate": "2025-01-06",
          "endDate": "2025-03-30",
          "monthlySpend": {
            "2025-1": 5000,
            "2025-2": 5000,
            "2025-3": 5000
          }
        }
      ]
    }
  ]
}

Rules:
- channelName must match one of these if possible: "Meta Ads", "Google Ads", "Display Ads", "Native Ads", "LinkedIn Ads", "TikTok Ads", "Instagram Ads", "YouTube Ads", "Snapchat Ads", "Reddit Ads", "Instagram (Organic)", "Facebook (Organic)", "LinkedIn (Organic)", "EDM / Email", "OOH", "Radio", "Linear TV", "SVOD", "BVOD", "Other"
- format: a short description of the ad format (e.g. "Feed + Stories", "Search + Display", "EDM Campaign")
- totalBudget: total budget across all flights for this channel (number, no currency symbol)
- percentOfInvestment: percentage of total media budget (number, 0-100)
- flights: date ranges when this channel is active. Use Monday dates for startDate (YYYY-MM-DD format)
- monthlySpend: budget split by month. Keys are "YYYY-M" (e.g. "2025-1" for January 2025). Values are numbers.
- If exact dates are unclear, infer from visible week columns or month headers
- If monthly breakdown is not visible, distribute totalBudget evenly across months in the date range
- If percentOfInvestment is not visible, calculate from totalBudget relative to the sum of all channels`;

export interface ParsedChannel {
  channelName: string;
  format: string;
  totalBudget: number;
  percentOfInvestment: number;
  flights: Array<{
    startDate: string;
    endDate: string;
    monthlySpend: Record<string, number>;
  }>;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { image: string; mimeType: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { image, mimeType } = body;
  if (!image || !mimeType) {
    return NextResponse.json({ error: 'image and mimeType are required' }, { status: 400 });
  }

  const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validMimeTypes.includes(mimeType)) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: image,
              },
            },
            {
              type: 'text',
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';

    // Strip markdown code fences if Claude wrapped the JSON
    const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    let parsed: { channels: ParsedChannel[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'Failed to parse Claude response as JSON', raw: text }, { status: 500 });
    }

    if (!Array.isArray(parsed.channels)) {
      return NextResponse.json({ error: 'Unexpected response structure from Claude' }, { status: 500 });
    }

    return NextResponse.json({ channels: parsed.channels });
  } catch (err: any) {
    console.error('Error calling Claude for screenshot parsing:', err);
    return NextResponse.json({ error: err.message ?? 'Failed to analyze screenshot' }, { status: 500 });
  }
}
