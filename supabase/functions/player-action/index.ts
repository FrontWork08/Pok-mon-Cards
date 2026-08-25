import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function getSecretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed.default) return parsed.default as string;
    } catch {
      // Fall back to legacy service-role env var.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = getSecretKey();
  if (!url || !secretKey) return json({ error: "Server configuration error" }, 500);

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;

  try {
    if (action === "favorite") {
      if (!body.cardId || typeof body.favorite !== "boolean") return json({ error: "cardId and favorite are required" }, 400);
      const { error } = await admin.rpc("server_set_favorite", {
        p_player_id: user.id,
        p_card_id: body.cardId,
        p_favorite: body.favorite,
      });
      if (error) throw error;
      return json({ data: { favorite: body.favorite } });
    }

    if (action === "friend") {
      if (!body.targetId || !body.friendAction) return json({ error: "targetId and friendAction are required" }, 400);
      const { data, error } = await admin.rpc("server_friend_action", {
        p_actor_id: user.id,
        p_target_id: body.targetId,
        p_action: body.friendAction,
      });
      if (error) throw error;
      return json({ data: { status: data } });
    }

    if (action === "daily") {
      const { data, error } = await admin.rpc("server_claim_daily_reward", { p_player_id: user.id });
      if (error) throw error;
      return json({ data });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("NOT_READY") ? 409 : message.includes("NOT_FOUND") || message.includes("NOT_OWNED") ? 404 : 409;
    return json({ error: message }, status);
  }
});
