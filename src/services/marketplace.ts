import { supabase } from '@/lib/supabase';

export type ShopTheme = 'guild' | 'classic' | 'night';

export type MarketplaceCard = {
  id: string;
  name: string;
  rarity: string | null;
  image: string | null;
  marketPriceUsd: number | null;
};

export type MarketplaceListing = {
  id: string;
  sellerId: string;
  buyerId: string | null;
  sellerName: string;
  sellerIcon: string;
  shopName: string;
  shopTheme: ShopTheme;
  guild: { id: string; name: string; color: string } | null;
  card: MarketplaceCard;
  quantity: number;
  price: number;
  status: 'active' | 'sold' | 'cancelled';
  createdAt: string;
};

export type MarketplaceHub = {
  myId: string;
  myShop: { name: string; themeStyle: ShopTheme } | null;
  listings: MarketplaceListing[];
  myListings: MarketplaceListing[];
};

export type MarketOffer = {
  id: string;
  listingId: string;
  amountCoins: number;
  status: 'pending'|'accepted'|'rejected'|'cancelled'|'expired';
  expiresAt: string;
  createdAt: string;
  buyerId: string;
  buyerUsername: string;
  sellerId: string;
  sellerUsername: string;
  listingPrice: number;
  quantity: number;
  card: { id:string; name:string; rarity:string|null; image:string|null };
};

export type MarketOffersHub = { incoming: MarketOffer[]; outgoing: MarketOffer[] };
export type CardPricePoint = { priceUsd:number; recordedAt:string; source:string };

function normalizeListing(row: any, shops: Map<string, any>, guilds: Map<string, any>): MarketplaceListing {
  const shop = shops.get(row.seller_id);
  const membership = guilds.get(row.seller_id);
  const guild = Array.isArray(membership?.guilds) ? membership.guilds[0] : membership?.guilds;
  const card = Array.isArray(row.cards) ? row.cards[0] : row.cards;
  const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller;
  return {
    id: String(row.id),
    sellerId: String(row.seller_id),
    buyerId: row.buyer_id ? String(row.buyer_id) : null,
    sellerName: String(seller?.username ?? 'Treinador'),
    sellerIcon: String(seller?.profile_icon ?? 'pokeball'),
    shopName: String(shop?.name ?? `${seller?.username ?? 'Trainer'} Card Shop`),
    shopTheme: (shop?.theme_style ?? 'guild') as ShopTheme,
    guild: guild ? { id:String(guild.id), name:String(guild.name), color:String(guild.color) } : null,
    card: {
      id: String(card?.id ?? row.card_id),
      name: String(card?.pokemon_name ?? 'Carta'),
      rarity: card?.rarity ?? null,
      image: card?.image_small ?? card?.image_large ?? null,
      marketPriceUsd: card?.market_price_usd == null ? null : Number(card.market_price_usd),
    },
    quantity: Number(row.quantity ?? 1),
    price: Number(row.unit_price_coins ?? 0),
    status: row.status,
    createdAt: String(row.created_at),
  };
}

export async function getMarketplaceHub(): Promise<MarketplaceHub> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const myId = auth.user?.id;
  if (!myId) throw new Error('Usuário não autenticado.');
  const fields =
    'id,seller_id,buyer_id,card_id,quantity,unit_price_coins,status,created_at,' +
    'cards(id,pokemon_name,rarity,image_small,image_large,market_price_usd),' +
    'seller:players!market_listings_seller_id_fkey(id,username,profile_icon)';
  const [activeResult, mineResult] = await Promise.all([
    supabase.from('market_listings').select(fields).eq('status','active').order('created_at',{ascending:false}).limit(100),
    supabase.from('market_listings').select(fields).eq('seller_id',myId).order('created_at',{ascending:false}).limit(100),
  ]);
  if (activeResult.error) throw activeResult.error;
  if (mineResult.error) throw mineResult.error;
  const allRows = [...(activeResult.data ?? []), ...(mineResult.data ?? [])] as any[];
  const sellerIds = [...new Set(allRows.map((row) => String(row.seller_id)))];
  if (!sellerIds.includes(myId)) sellerIds.push(myId);
  const [shopResult, guildResult] = await Promise.all([
    supabase.from('player_shops').select('player_id,name,theme_style').in('player_id',sellerIds),
    supabase.from('guild_members').select('player_id,guilds(id,name,color)').in('player_id',sellerIds),
  ]);
  if (shopResult.error) throw shopResult.error;
  if (guildResult.error) throw guildResult.error;
  const shops = new Map((shopResult.data ?? []).map((row:any) => [String(row.player_id), row]));
  const guilds = new Map((guildResult.data ?? []).map((row:any) => [String(row.player_id), row]));
  const myShop = shops.get(myId);
  return {
    myId,
    myShop: myShop ? { name:String(myShop.name), themeStyle:myShop.theme_style as ShopTheme } : null,
    listings: (activeResult.data ?? []).map((row:any) => normalizeListing(row,shops,guilds)),
    myListings: (mineResult.data ?? []).map((row:any) => normalizeListing(row,shops,guilds)),
  };
}

async function action(args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('marketplace_action', {
    p_action: args.action,
    p_listing_id: args.listingId ?? null,
    p_card_id: args.cardId ?? null,
    p_quantity: args.quantity ?? null,
    p_price: args.price ?? null,
    p_shop_name: args.shopName ?? null,
    p_theme_style: args.themeStyle ?? null,
  });
  if (error) {
    const map: Record<string,string> = {
      NOT_ENOUGH_CARDS:'Você não tem cópias suficientes desta carta.',
      NOT_ENOUGH_COINS:'Coins insuficientes para esta compra.',
      LISTING_NOT_ACTIVE:'Esta oferta já foi comprada ou removida.',
      CANNOT_BUY_OWN_LISTING:'Você não pode comprar sua própria oferta.',
      LISTING_LIMIT_REACHED:'Sua loja atingiu o limite de 100 ofertas ativas.',
      INVALID_SHOP_NAME:'O nome da loja deve ter entre 3 e 32 caracteres.',
      LEGACY_CARD_LOCKED:'A última cópia desta carta está protegida pelo seu Legado Beta e não pode sair da coleção antes da migração 1.0.',
    };
    const key=Object.keys(map).find((item)=>error.message.includes(item));
    throw new Error(key ? map[key] : error.message);
  }
  return data;
}

export const saveMyShop = (name:string,themeStyle:ShopTheme) =>
  action({action:'save_shop',shopName:name,themeStyle});
export const createListing = (cardId:string,quantity:number,price:number) =>
  action({action:'list',cardId,quantity,price});
export const cancelListing = (listingId:string) =>
  action({action:'cancel',listingId});
export const buyListing = (listingId:string) =>
  action({action:'buy',listingId});

function normalizeOffer(row:any):MarketOffer{
  return {
    id:String(row.id),
    listingId:String(row.listingId),
    amountCoins:Number(row.amountCoins??0),
    status:row.status,
    expiresAt:String(row.expiresAt),
    createdAt:String(row.createdAt),
    buyerId:String(row.buyerId),
    buyerUsername:String(row.buyerUsername??'Treinador'),
    sellerId:String(row.sellerId),
    sellerUsername:String(row.sellerUsername??'Treinador'),
    listingPrice:Number(row.listingPrice??0),
    quantity:Number(row.quantity??1),
    card:{
      id:String(row.card?.id??''),
      name:String(row.card?.name??'Carta'),
      rarity:row.card?.rarity??null,
      image:row.card?.image??null,
    },
  };
}

export async function getMarketOffers():Promise<MarketOffersHub>{
  const {data,error}=await supabase.rpc('get_market_offers');
  if(error) throw error;
  return {
    incoming:Array.isArray(data?.incoming)?data.incoming.map(normalizeOffer):[],
    outgoing:Array.isArray(data?.outgoing)?data.outgoing.map(normalizeOffer):[],
  };
}
export async function createMarketOffer(listingId:string,amountCoins:number){
  const {data,error}=await supabase.rpc('create_market_offer',{p_listing_id:listingId,p_amount:amountCoins});
  if(error) throw error;
  return data;
}
export async function respondMarketOffer(offerId:string,accept:boolean){
  const {data,error}=await supabase.rpc('respond_market_offer',{p_offer_id:offerId,p_accept:accept});
  if(error) {
    if (error.message.includes('LEGACY_CARD_LOCKED')) {
      throw new Error('A última cópia desta carta está protegida pelo Legado Beta e não pode ser transferida antes da migração 1.0.');
    }
    throw error;
  }
  return data;
}
export async function cancelMarketOffer(offerId:string){
  const {data,error}=await supabase.rpc('cancel_market_offer',{p_offer_id:offerId});
  if(error) throw error;
  return data;
}
export async function getCardPriceHistory(cardId:string,limit=30):Promise<CardPricePoint[]>{
  const {data,error}=await supabase.from('card_market_price_history')
    .select('price_usd,source,recorded_at')
    .eq('card_id',cardId)
    .order('recorded_at',{ascending:false})
    .limit(Math.max(2,Math.min(limit,90)));
  if(error) throw error;
  return (data??[]).map((row:any)=>({
    priceUsd:Number(row.price_usd??0),
    source:String(row.source??'tcgplayer'),
    recordedAt:String(row.recorded_at),
  })).reverse();
}

export function subscribeMarketplace(onChange:()=>void) {
  const channel = supabase.channel(`marketplace-live-${Date.now()}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'market_listings'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'player_shops'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'market_offers'},onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
