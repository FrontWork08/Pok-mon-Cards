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

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = getSecretKey();
  if (!url || !secretKey) return json({ error: "Server configuration error" }, 500);

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  if (body.kind === "legendary_diamond") {
    const { data, error } = await admin.rpc("server_open_legendary_diamond_pack", {
      p_player_id: user.id,
    });
    if (error) {
      const message = error.message ?? "Could not open legendary pack";
      const status =
        message.includes("NOT_ENOUGH_DIAMONDS") ? 409 :
        message.includes("PACK_NOT_AVAILABLE") ? 404 :
        message.includes("NO_ELIGIBLE_LEGENDARY_CARDS") ? 409 : 500;
      return json({ error: message }, status);
    }
    return json(data);
  }
  const packId = body.packId;
  if (!packId) return json({ error: "packId is required" }, 400);

  const { data, error } = await admin.rpc("server_open_pack", {
    p_player_id: user.id,
    p_pack_id: packId,
  });

  if (error) {
    const message = error.message ?? "Could not open pack";
    const status = message.includes("NOT_ENOUGH_COINS") || message.includes("NOT_ENOUGH_DIAMONDS")
      ? 409
      : message.includes("PACK_NOT_FOUND")
        ? 404
        : 500;
    return json({ error: message }, status);
  }

  return json(data);
});
