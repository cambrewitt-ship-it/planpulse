import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildExtractionPrompt(): string {
  const year = new Date().getFullYear();
  const exampleMonthly = Array.from({ length: 12 }, (_, i) => `"${year}-${i + 1}": 1250`).join(',\n            ');
  return `You are a media planning expert. Analyze this media plan screenshot and extract all channels, budgets, and flight dates.

CRITICAL: Look at the year shown in the column headers of the screenshot. Use that exact year in every date and every monthlySpend key. If you cannot read the year clearly, default to ${year}.

Return ONLY a valid JSON object — no markdown fences, no explanation text, nothing before or after the JSON. Use this exact structure:
{
  "channels": [
    {
      "channelName": "Meta Ads",
      "customChannelName": "",
      "format": "Feed + Stories",
      "totalBudget": 15000,
      "percentOfInvestment": 30,
      "flights": [
        {
          "startDate": "${year}-01-06",
          "endDate": "${year}-12-28",
          "monthlySpend": {
            ${exampleMonthly}
          }
        }
      ]
    }
  ]
}

Rules:
- channelName must match one of: "Meta Ads", "Google Ads", "Display Ads", "Native Ads", "LinkedIn Ads", "TikTok Ads", "Instagram Ads", "YouTube Ads", "Snapchat Ads", "Reddit Ads", "Instagram (Organic)", "Facebook (Organic)", "LinkedIn (Organic)", "EDM / Email", "OOH", "Radio", "Linear TV", "SVOD", "BVOD", "Other"
- If the channel doesn't match any above name (e.g. "Influencers", "Podcast", "Sponsorship"), set channelName to "Other" and put the real name in customChannelName
- customChannelName: real channel name when channelName is "Other". Empty string otherwise.
- format: short description of ad format or campaign type
- totalBudget: total spend for this channel as a plain number (no $ or commas)
- percentOfInvestment: percentage of total media budget (0-100)
- flights: active date ranges. startDate must be a Monday. ALL dates must use the year from the screenshot headers.
- EVERY channel must have at least one flight. If dates are not visible, use "${year}-01-06" to "${year}-12-28".
- monthlySpend keys must be "YEAR-MONTH" using the actual year (e.g. "${year}-1" for January ${year})
- monthlySpend values must sum exactly to totalBudget. Distribute evenly if no breakdown is visible.
- percentOfInvestment: calculate from totalBudget vs sum of all channels if not shown`;
}

export interface ParsedChannel {
  channelName: string;
  customChannelName?: string;
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
              text: buildExtractionPrompt(),
            },
          ],
        },
      ],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';

    let parsed: { channels: ParsedChannel[] } | null = null;

    // 1. Try direct parse first
    try { parsed = JSON.parse(text.trim()); } catch { /* fall through */ }

    // 2. Strip any code fences and try again
    if (!parsed) {
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      try { parsed = JSON.parse(stripped); } catch { /* fall through */ }
    }

    // 3. Find the first {...} block in the text and try to parse that
    if (!parsed) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
      }
    }

    if (!parsed || !Array.isArray(parsed.channels)) {
      console.error('Could not parse Claude response:', text.slice(0, 500));
      return NextResponse.json(
        { error: 'Could not extract media plan data from screenshot. Please try a clearer image.', raw: text.slice(0, 500) },
        { status: 500 }
      );
    }

    return NextResponse.json({ channels: parsed.channels });
  } catch (err: any) {
    console.error('Error calling Claude for screenshot parsing:', err);
    return NextResponse.json({ error: err.message ?? 'Failed to analyze screenshot' }, { status: 500 });
  }
}
