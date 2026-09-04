export type TeamSelectionSortMode = 'value' | 'hp' | 'attack' | 'defense' | 'speed' | 'name';

export type TeamSelectionCardLike = {
  cardId: string;
  name: string;
  setName?: string | null;
  rarity?: string | null;
  types?: string[] | null;
  hp?: number | null;
  attack?: number | null;
  defense?: number | null;
  speed?: number | null;
  gameValue?: number | null;
};

export function getDeckCardIds(deck: unknown): Set<string> {
  const rows = Array.isArray((deck as any)?.deck_cards) ? (deck as any).deck_cards : [];
  return new Set(rows.map((row: any) => String(row?.card_id ?? '')).filter(Boolean));
}

export function getAvailableTeamTypes(cards: TeamSelectionCardLike[]): string[] {
  const values = new Set<string>();
  for (const card of cards) {
    for (const type of Array.isArray(card.types) ? card.types : []) {
      const normalized = String(type ?? '').trim().toLowerCase();
      if (normalized) values.add(normalized);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function score(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : -1;
}

export function filterAndSortTeamCards<T extends TeamSelectionCardLike>(
  cards: T[],
  options: {
    search?: string;
    typeFilter?: string | null;
    sortMode?: TeamSelectionSortMode;
    deckCardIds?: Set<string> | null;
  } = {},
): T[] {
  const search = String(options.search ?? '').trim().toLowerCase();
  const typeFilter = String(options.typeFilter ?? '').trim().toLowerCase();
  const deckCardIds = options.deckCardIds ?? null;
  const sortMode = options.sortMode ?? 'value';

  const filtered = cards.filter((card) => {
    if (deckCardIds && !deckCardIds.has(card.cardId)) return false;
    const types = (Array.isArray(card.types) ? card.types : []).map((type) => String(type).toLowerCase());
    if (typeFilter && typeFilter !== 'all' && !types.includes(typeFilter)) return false;
    if (!search) return true;
    return [card.name, card.setName, card.rarity, card.cardId, types.join(' ')]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });

  return [...filtered].sort((a, b) => {
    if (sortMode === 'name') return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
    const field = sortMode === 'hp'
      ? 'hp'
      : sortMode === 'attack'
        ? 'attack'
        : sortMode === 'defense'
          ? 'defense'
          : sortMode === 'speed'
            ? 'speed'
            : 'gameValue';
    const delta = score((b as any)[field]) - score((a as any)[field]);
    return delta || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  });
}
