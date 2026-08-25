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

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = getSecretKey();
  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { packId } = await req.json();
  if (!packId) return Response.json({ error: "packId is required" }, { status: 400 });

  const { data: pack, error: packError } = await admin.from("packs").select("*").eq("id", packId).eq("active", true).single();
  if (packError || !pack) return Response.json({ error: "Pack not found" }, { status: 404 });

  const { data: player, error: playerError } = await admin.from("players").select("coins").eq("id", user.id).single();
  if (playerError || !player) return Response.json({ error: "Player not found" }, { status: 404 });
  if (Number(player.coins) < Number(pack.price)) return Response.json({ error: "Not enough coins" }, { status: 409 });

  const { data: pool, error: cardsError } = await admin
    .from("cards")
    .select("id,pokemon_name,rarity,image_large")
    .eq("set_id", pack.set_id)
    .limit(1000);

  if (cardsError || !pool?.length) return Response.json({ error: "No cards available for this pack" }, { status: 409 });

  const chosen = shuffle(pool).slice(0, Math.min(pack.cards_per_pack, pool.length));
  if (!chosen.length) return Response.json({ error: "Unable to generate pack" }, { status: 500 });

  const { error: debitError } = await admin.from("players").update({ coins: Number(player.coins) - Number(pack.price) }).eq("id", user.id).eq("coins", player.coins);
  if (debitError) return Response.json({ error: "Could not debit coins" }, { status: 409 });

  for (const card of chosen) {
    const { data: existing } = await admin.from("player_cards").select("quantity").eq("player_id", user.id).eq("card_id", card.id).maybeSingle();
    if (existing) {
      await admin.from("player_cards").update({ quantity: existing.quantity + 1 }).eq("player_id", user.id).eq("card_id", card.id);
    } else {
      await admin.from("player_cards").insert({ player_id: user.id, card_id: card.id, quantity: 1 });
    }
  }

  const resultCards = chosen.map((card) => ({ id: card.id, name: card.pokemon_name, rarity: card.rarity, image: card.image_large }));
  const { data: opening, error: openingError } = await admin.from("pack_openings").insert({ player_id: user.id, pack_id: pack.id, cards_received: resultCards }).select("id").single();
  if (openingError) return Response.json({ error: "Pack opened but history could not be recorded" }, { status: 500 });

  return Response.json({ openingId: opening.id, cards: resultCards });
});
