import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: corsHeaders });
const MAX_BYTES = 25 * 1024 * 1024;
const LAB_FORM = "lab";
const ALLOWED_IDS = new Set([6, 25, 130]);
const FORBIDDEN_EXTENSIONS = new Set([
  "KHR_draco_mesh_compression",
  "KHR_texture_basisu",
  "EXT_meshopt_compression",
]);
const ANIMATION_HINTS: Record<string, string[]> = {
  idle: ["idle", "wait", "stand", "breath"],
  attack: ["attack", "strike", "move", "skill", "bite", "punch", "kick"],
  hit: ["hit", "hurt", "damage", "impact"],
  faint: ["faint", "ko", "death", "down", "defeat"],
  victory: ["victory", "win", "celebrate", "happy"],
};

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

function blockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0 || a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function parseHttpsUrl(value: unknown, required = true) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    if (required) throw new Error("SOURCE_URL_REQUIRED");
    return null;
  }
  if (raw.length > 2048) throw new Error("SOURCE_URL_TOO_LONG");
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("INVALID_SOURCE_URL"); }
  if (parsed.protocol !== "https:" || blockedHost(parsed.hostname)) throw new Error("INVALID_SOURCE_URL");
  return parsed;
}

async function readLimited(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new Error("MODEL_TOO_LARGE");
  if (!response.body) throw new Error("EMPTY_MODEL_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("MODEL_TOO_LARGE");
    }
    chunks.push(value);
  }
  if (total < 20) throw new Error("INVALID_GLB_TOO_SMALL");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function parseGlb(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("INVALID_GLB_MAGIC");
  if (view.getUint32(4, true) !== 2) throw new Error("GLB_VERSION_NOT_SUPPORTED");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("INVALID_GLB_LENGTH");
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== 0x4e4f534a || jsonLength < 2 || 20 + jsonLength > bytes.byteLength) throw new Error("INVALID_GLB_JSON_CHUNK");
  const rawJson = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).replace(/[\u0000\u0020]+$/g, "");
  let gltf: any;
  try { gltf = JSON.parse(rawJson); } catch { throw new Error("INVALID_GLB_JSON"); }
  if (String(gltf?.asset?.version ?? "") !== "2.0") throw new Error("GLTF_2_REQUIRED");
  const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : [];
  if (!meshes.length) throw new Error("GLB_HAS_NO_MESHES");
  const extensions = new Set<string>([
    ...(Array.isArray(gltf.extensionsUsed) ? gltf.extensionsUsed : []),
    ...(Array.isArray(gltf.extensionsRequired) ? gltf.extensionsRequired : []),
  ].map(String));
  const blocked = [...extensions].filter((extension) => FORBIDDEN_EXTENSIONS.has(extension));
  if (blocked.length) throw new Error(`UNSUPPORTED_GLB_EXTENSION:${blocked.join(",")}`);
  const externalUris = [
    ...(Array.isArray(gltf.buffers) ? gltf.buffers : []),
    ...(Array.isArray(gltf.images) ? gltf.images : []),
  ].map((item: any) => typeof item?.uri === "string" ? item.uri.trim() : "")
    .filter((uri: string) => uri && !uri.startsWith("data:"));
  if (externalUris.length) throw new Error("GLB_EXTERNAL_RESOURCES_NOT_ALLOWED");
  const animationNames = (Array.isArray(gltf.animations) ? gltf.animations : [])
    .map((animation: any) => String(animation?.name ?? "").trim())
    .filter(Boolean);
  const animations: Record<string, string> = {};
  for (const [role, hints] of Object.entries(ANIMATION_HINTS)) {
    const match = animationNames.find((name: string) => hints.some((hint) => name.toLowerCase().includes(hint)));
    if (match) animations[role] = match;
  }
  return {
    meshCount: meshes.length,
    materialCount: Array.isArray(gltf.materials) ? gltf.materials.length : 0,
    textureCount: Array.isArray(gltf.textures) ? gltf.textures.length : 0,
    animationNames,
    animations,
    extensions: [...extensions],
  };
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = getSecretKey();
  if (!supabaseUrl || !secretKey) return json({ error: "Server configuration error" }, 500);
  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: "Unauthorized" }, 401);
  const { data: access, error: accessError } = await admin.rpc("server_admin_access", { p_actor_id: user.id });
  if (accessError) return json({ error: accessError.message }, 500);
  if (access?.role !== "owner") return json({ error: "OWNER_ONLY" }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const pokemonId = Number(body.pokemonId);
    if (!Number.isSafeInteger(pokemonId) || !ALLOWED_IDS.has(pokemonId)) throw new Error("LAB_POKEMON_NOT_ALLOWED");
    const source = parseHttpsUrl(body.sourceUrl, true)!;
    const sourceAuthor = typeof body.sourceAuthor === "string" ? body.sourceAuthor.trim() : "";
    const sourceLicense = typeof body.sourceLicense === "string" ? body.sourceLicense.trim() : "";
    const sourceLicenseUrl = parseHttpsUrl(body.sourceLicenseUrl, false);
    if (!sourceAuthor || sourceAuthor.length > 160) throw new Error("SOURCE_AUTHOR_REQUIRED");
    if (!sourceLicense || sourceLicense.length > 160) throw new Error("SOURCE_LICENSE_REQUIRED");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response: Response;
    try {
      response = await fetch(source, { signal: controller.signal, redirect: "follow", headers: { "User-Agent": "TrainerCollection-3DLab/1.2.1" } });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`MODEL_FETCH_FAILED:${response.status}`);
    if (response.url) {
      const finalUrl = new URL(response.url);
      if (finalUrl.protocol !== "https:" || blockedHost(finalUrl.hostname)) throw new Error("INVALID_REDIRECT_TARGET");
    }
    const bytes = await readLimited(response);
    const inspection = parseGlb(bytes);
    const hash = await sha256(bytes);

    const { data: previous, error: previousError } = await admin
      .from("pokemon_3d_models")
      .select("storage_path,version")
      .eq("pokemon_id", pokemonId)
      .eq("form_key", LAB_FORM)
      .maybeSingle();
    if (previousError) throw previousError;
    const version = Math.max(1, Number(previous?.version ?? 0) + 1);
    const storagePath = `${pokemonId}/${LAB_FORM}/v${version}/model.glb`;
    const { error: uploadError } = await admin.storage.from("pokemon-3d").upload(storagePath, bytes, {
      contentType: "model/gltf-binary",
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const row = {
      pokemon_id: pokemonId,
      form_key: LAB_FORM,
      storage_path: storagePath,
      format: "glb",
      version,
      sha256: hash,
      byte_size: bytes.byteLength,
      scale: 1,
      offset_x: 0,
      offset_y: 0,
      offset_z: 0,
      rotation_y: 0,
      animations: inspection.animations,
      enabled: true,
      min_app_version: "1.2.1",
      source_url: source.toString(),
      source_author: sourceAuthor,
      source_license: sourceLicense,
      source_license_url: sourceLicenseUrl?.toString() ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error: saveError } = await admin
      .from("pokemon_3d_models")
      .upsert(row, { onConflict: "pokemon_id,form_key" })
      .select("pokemon_id,form_key,storage_path,version,sha256,byte_size,animations,enabled,source_url,source_author,source_license,source_license_url")
      .single();
    if (saveError) {
      await admin.storage.from("pokemon-3d").remove([storagePath]).catch(() => undefined);
      throw saveError;
    }
    if (previous?.storage_path && previous.storage_path !== storagePath) {
      await admin.storage.from("pokemon-3d").remove([previous.storage_path]).catch(() => undefined);
    }
    return json({ data: { ...saved, inspection, isolated: true, productionFormUntouched: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("OWNER_ONLY") ? 403
      : message.includes("FETCH_FAILED") ? 422
      : message.includes("TOO_LARGE") ? 413
      : message.includes("REQUIRED") || message.includes("INVALID") || message.includes("UNSUPPORTED") || message.includes("NOT_ALLOWED") || message.includes("EXTERNAL_RESOURCES") ? 400
      : 409;
    return json({ error: message }, status);
  }
});
