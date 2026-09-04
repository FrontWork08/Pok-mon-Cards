import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AUTO_OPEN_CHUNK_SIZE = 8;
const AUTO_OPEN_MAX_RETRIES = 2;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function addMarketPrices(admin: ReturnType<typeof createClient>, payload: any) {
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  const ids = [...new Set(cards.map((card: any) => String(card?.id ?? "")).filter(Boolean))];
  if (!ids.length) return payload;

  const { data: priceRows, error } = await admin
    .from("cards")
    .select("id,market_price_usd")
    .in("id", ids);

  if (error) {
    console.warn("Could not enrich opened cards with market prices:", error.message);
    return payload;
  }

  const prices = new Map(
    (priceRows ?? []).map((row: any) => [
      String(row.id),
      row.market_price_usd == null ? null : Number(row.market_price_usd),
    ]),
  );

  return {
    ...payload,
    cards: cards.map((card: any) => ({
      ...card,
      marketPriceUsd: prices.get(String(card.id)) ?? card.marketPriceUsd ?? null,
    })),
  };
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

function uuidFromBytes(bytes: Uint8Array) {
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function childOperationId(batchId: string, startIndex: number, quantity: number) {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${batchId}:${startIndex}:${quantity}`),
    ),
  ).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x40;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return uuidFromBytes(digest);
}

function isStatementTimeout(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("statement timeout") || normalized.includes("canceling statement due to statement timeout");
}

function autoOpenErrorStatus(message: string) {
  return message.includes("AUTO_OPEN_GAMEPASS_REQUIRED") || message.includes("AUTO_OPEN_PLUS_REQUIRED") ? 403 :
    message.includes("INVALID_AUTO_OPEN_QUANTITY") || message.includes("INVALID_STOP_VALUE") || message.includes("INVALID_STOP_TIER") ? 400 :
    message.includes("NOT_ENOUGH_COINS") || message.includes("NOT_ENOUGH_DIAMONDS") ? 409 :
    message.includes("PACK_NOT_FOUND") ? 404 : 500;
}

async function getAutoOpenAccess(admin: ReturnType<typeof createClient>, playerId: string) {
  const { data, error } = await admin
    .from("player_gamepasses")
    .select("gamepass_id,active")
    .eq("player_id", playerId)
    .in("gamepass_id", ["booster_auto_open", "booster_auto_plus"]);
  if (error) throw error;

  const active = new Set(
    (data ?? [])
      .filter((row: any) => Boolean(row.active))
      .map((row: any) => String(row.gamepass_id)),
  );
  return {
    autoOpen: active.has("booster_auto_open"),
    plus: active.has("booster_auto_plus"),
  };
}

async function preflightAutoOpen(
  admin: ReturnType<typeof createClient>,
  playerId: string,
  packId: string,
  quantity: number,
) {
  const { data: pack, error: packError } = await admin
    .from("packs")
    .select("id,price,currency,active")
    .eq("id", packId)
    .eq("active", true)
    .maybeSingle();
  if (packError) throw packError;
  if (!pack) throw new Error("PACK_NOT_FOUND");

  const now = new Date().toISOString();
  const { data: freeEvents, error: eventError } = await admin
    .from("admin_game_events")
    .select("id")
    .eq("event_type", "free_boosters")
    .eq("active", true)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .limit(1);
  if (eventError) throw eventError;

  const currency = String(pack.currency ?? "coins");
  const basePrice = Math.max(0, Number(pack.price ?? 0));
  const freeBoosters = Boolean(freeEvents?.length);
  const effectivePrice = freeBoosters
    ? currency === "diamonds" ? Math.floor((basePrice + 1) / 2) : 0
    : basePrice;

  const { data: player, error: playerError } = await admin
    .from("players")
    .select("coins,diamonds")
    .eq("id", playerId)
    .single();
  if (playerError) throw playerError;

  const total = effectivePrice * quantity;
  if (currency === "diamonds" && Number(player.diamonds ?? 0) < total) {
    throw new Error("NOT_ENOUGH_DIAMONDS");
  }
  if (currency !== "diamonds" && Number(player.coins ?? 0) < total) {
    throw new Error("NOT_ENOUGH_COINS");
  }

  return { currency, effectivePrice, total };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

  const { error: maintenanceError } = await admin.rpc("server_assert_app_active", {
    p_player_id: user.id,
  });
  if (maintenanceError) {
    const message = maintenanceError.message ?? "APP_MAINTENANCE";
    return json({ error: message }, message.includes("APP_MAINTENANCE") ? 503 : 500);
  }

  const body = await req.json().catch(() => ({}));
  const operationId = typeof body.operationId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.operationId)
    ? body.operationId
    : crypto.randomUUID();

  if (body.kind === "legendary_diamond") {
    const { data, error } = await admin.rpc("server_idempotent_open_legendary_pack", {
      p_player_id: user.id,
      p_operation_id: operationId,
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

  if (body.kind === "auto_open") {
    const packId = typeof body.packId === "string" ? body.packId : "";
    const quantity = Number(body.quantity);
    const stopAfterValueUsd = body.stopAfterValueUsd == null || body.stopAfterValueUsd === ""
      ? null
      : Number(body.stopAfterValueUsd);
    const stopAfterTier = body.stopAfterTier == null || body.stopAfterTier === ""
      ? null
      : Number(body.stopAfterTier);

    if (!packId) return json({ error: "packId is required" }, 400);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      return json({ error: "INVALID_AUTO_OPEN_QUANTITY" }, 400);
    }
    if (stopAfterValueUsd != null && (!Number.isFinite(stopAfterValueUsd) || stopAfterValueUsd < 0)) {
      return json({ error: "INVALID_STOP_VALUE" }, 400);
    }
    if (stopAfterTier != null && (!Number.isSafeInteger(stopAfterTier) || stopAfterTier < 3 || stopAfterTier > 10)) {
      return json({ error: "INVALID_STOP_TIER" }, 400);
    }

    try {
      const access = await getAutoOpenAccess(admin, user.id);
      if (!access.autoOpen) return json({ error: "AUTO_OPEN_GAMEPASS_REQUIRED" }, 403);
      if (quantity > (access.plus ? 100 : 50)) {
        return json({ error: "INVALID_AUTO_OPEN_QUANTITY" }, 400);
      }
      if ((stopAfterValueUsd != null || stopAfterTier != null) && !access.plus) {
        return json({ error: "AUTO_OPEN_PLUS_REQUIRED" }, 403);
      }
      await preflightAutoOpen(admin, user.id, packId, quantity);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, autoOpenErrorStatus(message));
    }

    const cards: any[] = [];
    let opened = 0;
    let totalCoinsSpent = 0;
    let totalDiamondsSpent = 0;
    let coins = 0;
    let diamonds = 0;
    let lucky2xUsedCount = 0;
    let lucky2xRemaining = 0;
    let stopTriggered = false;
    let stopReason: "value" | "rarity" | null = null;
    let highestValueUsd = 0;
    let highestRarityTier = 1;
    let chunkSize = Math.min(AUTO_OPEN_CHUNK_SIZE, quantity);

    while (opened < quantity && !stopTriggered) {
      const remaining = quantity - opened;
      const requestedChunk = Math.min(chunkSize, remaining);
      const chunkOperationId = await childOperationId(operationId, opened, requestedChunk);
      let chunkData: any = null;
      let chunkError: any = null;

      for (let attempt = 0; attempt <= AUTO_OPEN_MAX_RETRIES; attempt += 1) {
        const result = await admin.rpc("server_idempotent_auto_open_packs_v2", {
          p_player_id: user.id,
          p_pack_id: packId,
          p_quantity: requestedChunk,
          p_operation_id: chunkOperationId,
          p_stop_min_value: stopAfterValueUsd,
          p_stop_min_tier: stopAfterTier,
        });
        chunkData = result.data;
        chunkError = result.error;
        if (!chunkError) break;

        const message = chunkError.message ?? "Could not auto-open packs";
        if (isStatementTimeout(message) && requestedChunk > 1) break;
        if (attempt < AUTO_OPEN_MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
      }

      if (chunkError) {
        const message = chunkError.message ?? "Could not auto-open packs";
        if (isStatementTimeout(message) && requestedChunk > 1) {
          chunkSize = Math.max(1, Math.floor(requestedChunk / 2));
          continue;
        }
        return json({
          error: message,
          retryable: isStatementTimeout(message),
          batchId: operationId,
          openedSoFar: opened,
        }, autoOpenErrorStatus(message));
      }

      const chunkOpened = Math.max(0, Number(chunkData?.quantity ?? requestedChunk));
      if (Array.isArray(chunkData?.cards)) cards.push(...chunkData.cards);
      opened += chunkOpened;
      totalCoinsSpent += Number(chunkData?.totalCoinsSpent ?? 0);
      totalDiamondsSpent += Number(chunkData?.totalDiamondsSpent ?? 0);
      coins = Number(chunkData?.coins ?? coins);
      diamonds = Number(chunkData?.diamonds ?? diamonds);
      lucky2xUsedCount += Number(chunkData?.lucky2xUsedCount ?? 0);
      lucky2xRemaining = Number(chunkData?.lucky2xRemaining ?? lucky2xRemaining);
      highestValueUsd = Math.max(highestValueUsd, Number(chunkData?.highestValueUsd ?? 0));
      highestRarityTier = Math.max(highestRarityTier, Number(chunkData?.highestRarityTier ?? 1));
      stopTriggered = Boolean(chunkData?.stopTriggered);
      stopReason = chunkData?.stopReason === "value" || chunkData?.stopReason === "rarity"
        ? chunkData.stopReason
        : stopReason;

      if (chunkOpened <= 0 && !stopTriggered) {
        return json({ error: "AUTO_OPEN_NO_PROGRESS", batchId: operationId, openedSoFar: opened }, 500);
      }
    }

    return json(await addMarketPrices(admin, {
      batchId: operationId,
      packId,
      quantity: opened,
      requestedQuantity: quantity,
      cards,
      totalCoinsSpent,
      totalDiamondsSpent,
      coins,
      diamonds,
      lucky2xUsedCount,
      lucky2xRemaining,
      stopTriggered,
      stopReason,
      highestValueUsd,
      highestRarityTier,
    }));
  }

  const packId = body.packId;
  if (!packId) return json({ error: "packId is required" }, 400);

  const { data, error } = await admin.rpc("server_idempotent_open_pack", {
    p_player_id: user.id,
    p_pack_id: packId,
    p_operation_id: operationId,
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

  return json(await addMarketPrices(admin, data));
});
