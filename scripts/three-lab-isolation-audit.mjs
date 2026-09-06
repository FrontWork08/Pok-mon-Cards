import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => {
  console.error(`[3d-lab-audit] ${message}`);
  process.exitCode = 1;
};
const need = (text, token, label) => {
  if (!text.includes(token)) fail(`${label}: missing ${token}`);
};

const service = read('src/services/pokemon3dModels.ts');
need(service, "formKeyInput = 'default'", 'model service default isolation');
need(service, ".eq('form_key', formKey)", 'model service form lookup');
need(service, 'manifestCache.delete(`${id}:${formKey}`)', 'model service scoped invalidation');

const arena = read('src/components/BattleArena3D.native.tsx');
need(arena, "modelFormKey = 'default'", 'native arena default isolation');
need(arena, 'resolvePokemon3DModel(pokemonId, quality, modelFormKey)', 'native arena form forwarding');
need(arena, ':${modelFormKey}`', 'native arena scene key isolation');

const adaptive = read('src/components/AdaptiveBattleArena.tsx');
need(adaptive, "modelFormKey='default'", 'adaptive arena default isolation');
need(adaptive, 'modelFormKey={modelFormKey}', 'adaptive arena form forwarding');

const lab = read('app/admin-3d-lab.tsx');
need(lab, "resolvePokemon3DModel(pokemon.pokemonId, 'medium', 'lab')", 'admin lab probe isolation');
need(lab, 'modelFormKey="lab"', 'admin lab renderer isolation');
need(lab, 'ingestPokemon3DLabModel', 'admin lab ingest UI');
need(lab, 'IMPORTAR GLB PARA LAB', 'admin lab ingest action');

const edge = read('supabase/functions/pokemon-3d-lab-ingest/index.ts');
need(edge, 'const LAB_FORM = "lab"', 'edge lab form');
need(edge, 'access?.role !== "owner"', 'edge owner-only guard');
need(edge, 'LAB_POKEMON_NOT_ALLOWED', 'edge pokemon allowlist');
need(edge, 'GLB_EXTERNAL_RESOURCES_NOT_ALLOWED', 'edge self-contained GLB guard');
need(edge, 'KHR_draco_mesh_compression', 'edge decoder guard');
need(edge, 'source_license', 'edge license metadata');

const migration = read('supabase/migrations/20260906224500_add_3d_model_source_metadata.sql');
for (const column of ['source_url', 'source_author', 'source_license', 'source_license_url']) {
  need(migration, column, '3D source metadata migration');
}

if (!process.exitCode) console.log('[3d-lab-audit] lab GLBs are isolated from production defaults and owner ingest is guarded.');
