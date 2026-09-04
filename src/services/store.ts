import { supabase } from '@/lib/supabase';

export type TrainerStoreCategory =
  | 'profile_frame'
  | 'profile_background'
  | 'card_style'
  | 'deck_style'
  | 'shop_theme'
  | 'booster_fx'
  | 'title'
  | 'trophy'
  | 'guild_decor'
  | 'consumable';

export type TrainerStoreItem = {
  id:string;
  category:TrainerStoreCategory;
  name:string;
  description:string;
  icon:string;
  priceCoins:number;
  rarity:string;
  metadata:Record<string,unknown>;
  owned:boolean;
  quantity:number;
  maxPurchases:number;
  luxury?:boolean;
};

export type TrainerShopCatalog = {
  live:boolean;
  adminPreview:boolean;
  wallet:{coins:number;diamonds:number;level:number};
  equipped:{frameId:string|null;backgroundId:string|null;boosterFxId:string|null;economyTitleId:string|null};
  items:TrainerStoreItem[];
  luxury:{weekStart:string;rerollCount:number;items:TrainerStoreItem[]};
  ownedCount:number;
};

function mapItem(item:any,luxury=false):TrainerStoreItem{
  return {
    id:String(item?.id??''),
    category:String(item?.category??'trophy') as TrainerStoreCategory,
    name:String(item?.name??'Item'),
    description:String(item?.description??''),
    icon:String(item?.icon??'sparkles'),
    priceCoins:Number(item?.priceCoins??0),
    rarity:String(item?.rarity??'standard'),
    metadata:item?.metadata&&typeof item.metadata==='object'?item.metadata:{},
    owned:Boolean(item?.owned),
    quantity:Number(item?.quantity??0),
    maxPurchases:Number(item?.maxPurchases??1),
    luxury,
  };
}

export async function getTrainerShopCatalog():Promise<TrainerShopCatalog>{
  const {data,error}=await supabase.rpc('get_trainer_shop_catalog');
  if(error) throw error;
  return {
    live:Boolean(data?.live),
    adminPreview:Boolean(data?.adminPreview),
    wallet:{
      coins:Number(data?.wallet?.coins??0),
      diamonds:Number(data?.wallet?.diamonds??0),
      level:Number(data?.wallet?.level??1),
    },
    equipped:{
      frameId:data?.equipped?.frameId??null,
      backgroundId:data?.equipped?.backgroundId??null,
      boosterFxId:data?.equipped?.boosterFxId??null,
      economyTitleId:data?.equipped?.economyTitleId??null,
    },
    items:Array.isArray(data?.items)?data.items.map((item:any)=>mapItem(item,false)):[],
    luxury:{
      weekStart:String(data?.luxury?.weekStart??''),
      rerollCount:Number(data?.luxury?.rerollCount??0),
      items:Array.isArray(data?.luxury?.items)?data.luxury.items.map((item:any)=>mapItem(item,true)):[],
    },
    ownedCount:Number(data?.ownedCount??0),
  };
}

function storeError(message:string){
  const known:Array<[string,string]> = [
    ['ECONOMY_V2_NOT_LIVE','A nova loja ficará liberada para todos quando a migração 1.0 estiver concluída.'],
    ['ITEM_NOT_AVAILABLE','Este item não está disponível agora.'],
    ['ITEM_NOT_FOR_SALE','Este item é exclusivo de evento, conquista ou leilão.'],
    ['ITEM_NOT_IN_LUXURY_ROTATION','Este item de luxo não está na sua rotação semanal atual.'],
    ['ITEM_ALREADY_OWNED','Você atingiu o limite de compras deste item.'],
    ['NOT_ENOUGH_COINS','Você não tem Coins suficientes para esta compra.'],
    ['ITEM_NOT_OWNED','Você ainda não possui este item.'],
    ['ITEM_NOT_EQUIPPABLE','Este item é aplicado em uma tela específica, como Carta ou Deck.'],
    ['INVALID_GIFT_RECIPIENT','Escolha um amigo válido para receber o presente.'],
    ['GIFT_RECIPIENT_NOT_FRIEND','Você só pode presentear pessoas da sua lista de amigos.'],
    ['GIFT_RECIPIENT_NOT_AVAILABLE','Esse amigo não está disponível para receber presentes agora.'],
    ['ITEM_NOT_GIFTABLE','Este item não pode ser enviado como presente.'],
    ['GIFT_RECIPIENT_ALREADY_OWNS','Esse amigo atingiu o limite deste item.'],
  ];
  return new Error(known.find(([key])=>message.includes(key))?.[1]??message);
}

export async function buyTrainerStoreItem(itemId:string){
  const {data,error}=await supabase.rpc('purchase_economy_item',{p_item_id:itemId});
  if(error) throw storeError(error.message);
  return data as {ok:boolean;itemId:string;category:string;coins:number;ownedQuantity:number;lucky2xRemaining?:number};
}

export async function equipTrainerStoreItem(itemId:string){
  const {data,error}=await supabase.rpc('equip_economy_item',{p_item_id:itemId});
  if(error) throw storeError(error.message);
  return data as {ok:boolean;itemId:string;category:string};
}

export async function giftTrainerStoreItem(itemId:string,recipientId:string,message:string){
  const cleanMessage=message.trim().slice(0,180);
  const {data,error}=await supabase.rpc('gift_trainer_store_item',{
    p_item_id:itemId,
    p_recipient_id:recipientId,
    p_message:cleanMessage,
  });
  if(error) throw storeError(error.message);
  return data as {
    ok:boolean;
    giftId:string;
    recipientId:string;
    recipientName:string;
    itemId:string;
    itemName:string;
    spentCoins:number;
    coins:number;
    message:string;
  };
}
