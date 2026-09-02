import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: corsHeaders });

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const item = error as Record<string, unknown>;
    for (const key of ["message", "error", "details", "hint", "code"]) {
      const value = item[key];
      if (typeof value === "string" && value.trim()) return value;
      if (value && typeof value === "object") {
        const nested = readableError(value);
        if (nested && nested !== "[object Object]") return nested;
      }
    }
    try {
      const encoded = JSON.stringify(error);
      if (encoded && encoded !== "{}") return encoded;
    } catch {}
  }
  return "BATTLE_ACTION_FAILED";
}

function appErrorCode(message: string) {
  const match = message.toUpperCase().match(/\b[A-Z][A-Z0-9_]{2,}\b/);
  return match?.[0] ?? null;
}

function secretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) try { const parsed = JSON.parse(modern); if (parsed.default) return parsed.default as string; } catch {}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = secretKey();
  if (!token || !url || !key) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, key, { auth: { persistSession: false } });
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

  async function ensureRankedBots() {
    const specs = [
      { key: "novato", username: "IA Novato", rating: 850, icon: "pokeball" },
      { key: "bronze", username: "IA Bronze", rating: 1000, icon: "fire" },
      { key: "prata", username: "IA Prata", rating: 1150, icon: "water" },
      { key: "ouro", username: "IA Ouro", rating: 1300, icon: "electric" },
      { key: "elite", username: "IA Elite", rating: 1500, icon: "dragon" },
      { key: "mestre", username: "IA Mestre", rating: 1700, icon: "ghost" },
      { key: "lenda", username: "IA Lenda", rating: 1950, icon: "diamond" },
    ];

    const { data: rows, error: rowsError } = await admin
      .from("players")
      .select("id,username,is_bot,bot_rating_base")
      .eq("is_bot", true);
    if (rowsError) throw rowsError;

    const existingByName = new Map((rows ?? []).map((row: any) => [String(row.username), row]));

    for (const spec of specs) {
      let playerId = existingByName.get(spec.username)?.id as string | undefined;

      if (!playerId) {
        const email = `ranked-bot-${spec.key}@trainer-bots.invalid`;
        let userId: string | undefined;

        const created = await admin.auth.admin.createUser({
          email,
          password: `${crypto.randomUUID()}${crypto.randomUUID()}!Aa7`,
          email_confirm: true,
          user_metadata: { username: spec.username },
          app_metadata: {
            system_bot: true,
            bot_rating: String(spec.rating),
          },
        });

        if (created.error) {
          const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          if (listed.error) throw created.error;
          userId = listed.data.users.find((item) => item.email === email)?.id;
          if (!userId) throw created.error;
        } else {
          userId = created.data.user?.id;
        }

        if (!userId) throw new Error("RANKED_BOT_CREATE_FAILED");
        playerId = userId;
      }

      const { error: updateError } = await admin
        .from("players")
        .update({
          username: spec.username,
          is_bot: true,
          bot_rating_base: spec.rating,
          battle_rating: spec.rating,
          battle_wins: 0,
          battle_losses: 0,
          battle_streak: 0,
          best_battle_streak: 0,
          coins: 0,
          diamonds: 0,
          xp: 0,
          level: 1,
          account_status: "active",
          profile_icon: spec.icon,
        })
        .eq("id", playerId);
      if (updateError) throw updateError;
    }
  }


  async function sendInviteMessage(opponentId: string, battleId: string, mode: string, stakeType: string, wagerCoins: number, rematchOf?: string | null) {
    const { data: conversationId } = await admin.rpc("server_get_or_create_conversation", { p_actor_id: user.id, p_friend_id: opponentId });
    if (!conversationId) return;
    const label = stakeType === "coins" ? ` valendo 🪙 ${wagerCoins.toLocaleString("pt-BR")} de cada lado` : stakeType === "card" ? " valendo 1 carta de cada lado" : "";
    await admin.rpc("server_send_message", {
      p_actor_id: user.id,
      p_conversation_id: conversationId,
      p_body: `${rematchOf ? "Revanche" : "Desafio"} ${mode === "draft3" ? "Draft 3" : mode === "mystery" ? "Mystery Battle" : "Quick Battle"}${label}.`,
      p_kind: "battle_invite",
      p_metadata: { battleId, mode, stakeType, wagerCoins, rematchOf: rematchOf ?? null },
    });
  }

  try {
    if (body.action === "matchmaking_join") {
      await ensureRankedBots();
      const mode = body.mode === "draft3" ? "draft3" : body.mode === "mystery" ? "mystery" : "quick";
      const { data, error } = await admin.rpc("server_matchmaking_join", {
        p_player_id: user.id,
        p_mode: mode,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "matchmaking_cancel") {
      const { data, error } = await admin.rpc("server_matchmaking_cancel", {
        p_player_id: user.id,
      });
      if (error) throw error;
      return json({ data: { status: data } });
    }

    if (body.action === "create") {
      const mode = body.mode === "draft3" ? "draft3" : body.mode === "mystery" ? "mystery" : "quick";
      const stakeType = body.stakeType === "coins" ? "coins" : body.stakeType === "card" ? "card" : "none";
      const wagerCoins = stakeType === "coins" ? Number(body.wagerCoins ?? 0) : 0;
      const { data: battleId, error } = await admin.rpc("server_create_battle_v2", {
        p_actor_id: user.id,
        p_opponent_id: body.opponentId,
        p_mode: mode,
        p_stake_type: stakeType,
        p_wager_coins: wagerCoins,
        p_stake_card_id: stakeType === "card" ? body.stakeCardId ?? null : null,
        p_rematch_of: body.rematchOf ?? null,
      });
      if (error) throw error;
      await sendInviteMessage(body.opponentId, battleId, mode, stakeType, wagerCoins, body.rematchOf ?? null);
      return json({ data: { battleId } });
    }

    if (body.action === "respond") {
      const { data, error } = await admin.rpc("server_respond_battle_v2", {
        p_actor_id: user.id,
        p_battle_id: body.battleId,
        p_accept: Boolean(body.accept),
        p_stake_card_id: body.stakeCardId ?? null,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "forfeit") {
      const { data, error } = await admin.rpc("server_forfeit_battle", {
        p_actor_id: user.id,
        p_battle_id: body.battleId,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "cancel") {
      const { data, error } = await admin.rpc("server_cancel_battle", { p_actor_id: user.id, p_battle_id: body.battleId });
      if (error) throw error;
      return json({ data: { status: data } });
    }

    if (body.action === "draft_pick") {
      const { data, error } = await admin.rpc("server_pick_battle_draft_card", {
        p_actor_id: user.id,
        p_battle_id: body.battleId,
        p_card_id: body.cardId,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "lock") {
      const { data: lockResult, error } = await admin.rpc("server_lock_battle_card", { p_actor_id: user.id, p_battle_id: body.battleId, p_card_id: body.cardId });
      if (error) throw error;
      if (!lockResult?.bothLocked) return json({ data: lockResult });
      const { data: resolved, error: resolveError } = await admin.rpc("server_resolve_battle_round", { p_battle_id: body.battleId });
      if (resolveError) throw resolveError;
      return json({ data: { ...lockResult, resolved } });
    }

    if (body.action === "timeout") {
      const { data: timeoutResult, error } = await admin.rpc("server_timeout_battle", { p_actor_id: user.id, p_battle_id: body.battleId });
      if (error) throw error;
      let resolved = null;
      if (timeoutResult?.bothLocked) {
        const result = await admin.rpc("server_resolve_battle_round", { p_battle_id: body.battleId });
        if (result.error) throw result.error;
        resolved = result.data;
      }
      return json({ data: { ...timeoutResult, resolved } });
    }

    if (body.action === "rematch") {
      const { data: previous, error: previousError } = await admin.from("battles").select("id,challenger_id,opponent_id,mode,stake_type,wager_coins,status").eq("id", body.battleId).single();
      if (previousError) throw previousError;
      if (previous.status !== "completed") throw new Error("BATTLE_NOT_COMPLETED");
      if (![previous.challenger_id, previous.opponent_id].includes(user.id)) throw new Error("FORBIDDEN");
      const opponentId = previous.challenger_id === user.id ? previous.opponent_id : previous.challenger_id;
      const stakeType = previous.stake_type === "coins" ? "coins" : "none";
      const wagerCoins = stakeType === "coins" ? Number(previous.wager_coins ?? 0) : 0;
      const { data: battleId, error } = await admin.rpc("server_create_battle_v2", {
        p_actor_id: user.id,
        p_opponent_id: opponentId,
        p_mode: previous.mode,
        p_stake_type: stakeType,
        p_wager_coins: wagerCoins,
        p_stake_card_id: null,
        p_rematch_of: previous.id,
      });
      if (error) throw error;
      await sendInviteMessage(opponentId, battleId, previous.mode, stakeType, wagerCoins, previous.id);
      return json({ data: { battleId } });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    const message = readableError(error);
    const code = appErrorCode(message);
    const status = message.includes("FORBIDDEN") ? 403 : message.includes("NOT_FOUND") ? 404 : 409;
    return json({ error: message, code }, status);
  }
});
