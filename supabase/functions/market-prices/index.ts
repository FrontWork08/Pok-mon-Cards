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

type CardRow = {
  id: string;
  set_id: string;
  rarity: string | null;
  market_price_usd: number | null;
  market_price_source: string | null;
  market_price_updated_at: string | null;
};

function numeric(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hasUsableTcgplayer(tcgplayer: any) {
  const prices = tcgplayer?.prices ?? {};
  return Object.values(prices).some((variant: any) =>
    numeric(variant?.market) !== null ||
    numeric(variant?.mid) !== null ||
    numeric(variant?.low) !== null
  );
}

function normalizeTcgdexTcgplayer(pricing: any) {
  const tcg = pricing?.tcgplayer;
  if (!tcg || typeof tcg !== "object") return null;
  const mapping: Record<string,string> = {
    normal:"normal",holofoil:"holofoil",reverse:"reverseHolofoil",
    "reverse-holofoil":"reverseHolofoil","1st-edition":"1stEditionNormal",
    "1st-edition-holofoil":"1stEditionHolofoil",unlimited:"normal",
    "unlimited-holofoil":"holofoil",
  };
  const prices: Record<string,any> = {};
  for (const [sourceKey,value] of Object.entries(tcg)) {
    if (!value || typeof value !== "object") continue;
    const targetKey = mapping[sourceKey];
    if (!targetKey) continue;
    const item = value as Record<string,unknown>;
    const normalized = {
      low:numeric(item.lowPrice), mid:numeric(item.midPrice),
      high:numeric(item.highPrice), market:numeric(item.marketPrice),
      directLow:numeric(item.directLowPrice),
    };
    if (normalized.market || normalized.mid || normalized.low) {
      if (!prices[targetKey] || normalized.market) prices[targetKey]=normalized;
    }
  }
  return Object.keys(prices).length ? { prices, updatedAt: tcg.updated ?? null } : null;
}

async function fetchTcgdexFallback(cardId: string) {
  try {
    const response = await fetch(
      `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(cardId)}`,
      { headers: { "User-Agent":"Pokemon-Cards-Price-Fallback/1.0" }, signal:AbortSignal.timeout(8_000) },
    );
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeTcgdexTcgplayer(payload?.pricing);
  } catch {
    return null;
  }
}

function pickTcgPlayerVariant(tcgplayer: Record<string, any> | null, rarity: string | null) {
  const prices = tcgplayer?.prices ?? {};
  const entries = Object.entries(prices).filter(([, value]) => value && typeof value === "object");
  if (!entries.length) return null;

  const rarityText = (rarity ?? "").toLowerCase();
  const holoFirst = rarityText.includes("holo") || rarityText.includes("shiny") || rarityText.includes("rare");
  const preferred = holoFirst
    ? ["holofoil", "1stEditionHolofoil", "normal", "1stEditionNormal", "reverseHolofoil"]
    : ["normal", "1stEditionNormal", "holofoil", "reverseHolofoil", "1stEditionHolofoil"];

  const map = new Map(entries);
  const ordered = [
    ...preferred.map((key) => [key, map.get(key)] as const).filter(([, value]) => value),
    ...entries.filter(([key]) => !preferred.includes(key)),
  ];

  for (const [variant, price] of ordered) {
    const market = numeric(price?.market) ?? numeric(price?.mid) ?? numeric(price?.low);
    if (market !== null) {
      return {
        variant,
        market,
        low: numeric(price?.low),
        high: numeric(price?.high),
        kind: numeric(price?.market) !== null ? "market" : numeric(price?.mid) !== null ? "mid" : "low",
      };
    }
  }

  return null;
}

async function fetchSet(setId: string) {
  const cards: any[] = [];
  let page = 1;
  let totalCount = 0;

  do {
    const q = encodeURIComponent(`set.id:${setId}`);
    const response = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=${q}&page=${page}&pageSize=250&select=id,rarity,tcgplayer`,
      { headers: { "User-Agent": "Pokemon-Cards-Private-Project" } },
    );

    if (!response.ok) {
      return { ok: false as const, status: response.status, cards: [] as any[] };
    }

    const payload = await response.json();
    const pageCards = Array.isArray(payload?.data) ? payload.data : [];
    cards.push(...pageCards);
    totalCount = Number(payload?.totalCount ?? cards.length);
    page += 1;
  } while (cards.length < totalCount && page <= 4);

  return { ok: true as const, status: 200, cards };
}

async function updateRows(admin: any, rows: any[]) {
  const chunks: any[][] = [];
  for (let index = 0; index < rows.length; index += 20) chunks.push(rows.slice(index, index + 20));

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (row) => {
      await admin
        .from("cards")
        .update({
          market_price_usd: row.market_price_usd,
          market_price_low_usd: row.market_price_low_usd,
          market_price_high_usd: row.market_price_high_usd,
          market_price_variant: row.market_price_variant,
          market_price_source: row.market_price_source,
          market_price_data: row.market_price_data,
          market_price_updated_at: row.market_price_updated_at,
        })
        .eq("id", row.id);
    }));
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
    ? [...new Set(body.cardIds.filter((id: unknown) => typeof id === "string"))]
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
      .limit(5000);

    if (ownedError) return json({ error: ownedError.message }, 500);
    allowedIds = [...new Set((ownedRows ?? []).map((row: any) => row.card_id))];
  } else {
    if (!requestedIds.length) return json({ data: { results: [], refreshed: 0, priced: 0 } });

    const { data: ownedRows, error: ownedError } = await admin
      .from("player_cards")
      .select("card_id")
      .eq("player_id", user.id)
      .gt("quantity", 0)
      .in("card_id", requestedIds.slice(0, 500));

    if (ownedError) return json({ error: ownedError.message }, 500);
    allowedIds = (ownedRows ?? []).map((row: any) => row.card_id);
  }

  if (!allowedIds.length) return json({ data: { results: [], refreshed: 0, priced: 0 } });

  const { data: cards, error: cardsError } = await admin
    .from("cards")
    .select("id,set_id,rarity,market_price_usd,market_price_source,market_price_updated_at")
    .in("id", allowedIds);

  if (cardsError) return json({ error: cardsError.message }, 500);

  const staleBefore = Date.now() - 12 * 60 * 60 * 1000;
  const missingRetryBefore = Date.now() - 30 * 60 * 1000;
  const targets = (cards ?? [])
    .filter((card: any) => {
      if (force || !card.market_price_updated_at) return true;
      const updatedAt = new Date(card.market_price_updated_at).getTime();
      if (card.market_price_usd == null || Number(card.market_price_usd) <= 0) {
        return !Number.isFinite(updatedAt) || updatedAt < missingRetryBefore;
      }
      return updatedAt < staleBefore;
    })
    .sort((a: any, b: any) => Number(Boolean(a.market_price_updated_at)) - Number(Boolean(b.market_price_updated_at)))
    .slice(0, scope === "global" ? 500 : 120) as CardRow[];

  if (!targets.length) {
    return json({ data: { results: [], refreshed: 0, priced: 0, requested: allowedIds.length, remainingStale: 0 } });
  }

  const bySet = new Map<string, CardRow[]>();
  for (const card of targets) {
    const list = bySet.get(card.set_id) ?? [];
    list.push(card);
    bySet.set(card.set_id, list);
  }

  const results: any[] = [];
  const setEntries = [...bySet.entries()];

  for (let index = 0; index < setEntries.length; index += 3) {
    const chunk = setEntries.slice(index, index + 3);

    const fetchedChunk = await Promise.all(
      chunk.map(async ([setId, targetCards]) => {
        const fetched = await fetchSet(setId);
        return { setId, targetCards, fetched };
      }),
    );

    for (const { setId, targetCards, fetched } of fetchedChunk) {
      const now = new Date().toISOString();

      if (!fetched.ok) {
        for (const card of targetCards) {
          results.push({
            id: card.id,
            market_price_usd: null,
            market_price_low_usd: null,
            market_price_high_usd: null,
            market_price_variant: null,
            market_price_source: `pokemontcg:http_${fetched.status}`,
            market_price_data: {},
            market_price_updated_at: now,
          });
        }
        continue;
      }

      const fetchedById = new Map(fetched.cards.map((card: any) => [card.id, card]));
      const fallbackById = new Map<string, any>();
      const fallbackTargets = targetCards.filter((card) => {
        const apiCard: any = fetchedById.get(card.id);
        return !hasUsableTcgplayer(apiCard?.tcgplayer);
      });

      for (let i = 0; i < fallbackTargets.length; i += 12) {
        const chunk = fallbackTargets.slice(i, i + 12);
        const values = await Promise.all(chunk.map(async (card) => ({
          id: card.id,
          tcgplayer: await fetchTcgdexFallback(card.id),
        })));
        for (const item of values) if (item.tcgplayer) fallbackById.set(item.id, item.tcgplayer);
      }

      for (const card of targetCards) {
        const apiCard: any = fetchedById.get(card.id);
        const primary = apiCard?.tcgplayer ?? null;
        const fallback = fallbackById.get(card.id) ?? null;
        const tcgplayer = hasUsableTcgplayer(primary) ? primary : fallback;
        const source = hasUsableTcgplayer(primary) ? "pokemontcg" : fallback ? "tcgdex" : "pokemontcg";
        const picked = pickTcgPlayerVariant(tcgplayer, card.rarity);

        results.push({
          id: card.id,
          market_price_usd: picked?.market ?? null,
          market_price_low_usd: picked?.low ?? null,
          market_price_high_usd: picked?.high ?? null,
          market_price_variant: picked?.variant ?? null,
          market_price_source: picked ? `${source}:tcgplayer_${picked.kind}` : `${source}:no_tcgplayer_price`,
          market_price_data: tcgplayer ?? { setId },
          market_price_updated_at: now,
        });
      }
    }
  }

  await updateRows(admin, results);

  const priced = results.filter((row) => row.market_price_usd !== null).length;

  return json({
    data: {
      results,
      refreshed: results.length,
      priced,
      requested: allowedIds.length,
      remainingStale: Math.max(0, allowedIds.length - targets.length),
    },
  });
});
