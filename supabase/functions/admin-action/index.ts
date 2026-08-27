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

  const { data: adminRow, error: adminError } = await admin
    .from("admin_members")
    .select("player_id")
    .eq("player_id", user.id)
    .maybeSingle();

  if (adminError) return json({ error: adminError.message }, 500);
  if (!adminRow) return json({ error: "FORBIDDEN" }, 403);

  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === "overview") {
      const { data, error } = await admin.rpc("server_admin_overview", {
        p_actor_id: user.id,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "grant_coins") {
      const targetId = typeof body.targetId === "string" ? body.targetId : "";
      const amount = Number(body.amount);
      const note = typeof body.note === "string" ? body.note : null;

      if (!targetId || !Number.isSafeInteger(amount) || amount < 1) {
        return json({ error: "INVALID_AMOUNT_OR_TARGET" }, 400);
      }

      const { data, error } = await admin.rpc("server_admin_grant_coins", {
        p_actor_id: user.id,
        p_target_id: targetId,
        p_amount: amount,
        p_note: note,
      });
      if (error) throw error;

      return json({ data });
    }

    if (body.action === "players") {
      const { data, error } = await admin
        .from("players")
        .select("id,username,level,created_at,account_status,suspended_until,moderation_reason,warning_count")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return json({ data: data ?? [] });
    }

    if (body.action === "moderate") {
      const targetId = typeof body.targetId === "string" ? body.targetId : "";
      const moderationAction = typeof body.moderationAction === "string" ? body.moderationAction : "";
      const reason = typeof body.reason === "string" ? body.reason : null;
      const durationHours = body.durationHours == null ? null : Number(body.durationHours);

      if (!targetId || !["warn", "suspend", "ban", "restore"].includes(moderationAction)) {
        return json({ error: "INVALID_MODERATION_ACTION" }, 400);
      }

      const { data, error } = await admin.rpc("server_admin_moderate", {
        p_actor_id: user.id,
        p_target_id: targetId,
        p_action: moderationAction,
        p_reason: reason,
        p_duration_hours: Number.isFinite(durationHours) ? durationHours : null,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "announce") {
      const title = typeof body.title === "string" ? body.title : "";
      const announcementBody = typeof body.body === "string" ? body.body : "";
      const severity = typeof body.severity === "string" ? body.severity : "info";
      const durationHours = Number(body.durationHours ?? 24);

      const { data, error } = await admin.rpc("server_admin_announce", {
        p_actor_id: user.id,
        p_title: title,
        p_body: announcementBody,
        p_severity: severity,
        p_duration_hours: durationHours,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "coin_history") {
      const { data, error } = await admin
        .from("admin_coin_adjustments")
        .select("id,target_id,amount,balance_before,balance_after,note,created_at,players!admin_coin_adjustments_target_id_fkey(username)")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      return json({ data: data ?? [] });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      message.includes("FORBIDDEN") ? 403 :
      message.includes("NOT_FOUND") ? 404 :
      message.includes("INVALID") ? 400 : 409;
    return json({ error: message }, status);
  }
});
