import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const TCGDEX = "https://api.tcgdex.net/v2/en";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function assetUrl(value?: string | null) {
  if (!value) return null;
  return /\.(png|jpe?g|webp)$/i.test(value) ? value : `${value}.png`;
}

type PackRequest = {
  setId: string;
  setName?: string | null;
};

type ArtworkResult = {
  set_id: string;
  booster_art_url: string | null;
  booster_art_urls: string[];
  booster_back_url: string | null;
  booster_logo_url: string | null;
  source: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const secret = getSecretKey();
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");

  if (!url || !secret) {
    return Response.json({ error: "Server configuration error" }, { status: 500, headers: corsHeaders });
  }

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));
  const requested: PackRequest[] = Array.isArray(body?.sets)
    ? body.sets
        .filter((item: any) => typeof item?.setId === "string")
        .slice(0, 20)
        .map((item: any) => ({ setId: item.setId, setName: item.setName ?? null }))
    : [];

  if (!requested.length) {
    return Response.json({ results: [] }, { headers: corsHeaders });
  }

  const listResponse = await fetch(`${TCGDEX}/sets`, {
    headers: { "User-Agent": "Pokemon-Cards-Private-Project" },
  });

  if (!listResponse.ok) {
    return Response.json(
      { error: `TCGdex sets fetch failed: ${listResponse.status}` },
      { status: 502, headers: corsHeaders },
    );
  }

  const setList = (await listResponse.json()) as Array<{ id: string; name: string }>;
  const byId = new Map(setList.map((set) => [set.id.toLowerCase(), set]));
  const byName = new Map(setList.map((set) => [normalize(set.name ?? ""), set]));

  const results: ArtworkResult[] = [];

  for (const item of requested) {
    const setName = (item.setName ?? "").replace(/\s+Booster$/i, "");
    const match =
      byId.get(item.setId.toLowerCase()) ??
      byName.get(normalize(setName));

    if (!match) {
      await admin
        .from("packs")
        .update({
          booster_art_source: "tcgdex:no_match",
          booster_art_checked_at: new Date().toISOString(),
        })
        .eq("set_id", item.setId);

      results.push({
        set_id: item.setId,
        booster_art_url: null,
        booster_art_urls: [],
        booster_back_url: null,
        booster_logo_url: null,
        source: "tcgdex:no_match",
      });
      continue;
    }

    try {
      const detailResponse = await fetch(`${TCGDEX}/sets/${encodeURIComponent(match.id)}`, {
        headers: { "User-Agent": "Pokemon-Cards-Private-Project" },
      });

      if (!detailResponse.ok) {
        throw new Error(`HTTP_${detailResponse.status}`);
      }

      const detail = await detailResponse.json();
      const boosters = Array.isArray(detail?.boosters) ? detail.boosters : [];

      const fronts = boosters
        .map((booster: any) => assetUrl(booster?.artwork_front))
        .filter((value: string | null): value is string => Boolean(value));

      const backs = boosters
        .map((booster: any) => assetUrl(booster?.artwork_back))
        .filter((value: string | null): value is string => Boolean(value));

      const firstLogo =
        boosters
          .map((booster: any) => assetUrl(booster?.logo))
          .find((value: string | null) => Boolean(value)) ?? null;

      const update = {
        booster_art_url: fronts[0] ?? null,
        booster_art_urls: fronts,
        booster_back_url: backs[0] ?? null,
        booster_logo_url: firstLogo,
        booster_art_source: fronts.length ? "tcgdex" : "tcgdex:no_art",
        booster_art_checked_at: new Date().toISOString(),
      };

      const { error: updateError } = await admin
        .from("packs")
        .update(update)
        .eq("set_id", item.setId);

      if (updateError) throw updateError;

      results.push({
        set_id: item.setId,
        booster_art_url: update.booster_art_url,
        booster_art_urls: fronts,
        booster_back_url: update.booster_back_url,
        booster_logo_url: firstLogo,
        source: update.booster_art_source,
      });
    } catch (error) {
      await admin
        .from("packs")
        .update({
          booster_art_source: "tcgdex:error",
          booster_art_checked_at: new Date().toISOString(),
        })
        .eq("set_id", item.setId);

      results.push({
        set_id: item.setId,
        booster_art_url: null,
        booster_art_urls: [],
        booster_back_url: null,
        booster_logo_url: null,
        source: `tcgdex:error:${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return Response.json({ results }, { headers: corsHeaders });
});
