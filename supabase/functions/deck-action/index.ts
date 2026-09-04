import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:corsHeaders});
function secretKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern)try{const p=JSON.parse(modern);if(p.default)return p.default as string;}catch{}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
  const url=Deno.env.get("SUPABASE_URL")??"";
  const key=secretKey();
  if(!token||!url||!key)return json({error:"Unauthorized"},401);
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const{data:userData,error:userError}=await admin.auth.getUser(token);
  const user=userData.user;
  if(userError||!user)return json({error:"Unauthorized"},401);
  const{error:maintenanceError}=await admin.rpc("server_assert_app_active",{p_player_id:user.id});
  if(maintenanceError){const message=maintenanceError.message??"APP_MAINTENANCE";return json({error:message},message.includes("APP_MAINTENANCE")?503:500);}
  const body=await req.json().catch(()=>({}));
  try{
    if(body.action==="create"){
      const{data,error}=await admin.rpc("server_create_deck",{p_player_id:user.id,p_name:body.name});if(error)throw error;return json({data:{deckId:data}});
    }
    if(body.action==="copy"){
      const name=typeof body.name==="string"?body.name.trim():null;
      const{data,error}=await admin.rpc("server_copy_deck",{p_player_id:user.id,p_deck_id:body.deckId,p_name:name||null});
      if(error){const message=error.message??"COPY_DECK_FAILED";return json({error:message},message.includes("DECK_PRO_GAMEPASS_REQUIRED")?403:message.includes("DECK_NOT_FOUND")?404:409);}
      return json({data:{deckId:data}});
    }
    if(body.action==="set_cards"){
      const{data,error}=await admin.rpc("server_set_deck_cards",{p_player_id:user.id,p_deck_id:body.deckId,p_cards:body.cards??[]});if(error)throw error;return json({data:{cardCount:data}});
    }
    if(body.action==="set_default"){
      const{error}=await admin.rpc("server_set_default_deck",{p_player_id:user.id,p_deck_id:body.deckId});if(error)throw error;return json({data:{ok:true}});
    }
    if(body.action==="rename"){
      const name=String(body.name??"").trim();if(!name||name.length>40)return json({error:"INVALID_NAME"},400);
      const{data:deck,error:findError}=await admin.from("decks").select("id").eq("id",body.deckId).eq("player_id",user.id).maybeSingle();if(findError)throw findError;if(!deck)return json({error:"DECK_NOT_FOUND"},404);
      const{error}=await admin.from("decks").update({name,updated_at:new Date().toISOString()}).eq("id",body.deckId);if(error)throw error;return json({data:{ok:true}});
    }
    if(body.action==="delete"){
      const{data:deck,error:findError}=await admin.from("decks").select("id").eq("id",body.deckId).eq("player_id",user.id).maybeSingle();if(findError)throw findError;if(!deck)return json({error:"DECK_NOT_FOUND"},404);
      const{error}=await admin.from("decks").delete().eq("id",body.deckId);if(error)throw error;return json({data:{ok:true}});
    }
    return json({error:"Invalid action"},400);
  }catch(e){const message=e instanceof Error?e.message:String(e);return json({error:message},message.includes("NOT_FOUND")?404:409);}
});
