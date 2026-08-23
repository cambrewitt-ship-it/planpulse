import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import { CARD_REGISTRY, sanitizeHiddenCards, type HiddenCards } from '@/lib/client-hub/hidden-cards';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

// PATCH — flip one card's client-visibility flag within a section. Body: { section, card, hidden }
export async function PATCH(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { section, card, hidden } = await req.json();
  const validCards = CARD_REGISTRY[section];
  if (!validCards || !validCards.includes(card) || typeof hidden !== 'boolean') {
    return NextResponse.json({ error: 'section/card must be a valid pair and hidden must be a boolean' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('client_hub_config')
    .select('hidden_cards')
    .eq('client_id', clientId)
    .maybeSingle();

  const current = sanitizeHiddenCards(existing?.hidden_cards);
  const sectionHidden = new Set(current[section] ?? []);
  if (hidden) sectionHidden.add(card); else sectionHidden.delete(card);

  const hiddenCards: HiddenCards = { ...current };
  if (sectionHidden.size > 0) hiddenCards[section] = Array.from(sectionHidden);
  else delete hiddenCards[section];

  const { data, error } = await supabase
    .from('client_hub_config')
    .upsert({ client_id: clientId, hidden_cards: hiddenCards, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    .select('hidden_cards')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hiddenCards: data.hidden_cards });
}
