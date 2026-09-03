import { supabase } from '@/lib/supabase';

export type CardTag='team'|'collection'|'trade'|'sell'|'do_not_sell';

export type CardPassport={
  card:{id:string;name:string;setName:string;rarity:string|null;imageSmall:string|null;imageLarge:string|null;marketPriceUsd:number|null;gameTypes:string[]};
  ownership:{owned:boolean;quantity:number;firstObtainedAt:string|null;locked:boolean;tags:CardTag[];note:string|null;trackedTrainerCount:number};
  battle:{rounds:number;wins:number;knockouts:number};
  timeline:Array<{kind:string;sourceId:string;createdAt:string;quantity:number;metadata:Record<string,unknown>}>;
};

export async function getCardPassport(cardId:string):Promise<CardPassport>{
  const{data,error}=await supabase.rpc('get_card_passport',{p_card_id:cardId});
  if(error)throw error;
  return data as CardPassport;
}

export async function setCardMetadata(cardId:string,input:{locked?:boolean;tags?:CardTag[];note?:string|null}){
  const{data,error}=await supabase.rpc('set_my_card_metadata',{
    p_card_id:cardId,
    p_locked:input.locked??null,
    p_tags:input.tags??null,
    p_note:input.note===undefined?null:input.note,
  });
  if(error){
    if(error.message.includes('CARD_BUSY'))throw new Error('Esta carta está em uma negociação, anúncio ou aposta ativa. Remova-a dessa operação antes de bloquear.');
    if(error.message.includes('CARD_NOT_OWNED'))throw new Error('Esta carta não está mais na sua Bag.');
    throw error;
  }
  return data as {cardId:string;locked:boolean;tags:CardTag[];note:string|null};
}
