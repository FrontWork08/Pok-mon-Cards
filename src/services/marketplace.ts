import { supabase } from '@/lib/supabase';
import { createOperationId } from '@/lib/operationId';

export type ShopTheme = 'guild' | 'classic' | 'night' | 'royal' | 'neon' | 'master' | 'celestial' | 'galaxy';

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
  sellerAvatarPath: string | null;
  sellerAvatarUpdatedAt: string | null;
  sellerFrameId: string | null;
  sellerBackgroundId: string | null;
  shopName: string;
  shopTheme: ShopTheme;
  guild: { id: string; name: string; color: string } | null;
  card: MarketplaceCard;
  quantity: number;
  price: number;
  status: 'active' | 'sold' | 'cancelled';
  boostedUntil: string | null;
  boostTier: string | null;
  shopHighlightUntil: string | null;
  createdAt: string;
};

export type MarketplaceHub = {
  myId: string;
  myShop: { name: string; themeStyle: ShopTheme; highlightUntil: string | null } | null;
  ownedShopThemes: ShopTheme[];
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

function normalizeHubListing(row:any):MarketplaceListing {
  return {
    id:String(row?.id??''),
    sellerId:String(row?.sellerId??''),
    buyerId:row?.buyerId?String(row.buyerId):null,
    sellerName:String(row?.sellerName??'Treinador'),
    sellerIcon:String(row?.sellerIcon??'pokeball'),
    sellerAvatarPath:row?.sellerAvatarPath?String(row.sellerAvatarPath):null,
    sellerAvatarUpdatedAt:row?.sellerAvatarUpdatedAt?String(row.sellerAvatarUpdatedAt):null,
    sellerFrameId:row?.sellerFrameId?String(row.sellerFrameId):null,
    sellerBackgroundId:row?.sellerBackgroundId?String(row.sellerBackgroundId):null,
    shopName:String(row?.shopName??'Trainer Card Shop'),
    shopTheme:(row?.shopTheme??'guild') as ShopTheme,
    guild:row?.guild?{id:String(row.guild.id),name:String(row.guild.name),color:String(row.guild.color)}:null,
    card:{
      id:String(row?.card?.id??''),
      name:String(row?.card?.name??'Carta'),
      rarity:row?.card?.rarity??null,
      image:row?.card?.image??null,
      marketPriceUsd:row?.card?.marketPriceUsd==null?null:Number(row.card.marketPriceUsd),
    },
    quantity:Number(row?.quantity??1),
    price:Number(row?.price??0),
    status:(row?.status??'active') as MarketplaceListing['status'],
    boostedUntil:row?.boostedUntil?String(row.boostedUntil):null,
    boostTier:row?.boostTier?String(row.boostTier):null,
    shopHighlightUntil:row?.shopHighlightUntil?String(row.shopHighlightUntil):null,
    createdAt:String(row?.createdAt??''),
  };
}

export async function getMarketplaceHub(): Promise<MarketplaceHub> {
  const {data,error}=await supabase.rpc('get_marketplace_hub_v2');
  if(error) throw error;
  if(!data?.myId) throw new Error('Usuário não autenticado.');
  return {
    myId:String(data.myId),
    myShop:data.myShop?{
      name:String(data.myShop.name??''),
      themeStyle:(data.myShop.themeStyle??'guild') as ShopTheme,
      highlightUntil:data.myShop.highlightUntil?String(data.myShop.highlightUntil):null,
    }:null,
    ownedShopThemes:Array.isArray(data.ownedShopThemes)
      ? data.ownedShopThemes.map((value:unknown)=>String(value)).filter(Boolean) as ShopTheme[]
      : [],
    listings:Array.isArray(data.listings)?data.listings.map(normalizeHubListing):[],
    myListings:Array.isArray(data.myListings)?data.myListings.map(normalizeHubListing):[],
  };
}

const pendingMarketplaceOperations=new Map<string,string>();

async function action(args: Record<string, unknown>) {
  const key=JSON.stringify([args.action??null,args.listingId??null,args.cardId??null,args.quantity??null,args.price??null,args.shopName??null,args.themeStyle??null]);
  const operationId=pendingMarketplaceOperations.get(key)??createOperationId();
  pendingMarketplaceOperations.set(key,operationId);
  const { data, error } = await supabase.rpc('server_idempotent_marketplace_action', {
    p_operation_id:operationId,
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
      PREMIUM_SHOP_THEME_LOCKED:'Esse tema premium precisa ser comprado na Economy 2.1 antes de ser usado.',
      LEGACY_CARD_LOCKED:'A última cópia desta carta está protegida pelo seu Legado Beta e não pode sair da coleção antes da migração 1.0.',
      CARD_LOCKED:'Esta carta está bloqueada 🔒. Desbloqueie no Passaporte antes de anunciar.',
    };
    const key=Object.keys(map).find((item)=>error.message.includes(item));
    throw new Error(key ? map[key] : error.message);
  }
  pendingMarketplaceOperations.delete(key);
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
