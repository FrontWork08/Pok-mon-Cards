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
    }
    try { return JSON.stringify(error); } catch {}
  }
  return "TEAM_BATTLE_ACTION_FAILED";
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

  const { error: maintenanceError } = await admin.rpc("server_assert_app_active", { p_player_id: user.id });
  if (maintenanceError) {
    const message = maintenanceError.message ?? "APP_MAINTENANCE";
    return json({ error: message }, message.includes("APP_MAINTENANCE") ? 503 : 500);
  }

  const body = await req.json().catch(() => ({}));

  async function sendInviteMessage(opponentId: string, battleId: string, rematchOf?: string | null) {
    const { data: conversationId } = await admin.rpc("server_get_or_create_conversation", { p_actor_id: user.id, p_friend_id: opponentId });
    if (!conversationId) return;
    await admin.rpc("server_send_message", {
      p_actor_id: user.id,
      p_conversation_id: conversationId,
      p_body: `${rematchOf ? "Revanche" : "Desafio"} Equipe 3×3 • escolha Golpear ou Trocar a cada turno.`,
      p_kind: "battle_invite",
      p_metadata: { battleId, mode: "team3", stakeType: "none", teamSize: 3, switching: true, route: `/team-battle/${battleId}`, rematchOf: rematchOf ?? null },
    });
  }

  try {
    if (body.action === "create") {
      const { data: battleId, error } = await admin.rpc("server_create_team_battle", {
        p_actor_id: user.id,
        p_opponent_id: body.opponentId,
        p_rematch_of: body.rematchOf ?? null,
      });
      if (error) throw error;
      await sendInviteMessage(String(body.opponentId), String(battleId), body.rematchOf ?? null);
      return json({ data: { battleId } });
    }

    if (body.action === "respond") {
      const { data, error } = await admin.rpc("server_respond_team_battle", {
        p_actor_id: user.id,
        p_battle_id: body.battleId,
        p_accept: Boolean(body.accept),
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "set_team") {
      const cardIds = Array.isArray(body.cardIds) ? body.cardIds.map(String).slice(0, 3) : [];
      const { data, error } = await admin.rpc("server_set_battle_team", {
        p_actor_id: user.id,
        p_battle_id: body.battleId,
        p_card_ids: cardIds,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "state") {
      const { data, error } = await admin.rpc("server_get_battle_team_state", {
        p_actor_id: user.id,
        p_battle_id: body.battleId,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "attack") {
      const { data: actionResult, error } = await admin.rpc("server_choose_battle_team_attack", {
        p_actor_id: user.id,
        p_battle_id: body.battleId,
        p_attack_name: String(body.attackName ?? ""),
      });
      if (error) throw error;
      if (!actionResult?.bothActionsLocked) return json({ data: actionResult });
      const { data: resolved, error: resolveError } = await admin.rpc("server_resolve_team_turn", { p_battle_id: body.battleId });
      if (resolveError) throw resolveError;
      return json({ data: { ...actionResult, resolved } });
    }

    if (body.action === "switch") {
      const { data: actionResult, error } = await admin.rpc("server_choose_battle_team_switch", {
        p_actor_id: user.id,
        p_battle_id: body.battleId,
        p_slot: Number(body.slot),
      });
      if (error) throw error;
      if (!actionResult?.bothActionsLocked) return json({ data: actionResult });
      const { data: resolved, error: resolveError } = await admin.rpc("server_resolve_team_turn", { p_battle_id: body.battleId });
      if (resolveError) throw resolveError;
      return json({ data: { ...actionResult, resolved } });
    }

    if (body.action === "timeout") {
      const { data, error } = await admin.rpc("server_timeout_team_battle", {
        p_actor_id: user.id,
        p_battle_id: body.battleId,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "rematch") {
      const { data: previous, error: previousError } = await admin
        .from("battles")
        .select("id,challenger_id,opponent_id,mode,status")
        .eq("id", body.battleId)
        .single();
      if (previousError) throw previousError;
      if (previous.mode !== "team3" || previous.status !== "completed") throw new Error("BATTLE_NOT_COMPLETED");
      if (![previous.challenger_id, previous.opponent_id].includes(user.id)) throw new Error("FORBIDDEN");
      const opponentId = previous.challenger_id === user.id ? previous.opponent_id : previous.challenger_id;
      const { data: battleId, error } = await admin.rpc("server_create_team_battle", {
        p_actor_id: user.id,
        p_opponent_id: opponentId,
        p_rematch_of: previous.id,
      });
      if (error) throw error;
      await sendInviteMessage(opponentId, battleId, previous.id);
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
