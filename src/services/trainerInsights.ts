import { supabase } from '@/lib/supabase';

export type BattleFormat={id:string;name:string;description:string;icon:string;rules:Record<string,unknown>;rankedAllowed:boolean};
export type TrainerBattleStats={
  summary:{wins:number;losses:number;rating:number;bestStreak:number};
  favoritePokemon:{cardId:string;name:string;rounds:number;wins:number}|null;
  moveStats:{totalMoves:number;criticalHits:number;misses:number;superEffective:number;immunitiesHit:number;knockouts:number;topMove:string|null};
  typePerformance:Array<{type:string;rounds:number;wins:number;winRate:number}>;
};
export type SellGuidance={cardId:string;marketPriceUsd:number|null;activeCount:number;lowestActiveCoins:number|null;averageActiveCoins:number|null;recentSalesCount:number;recentSaleMinCoins:number|null;recentSaleAvgCoins:number|null;recentSaleMaxCoins:number|null;suggestedCoins:number|null};
export type ChaseItem={cardId:string;name:string;setId:string;setName:string;image:string|null;rarity:string|null;marketPriceUsd:number|null;priority:number;notifyMarket:boolean;owned:boolean;market:{listingCount:number;lowestCoins:number|null};packs:Array<{id:string;name:string;currency:string;price:number}>};
export type CollectionRecommendations={unusedStrongCards:Array<{cardId:string;name:string;image:string|null;score:number;types:string[]}>;valuableDuplicates:Array<{cardId:string;name:string;image:string|null;extraCopies:number;marketPriceUsd:number|null}>;chaseAvailable:number};

export async function getBattleFormats():Promise<BattleFormat[]>{
  const{data,error}=await supabase.rpc('get_battle_formats');if(error)throw error;return Array.isArray(data)?data:[];
}
export async function setBattleFormat(battleId:string,formatId:string){
  const{data,error}=await supabase.rpc('set_battle_format',{p_battle_id:battleId,p_format_id:formatId});if(error)throw error;return data;
}
export async function getMyTrainerBattleStats():Promise<TrainerBattleStats>{
  const{data,error}=await supabase.rpc('get_my_trainer_battle_stats');if(error)throw error;return data as TrainerBattleStats;
}
export async function getCardSellGuidance(cardId:string):Promise<SellGuidance>{
  const{data,error}=await supabase.rpc('get_card_sell_guidance',{p_card_id:cardId});if(error)throw error;return data as SellGuidance;
}
export async function getCardChaseHub():Promise<ChaseItem[]>{
  const{data,error}=await supabase.rpc('get_card_chase_hub');if(error)throw error;return Array.isArray(data)?data:[];
}
export async function getMyCollectionRecommendations():Promise<CollectionRecommendations>{
  const{data,error}=await supabase.rpc('get_my_collection_recommendations');if(error)throw error;return data as CollectionRecommendations;
}
