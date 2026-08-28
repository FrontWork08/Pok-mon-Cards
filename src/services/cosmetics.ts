import { supabase } from '@/lib/supabase';

export type CosmeticItem={
  id:string;
  kind:'frame'|'background';
  name:string;
  description:string;
  icon:string;
  primaryColor:string;
  secondaryColor:string;
  unlockType:string;
  threshold:number;
  unlockKey:string|null;
  unlocked:boolean;
};
export type CosmeticsHub={
  equippedFrameId:string|null;
  equippedBackgroundId:string|null;
  items:CosmeticItem[];
};

export async function getCosmeticsHub():Promise<CosmeticsHub>{
  const {data,error}=await supabase.rpc('get_cosmetics_hub');
  if(error) throw error;
  return {
    equippedFrameId:data?.equippedFrameId??null,
    equippedBackgroundId:data?.equippedBackgroundId??null,
    items:Array.isArray(data?.items)?data.items.map((item:any)=>({
      ...item,threshold:Number(item.threshold??0),unlocked:Boolean(item.unlocked),
    })):[],
  };
}

export async function equipCosmetic(id:string){
  const {data,error}=await supabase.rpc('equip_cosmetic',{p_cosmetic_id:id});
  if(error) throw error;
  return data;
}
