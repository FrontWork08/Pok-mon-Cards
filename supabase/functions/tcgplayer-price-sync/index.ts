import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

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

class UpstreamError extends Error {
  constructor(message: string, readonly status: number | null = null) { super(message); }
}

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

  const mapping: Record<string, string> = {
    normal: "normal",
    holofoil: "holofoil",
    reverse: "reverseHolofoil",
    "reverse-holofoil": "reverseHolofoil",
    "1st-edition": "1stEditionNormal",
    "1st-edition-holofoil": "1stEditionHolofoil",
    unlimited: "normal",
    "unlimited-holofoil": "holofoil",
  };

  const prices: Record<string, any> = {};
  for (const [sourceKey, value] of Object.entries(tcg)) {
    if (!value || typeof value !== "object") continue;
    const targetKey = mapping[sourceKey];
    if (!targetKey) continue;
    const item = value as Record<string, unknown>;
    const normalized = {
      low: numeric(item.lowPrice),
      mid: numeric(item.midPrice),
      high: numeric(item.highPrice),
      market: numeric(item.marketPrice),
      directLow: numeric(item.directLowPrice),
    };
    if (normalized.market || normalized.mid || normalized.low) {
      if (!prices[targetKey] || normalized.market) prices[targetKey] = normalized;
    }
  }
  return Object.keys(prices).length ? { prices, updatedAt: tcg.updated ?? null } : null;
}

async function fetchEurUsdRate() {
  try {
    const response = await fetch("https://api.frankfurter.dev/v2/rate/EUR/USD", {
      headers: { "User-Agent": "Pokemon-Cards-FX/1.0" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return numeric(payload?.rate);
  } catch {
    return null;
  }
}

function normalizeCardmarketUsd(cardmarket: any, eurUsd: number | null) {
  if (!cardmarket || !eurUsd) return null;
  const prices = cardmarket?.prices ?? {};
  const trend = numeric(prices.trendPrice);
  const average = numeric(prices.averageSellPrice);
  const low = numeric(prices.lowPrice);
  const base = trend ?? average ?? low;
  if (!base) return null;
  const market = Number((base * eurUsd).toFixed(4));
  const lowUsd = low ? Number((low * eurUsd).toFixed(4)) : null;
  return {
    prices: {
      normal: {
        market,
        mid: average ? Number((average * eurUsd).toFixed(4)) : market,
        low: lowUsd,
        high: null,
      },
    },
    cardmarket,
    fx: { base: "EUR", quote: "USD", rate: eurUsd },
  };
}

function toTcgdexCardId(cardId: string) {
  const match = cardId.match(/^(.+)-([^-]+)$/);
  if (!match) return cardId;

  const [, setId, localId] = match;
  const halfSet = setId.match(/^me(\d+)pt5$/i);
  const fullSet = setId.match(/^me(\d+)$/i);

  if (!halfSet && !fullSet) return cardId;

  const mappedSet = halfSet
    ? `me${halfSet[1].padStart(2, "0")}.5`
    : `me${fullSet![1].padStart(2, "0")}`;
  const mappedLocalId = /^\d+$/.test(localId) ? localId.padStart(3, "0") : localId;

  return `${mappedSet}-${mappedLocalId}`;
}

function normalizeTcgdexCardmarketUsd(pricing: any, eurUsd: number | null) {
  const cardmarket = pricing?.cardmarket;
  if (!cardmarket || !eurUsd) return null;

  const trend = numeric(cardmarket.trend) ?? numeric(cardmarket["trend-holo"]);
  const average = numeric(cardmarket.avg) ?? numeric(cardmarket["avg-holo"]);
  const low = numeric(cardmarket.low) ?? numeric(cardmarket["low-holo"]);
  const base = trend ?? average ?? low;
  if (!base) return null;

  const market = Number((base * eurUsd).toFixed(4));
  const lowUsd = low ? Number((low * eurUsd).toFixed(4)) : null;

  return {
    prices: {
      normal: {
        market,
        mid: average ? Number((average * eurUsd).toFixed(4)) : market,
        low: lowUsd,
        high: null,
      },
    },
    cardmarket,
    fx: { base: "EUR", quote: "USD", rate: eurUsd },
  };
}

async function fetchTcgdexFallback(cardId: string, eurUsd: number | null) {
  try {
    const tcgdexCardId = toTcgdexCardId(cardId);
    const response = await fetch(
      `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(tcgdexCardId)}`,
      { headers: { "User-Agent": "Pokemon-Cards-Price-Fallback/1.1" }, signal: AbortSignal.timeout(8_000) },
    );
    if (!response.ok) return null;

    const payload = await response.json();
    const tcgplayer = normalizeTcgdexTcgplayer(payload?.pricing);
    if (tcgplayer) return { tcgplayer, pricingSource: "tcgdex" };

    const cardmarket = normalizeTcgdexCardmarketUsd(payload?.pricing, eurUsd);
    if (cardmarket) return { tcgplayer: cardmarket, pricingSource: "cardmarket" };

    return null;
  } catch {
    return null;
  }
}

async function enrichWithTcgdexFallback(cards: any[], eurUsd: number | null) {
  const enriched = cards.map((card) => ({ ...card, pricing_source: "pokemontcg" }));
  const targets = enriched.filter((card) => !hasUsableTcgplayer(card?.tcgplayer));

  for (let index = 0; index < targets.length; index += 24) {
    const chunk = targets.slice(index, index + 24);
    const values = await Promise.all(chunk.map(async (card) => ({
      id: String(card.id ?? ""),
      fallback: await fetchTcgdexFallback(String(card.id ?? ""), eurUsd),
    })));

    const byId = new Map(
      values
        .filter((item) => item.fallback)
        .map((item) => [item.id, item.fallback!]),
    );

    for (const card of enriched) {
      const fallback = byId.get(String(card.id ?? ""));
      if (fallback) {
        card.tcgplayer = fallback.tcgplayer;
        card.pricing_source = fallback.pricingSource;
      }
    }
  }

  for (const card of enriched) {
    if (hasUsableTcgplayer(card?.tcgplayer)) continue;
    const cardmarketUsd = normalizeCardmarketUsd(card?.cardmarket, eurUsd);
    if (cardmarketUsd) {
      card.tcgplayer = cardmarketUsd;
      card.pricing_source = "cardmarket";
    }
  }

  return enriched;
}

async function fetchLocalSetFromTcgdex(admin: any, setId: string, eurUsd: number | null) {
  const { data: localCards, error } = await admin
    .from("cards")
    .select("id,rarity")
    .eq("set_id", setId);

  if (error) throw new UpstreamError(`LOCAL_SET_LOOKUP_FAILED: ${error.message}`);

  const cards = (localCards ?? []).map((card: any) => ({
    id: card.id,
    rarity: card.rarity,
    tcgplayer: null,
    pricing_source: "tcgdex",
  }));

  for (let index = 0; index < cards.length; index += 24) {
    const chunk = cards.slice(index, index + 24);
    const values = await Promise.all(chunk.map(async (card: any) => ({
      id: String(card.id ?? ""),
      fallback: await fetchTcgdexFallback(String(card.id ?? ""), eurUsd),
    })));

    const byId = new Map(
      values
        .filter((item) => item.fallback)
        .map((item) => [item.id, item.fallback!]),
    );

    for (const card of cards) {
      const fallback = byId.get(String(card.id ?? ""));
      if (fallback) {
        card.tcgplayer = fallback.tcgplayer;
        card.pricing_source = fallback.pricingSource;
      }
    }
  }

  if (!cards.some((card: any) => hasUsableTcgplayer(card.tcgplayer))) {
    throw new UpstreamError(`TCGDEX_SET_FALLBACK_EMPTY_${setId}`);
  }

  return cards;
}

async function fetchPage(setId: string, page: number) {
  const query = encodeURIComponent(`set.id:${setId}`);
  const apiKey = Deno.env.get("POKEMON_TCG_API_KEY");
  const headers: Record<string, string> = { "User-Agent": "Pokemon-Cards-TCGplayer-Review/2.0" };
  if (apiKey) headers["X-Api-Key"] = apiKey;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=${query}&page=${page}&pageSize=250&select=id,rarity,tcgplayer,cardmarket`,
        { headers, signal: AbortSignal.timeout(25_000) },
      );
      if (response.ok) return await response.json();
      lastError = new UpstreamError(`POKEMONTCG_HTTP_${response.status}`, response.status);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
  }
  if (lastError instanceof UpstreamError) throw lastError;
  throw new UpstreamError(lastError instanceof Error ? lastError.message : "POKEMONTCG_NETWORK_ERROR");
}

async function fetchSet(setId: string) {
  const cards: any[] = [];
  let page = 1;
  let totalCount = 0;
  do {
    const payload = await fetchPage(setId, page);
    const pageCards = Array.isArray(payload?.data) ? payload.data : [];
    cards.push(...pageCards);
    totalCount = Number(payload?.totalCount ?? cards.length);
    page += 1;
  } while (cards.length < totalCount && page <= 8);
  return cards;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const syncToken = request.headers.get("x-sync-secret") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = getSecretKey();
  if (!syncToken || !url || !secretKey) return Response.json({ error: "Forbidden" }, { status: 403 });

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });
  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body?.limit ?? 2), 3));
  const { data: claimed, error: claimError } = await admin.rpc("claim_market_price_sync_sets", {
    p_token: syncToken,
    p_limit: limit,
  });
  if (claimError) return Response.json({ error: claimError.message.includes("FORBIDDEN") ? "Forbidden" : claimError.message }, { status: claimError.message.includes("FORBIDDEN") ? 403 : 500 });

  const results: any[] = [];
  const eurUsd = await fetchEurUsdRate();
  for (const job of claimed ?? []) {
    const setId = String(job.set_id ?? "");
    try {
      let enrichedCards: any[];
      try {
        const cards = await fetchSet(setId);
        enrichedCards = await enrichWithTcgdexFallback(cards, eurUsd);
      } catch (primaryError) {
        const fallbackCards = await fetchLocalSetFromTcgdex(admin, setId, eurUsd);
        enrichedCards = fallbackCards;
        results.push({
          ok: true,
          setId,
          fallback: "tcgdex-set",
          primaryError: primaryError instanceof Error ? primaryError.message : "UNKNOWN_PRIMARY_ERROR",
        });
      }

      const { data, error } = await admin.rpc("apply_market_price_sync_set", {
        p_token: syncToken,
        p_set_id: setId,
        p_cards: enrichedCards,
      });
      if (error) throw new UpstreamError(error.message);
      results.push({ ok: true, ...data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      const status = error instanceof UpstreamError ? error.status : null;
      await admin.rpc("fail_market_price_sync_set", {
        p_token: syncToken,
        p_set_id: setId,
        p_http_status: status,
        p_error: message,
      });
      results.push({ ok: false, setId, error: message });
    }
  }

  return Response.json({ data: { processed: results.length, results } });
});

