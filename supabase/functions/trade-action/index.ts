import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSecretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed.default) return parsed.default as string;
    } catch {
      // Fall back to the legacy service-role environment variable.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
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

  const { error: maintenanceError } = await admin.rpc("server_assert_app_active", {
    p_player_id: user.id,
  });
  if (maintenanceError) {
    const message = maintenanceError.message ?? "APP_MAINTENANCE";
    return json({ error: message }, message.includes("APP_MAINTENANCE") ? 503 : 500);
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;

  let rpcName = "";
  let args: Record<string, unknown> = {};

  if (action === "create") {
    if (!body.receiverId) return json({ error: "receiverId is required" }, 400);
    rpcName = "server_create_trade";
    args = { p_sender_id: user.id, p_receiver_id: body.receiverId };
  } else if (action === "set_cards") {
    if (!body.tradeId || !Array.isArray(body.cards)) return json({ error: "tradeId and cards are required" }, 400);
    rpcName = "server_set_trade_cards";
    args = { p_actor_id: user.id, p_trade_id: body.tradeId, p_cards: body.cards };
  } else if (action === "confirm") {
    if (!body.tradeId) return json({ error: "tradeId is required" }, 400);
    rpcName = "server_confirm_trade";
    args = { p_actor_id: user.id, p_trade_id: body.tradeId };
  } else if (action === "cancel") {
    if (!body.tradeId) return json({ error: "tradeId is required" }, 400);
    rpcName = "server_cancel_trade";
    args = { p_actor_id: user.id, p_trade_id: body.tradeId };
  } else {
    return json({ error: "Invalid action" }, 400);
  }

  const { data, error } = await admin.rpc(rpcName, args);
  if (error) return json({ error: error.message }, 409);

  return json({ data });
});
