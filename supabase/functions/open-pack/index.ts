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

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = getSecretKey();
  if (!url || !secretKey) return Response.json({ error: "Server configuration error" }, { status: 500 });

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { packId } = await req.json();
  if (!packId) return Response.json({ error: "packId is required" }, { status: 400 });

  const { data, error } = await admin.rpc("server_open_pack", {
    p_player_id: user.id,
    p_pack_id: packId,
  });

  if (error) {
    const message = error.message ?? "Could not open pack";
    const status = message.includes("NOT_ENOUGH_COINS") ? 409 : message.includes("PACK_NOT_FOUND") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }

  return Response.json(data);
});
