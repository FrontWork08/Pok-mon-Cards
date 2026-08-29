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


const TCGCSV_GROUPS: Record<string, number> = {
  me2pt5: 24541,
  me3: 24587,
  me4: 24655,
  me5: 24688,
};

const TCGCSV_GROUP_NAMES: Record<string, string> = {
  mcd14: "McDonald's Promos 2014",
  mcd15: "McDonald's Promos 2015",
  mcd17: "McDonald's Promos 2017",
  mcd18: "McDonald's Promos 2018",
  tk1a: "EX Trainer Kit 1: Latias & Latios",
  tk1b: "EX Trainer Kit 1: Latias & Latios",
  tk2a: "EX Trainer Kit 2: Plusle & Minun",
  tk2b: "EX Trainer Kit 2: Plusle & Minun",
  bwp: "BW Promos",
  ecard2: "Aquapolis",
};

let tcgcsvGroupsPromise: Promise<any[]> | null = null;

function normalizeName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesRoughlyMatch(localName: unknown, productName: unknown) {
  const local = normalizeName(localName);
  const product = normalizeName(productName);
  if (!local || !product) return false;
  return product === local || product.startsWith(local + " ") || local.startsWith(product + " ");
}

async function resolveTcgcsvGroupId(setId: string) {
  if (TCGCSV_GROUPS[setId]) return TCGCSV_GROUPS[setId];
  const expectedName = TCGCSV_GROUP_NAMES[setId];
  if (!expectedName) return null;

  if (!tcgcsvGroupsPromise) {
    tcgcsvGroupsPromise = fetch("https://tcgcsv.com/tcgplayer/3/groups", {
      headers: { "User-Agent": "Pokemon-Cards-Price-Sync/1.3" },
      signal: AbortSignal.timeout(20_000),
    }).then(async (response) => {
      if (!response.ok) throw new UpstreamError(`TCGCSV_GROUPS_HTTP_${response.status}`, response.status);
      const payload = await response.json();
      return Array.isArray(payload?.results) ? payload.results : [];
    }).catch((error) => {
      tcgcsvGroupsPromise = null;
      throw error;
    });
  }

  const groups = await tcgcsvGroupsPromise;
  const expected = normalizeName(expectedName);
  const group = groups.find((item: any) => normalizeName(item?.name) === expected);
  const groupId = Number(group?.groupId);
  return Number.isFinite(groupId) ? groupId : null;
}

function normalizeCollectorNumber(value: unknown) {
  const raw = String(value ?? "").trim().split("/")[0] ?? "";
  if (!raw) return "";
  return /^\d+$/.test(raw) ? String(Number(raw)) : raw.toUpperCase();
}

function tcgcsvVariantKey(subTypeName: unknown) {
  const key = String(subTypeName ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    "normal": "normal",
    "holofoil": "holofoil",
    "reverse holofoil": "reverseHolofoil",
    "1st edition normal": "1stEditionNormal",
    "1st edition holofoil": "1stEditionHolofoil",
    "unlimited": "normal",
    "unlimited holofoil": "holofoil",
  };
  return map[key] ?? key.replace(/[^a-z0-9]+(.)/g, (_, c) => String(c).toUpperCase());
}

async function fetchTcgcsvSet(admin: any, setId: string) {
  const groupId = await resolveTcgcsvGroupId(setId);
  if (!groupId) return null;

  const headers = { "User-Agent": "Pokemon-Cards-Price-Sync/1.2" };
  const [productsResponse, pricesResponse] = await Promise.all([
    fetch(`https://tcgcsv.com/tcgplayer/3/${groupId}/products`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    }),
    fetch(`https://tcgcsv.com/tcgplayer/3/${groupId}/prices`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    }),
  ]);

  if (!productsResponse.ok || !pricesResponse.ok) {
    throw new UpstreamError(
      `TCGCSV_HTTP_${productsResponse.status}_${pricesResponse.status}`,
      !productsResponse.ok ? productsResponse.status : pricesResponse.status,
    );
  }

  const productsPayload = await productsResponse.json();
  const pricesPayload = await pricesResponse.json();
  const products = Array.isArray(productsPayload?.results) ? productsPayload.results : [];
  const priceRows = Array.isArray(pricesPayload?.results) ? pricesPayload.results : [];

  const pricesByProduct = new Map<number, any[]>();
  for (const row of priceRows) {
    const productId = Number(row?.productId);
    if (!Number.isFinite(productId)) continue;
    const list = pricesByProduct.get(productId) ?? [];
    list.push(row);
    pricesByProduct.set(productId, list);
  }

  const productsByNumber = new Map<string, any[]>();
  for (const product of products) {
    const extended = Array.isArray(product?.extendedData) ? product.extendedData : [];
    const numberField = extended.find((item: any) =>
      String(item?.name ?? "").toLowerCase() === "number"
    );
    const collectorNumber = normalizeCollectorNumber(numberField?.value);
    if (!collectorNumber) continue;

    const rows = pricesByProduct.get(Number(product.productId)) ?? [];
    const prices: Record<string, any> = {};
    for (const row of rows) {
      const market = numeric(row?.marketPrice);
      const mid = numeric(row?.midPrice);
      const low = numeric(row?.lowPrice);
      if (!market && !mid && !low) continue;
      prices[tcgcsvVariantKey(row?.subTypeName)] = {
        market,
        mid,
        low,
        high: numeric(row?.highPrice),
        directLow: numeric(row?.directLowPrice),
      };
    }
    if (!Object.keys(prices).length) continue;

    const candidate = {
      productId: Number(product.productId),
      productName: product.name,
      prices,
      source: "tcgcsv",
      groupId,
    };
    const list = productsByNumber.get(collectorNumber) ?? [];
    list.push(candidate);
    productsByNumber.set(collectorNumber, list);
  }

  const { data: localCards, error } = await admin
    .from("cards")
    .select("id,card_number,rarity,pokemon_name")
    .eq("set_id", setId);
  if (error) throw new UpstreamError(`LOCAL_SET_LOOKUP_FAILED: ${error.message}`);

  return (localCards ?? []).map((card: any) => {
    const collectorNumber = normalizeCollectorNumber(card.card_number);
    const candidates =
      setId === "ecard2" && collectorNumber === "103"
        ? [
            ...(productsByNumber.get("103A") ?? []),
            ...(productsByNumber.get("103B") ?? []),
          ]
        : (productsByNumber.get(collectorNumber) ?? []);
    let tcgplayer =
      candidates.find((item: any) => namesRoughlyMatch(card.pokemon_name, item.productName))
      ?? (candidates.length === 1 ? candidates[0] : null);

    return {
      id: card.id,
      rarity: card.rarity,
      tcgplayer,
      pricing_source: tcgplayer ? "tcgcsv" : "tcgcsv-unmatched",
    };
  });
}

async function enrichWithTcgcsvFallback(admin: any, setId: string, cards: any[]) {
  if (!TCGCSV_GROUPS[setId] && !TCGCSV_GROUP_NAMES[setId]) return cards;
  const tcgcsvCards = await fetchTcgcsvSet(admin, setId);
  if (!tcgcsvCards) return cards;

  const byId = new Map(tcgcsvCards.map((card: any) => [String(card.id), card]));
  return cards.map((card) => {
    if (hasUsableTcgplayer(card?.tcgplayer)) return card;
    const fallback: any = byId.get(String(card.id));
    if (!fallback || !hasUsableTcgplayer(fallback.tcgplayer)) return card;
    return {
      ...card,
      tcgplayer: fallback.tcgplayer,
      pricing_source: "tcgcsv",
    };
  });
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
        enrichedCards = await enrichWithTcgcsvFallback(admin, setId, enrichedCards);
      } catch (primaryError) {
        let fallbackCards: any[] | null = null;
        if (TCGCSV_GROUPS[setId] || TCGCSV_GROUP_NAMES[setId]) {
          fallbackCards = await fetchTcgcsvSet(admin, setId);
        }
        if (!fallbackCards || !fallbackCards.some((card: any) => hasUsableTcgplayer(card.tcgplayer))) {
          fallbackCards = await fetchLocalSetFromTcgdex(admin, setId, eurUsd);
        }
        enrichedCards = fallbackCards;
        results.push({
          ok: true,
          setId,
          fallback: (TCGCSV_GROUPS[setId] || TCGCSV_GROUP_NAMES[setId]) ? "tcgcsv-set" : "tcgdex-set",
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

