import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';
import { getPhysicalPackshots } from '@/data/physicalPackshots';
import { getActiveFreeBoosterEvent } from '@/services/liveEvents';

export type Pack = {
  id: string;
  name: string;
  set_id: string;
  price: number;
  base_price: number;
  free_until: string | null;
  cards_per_pack: number;
  image_url: string | null;
  art_url: string | null;
  booster_art_url: string | null;
  booster_art_urls: string[];
  booster_back_url: string | null;
  booster_logo_url: string | null;
  booster_art_source: string | null;
  release_date: string | null;
  generation: number | null;
  rarity_score: number;
  active: boolean;
  currency: 'coins' | 'diamonds';
};

export type OpenedCard = {
  id: string;
  name: string;
  rarity: string | null;
  image: string | null;
  imageLarge?: string | null;
  imageSmall?: string | null;
  isNew?: boolean;
  wishlistHit?: boolean;
  imageFallback?: string | null;
  imageFallbackLarge?: string | null;
};

export type PackCardPreview = {
  id: string;
  name: string;
  rarity: string | null;
  image: string | null;
  market_price_usd: number | null;
  image_fallback: string | null;
};

export async function listPacks(): Promise<Pack[]> {
  const [{ data, error }, freeEvent] = await Promise.all([
    supabase
      .from('packs')
      .select(
        'id,name,set_id,price,currency,cards_per_pack,image_url,art_url,booster_art_url,booster_art_urls,booster_back_url,booster_logo_url,booster_art_source,release_date,generation,rarity_score,active',
      )
      .eq('active', true)
      .order('price', { ascending: true }),
    getActiveFreeBoosterEvent(),
  ]);

  if (error) throw error;

  return (data ?? []).map((pack: any) => {
    const manifestArt = [...getPhysicalPackshots(pack.set_id)];
    const cachedArt = Array.isArray(pack.booster_art_urls) ? pack.booster_art_urls : [];
    const boosterArtUrls = cachedArt.length ? cachedArt : manifestArt;
    const basePrice = Number(pack.price ?? 0);

    return {
      ...pack,
      price: freeEvent ? 0 : basePrice,
      base_price: basePrice,
      currency: pack.currency === 'diamonds' ? 'diamonds' : 'coins',
      free_until: freeEvent?.ends_at ?? null,
      generation: pack.generation == null ? null : Number(pack.generation),
      rarity_score: Number(pack.rarity_score ?? 0),
      booster_art_url: pack.booster_art_url ?? boosterArtUrls[0] ?? null,
      booster_art_urls: boosterArtUrls,
      booster_art_source:
        pack.booster_art_source ?? (manifestArt.length ? 'ptcg-assets' : null),
    };
  });
}

export async function openPack(packId: string) {
  const { data, error } = await supabase.functions.invoke('open-pack', { body: { packId } });
  if (error) throw await normalizeFunctionError(error, 'Não foi possível abrir este booster.');
  if (data?.error) throw await normalizeFunctionError(new Error(String(data.error)), 'Não foi possível abrir este booster.');
  return data as { openingId: string; cards: OpenedCard[] };
}

export async function getLegendaryPackConfig() {
  const { data, error } = await supabase
    .from('diamond_pack_config')
    .select('cost_diamonds,min_value_usd,active')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return {
    costDiamonds: Number(data.cost_diamonds ?? 25),
    minValueUsd: Number(data.min_value_usd ?? 25),
    active: Boolean(data.active),
  };
}

export async function openLegendaryDiamondPack() {
  const { data, error } = await supabase.functions.invoke('open-pack', {
    body: { kind: 'legendary_diamond' },
  });
  if (error) throw await normalizeFunctionError(error, 'Não foi possível abrir o pacote lendário.');
  if (data?.error) throw await normalizeFunctionError(new Error(String(data.error)), 'Não foi possível abrir o pacote lendário.');
  return data as { openingId: string; cards: OpenedCard[]; diamonds: number; pricePaid: number };
}


export async function getFavoritePackIds() {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [] as string[];

  const { data, error } = await supabase
    .from('player_favorite_packs')
    .select('pack_id')
    .eq('player_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => String(row.pack_id));
}

export async function setPackFavorite(packId: string, favorite: boolean) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sessão não encontrada.');

  if (favorite) {
    const { error } = await supabase
      .from('player_favorite_packs')
      .upsert({ player_id: userId, pack_id: packId }, { onConflict: 'player_id,pack_id' });
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('player_favorite_packs')
    .delete()
    .eq('player_id', userId)
    .eq('pack_id', packId);

  if (error) throw error;
}

export async function listPackCards(setId: string, page = 0, pageSize = 36, search = '', sort: 'number'|'price-high' = 'number') {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  let query = supabase
    .from('cards')
    .select('id,pokemon_name,rarity,image_small,image_large,market_price_usd,set_id,card_number', { count: 'exact' })
    .eq('set_id', setId);
  if (search.trim()) query = query.ilike('pokemon_name', `%${search.trim()}%`);
  query = sort === 'price-high'
    ? query.order('market_price_usd', { ascending: false, nullsFirst: false })
    : query.order('card_number', { ascending: true });
  const { data, error, count } = await query.range(from, to);

  if (error) throw error;

  return {
    total: count ?? 0,
    cards: (data ?? []).map((card: any) => ({
      id: card.id,
      name: card.pokemon_name,
      rarity: card.rarity,
      image: card.image_small ?? card.image_large ?? `https://images.pokemontcg.io/${card.set_id}/${card.card_number}.png`,
      image_fallback: `https://images.pokemontcg.io/${card.set_id}/${card.card_number}.png`,
      market_price_usd: card.market_price_usd == null ? null : Number(card.market_price_usd),
    })) as PackCardPreview[],
  };
}


export async function exchangeCoinsForDiamonds(diamonds = 1) {
  const {data,error}=await supabase.rpc('exchange_coins_for_diamonds',{p_diamonds:diamonds});
  if(error) throw error;
  return {
    diamondsBought:Number(data?.diamondsBought??0),
    coinsSpent:Number(data?.coinsSpent??0),
    rate:Number(data?.rate??100000),
    coins:Number(data?.coins??0),
    diamonds:Number(data?.diamonds??0),
  };
}
