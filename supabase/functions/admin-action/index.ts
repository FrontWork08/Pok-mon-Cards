import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: corsHeaders });
function getSecretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) { try { const parsed = JSON.parse(modern); if (parsed.default) return parsed.default as string; } catch {} }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const WRITE_PERMISSION_BY_ACTION: Record<string, string> = {
  set_maintenance: "maintenance_manage",
  grant_coins: "economy_grant",
  grant_coins_batch: "economy_grant",
  grant_diamonds_batch: "economy_grant",
  remove_coins_batch: "economy_remove",
  remove_diamonds_batch: "economy_remove",
  grant_battle_pass_vip: "battlepass_grant",
  create_redeem_code: "codes_manage",
  set_redeem_code_active: "codes_manage",
  moderate: "moderate_users",
  announce: "announcements_manage",
  stop_announcement: "announcements_manage",
  start_game_event: "events_manage",
  stop_game_event: "events_manage",
  start_free_boosters: "events_manage",
  stop_free_boosters: "events_manage",
};

const ALLOWED_DELEGATED_PERMISSIONS = new Set([
  "audit_users",
  "moderate_users",
  "economy_grant",
  "economy_remove",
  "battlepass_grant",
  "codes_manage",
  "announcements_manage",
  "events_manage",
  "maintenance_manage",
  "guilds_manage",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = getSecretKey();
  if (!url || !key) return json({ error: "Server configuration error" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: "Unauthorized" }, 401);
  const { data: adminRow, error: adminError } = await admin.from("admin_members").select("player_id,role").eq("player_id", user.id).maybeSingle();
  if (adminError) return json({ error: adminError.message }, 500);
  if (!adminRow) return json({ error: "FORBIDDEN" }, 403);
  const body = await req.json().catch(() => ({}));

  const { data: access, error: accessError } = await admin.rpc("server_admin_access", {
    p_actor_id: user.id,
  });
  if (accessError) return json({ error: accessError.message }, 500);

  const isOwner = access?.role === "owner";
  const permissions = new Set(
    Array.isArray(access?.permissions)
      ? access.permissions.filter((value: unknown): value is string => typeof value === "string")
      : [],
  );
  const can = (permission: string) => isOwner || permissions.has(permission);

  const requiredPermission = WRITE_PERMISSION_BY_ACTION[String(body.action ?? "")];
  if (requiredPermission && !can(requiredPermission)) {
    return json({ error: `FORBIDDEN_PERMISSION:${requiredPermission}` }, 403);
  }

  try {
    if (body.action === "my_access") {
      return json({ data: access });
    }

    if (body.action === "account_audit") {
      if (!can("audit_users")) return json({ error: "FORBIDDEN_PERMISSION:audit_users" }, 403);
      const targetId = typeof body.targetId === "string" ? body.targetId : "";
      const packOffset = Math.max(0, Number(body.packOffset ?? 0) || 0);
      const packLimit = Math.max(10, Math.min(50, Number(body.packLimit ?? 25) || 25));
      if (!targetId) return json({ error: "INVALID_TARGET" }, 400);
      const { data, error } = await admin.rpc("server_admin_account_audit", {
        p_actor_id: user.id,
        p_target_id: targetId,
        p_pack_offset: packOffset,
        p_pack_limit: packLimit,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "admin_team") {
      if (!isOwner) return json({ error: "OWNER_ONLY" }, 403);
      const { data, error } = await admin.rpc("server_owner_admin_team", { p_actor_id: user.id });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "set_admin_access") {
      if (!isOwner) return json({ error: "OWNER_ONLY" }, 403);
      const targetId = typeof body.targetId === "string" ? body.targetId : "";
      const enabled = body.enabled === true;
      const requested = Array.isArray(body.permissions)
        ? body.permissions.filter(
            (value: unknown): value is string =>
              typeof value === "string" && ALLOWED_DELEGATED_PERMISSIONS.has(value),
          )
        : [];
      if (!targetId) return json({ error: "INVALID_TARGET" }, 400);
      const { data, error } = await admin.rpc("server_owner_set_admin_access", {
        p_actor_id: user.id,
        p_target_id: targetId,
        p_enabled: enabled,
        p_permissions: requested,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "redeem_codes" && !can("codes_manage")) {
      return json({ data: [] });
    }
    if (body.action === "set_maintenance") {
      const enabled = body.enabled === true;
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (enabled && (message.length < 1 || message.length > 500)) return json({ error: "INVALID_MAINTENANCE_MESSAGE" }, 400);
      const payload = { maintenance_enabled: enabled, maintenance_message: message || "Estamos aplicando uma atualização importante. O jogo voltará em breve.", enabled_at: enabled ? new Date().toISOString() : null, enabled_by: enabled ? user.id : null, updated_at: new Date().toISOString() };
      const { data, error } = await admin.from("app_runtime_status").update(payload).eq("id", 1).select("id,maintenance_enabled,maintenance_message,enabled_at,enabled_by,updated_at").single();
      if (error) throw error; return json({ data });
    }
    if (body.action === "overview") { const { data, error } = await admin.rpc("server_admin_overview", { p_actor_id: user.id }); if (error) throw error; return json({ data }); }
    if (body.action === "grant_coins") {
      const targetId=typeof body.targetId==="string"?body.targetId:""; const amount=Number(body.amount); const note=typeof body.note==="string"?body.note:null;
      if(!targetId||!Number.isSafeInteger(amount)||amount<1)return json({error:"INVALID_AMOUNT_OR_TARGET"},400);
      const {data,error}=await admin.rpc("server_admin_grant_coins",{p_actor_id:user.id,p_target_id:targetId,p_amount:amount,p_note:note});if(error)throw error;return json({data});
    }
    if(body.action==="grant_coins_batch"||body.action==="grant_diamonds_batch"){
      const raw=Array.isArray(body.targetIds)?body.targetIds:[];const targetIds=[...new Set(raw.filter((id):id is string=>typeof id==="string"&&id.length>0))];const amount=Number(body.amount);const note=typeof body.note==="string"?body.note:null;
      if(targetIds.length<1||targetIds.length>100||!Number.isSafeInteger(amount)||amount<1)return json({error:"INVALID_AMOUNT_OR_TARGETS"},400);
      const rpc=body.action==="grant_coins_batch"?"server_admin_grant_coins_batch":"server_admin_grant_diamonds_batch";const {data,error}=await admin.rpc(rpc,{p_actor_id:user.id,p_target_ids:targetIds,p_amount:amount,p_note:note});if(error)throw error;return json({data});
    }
    if(body.action==="remove_coins_batch"||body.action==="remove_diamonds_batch"){
      const raw=Array.isArray(body.targetIds)?body.targetIds:[];const targetIds=[...new Set(raw.filter((id):id is string=>typeof id==="string"&&id.length>0))];const amount=Number(body.amount);const note=typeof body.note==="string"?body.note:null;
      if(targetIds.length<1||targetIds.length>100||!Number.isSafeInteger(amount)||amount<1)return json({error:"INVALID_AMOUNT_OR_TARGETS"},400);
      const rpc=body.action==="remove_coins_batch"?"server_admin_remove_coins_batch":"server_admin_remove_diamonds_batch";
      const {data,error}=await admin.rpc(rpc,{p_actor_id:user.id,p_target_ids:targetIds,p_amount:amount,p_note:note});if(error)throw error;return json({data});
    }
    if(body.action==="grant_battle_pass_vip"){
      const raw=Array.isArray(body.targetIds)?body.targetIds:[];const targetIds=[...new Set(raw.filter((id):id is string=>typeof id==="string"&&id.length>0))];const note=typeof body.note==="string"?body.note:null;
      if(targetIds.length<1||targetIds.length>100)return json({error:"INVALID_TARGETS"},400);
      const {data,error}=await admin.rpc("server_admin_grant_battle_pass_vip",{p_actor_id:user.id,p_target_ids:targetIds,p_note:note});if(error)throw error;return json({data});
    }
    if(body.action==="tester_title_hub"){
      if(adminRow.role!=="owner")return json({data:{isOwner:false,title:null,friends:[]}});
      const [{data:title,error:titleError},{data:relations,error:relationsError},{data:grants,error:grantsError}]=await Promise.all([
        admin.from("achievement_definitions").select("id,name,title,description,icon").eq("id","tester_official").eq("active",true).maybeSingle(),
        admin.from("friendships").select("requester_id,addressee_id,created_at").eq("status","accepted").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).order("created_at",{ascending:true}),
        admin.from("admin_tester_title_grants").select("target_id,achievement_id,granted_at,revoked_at").eq("achievement_id","tester_official"),
      ]);
      if(titleError)throw titleError;if(relationsError)throw relationsError;if(grantsError)throw grantsError;
      const friendIds=[...new Set((relations??[]).map((row:any)=>row.requester_id===user.id?row.addressee_id:row.requester_id).filter(Boolean))];
      let players:any[]=[];
      if(friendIds.length){const {data,error}=await admin.from("players").select("id,username,level").in("id",friendIds).order("username",{ascending:true});if(error)throw error;players=data??[];}
      const activeGrants=new Map((grants??[]).filter((row:any)=>!row.revoked_at).map((row:any)=>[row.target_id,row]));
      return json({data:{isOwner:true,title:title??null,friends:players.map((player:any)=>({id:player.id,username:player.username,level:player.level,hasTitle:activeGrants.has(player.id),grantedAt:activeGrants.get(player.id)?.granted_at??null}))}});
    }
    if(body.action==="grant_tester_title"||body.action==="revoke_tester_title"){
      if(adminRow.role!=="owner")return json({error:"OWNER_ONLY"},403);
      const targetId=typeof body.targetId==="string"?body.targetId:"";const note=typeof body.note==="string"?body.note:null;
      if(!targetId)return json({error:"INVALID_TARGET"},400);
      const rpc=body.action==="grant_tester_title"?"server_owner_grant_tester_title":"server_owner_revoke_tester_title";
      const args=body.action==="grant_tester_title"
        ?{p_actor_id:user.id,p_target_id:targetId,p_achievement_id:"tester_official",p_note:note}
        :{p_actor_id:user.id,p_target_id:targetId,p_achievement_id:"tester_official"};
      const {data,error}=await admin.rpc(rpc,args);if(error)throw error;return json({data});
    }
    if(body.action==="create_redeem_code"){
      const code=typeof body.code==="string"?body.code:"";const reward=body.reward&&typeof body.reward==="object"?body.reward:{};const maxTotalUses=body.maxTotalUses==null?null:Number(body.maxTotalUses);const expiresHours=body.expiresHours==null?null:Number(body.expiresHours);
      if(!code||(maxTotalUses!=null&&(!Number.isSafeInteger(maxTotalUses)||maxTotalUses<1))||(expiresHours!=null&&(!Number.isFinite(expiresHours)||expiresHours<1||expiresHours>8760)))return json({error:"INVALID_CODE_CONFIGURATION"},400);
      const expiresAt=expiresHours==null?null:new Date(Date.now()+expiresHours*3600000).toISOString();const {data,error}=await admin.rpc("server_admin_create_redeem_code",{p_actor_id:user.id,p_code:code,p_reward:reward,p_max_total_uses:maxTotalUses,p_expires_at:expiresAt});if(error)throw error;return json({data});
    }
    if(body.action==="redeem_codes"){const {data,error}=await admin.from("redeem_codes").select("id,code,reward,active,max_total_uses,expires_at,created_at,code_redemptions(count)").order("created_at",{ascending:false}).limit(50);if(error)throw error;return json({data:data??[]});}
    if(body.action==="set_redeem_code_active"){const codeId=typeof body.codeId==="string"?body.codeId:"";const active=body.active===true;if(!codeId)return json({error:"INVALID_CODE"},400);const {data,error}=await admin.from("redeem_codes").update({active}).eq("id",codeId).select("id,code,reward,active,max_total_uses,expires_at,created_at").single();if(error)throw error;return json({data});}
    if(body.action==="players"){const {data,error}=await admin.from("players").select("id,username,level,coins,diamonds,created_at,account_status,suspended_until,moderation_reason,warning_count").order("created_at",{ascending:false});if(error)throw error;return json({data:data??[]});}
    if(body.action==="moderate"){
      const targetId=typeof body.targetId==="string"?body.targetId:"";const moderationAction=typeof body.moderationAction==="string"?body.moderationAction:"";const reason=typeof body.reason==="string"?body.reason:null;const durationHours=body.durationHours==null?null:Number(body.durationHours);
      if(!targetId||!["warn","suspend","ban","restore"].includes(moderationAction))return json({error:"INVALID_MODERATION_ACTION"},400);const {data,error}=await admin.rpc("server_admin_moderate",{p_actor_id:user.id,p_target_id:targetId,p_action:moderationAction,p_reason:reason,p_duration_hours:Number.isFinite(durationHours)?durationHours:null});if(error)throw error;return json({data});
    }
    if(body.action==="announce"){
      const title=typeof body.title==="string"?body.title:"";const announcementBody=typeof body.body==="string"?body.body:"";const severity=typeof body.severity==="string"?body.severity:"info";const durationHours=Number(body.durationHours??24);
      const {data,error}=await admin.rpc("server_admin_announce",{p_actor_id:user.id,p_title:title,p_body:announcementBody,p_severity:severity,p_duration_hours:durationHours});if(error)throw error;return json({data});
    }
    if(body.action==="announcements"){
      const now=new Date().toISOString();const {data,error}=await admin.from("global_announcements").select("id,title,body,severity,starts_at,ends_at,created_at").eq("active",true).lte("starts_at",now).or(`ends_at.is.null,ends_at.gt.${now}`).order("created_at",{ascending:false}).limit(20);if(error)throw error;return json({data:data??[]});
    }
    if(body.action==="stop_announcement"){
      const announcementId=typeof body.announcementId==="string"&&body.announcementId?body.announcementId:null;let query=admin.from("global_announcements").update({active:false,ends_at:new Date().toISOString()}).eq("active",true);if(announcementId)query=query.eq("id",announcementId);const {data,error}=await query.select("id,title,body,severity,starts_at,ends_at,created_at");if(error)throw error;return json({data:data??[]});
    }
    if(body.action==="events"){const {data,error}=await admin.from("admin_game_events").select("id,event_type,title,active,starts_at,ends_at,created_at,payload").eq("active",true).gt("ends_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(10);if(error)throw error;return json({data:data??[]});}
    if(body.action==="start_game_event"){const eventType=typeof body.eventType==="string"?body.eventType:"";const title=typeof body.title==="string"?body.title:"";const durationMinutes=Number(body.durationMinutes);const payload=body.payload&&typeof body.payload==="object"?body.payload:{};const {data,error}=await admin.rpc("server_admin_start_game_event",{p_actor_id:user.id,p_event_type:eventType,p_title:title,p_duration_minutes:durationMinutes,p_payload:payload});if(error)throw error;return json({data});}
    if(body.action==="stop_game_event"){const eventId=typeof body.eventId==="string"?body.eventId:"";if(!eventId)return json({error:"INVALID_EVENT_ID"},400);const {data,error}=await admin.rpc("server_admin_stop_game_event",{p_actor_id:user.id,p_event_id:eventId});if(error)throw error;return json({data});}
    if(body.action==="start_free_boosters"){const durationMinutes=Number(body.durationMinutes);if(!Number.isSafeInteger(durationMinutes)||durationMinutes<1||durationMinutes>1440)return json({error:"INVALID_DURATION"},400);const {data,error}=await admin.rpc("server_admin_start_free_boosters",{p_actor_id:user.id,p_duration_minutes:durationMinutes});if(error)throw error;return json({data});}
    if(body.action==="stop_free_boosters"){const {data,error}=await admin.rpc("server_admin_stop_free_boosters",{p_actor_id:user.id});if(error)throw error;return json({data});}
    if(body.action==="currency_history"){
      const [coins,diamonds]=await Promise.all([
        admin.from("admin_coin_adjustments").select("id,target_id,amount,balance_before,balance_after,note,created_at,players!admin_coin_adjustments_target_id_fkey(username)").order("created_at",{ascending:false}).limit(40),
        admin.from("admin_diamond_adjustments").select("id,target_id,amount,balance_before,balance_after,note,created_at,players!admin_diamond_adjustments_target_id_fkey(username)").order("created_at",{ascending:false}).limit(40),
      ]);
      if(coins.error)throw coins.error;if(diamonds.error)throw diamonds.error;
      const data=[
        ...(coins.data??[]).map((item:any)=>({...item,currency:"coins"})),
        ...(diamonds.data??[]).map((item:any)=>({...item,currency:"diamonds"})),
      ].sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,60);
      return json({data});
    }
    if(body.action==="coin_history"){const {data,error}=await admin.from("admin_coin_adjustments").select("id,target_id,amount,balance_before,balance_after,note,created_at,players!admin_coin_adjustments_target_id_fkey(username)").order("created_at",{ascending:false}).limit(30);if(error)throw error;return json({data:data??[]});}
    return json({error:"Invalid action"},400);
  } catch(error){const message=error instanceof Error?error.message:String(error);const status=message.includes("FORBIDDEN")?403:message.includes("NOT_FOUND")?404:message.includes("INVALID")?400:409;return json({error:message},status);}
});
