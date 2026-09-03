import { supabase } from '@/lib/supabase';

export type EconomyLedgerRow={id:number;currency:'coins'|'diamonds';amount:number;balanceBefore:number;balanceAfter:number;reason:string;sourceType:string|null;sourceId:string|null;operationId:string|null;metadata:Record<string,unknown>;createdAt:string};
export type HealthCheck={checkedAt:string;overall:'ok'|'warning'|'error';checks:Array<{id:string;label:string;status:'ok'|'warning'|'error';detail:string}>};
export type AdminError={id:number;playerId:string|null;username:string|null;source:string;code:string|null;message:string;context:Record<string,unknown>;createdAt:string};
export type AccountMuseum={museum:{level:number;totalSpentCoins:number};displayCards:Array<{slot:number;card:{id:string;name:string;image:string|null;rarity:string|null;marketPriceUsd:number|null}}>;moments:Array<{kind:string;title:string;occurredAt:string;metadata:Record<string,unknown>}>};

export async function getMyEconomyLedger(limit=100,offset=0):Promise<EconomyLedgerRow[]>{
  const{data,error}=await supabase.rpc('get_my_economy_ledger',{p_limit:limit,p_offset:offset});
  if(error)throw error; return Array.isArray(data)?data:[];
}
export async function getAdminPlayerEconomyLedger(playerId:string,limit=100,offset=0):Promise<EconomyLedgerRow[]>{
  const{data,error}=await supabase.rpc('get_admin_player_economy_ledger',{p_target_id:playerId,p_limit:limit,p_offset:offset});
  if(error)throw error; return Array.isArray(data)?data:[];
}
export async function getAdminHealthCheck():Promise<HealthCheck>{
  const{data,error}=await supabase.rpc('get_admin_health_check'); if(error)throw error; return data as HealthCheck;
}
export async function getAdminRecentErrors(limit=100):Promise<AdminError[]>{
  const{data,error}=await supabase.rpc('get_admin_recent_errors',{p_limit:limit}); if(error)throw error; return Array.isArray(data)?data:[];
}
export async function reportClientError(source:string,error:unknown,context:Record<string,unknown>={}){
  const message=error instanceof Error?error.message:String(error);
  const code=(error as any)?.code?String((error as any).code):null;
  try { await supabase.rpc('report_client_error',{p_source:source,p_code:code,p_message:message,p_context:context}); } catch {}
}
export async function getAccountMuseum():Promise<AccountMuseum>{
  const{data,error}=await supabase.rpc('get_account_museum'); if(error)throw error; return data as AccountMuseum;
}
