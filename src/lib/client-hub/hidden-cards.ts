/**
 * Per-card visibility within a Client Hub section. A section can be toggled
 * on as a whole (see client_hub_config.sections) while individual cards
 * inside it stay hidden from the client — e.g. Audience/demographics stays
 * visible but its "Top countries" card is hidden. Stored as
 * { [sectionKey]: cardKey[] } of hidden card keys on client_hub_config.hidden_cards.
 */

export type HiddenCards = Record<string, string[]>;

/** Registry of sections that expose individually hideable cards, and their valid card keys. */
export const CARD_REGISTRY: Record<string, string[]> = {
  demographics: ['age', 'gender', 'country'],
};

export function isCardHidden(hiddenCards: HiddenCards | null | undefined, sectionKey: string, cardKey: string): boolean {
  return !!hiddenCards?.[sectionKey]?.includes(cardKey);
}

export function sanitizeHiddenCards(input: unknown): HiddenCards {
  if (!input || typeof input !== 'object') return {};
  const out: HiddenCards = {};
  for (const [sectionKey, cards] of Object.entries(input as Record<string, unknown>)) {
    const validCards = CARD_REGISTRY[sectionKey];
    if (!validCards || !Array.isArray(cards)) continue;
    const filtered = cards.filter((c): c is string => typeof c === 'string' && validCards.includes(c));
    if (filtered.length > 0) out[sectionKey] = filtered;
  }
  return out;
}
