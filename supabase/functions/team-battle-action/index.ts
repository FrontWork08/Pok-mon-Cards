import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:corsHeaders});
function readableError(error:unknown){if(error instanceof Error)return error.message;if(typeof error==="string")return error;if(error&&typeof error==="object"){const item=error as Record<string,unknown>;for(const key of ["message","error","details","hint","code"]){const value=item[key];if(typeof value==="string"&&value.trim())return value;}try{return JSON.stringify(error)}catch{}}return "TEAM_BATTLE_ACTION_FAILED"}
function appErrorCode(message:string){return message.toUpperCase().match(/\b[A-Z][A-Z0-9_]{2,}\b/)?.[0]??null}
function secretKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern)try{const parsed=JSON.parse(modern);if(parsed.default)return parsed.default as string}catch{}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
  const url=Deno.env.get("SUPABASE_URL")??"";const key=secretKey();
  if(!token||!url||!key)return json({error:"Unauthorized"},401);
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const {data:userData,error:userError}=await admin.auth.getUser(token);const user=userData.user;
  if(userError||!user)return json({error:"Unauthorized"},401);
  const {error:maintenanceError}=await admin.rpc("server_assert_app_active",{p_player_id:user.id});
  if(maintenanceError){const message=maintenanceError.message??"APP_MAINTENANCE";return json({error:message},message.includes("APP_MAINTENANCE")?503:500)}
  const body=await req.json().catch(()=>({}));
  async function driveBot(battleId:string){const {data,error}=await admin.rpc("server_ranked_team3_bot_take_turn",{p_battle_id:battleId});if(error)throw error;return data}
  async function state(battleId:string){const {data,error}=await admin.rpc("server_get_battle_team_state",{p_actor_id:user.id,p_battle_id:battleId});if(error)throw error;return data}
  try{
    if(body.action==="matchmaking_join"){const {data,error}=await admin.rpc("server_matchmaking_join_team3",{p_player_id:user.id});if(error)throw error;return json({data})}
    if(body.action==="eligible_cards"){const {data,error}=await admin.rpc("server_list_team_battle_cards",{p_actor_id:user.id,p_battle_id:body.battleId,p_search:body.search??null,p_limit:Number(body.limit??120),p_offset:Number(body.offset??0)});if(error)throw error;return json({data})}
    if(body.action==="create"){const {data:battleId,error}=await admin.rpc("server_create_team_battle",{p_actor_id:user.id,p_opponent_id:body.opponentId,p_rematch_of:body.rematchOf??null});if(error)throw error;return json({data:{battleId,mode:"team3",route:`/team-battle/${battleId}`}})}
    if(body.action==="respond"){const {data,error}=await admin.rpc("server_respond_team_battle",{p_actor_id:user.id,p_battle_id:body.battleId,p_accept:Boolean(body.accept)});if(error)throw error;return json({data})}
    if(body.action==="rematch"){
      const {data:previous,error:previousError}=await admin.from("battles").select("id,challenger_id,opponent_id,mode,status").eq("id",body.battleId).single();if(previousError)throw previousError;
      if(previous.mode!=="team3")throw new Error("INVALID_MODE");if(previous.status!=="completed")throw new Error("BATTLE_NOT_COMPLETED");if(![previous.challenger_id,previous.opponent_id].includes(user.id))throw new Error("FORBIDDEN");
      const opponentId=previous.challenger_id===user.id?previous.opponent_id:previous.challenger_id;const {data:battleId,error}=await admin.rpc("server_create_team_battle",{p_actor_id:user.id,p_opponent_id:opponentId,p_rematch_of:previous.id});if(error)throw error;return json({data:{battleId,mode:"team3",route:`/team-battle/${battleId}`}})
    }
    if(body.action==="state"){await driveBot(String(body.battleId));return json({data:await state(String(body.battleId))})}
    if(body.action==="set_team"){const cardIds=Array.isArray(body.cardIds)?body.cardIds.map(String):[];const {data:result,error}=await admin.rpc("server_set_battle_team",{p_actor_id:user.id,p_battle_id:body.battleId,p_card_ids:cardIds});if(error)throw error;const bot=await driveBot(String(body.battleId));return json({data:{...result,bot}})}
    if(body.action==="attack"){const {data:action,error}=await admin.rpc("server_choose_battle_team_attack",{p_actor_id:user.id,p_battle_id:body.battleId,p_attack_name:String(body.attackName??"")});if(error)throw error;let resolved=null;if(action?.bothActionsLocked){const result=await admin.rpc("server_resolve_team_turn",{p_battle_id:body.battleId});if(result.error)throw result.error;resolved=result.data}const bot=await driveBot(String(body.battleId));return json({data:{...action,resolved,bot}})}
    if(body.action==="switch"){const {data:action,error}=await admin.rpc("server_choose_battle_team_switch",{p_actor_id:user.id,p_battle_id:body.battleId,p_slot:Number(body.slot)});if(error)throw error;let resolved=action?.resolved??null;if(action?.bothActionsLocked){const result=await admin.rpc("server_resolve_team_turn",{p_battle_id:body.battleId});if(result.error)throw result.error;resolved=result.data}const bot=await driveBot(String(body.battleId));return json({data:{...action,resolved,bot}})}
    if(body.action==="timeout"){const {data:result,error}=await admin.rpc("server_timeout_team_battle",{p_actor_id:user.id,p_battle_id:body.battleId});if(error)throw error;const bot=await driveBot(String(body.battleId));return json({data:{...result,bot}})}
    if(body.action==="forfeit"){const {data,error}=await admin.rpc("server_forfeit_battle",{p_actor_id:user.id,p_battle_id:body.battleId});if(error)throw error;return json({data})}
    if(body.action==="cancel"){const {data,error}=await admin.rpc("server_cancel_battle",{p_actor_id:user.id,p_battle_id:body.battleId});if(error)throw error;return json({data:{status:data}})}
    return json({error:"Invalid action"},400)
  }catch(error){const message=readableError(error);const code=appErrorCode(message);const status=message.includes("FORBIDDEN")?403:message.includes("NOT_FOUND")?404:409;return json({error:message,code},status)}
});
