import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => {
  console.error(`[3d-audit] ${message}`);
  process.exitCode = 1;
};
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) fail(`${label}: missing ${needle}`);
};

const pkg = JSON.parse(read('package.json'));
for (const dependency of ['three', 'expo-gl', 'expo-file-system']) {
  if (!pkg.dependencies?.[dependency]) fail(`package.json: missing native/runtime dependency ${dependency}`);
}

const service = read('src/services/pokemon3dModels.ts');
requireText(service, ".from('pokemon_3d_models')", 'model registry service');
requireText(service, ".from(BUCKET).getPublicUrl", 'model registry service');
requireText(service, 'FileSystem.downloadAsync', 'model cache');
requireText(service, 'readPokemon3DModelArrayBuffer', 'model cache');
requireText(service, 'manifest.version', 'cache invalidation');

const arena = read('src/components/BattleArena3D.native.tsx');
requireText(arena, "three/examples/jsm/loaders/GLTFLoader.js", 'native arena');
requireText(arena, 'createExpoThreeRenderer', 'Expo GL canvas compatibility');
requireText(arena, 'canvas: canvas as any', 'Expo GL canvas compatibility');
requireText(arena, 'resolvePokemon3DModel', 'native arena');
requireText(arena, "playAnimation(myRuntime, 'attack')", 'battle animations');
requireText(arena, "playAnimation(rivalRuntime, 'faint')", 'battle animations');
requireText(arena, 'makeCreature', 'procedural fallback');
requireText(arena, 'contextError', 'safe render failure fallback');

const adaptive = read('src/components/AdaptiveBattleArena.tsx');
requireText(adaptive, "mode==='3d'", 'adaptive arena');
requireText(adaptive, '<PixelBattleArena', '2D fallback');

const migrationFiles = fs.readdirSync(path.join(root, 'supabase', 'migrations'));
const registryMigration = migrationFiles.find((name) => name.endsWith('_remote_pokemon_3d_model_registry.sql'));
if (!registryMigration) fail('Supabase migration for remote Pokemon 3D models is missing');
else {
  const migration = read(path.join('supabase', 'migrations', registryMigration));
  requireText(migration, 'create table if not exists public.pokemon_3d_models', '3D migration');
  requireText(migration, "'pokemon-3d'", '3D migration');
  requireText(migration, 'enable row level security', '3D migration');
}

if (!process.exitCode) console.log('[3d-audit] remote GLB runtime, cache, Expo GL canvas shim, safe render fallback and registry are wired.');
