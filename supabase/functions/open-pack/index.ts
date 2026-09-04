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
    if (!packId) return json({ error: "packId is required" }, 400);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
      return json({ error: "INVALID_AUTO_OPEN_QUANTITY" }, 400);
    }

    const { data, error } = await admin.rpc("server_idempotent_auto_open_packs", {
      p_player_id: user.id,
      p_pack_id: packId,
      p_quantity: quantity,
      p_operation_id: operationId,
    });
    if (error) {
      const message = error.message ?? "Could not auto-open packs";
      const status =
        message.includes("AUTO_OPEN_GAMEPASS_REQUIRED") ? 403 :
        message.includes("INVALID_AUTO_OPEN_QUANTITY") ? 400 :
        message.includes("NOT_ENOUGH_COINS") || message.includes("NOT_ENOUGH_DIAMONDS") ? 409 :
        message.includes("PACK_NOT_FOUND") ? 404 : 500;
      return json({ error: message }, status);
    }
    return json(await addMarketPrices(admin, data));
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
