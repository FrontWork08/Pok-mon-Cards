import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

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
  const secret = getSecretKey();
  if (!url || !secret) return json({ error: "Server configuration error" }, 500);

  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData.user;
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const scope = body?.scope === "global" ? "global" : "owned";
  const requestedIds = Array.isArray(body?.cardIds)
    ? [...new Set(body.cardIds.filter((id: unknown) => typeof id === "string"))].slice(0, 1000)
    : [];

  if (scope === "global") {
    const { data: adminRow } = await admin
      .from("admin_members")
      .select("player_id")
      .eq("player_id", user.id)
      .maybeSingle();

    if (!adminRow) return json({ error: "FORBIDDEN" }, 403);

    const { count: pricedCount } = await admin
      .from("cards")
      .select("id", { count: "exact", head: true })
      .not("market_price_usd", "is", null);

    const { count: totalCount } = await admin
      .from("cards")
      .select("id", { count: "exact", head: true });

    return json({
      data: {
        results: [],
        refreshed: 0,
        requested: totalCount ?? 0,
        remainingStale: 0,
        priced: pricedCount ?? 0,
        mode: "fixed",
      },
    });
  }

  if (!requestedIds.length) {
    return json({ data: { results: [], refreshed: 0, mode: "fixed" } });
  }

  const { data: ownedRows, error: ownedError } = await admin
    .from("player_cards")
    .select("card_id")
    .eq("player_id", user.id)
    .gt("quantity", 0)
    .in("card_id", requestedIds);

  if (ownedError) return json({ error: ownedError.message }, 500);
  const allowedIds = (ownedRows ?? []).map((row: any) => row.card_id);
  if (!allowedIds.length) {
    return json({ data: { results: [], refreshed: 0, mode: "fixed" } });
  }

  const { data: cards, error: cardError } = await admin
    .from("cards")
    .select("id,market_price_usd,market_price_low_usd,market_price_high_usd,market_price_variant,market_price_source,market_price_updated_at")
    .in("id", allowedIds);

  if (cardError) return json({ error: cardError.message }, 500);

  return json({
    data: {
      results: cards ?? [],
      refreshed: 0,
      requested: allowedIds.length,
      remainingStale: 0,
      mode: "fixed",
    },
  });
});
