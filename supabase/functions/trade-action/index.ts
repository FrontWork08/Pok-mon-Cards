import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

function getSecretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    const parsed = JSON.parse(modern);
    if (parsed.default) return parsed.default as string;
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = getSecretKey();
  if (!url || !secretKey) return Response.json({ error: "Server configuration error" }, { status: 500 });

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;

  let rpcName = "";
  let args: Record<string, unknown> = {};

  if (action === "create") {
    if (!body.receiverId) return Response.json({ error: "receiverId is required" }, { status: 400 });
    rpcName = "server_create_trade";
    args = { p_sender_id: user.id, p_receiver_id: body.receiverId };
  } else if (action === "set_cards") {
    if (!body.tradeId || !Array.isArray(body.cards)) return Response.json({ error: "tradeId and cards are required" }, { status: 400 });
    rpcName = "server_set_trade_cards";
    args = { p_actor_id: user.id, p_trade_id: body.tradeId, p_cards: body.cards };
  } else if (action === "confirm") {
    if (!body.tradeId) return Response.json({ error: "tradeId is required" }, { status: 400 });
    rpcName = "server_confirm_trade";
    args = { p_actor_id: user.id, p_trade_id: body.tradeId };
  } else if (action === "cancel") {
    if (!body.tradeId) return Response.json({ error: "tradeId is required" }, { status: 400 });
    rpcName = "server_cancel_trade";
    args = { p_actor_id: user.id, p_trade_id: body.tradeId };
  } else {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data, error } = await admin.rpc(rpcName, args);
  if (error) return Response.json({ error: error.message }, { status: 409 });

  return Response.json({ data });
});
