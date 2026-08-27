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

type PriceRow = {
  id: string;
  rarity: string | null;
  market_price_updated_at: string | null;
};

function numeric(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function pickTcgPlayerVariant(tcg: Record<string, any>, rarity: string | null) {
  const entries = Object.entries(tcg ?? {}).filter(([key, value]) => {
    if (key === "updated" || key === "unit") return false;
    return value && typeof value === "object";
  });

  if (!entries.length) return null;

  const rarityText = (rarity ?? "").toLowerCase();
  const holoFirst = rarityText.includes("holo") || rarityText.includes("shiny");
  const preferred = holoFirst
    ? ["holofoil", "unlimited-holofoil", "1st-edition-holofoil", "normal", "unlimited", "reverse-holofoil", "reverse"]
    : ["normal", "unlimited", "1st-edition", "holofoil", "reverse-holofoil", "reverse", "unlimited-holofoil"];

  const byKey = new Map(entries);
  const ordered = [
    ...preferred.map((key) => [key, byKey.get(key)] as const).filter(([, value]) => value),
    ...entries.filter(([key]) => !preferred.includes(key)),
  ];

  for (const [variant, price] of ordered) {
    const market = numeric(price?.marketPrice) ?? numeric(price?.midPrice) ?? numeric(price?.lowPrice);
    if (market !== null) {
      return {
        variant,
        market,
        low: numeric(price?.lowPrice),
        high: numeric(price?.highPrice),
      };
    }
  }
  return null;
}

async function fetchOne(card: PriceRow) {
  try {
    const response = await fetch(
      `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(card.id)}`,
      { headers: { "User-Agent": "Pokemon-Cards-Private-Project" } },
    );

    if (!response.ok) {
      return {
        id: card.id,
        market_price_usd: null,
        market_price_low_usd: null,
        market_price_high_usd: null,
        market_price_variant: null,
        market_price_source: `tcgdex:http_${response.status}`,
        market_price_data: {},
      };
    }

    const payload = await response.json();
    const tcg = payload?.pricing?.tcgplayer ?? null;
    const unit = String(tcg?.unit ?? "USD").toUpperCase();

    if (!tcg || unit !== "USD") {
      return {
        id: card.id,
        market_price_usd: null,
        market_price_low_usd: null,
        market_price_high_usd: null,
        market_price_variant: null,
        market_price_source: "tcgdex:tcgplayer:no_price",
        market_price_data: tcg ?? {},
      };
    }

    const picked = pickTcgPlayerVariant(tcg, card.rarity);
    return {
      id: card.id,
      market_price_usd: picked?.market ?? null,
      market_price_low_usd: picked?.low ?? null,
      market_price_high_usd: picked?.high ?? null,
      market_price_variant: picked?.variant ?? null,
      market_price_source: picked ? "tcgplayer" : "tcgdex:tcgplayer:no_price",
      market_price_data: tcg,
    };
  } catch {
    return {
      id: card.id,
      market_price_usd: null,
      market_price_low_usd: null,
      market_price_high_usd: null,
      market_price_variant: null,
      market_price_source: "tcgdex:error",
      market_price_data: {},
    };
  }
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
  const requestedIds = Array.isArray(body?.cardIds)
    ? [...new Set(body.cardIds.filter((id: unknown) => typeof id === "string"))].slice(0, 80)
    : [];
  const force = body?.force === true;

  let allowedIds: string[] = [];

  if (scope === "global") {
    const { data: adminRow } = await admin
      .from("admin_members")
      .select("player_id")
      .eq("player_id", user.id)
      .maybeSingle();

    if (!adminRow) return json({ error: "FORBIDDEN" }, 403);

    const { data: ownedRows, error: ownedError } = await admin
      .from("player_cards")
      .select("card_id")
      .gt("quantity", 0)
      .limit(2000);

    if (ownedError) throw ownedError;
    allowedIds = [...new Set((ownedRows ?? []).map((row: any) => row.card_id))];
  } else {
    if (!requestedIds.length) return json({ data: { results: [], refreshed: 0 } });

    const { data: ownedRows, error: ownedError } = await admin
      .from("player_cards")
      .select("card_id")
      .eq("player_id", user.id)
      .gt("quantity", 0)
      .in("card_id", requestedIds);

    if (ownedError) return json({ error: ownedError.message }, 500);
    allowedIds = (ownedRows ?? []).map((row: any) => row.card_id);
  }

  if (!allowedIds.length) return json({ data: { results: [], refreshed: 0 } });

  const { data: cards, error: cardsError } = await admin
    .from("cards")
    .select("id,rarity,market_price_updated_at")
    .in("id", allowedIds);

  if (cardsError) return json({ error: cardsError.message }, 500);

  const staleBefore = Date.now() - 12 * 60 * 60 * 1000;
  const targets = (cards ?? [])
    .filter((card: any) => {
      if (force || !card.market_price_updated_at) return true;
      return new Date(card.market_price_updated_at).getTime() < staleBefore;
    })
    .slice(0, scope === "global" ? 120 : 80) as PriceRow[];

  const results: any[] = [];
  const chunkSize = 8;

  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    const fetched = await Promise.all(chunk.map(fetchOne));

    for (const price of fetched) {
      const now = new Date().toISOString();
      const { error: updateError } = await admin
        .from("cards")
        .update({
          market_price_usd: price.market_price_usd,
          market_price_low_usd: price.market_price_low_usd,
          market_price_high_usd: price.market_price_high_usd,
          market_price_variant: price.market_price_variant,
          market_price_source: price.market_price_source,
          market_price_data: price.market_price_data,
          market_price_updated_at: now,
        })
        .eq("id", price.id);

      if (!updateError) {
        results.push({ ...price, market_price_updated_at: now });
      }
    }
  }

  return json({
    data: {
      results,
      refreshed: results.length,
      requested: allowedIds.length,
      remainingStale: Math.max(0, allowedIds.length - targets.length),
    },
  });
});
