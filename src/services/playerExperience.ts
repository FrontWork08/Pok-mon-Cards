import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

export type FeedbackCategory='bug'|'suggestion'|'balance'|'ux'|'other';
export type FeedbackStatus='new'|'reviewing'|'planned'|'resolved'|'closed';

export async function getWhatsNew(limit=20){
  const{data,error}=await supabase.rpc('get_my_whats_new',{p_limit:limit});
  if(error)throw error;return data as {unseenCount:number;logs:Array<{id:number;version:string;title:string;summary:string;changes:string[];publishedAt:string;seen:boolean}>};
}
export async function markUpdateSeen(id:number){
  const{error}=await supabase.rpc('mark_update_log_seen',{p_update_log_id:id});if(error)throw error;
}
export async function submitFeedback(category:FeedbackCategory,message:string,route?:string|null,context:Record<string,unknown>={}){
  const{data,error}=await supabase.rpc('submit_app_feedback',{
    p_category:category,p_message:message,p_route:route??null,
    p_app_version:Constants.expoConfig?.version??null,p_context:context,
  });
  if(error){
    if(error.message.includes('FEEDBACK_RATE_LIMIT'))throw new Error('Você enviou muitos feedbacks em pouco tempo. Tente novamente mais tarde.');
    throw error;
  }
  return String(data);
}
export async function getMyFeedback(){
  const{data,error}=await supabase.rpc('get_my_feedback');if(error)throw error;return Array.isArray(data)?data:[];
}
export async function getAdminFeedback(status?:FeedbackStatus|null,limit=100){
  const{data,error}=await supabase.rpc('get_admin_feedback',{p_status:status??null,p_limit:limit});if(error)throw error;return Array.isArray(data)?data:[];
}
export async function updateAdminFeedback(id:string,status:FeedbackStatus,note?:string|null){
  const{data,error}=await supabase.rpc('server_admin_update_feedback',{p_feedback_id:id,p_status:status,p_admin_note:note??null});if(error)throw error;return data;
}
export async function getMyFeatureFlags():Promise<Record<string,boolean>>{
  const{data,error}=await supabase.rpc('get_my_feature_flags');if(error)throw error;return(data??{}) as Record<string,boolean>;
}
export async function getAdminFeatureFlags(){
  const{data,error}=await supabase.rpc('get_admin_feature_flags');if(error)throw error;return Array.isArray(data)?data:[];
}
export async function setAdminFeatureFlag(key:string,enabled:boolean,rolloutPercent=100,testerOnly=false){
  const{data,error}=await supabase.rpc('server_admin_set_feature_flag',{p_key:key,p_enabled:enabled,p_rollout_percent:rolloutPercent,p_tester_only:testerOnly});if(error)throw error;return data;
}
export async function getBetaTesterHub(){
  const{data,error}=await supabase.rpc('get_my_beta_tester_hub');if(error)throw error;return data as any;
}
export async function getWeeklySummary(){
  const{data,error}=await supabase.rpc('get_my_weekly_summary');if(error)throw error;return data as any;
}
