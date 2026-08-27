/**
 * Generates a short AI narrative callout for a Client Hub report section
 * (e.g. "Engagement peaked on 7 April with a 27.43% CTR..."). Mirrors the
 * AI-summary block in src/app/api/clients/[id]/report-data/route.ts — same
 * SDK, model, and fail-soft behavior — so report sections keep a consistent
 * voice without each section hand-rolling its own prompt/call.
 *
 * Callers generate this once per sync (not per page load): the public
 * /api/hub/[token]/* routes are unauthenticated and get hit repeatedly by
 * clients, so calling Anthropic live on every GET would be slow and costly.
 * Store the result (see client_hub_insights) and regenerate only on re-sync.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface GenerateInsightParams {
  clientName: string;
  periodStart: string;
  periodEnd: string;
  /** Short, pre-computed data points to ground the narrative, e.g. "CTR peaked at 27.43% on 2026-04-07". */
  facts: string[];
}

/** Returns a 2-3 sentence narrative, or '' on any failure (missing API key, rate limit, etc) — never throws. */
export async function generateInsightNarrative({ clientName, periodStart, periodEnd, facts }: GenerateInsightParams): Promise<string> {
  if (facts.length === 0) return '';
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = `Write a 2-3 sentence performance insight for ${clientName}'s campaign from ${periodStart} to ${periodEnd}.
Facts: ${facts.join('. ')}.
Be specific and cite the numbers given. Professional, concise tone. Max 100 tokens.`;
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = msg.content[0];
    return block && block.type === 'text' ? block.text : '';
  } catch {
    return '';
  }
}

/** Reads back the most recently generated insight for one section, or null if none has been synced yet. */
export async function getStoredInsight(supabase: SupabaseClient, clientId: string, sectionKey: string): Promise<string | null> {
  const { data } = await supabase
    .from('client_hub_insights')
    .select('insight_text')
    .eq('client_id', clientId)
    .eq('section_key', sectionKey)
    .maybeSingle();
  return data?.insight_text ?? null;
}
