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
need(adaptive, "prefer3D=false", 'adaptive arena production 2D default');
need(adaptive, "prefer3D===true&&modelFormKey==='lab'", 'adaptive arena lab-only 3D gate');
need(adaptive, 'if(!lab3DAllowed)', 'adaptive arena hard 2D production fallback');
need(adaptive, "modelFormKey='default'", 'adaptive arena default isolation');
need(adaptive, 'modelFormKey={modelFormKey}', 'adaptive arena form forwarding');

const lab = read('app/admin-3d-lab.tsx');
need(lab, "resolvePokemon3DModel(pokemon.pokemonId, 'medium', 'lab')", 'admin lab probe isolation');
need(lab, 'modelFormKey="lab"', 'admin lab renderer isolation');
need(lab, 'prefer3D={true}', 'admin lab explicit 3D opt-in');
need(lab, 'ingestPokemon3DLabModel', 'admin lab ingest UI');
need(lab, 'IMPORTAR GLB PARA LAB', 'admin lab ingest action');

// No gameplay screen or unrelated component may opt into or import the 3D renderer.
const allowed3DFiles = new Set([
  path.normalize('app/admin-3d-lab.tsx'),
  path.normalize('src/components/AdaptiveBattleArena.tsx'),
  path.normalize('src/components/BattleArena3D.tsx'),
  path.normalize('src/components/BattleArena3D.native.tsx'),
  path.normalize('src/components/BattleArena3D.web.tsx'),
]);
const scanRoots = ['app', 'src'];
const walk = (dir) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(relative);
    else if (/\.(ts|tsx)$/.test(entry.name) && !allowed3DFiles.has(path.normalize(relative))) {
      const text = read(relative);
      if (text.includes('BattleArena3D')) fail(`${relative}: direct 3D renderer reference outside lab bridge`);
      if (text.includes('prefer3D={true}')) fail(`${relative}: 3D opt-in outside owner lab`);
      if (text.includes('modelFormKey="lab"')) fail(`${relative}: lab model form used outside owner lab`);
    }
  }
};
for (const dir of scanRoots) walk(dir);

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

if (!process.exitCode) console.log('[3d-lab-audit] 3D rendering is owner-lab-only; production battle modes are hard-locked to 2D.');
