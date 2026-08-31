import { supabase } from '@/lib/supabase';

export type EconomyStoreItem = {
  id: string;
  category: 'profile_frame'|'profile_background'|'card_style'|'deck_style'|'shop_theme'|'booster_fx'|'title'|'trophy'|'guild_decor';
  name: string;
  description: string;
  icon: string;
  priceCoins: number;
  rarity: string;
  metadata: Record<string, unknown>;
  owned: boolean;
  quantity?: number;
};

export type EconomySinkHub = {
  live: boolean;
  adminPreview: boolean;
  softCap: { enabled:boolean; dailyCoins:number; multiplier:number };
  wallet: { coins:number; diamonds:number; level:number };
  equipped: { frameId:string|null; backgroundId:string|null; boosterFxId:string|null; economyTitleId:string|null };
  prestige: { level:number; stars:number; totalSpentCoins:number; nextCost:number };
  museum: {
    progress: { level:number; slots:number; totalSpentCoins:number; nextCost:number|null };
    cards: Array<{ slot:number; id:string; name:string; rarity:string|null; image:string|null; marketPriceUsd:number|null }>;
  };
  storeItems: EconomyStoreItem[];
  luxury: { weekStart:string; rerollCount:number; nextRerollCost:number; items:EconomyStoreItem[] };
  ownedItems: Array<EconomyStoreItem & { quantity:number }>;
  cardCustomizations: Array<{ cardId:string; cardName:string; image:string|null; styleItemId:string; styleName:string; appliedAt:string }>;
  decks: Array<{ id:string; name:string; isDefault:boolean; styleItemId:string|null; styleName:string|null }>;
  market: {
    shop: { name:string; themeStyle:string; highlightUntil:string|null }|null;
    listings: Array<{ id:string; cardId:string; cardName:string; priceCoins:number; boostedUntil:string|null; boostTier:string|null }>;
  };
  guild: null|{
    guildId:string;
    guildName:string;
    guildColor:string;
    guildLevel:number;
    project:null|{
      id:string; projectNo:number; name:string; description:string; targetCoins:number; contributedCoins:number; myContribution:number;
      topContributors:Array<{playerId:string;username:string;coins:number}>;
    };
    upgrades:Record<string,number>;
  };
  globalProject:null|{
    id:string; code:string; name:string; description:string; targetCoins:number; contributedCoins:number; completedAt:string|null;
    myContribution:number; contributors:number; rewardItemId:string|null;
  };
  auction:null|{
    id:string; itemId:string; itemName:string; itemIcon:string; minBidCoins:number; bidIncrementCoins:number;
    highestBidCoins:number|null; highestBidderId:string|null; highestBidderName:string|null;
    startsAt:string; endsAt:string; status:string; minimumNextBid:number; amIHighest:boolean;
  };
  mySinks:{ last30Days:number; lifetime:number; byType:Record<string,number> };
};

function economyError(message:string) {
  const known:Array<[string,string]> = [
    ['ECONOMY_V2_NOT_LIVE','A Economy 2.0 fica disponível para todos após a migração 1.0. O painel já está pronto para o lançamento.'],
    ['NOT_ENOUGH_COINS','Coins insuficientes para esta ação.'],
    ['ITEM_ALREADY_OWNED','Você já possui este item.'],
    ['ITEM_NOT_IN_LUXURY_ROTATION','Este item não está na sua rotação atual da Loja de Luxo.'],
    ['ITEM_NOT_AVAILABLE','Este item não está disponível agora.'],
    ['ITEM_NOT_FOR_SALE','Este item só pode ser obtido por evento ou leilão.'],
    ['ITEM_NOT_OWNED','Você ainda não possui este item.'],
    ['STYLE_NOT_OWNED','Compre este estilo antes de aplicá-lo.'],
    ['CARD_NOT_OWNED','Esta carta não está mais na sua Bag.'],
    ['DECK_NOT_OWNED','Este deck não pertence mais à sua conta.'],
    ['PRESTIGE_REQUIRES_LEVEL_5','O Prestígio de Trainer é liberado no nível 5.'],
    ['MUSEUM_MAX_LEVEL','Seu Museu já está no nível máximo.'],
    ['MUSEUM_SLOT_LOCKED','Este espaço do Museu ainda está bloqueado.'],
    ['NOT_IN_GUILD','Entre em uma guilda para contribuir com projetos coletivos.'],
    ['INVALID_CONTRIBUTION','Use uma contribuição entre 1.000 e 5.000.000 Coins.'],
    ['LISTING_NOT_ACTIVE','Esta oferta não está mais ativa.'],
    ['BID_TOO_LOW','O lance precisa superar o valor mínimo atual.'],
    ['AUCTION_NOT_ACTIVE','Este leilão já terminou ou ainda não começou.'],
    ['GYM_NOT_OWNED_BY_GUILD','Sua guilda precisa controlar este ginásio para decorá-lo.'],
  ];
  return new Error(known.find(([key])=>message.includes(key))?.[1] ?? message);
}

async function rpc<T=any>(name:string,args:Record<string,unknown> = {}):Promise<T>{
  const {data,error}=await supabase.rpc(name,args);
  if(error) throw economyError(error.message);
  return data as T;
}

function numberizeItem(item:any):EconomyStoreItem {
  return {
    ...item,
    priceCoins:Number(item?.priceCoins??0),
    owned:Boolean(item?.owned),
    quantity:item?.quantity==null?undefined:Number(item.quantity),
    metadata:item?.metadata && typeof item.metadata==='object'?item.metadata:{},
  };
}

export async function getEconomySinkHub():Promise<EconomySinkHub>{
  const value:any=await rpc('get_economy_sink_hub');
  let guildMeta:{name:string;color:string;level:number}|null=null;
  const guildId=value?.guild?.guildId?String(value.guild.guildId):'';
  if(guildId){
    const {data,error}=await supabase.from('guilds').select('name,color,level').eq('id',guildId).maybeSingle();
    if(!error&&data)guildMeta={name:String(data.name),color:String(data.color),level:Number(data.level??1)};
  }
  return {
    ...value,
    live:Boolean(value?.live),
    adminPreview:Boolean(value?.adminPreview),
    softCap:{
      enabled:Boolean(value?.softCap?.enabled),
      dailyCoins:Number(value?.softCap?.dailyCoins??0),
      multiplier:Number(value?.softCap?.multiplier??0),
    },
    wallet:{coins:Number(value?.wallet?.coins??0),diamonds:Number(value?.wallet?.diamonds??0),level:Number(value?.wallet?.level??1)},
    prestige:{
      level:Number(value?.prestige?.level??0),
      stars:Number(value?.prestige?.stars??0),
      totalSpentCoins:Number(value?.prestige?.totalSpentCoins??0),
      nextCost:Number(value?.prestige?.nextCost??0),
    },
    museum:{
      progress:{
        level:Number(value?.museum?.progress?.level??0),
        slots:Number(value?.museum?.progress?.slots??3),
        totalSpentCoins:Number(value?.museum?.progress?.totalSpentCoins??0),
        nextCost:value?.museum?.progress?.nextCost==null?null:Number(value.museum.progress.nextCost),
      },
      cards:Array.isArray(value?.museum?.cards)?value.museum.cards.map((x:any)=>({...x,slot:Number(x.slot),marketPriceUsd:x.marketPriceUsd==null?null:Number(x.marketPriceUsd)})):[],
    },
    storeItems:Array.isArray(value?.storeItems)?value.storeItems.map(numberizeItem):[],
    luxury:{
      weekStart:String(value?.luxury?.weekStart??''),
      rerollCount:Number(value?.luxury?.rerollCount??0),
      nextRerollCost:Number(value?.luxury?.nextRerollCost??15000),
      items:Array.isArray(value?.luxury?.items)?value.luxury.items.map(numberizeItem):[],
    },
    ownedItems:Array.isArray(value?.ownedItems)?value.ownedItems.map(numberizeItem):[],
    cardCustomizations:Array.isArray(value?.cardCustomizations)?value.cardCustomizations:[],
    decks:Array.isArray(value?.decks)?value.decks.map((x:any)=>({...x,isDefault:Boolean(x.isDefault)})):[],
    market:{
      shop:value?.market?.shop??null,
      listings:Array.isArray(value?.market?.listings)?value.market.listings.map((x:any)=>({...x,priceCoins:Number(x.priceCoins??0)})):[],
    },
    guild:value?.guild?{
      ...value.guild,
      guildName:guildMeta?.name??String(value.guild.guildId??'Guilda'),
      guildColor:guildMeta?.color??'#6A7CFF',
      guildLevel:guildMeta?.level??1,
      project:value.guild.project?{
        ...value.guild.project,
        projectNo:Number(value.guild.project.projectNo??0),
        targetCoins:Number(value.guild.project.targetCoins??0),
        contributedCoins:Number(value.guild.project.contributedCoins??0),
        myContribution:Number(value.guild.project.myContribution??0),
        topContributors:Array.isArray(value.guild.project.topContributors)?value.guild.project.topContributors.map((x:any)=>({...x,coins:Number(x.coins??0)})):[],
      }:null,
      upgrades:value.guild.upgrades??{},
    }:null,
    globalProject:value?.globalProject?{
      ...value.globalProject,
      targetCoins:Number(value.globalProject.targetCoins??0),
      contributedCoins:Number(value.globalProject.contributedCoins??0),
      myContribution:Number(value.globalProject.myContribution??0),
      contributors:Number(value.globalProject.contributors??0),
    }:null,
    auction:value?.auction?{
      ...value.auction,
      minBidCoins:Number(value.auction.minBidCoins??0),
      bidIncrementCoins:Number(value.auction.bidIncrementCoins??0),
      highestBidCoins:value.auction.highestBidCoins==null?null:Number(value.auction.highestBidCoins),
      minimumNextBid:Number(value.auction.minimumNextBid??0),
      amIHighest:Boolean(value.auction.amIHighest),
    }:null,
    mySinks:{
      last30Days:Number(value?.mySinks?.last30Days??0),
      lifetime:Number(value?.mySinks?.lifetime??0),
      byType:value?.mySinks?.byType??{},
    },
  } as EconomySinkHub;
}

export async function getMyEquippedBoosterFx():Promise<{id:string;name:string;icon:string;rarity:string}|null>{
  const {data:auth,error:authError}=await supabase.auth.getUser();
  if(authError)throw authError;
  const playerId=auth.user?.id;
  if(!playerId)return null;
  const {data:player,error}=await supabase
    .from('players')
    .select('equipped_booster_fx_id')
    .eq('id',playerId)
    .maybeSingle();
  if(error)throw error;
  const fxId=player?.equipped_booster_fx_id?String(player.equipped_booster_fx_id):'';
  if(!fxId)return null;
  const {data:item,error:itemError}=await supabase
    .from('economy_store_items')
    .select('id,name,icon,rarity')
    .eq('id',fxId)
    .maybeSingle();
  if(itemError)throw itemError;
  return item ? {id:String(item.id),name:String(item.name),icon:String(item.icon??'sparkles'),rarity:String(item.rarity??'standard')} : null;
}

export async function getMyCardEconomyStyle(cardId:string):Promise<{id:string;name:string;icon:string;rarity:string}|null>{
  const {data,error}=await supabase
    .from('player_card_customizations')
    .select('style_item_id')
    .eq('card_id',cardId)
    .maybeSingle();
  if(error) throw error;
  if(!data?.style_item_id)return null;
  const {data:item,error:itemError}=await supabase
    .from('economy_store_items')
    .select('id,name,icon,rarity')
    .eq('id',String(data.style_item_id))
    .maybeSingle();
  if(itemError) throw itemError;
  return item ? {id:String(item.id),name:String(item.name),icon:String(item.icon??'color-wand'),rarity:String(item.rarity??'standard')} : null;
}

export const purchaseEconomyItem=(itemId:string)=>rpc('purchase_economy_item',{p_item_id:itemId});
export const equipEconomyItem=(itemId:string)=>rpc('equip_economy_item',{p_item_id:itemId});
export const purchaseTrainerPrestige=()=>rpc('purchase_trainer_prestige');
export const rerollLuxuryShop=()=>rpc('reroll_luxury_shop');
export const applyCardEconomyStyle=(cardId:string,itemId:string)=>rpc('apply_card_economy_style',{p_card_id:cardId,p_item_id:itemId});
export const applyDeckEconomyStyle=(deckId:string,itemId:string)=>rpc('apply_deck_economy_style',{p_deck_id:deckId,p_item_id:itemId});
export const upgradeCollectionMuseum=()=>rpc('upgrade_collection_museum');
export const setCollectionMuseumCard=(slot:number,cardId:string)=>rpc('set_collection_museum_card',{p_slot:slot,p_card_id:cardId});
export const boostMarketListing=(listingId:string,tier:'6h'|'24h'|'72h')=>rpc('boost_market_listing',{p_listing_id:listingId,p_tier:tier});
export const boostMyMarketShop=(tier:'24h'|'72h'|'168h')=>rpc('boost_my_market_shop',{p_tier:tier});
export const contributeGuildProject=(amount:number)=>rpc('contribute_guild_project',{p_amount:amount});
export const contributeGlobalProject=(projectId:string,amount:number)=>rpc('contribute_global_economy_project',{p_project_id:projectId,p_amount:amount});
export const placeEconomyAuctionBid=(auctionId:string,amount:number)=>rpc('place_economy_auction_bid',{p_auction_id:auctionId,p_amount:amount});
export const purchaseGuildWarGymFlare=(gymId:string,flare:'banner'|'champion'|'legendary'|'galaxy')=>rpc('purchase_guild_war_gym_flare',{p_gym_id:gymId,p_flare:flare});

export function subscribeEconomySinks(onChange:()=>void){
  const channel=supabase.channel(`economy-sinks-${Date.now()}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'guild_projects'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'guild_project_contributions'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'economy_global_projects'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'economy_global_project_contributions'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'economy_auctions'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'market_listings'},onChange)
    .subscribe();
  return ()=>{void supabase.removeChannel(channel);};
}
