import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { unzipSync } from "npm:fflate@0.8.2";
import { WebIO } from "npm:@gltf-transform/core@4.2.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/sketchfab-oauth`;
const APP_RETURN_URL = "pokemoncards://admin-3d-lab?sketchfab=connected";
const WEB_RETURN_URL = "https://pokemon-cards-frontwork.expo.app/admin-3d-lab?sketchfab=connected";
const MAX_MODEL_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024;
const ALLOWED_POKEMON = new Set([6, 25, 130]);
const SAFE_LICENSE_SLUGS = new Set(["cc0", "by", "cc-by", "by-sa", "cc-by-sa"]);
const FORBIDDEN_EXTENSIONS = new Set(["KHR_draco_mesh_compression", "KHR_texture_basisu", "EXT_meshopt_compression"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: corsHeaders });

function secretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed.default) return parsed.default as string;
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const admin = createClient(SUPABASE_URL, secretKey(), { auth: { persistSession: false } });

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashText(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

async function getUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

async function requireOwner(req: Request) {
  const user = await getUser(req);
  if (!user) throw new Error("UNAUTHORIZED");
  const { data: access, error } = await admin.rpc("server_admin_access", { p_actor_id: user.id });
  if (error || access?.role !== "owner") throw new Error("OWNER_ONLY");
  return user;
}

async function isInternal(req: Request) {
  const supplied = req.headers.get("x-internal-key") ?? "";
  if (!supplied) return false;
  const { data, error } = await admin.rpc("server_sketchfab_get_internal_key");
  return !error && typeof data === "string" && data.length > 20 && supplied === data;
}

async function getConfig() {
  const { data, error } = await admin.rpc("server_sketchfab_get_config");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.client_id || !row?.client_secret) throw new Error("SKETCHFAB_NOT_CONFIGURED");
  return { clientId: String(row.client_id), clientSecret: String(row.client_secret) };
}

async function storeTokens(userId: string, tokenData: any, profile?: any) {
  const expiresIn = Math.max(60, Number(tokenData?.expires_in ?? 2_592_000));
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const p = profile ?? {};
  const { error } = await admin.rpc("server_sketchfab_store_tokens", {
    p_user_id: userId,
    p_access_token: String(tokenData?.access_token ?? ""),
    p_refresh_token: tokenData?.refresh_token ? String(tokenData.refresh_token) : "",
    p_token_type: String(tokenData?.token_type ?? "Bearer"),
    p_scope: tokenData?.scope ? String(tokenData.scope) : null,
    p_expires_at: expiresAt,
    p_sketchfab_user_id: p?.uid ? String(p.uid) : null,
    p_username: p?.username ? String(p.username) : (p?.displayName ? String(p.displayName) : null),
    p_profile: p,
  });
  if (error) throw error;
  return expiresAt;
}

async function validAccessToken(userId: string) {
  const { data, error } = await admin.rpc("server_sketchfab_get_tokens", { p_user_id: userId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.access_token) throw new Error("SKETCHFAB_NOT_CONNECTED");
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (!expiresAt || expiresAt > Date.now() + 5 * 60 * 1000) return String(row.access_token);
  if (!row.refresh_token) throw new Error("SKETCHFAB_RECONNECT_REQUIRED");

  const config = await getConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: String(row.refresh_token),
  });
  const response = await fetch("https://sketchfab.com/oauth2/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`SKETCHFAB_REFRESH_FAILED:${response.status}`);
  const refreshed = await response.json();
  const access = String(refreshed?.access_token ?? "");
  if (!access) throw new Error("SKETCHFAB_REFRESH_NO_TOKEN");
  const profileResponse = await fetch("https://api.sketchfab.com/v3/me", { headers: { Authorization: `Bearer ${access}` } });
  const profile = profileResponse.ok ? await profileResponse.json() : {};
  await storeTokens(userId, { ...refreshed, refresh_token: refreshed.refresh_token ?? row.refresh_token }, profile);
  return access;
}

function htmlEscape(value: string) {
  return value.replace(/[&<>\"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch] ?? ch));
}

function callbackPage(title: string, message: string, returnUrl?: string, ok = true) {
  const safeReturn = returnUrl === APP_RETURN_URL || returnUrl === WEB_RETURN_URL ? returnUrl : APP_RETURN_URL;
  const color = ok ? "#65D894" : "#FF8290";
  const escaped = htmlEscape(safeReturn);
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>${htmlEscape(title)}</title></head><body style="margin:0;background:#07111F;color:#F4F7FB;font-family:system-ui;padding:32px"><div style="max-width:560px;margin:60px auto;border:1px solid #314255;border-radius:18px;padding:24px;background:#0C1826"><h2 style="color:${color}">${htmlEscape(title)}</h2><p>${htmlEscape(message)}</p><a href="${escaped}" style="display:inline-block;margin-top:12px;padding:12px 16px;background:#FFD447;color:#07111F;border-radius:12px;text-decoration:none;font-weight:800">Voltar ao Trainer Collection</a></div><script>setTimeout(function(){location.href=${JSON.stringify(safeReturn)}},700)</script></body></html>`, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function dirname(value: string) {
  const normalized = normalizePath(value);
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(0, idx + 1) : "";
}

function inspectGltfJson(gltf: any) {
  const ext = new Set<string>([
    ...(Array.isArray(gltf?.extensionsUsed) ? gltf.extensionsUsed : []),
    ...(Array.isArray(gltf?.extensionsRequired) ? gltf.extensionsRequired : []),
  ].map(String));
  const blocked = [...ext].filter((x) => FORBIDDEN_EXTENSIONS.has(x));
  if (blocked.length) throw new Error(`UNSUPPORTED_GLB_EXTENSION:${blocked.join(",")}`);
}

async function convertGltfZipToGlb(zipBytes: Uint8Array) {
  const files = unzipSync(zipBytes);
  const names = Object.keys(files).map(normalizePath);
  const sceneName = names.find((n) => n.toLowerCase() === "scene.gltf") ?? names.find((n) => n.toLowerCase().endsWith(".gltf"));
  if (!sceneName) throw new Error("SKETCHFAB_ARCHIVE_HAS_NO_GLTF");
  const originalName = Object.keys(files).find((n) => normalizePath(n) === sceneName)!;
  const jsonText = new TextDecoder().decode(files[originalName]);
  const gltf = JSON.parse(jsonText);
  inspectGltfJson(gltf);
  const base = dirname(sceneName);
  const resources: Record<string, Uint8Array> = {};
  for (const [rawName, bytes] of Object.entries(files)) {
    const name = normalizePath(rawName);
    if (name === sceneName) continue;
    resources[name] = bytes;
    if (base && name.startsWith(base)) resources[name.slice(base.length)] = bytes;
  }
  const io = new WebIO();
  const doc = await io.readJSON({ json: gltf, resources });
  const binary = await io.writeBinary(doc);
  doc.dispose();
  return binary;
}

function validateGlb(bytes: Uint8Array) {
  if (bytes.byteLength < 20 || bytes.byteLength > MAX_MODEL_BYTES) throw new Error("MODEL_SIZE_NOT_ALLOWED");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) throw new Error("INVALID_GLB");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength < 2 || 20 + jsonLength > bytes.byteLength) throw new Error("INVALID_GLB_JSON");
  const raw = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).replace(/[\u0000\u0020]+$/g, "");
  const gltf = JSON.parse(raw);
  inspectGltfJson(gltf);
  const meshes = Array.isArray(gltf?.meshes) ? gltf.meshes : [];
  if (!meshes.length) throw new Error("GLB_HAS_NO_MESHES");
  const animations = (Array.isArray(gltf?.animations) ? gltf.animations : []).map((a: any) => String(a?.name ?? "")).filter(Boolean);
  return { meshCount: meshes.length, animations };
}

async function fetchBytes(url: string, maxBytes: number) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`MODEL_FETCH_FAILED:${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared && declared > maxBytes) throw new Error("MODEL_TOO_LARGE");
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (!buffer.byteLength || buffer.byteLength > maxBytes) throw new Error("MODEL_TOO_LARGE");
  return buffer;
}

function licenseInfo(metadata: any) {
  const license = metadata?.license ?? {};
  const slug = String(license?.slug ?? license?.uid ?? "").toLowerCase();
  const label = String(license?.label ?? license?.name ?? slug);
  const url = license?.url ? String(license.url) : null;
  const labelLower = label.toLowerCase();
  const safe = SAFE_LICENSE_SLUGS.has(slug) || labelLower.includes("cc0") || (labelLower.includes("attribution") && !labelLower.includes("noncommercial") && !labelLower.includes("no derivatives"));
  if (!safe) throw new Error(`SKETCHFAB_LICENSE_NOT_ALLOWED:${slug || label}`);
  return { slug, label, url };
}

async function processJob(jobId: string) {
  const { data: job, error: jobError } = await admin.from("sketchfab_import_jobs").select("*").eq("id", jobId).single();
  if (jobError || !job) throw new Error("IMPORT_JOB_NOT_FOUND");
  if (job.status === "completed") return job;
  await admin.from("sketchfab_import_jobs").update({ status: "processing", started_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() }).eq("id", jobId);

  try {
    const pokemonId = Number(job.pokemon_id);
    if (!ALLOWED_POKEMON.has(pokemonId)) throw new Error("LAB_POKEMON_NOT_ALLOWED");
    const uid = String(job.model_uid);
    const token = await validAccessToken(String(job.requested_by));

    const metaRes = await fetch(`https://api.sketchfab.com/v3/models/${encodeURIComponent(uid)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!metaRes.ok) throw new Error(`SKETCHFAB_MODEL_LOOKUP_FAILED:${metaRes.status}`);
    const metadata = await metaRes.json();
    if (metadata?.isDownloadable === false || metadata?.downloadable === false) throw new Error("SKETCHFAB_MODEL_NOT_DOWNLOADABLE");
    const license = licenseInfo(metadata);
    const author = String(metadata?.user?.displayName ?? metadata?.user?.username ?? "Sketchfab artist").slice(0, 160);
    const modelName = String(metadata?.name ?? `Sketchfab ${uid}`).slice(0, 200);
    const sourceUrl = String(metadata?.viewerUrl ?? metadata?.url ?? `https://sketchfab.com/3d-models/${uid}`).slice(0, 2048);

    const downloadRes = await fetch(`https://api.sketchfab.com/v3/models/${encodeURIComponent(uid)}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!downloadRes.ok) throw new Error(`SKETCHFAB_DOWNLOAD_REQUEST_FAILED:${downloadRes.status}`);
    const download = await downloadRes.json();

    let glb: Uint8Array;
    if (download?.glb?.url) {
      glb = await fetchBytes(String(download.glb.url), MAX_MODEL_BYTES);
    } else if (download?.gltf?.url) {
      const archive = await fetchBytes(String(download.gltf.url), MAX_ARCHIVE_BYTES);
      glb = await convertGltfZipToGlb(archive);
    } else {
      throw new Error("SKETCHFAB_NO_GLTF_OR_GLB_DOWNLOAD");
    }

    const inspection = validateGlb(glb);
    const { data: previous, error: prevError } = await admin.from("pokemon_3d_models").select("storage_path,version").eq("pokemon_id", pokemonId).eq("form_key", "lab").maybeSingle();
    if (prevError) throw prevError;
    const version = Math.max(1, Number(previous?.version ?? 0) + 1);
    const storagePath = `${pokemonId}/lab/v${version}/model.glb`;
    const hashBuffer = await crypto.subtle.digest("SHA-256", glb);
    const hash = [...new Uint8Array(hashBuffer)].map((v) => v.toString(16).padStart(2, "0")).join("");
    const { error: uploadError } = await admin.storage.from("pokemon-3d").upload(storagePath, glb, { contentType: "model/gltf-binary", cacheControl: "31536000", upsert: false });
    if (uploadError) throw uploadError;

    const row = {
      pokemon_id: pokemonId,
      form_key: "lab",
      storage_path: storagePath,
      format: "glb",
      version,
      sha256: hash,
      byte_size: glb.byteLength,
      scale: 1,
      offset_x: 0,
      offset_y: 0,
      offset_z: 0,
      rotation_y: 0,
      animations: {},
      enabled: true,
      min_app_version: "1.2.1",
      source_url: sourceUrl,
      source_author: author,
      source_license: license.label.slice(0, 160),
      source_license_url: license.url,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await admin.from("pokemon_3d_models").upsert(row, { onConflict: "pokemon_id,form_key" });
    if (saveError) {
      await admin.storage.from("pokemon-3d").remove([storagePath]).catch(() => undefined);
      throw saveError;
    }
    if (previous?.storage_path && previous.storage_path !== storagePath) await admin.storage.from("pokemon-3d").remove([previous.storage_path]).catch(() => undefined);

    await admin.from("sketchfab_import_jobs").update({
      status: "completed",
      model_name: modelName,
      model_author: author,
      model_license: license.label,
      model_license_url: license.url,
      storage_path: storagePath,
      model_version: version,
      byte_size: glb.byteLength,
      error: null,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    return { jobId, pokemonId, uid, modelName, author, license: license.label, storagePath, version, byteSize: glb.byteLength, meshCount: inspection.meshCount, animationNames: inspection.animations };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("sketchfab_import_jobs").update({ status: "failed", error: message.slice(0, 1000), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  if (req.method === "GET") {
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const oauthError = url.searchParams.get("error") ?? "";
    if (!state) return callbackPage("Conexão inválida", "O retorno do Sketchfab não trouxe o estado de segurança.", undefined, false);
    const stateHash = await hashText(state);
    const { data: consumed, error: stateError } = await admin.rpc("server_sketchfab_consume_state", { p_state_hash: stateHash });
    const row = Array.isArray(consumed) ? consumed[0] : consumed;
    if (stateError || !row?.user_id) return callbackPage("Conexão expirada", "Este login expirou ou já foi usado. Volte ao 3D Lab e tente conectar novamente.", undefined, false);
    const returnUrl = row.return_url === WEB_RETURN_URL ? WEB_RETURN_URL : APP_RETURN_URL;
    if (oauthError) return callbackPage("Sketchfab não conectado", `Autorização cancelada ou recusada: ${oauthError}`, returnUrl, false);
    if (!code) return callbackPage("Sketchfab não conectado", "O código de autorização não foi retornado.", returnUrl, false);

    try {
      const config = await getConfig();
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: CALLBACK_URL,
      });
      const tokenRes = await fetch("https://sketchfab.com/oauth2/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!tokenRes.ok) throw new Error(`TOKEN_EXCHANGE_FAILED:${tokenRes.status}`);
      const tokenData = await tokenRes.json();
      const access = String(tokenData?.access_token ?? "");
      if (!access) throw new Error("TOKEN_EXCHANGE_NO_ACCESS_TOKEN");
      const meRes = await fetch("https://api.sketchfab.com/v3/me", { headers: { Authorization: `Bearer ${access}` } });
      const profile = meRes.ok ? await meRes.json() : {};
      await storeTokens(String(row.user_id), tokenData, profile);
      return callbackPage("Sketchfab conectado", "A autorização foi salva com segurança. Você já pode voltar ao 3D Lab.", returnUrl, true);
    } catch (error) {
      return callbackPage("Falha ao conectar Sketchfab", error instanceof Error ? error.message : String(error), returnUrl, false);
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "status");

  try {
    if (action === "process_job") {
      if (!(await isInternal(req))) throw new Error("INTERNAL_AUTH_FAILED");
      const jobId = String(body?.jobId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("INVALID_JOB_ID");
      const result = await processJob(jobId);
      return json({ data: result });
    }

    const user = await requireOwner(req);

    if (action === "save_config") {
      const clientId = String(body?.clientId ?? "").trim();
      const clientSecret = String(body?.clientSecret ?? "").trim();
      const { error } = await admin.rpc("server_sketchfab_save_config", { p_actor_id: user.id, p_client_id: clientId, p_client_secret: clientSecret });
      if (error) throw error;
      return json({ data: { configured: true, redirectUri: CALLBACK_URL } });
    }

    if (action === "status") {
      const { data: configRows } = await admin.from("sketchfab_integration_config").select("client_id,updated_at").eq("singleton", true).maybeSingle();
      const { data: connection } = await admin.from("sketchfab_oauth_connections").select("username,sketchfab_user_id,expires_at,connected_at,updated_at").eq("user_id", user.id).maybeSingle();
      return json({ data: {
        configured: Boolean(configRows?.client_id),
        clientIdHint: configRows?.client_id ? `${String(configRows.client_id).slice(0, 6)}…${String(configRows.client_id).slice(-4)}` : null,
        connected: Boolean(connection),
        username: connection?.username ?? null,
        sketchfabUserId: connection?.sketchfab_user_id ?? null,
        expiresAt: connection?.expires_at ?? null,
        connectedAt: connection?.connected_at ?? null,
        redirectUri: CALLBACK_URL,
      } });
    }

    if (action === "start") {
      const config = await getConfig();
      const stateBytes = new Uint8Array(32);
      crypto.getRandomValues(stateBytes);
      const state = bytesToBase64Url(stateBytes);
      const stateHash = await hashText(state);
      const returnUrl = body?.platform === "web" ? WEB_RETURN_URL : APP_RETURN_URL;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { error } = await admin.rpc("server_sketchfab_create_state", { p_user_id: user.id, p_state_hash: stateHash, p_return_url: returnUrl, p_expires_at: expiresAt });
      if (error) throw error;
      const authorize = new URL("https://sketchfab.com/oauth2/authorize/");
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("client_id", config.clientId);
      authorize.searchParams.set("redirect_uri", CALLBACK_URL);
      authorize.searchParams.set("state", state);
      return json({ data: { authorizeUrl: authorize.toString(), redirectUri: CALLBACK_URL, expiresAt } });
    }

    if (action === "disconnect") {
      const { error } = await admin.rpc("server_sketchfab_disconnect", { p_user_id: user.id });
      if (error) throw error;
      return json({ data: { connected: false } });
    }

    if (action === "queue_import") {
      const pokemonId = Number(body?.pokemonId);
      const modelUid = String(body?.modelUid ?? "").trim();
      if (!ALLOWED_POKEMON.has(pokemonId)) throw new Error("LAB_POKEMON_NOT_ALLOWED");
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(modelUid)) throw new Error("INVALID_MODEL_UID");
      const { data: jobId, error } = await admin.rpc("server_sketchfab_enqueue_import", { p_pokemon_id: pokemonId, p_model_uid: modelUid });
      if (error) throw error;
      return json({ data: { jobId } });
    }

    if (action === "job_status") {
      const jobId = String(body?.jobId ?? "");
      const { data: job, error } = await admin.from("sketchfab_import_jobs").select("id,pokemon_id,model_uid,status,model_name,model_author,model_license,model_license_url,storage_path,model_version,byte_size,error,created_at,started_at,finished_at").eq("id", jobId).eq("requested_by", user.id).single();
      if (error) throw error;
      return json({ data: job });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("UNAUTHORIZED") ? 401 : message.includes("OWNER_ONLY") ? 403 : message.includes("NOT_CONFIGURED") ? 409 : 400;
    return json({ error: message }, status);
  }
});
