import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: corsHeaders });

function getSecretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed.default) return parsed.default as string;
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

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

  const body = await req.json().catch(() => ({}));
  const scope = body?.scope === "global" ? "global" : "owned";
  const force = body?.force === true;
  const requestedIds = Array.isArray(body?.cardIds)
    ? [...new Set(body.cardIds.filter((id: unknown) => typeof id === "string"))].slice(0, 120)
    : [];

  if (scope === "owned" && !requestedIds.length) {
    return json({ data: { results: [], refreshed: 0, requested: 0, remainingStale: 0 } });
  }

  const { data: refreshData, error: refreshError } = await admin.rpc(
    "server_refresh_owned_market_prices",
    {
      p_actor_id: user.id,
      p_card_ids: scope === "owned" ? requestedIds : null,
      p_global: scope === "global",
      p_limit: scope === "global" ? 20 : 16,
      p_force: force,
    },
  );

  if (refreshError) {
    const status = refreshError.message.includes("FORBIDDEN") ? 403 : 409;
    return json({ error: refreshError.message }, status);
  }

  if (scope === "global") {
    return json({
      data: {
        results: [],
        refreshed: Number(refreshData?.priced ?? 0),
        requested: Number(refreshData?.processed ?? 0),
        remainingStale: Number(refreshData?.remaining ?? 0),
        noPrice: Number(refreshData?.noPrice ?? 0),
        errors: Number(refreshData?.errors ?? 0),
      },
    });
  }

  const { data: rows, error: rowsError } = await admin
    .from("cards")
    .select(
      "id,market_price_usd,market_price_low_usd,market_price_high_usd,market_price_variant,market_price_source,market_price_updated_at",
    )
    .in("id", requestedIds);

  if (rowsError) return json({ error: rowsError.message }, 500);

  return json({
    data: {
      results: rows ?? [],
      refreshed: Number(refreshData?.priced ?? 0),
      requested: requestedIds.length,
      remainingStale: Number(refreshData?.remaining ?? 0),
      noPrice: Number(refreshData?.noPrice ?? 0),
      errors: Number(refreshData?.errors ?? 0),
    },
  });
});
