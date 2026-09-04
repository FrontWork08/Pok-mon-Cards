import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const failures = [];
const warnings = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

function walk(dir, exts = null) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (!exts || exts.some((ext) => name.endsWith(ext))) out.push(full.replaceAll('\\', '/'));
  }
  return out;
}

const sourceFiles = [...walk('app', ['.ts', '.tsx']), ...walk('src', ['.ts', '.tsx'])];
const migrationFiles = walk('supabase/migrations', ['.sql']);
const edgeDirs = existsSync('supabase/functions')
  ? readdirSync('supabase/functions').filter((name) => statSync(path.join('supabase/functions', name)).isDirectory())
  : [];
const edgeSet = new Set(edgeDirs);

// 1) Every Edge Function referenced by the client must exist in the repository.
const invokedEdges = new Map();
const rpcCalls = new Map();
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\.functions\.invoke\(\s*['"]([^'"]+)['"]/g)) {
    const slug = match[1];
    if (!invokedEdges.has(slug)) invokedEdges.set(slug, []);
    invokedEdges.get(slug).push(file);
  }
  for (const match of text.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)) {
    const name = match[1];
    if (!rpcCalls.has(name)) rpcCalls.set(name, []);
    rpcCalls.get(name).push(file);
  }
}
for (const [slug, files] of invokedEdges) {
  assert(edgeSet.has(slug), `Contrato backend: Edge Function '${slug}' é chamada por ${files[0]}, mas não existe em supabase/functions/.`);
}
for (const slug of edgeSet) {
  assert(existsSync(`supabase/functions/${slug}/index.ts`), `Edge Function '${slug}' está sem index.ts.`);
}

// 2) Every RPC used by the client must have a definition preserved in migrations.
const migrationsText = migrationFiles.map((file) => readFileSync(file, 'utf8')).join('\n').toLowerCase();
for (const [name, files] of rpcCalls) {
  const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const definition = new RegExp(`(?:function\\s+(?:public\\.)?${escaped}\\s*\\(|create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${escaped}\\s*\\()`, 'i');
  assert(definition.test(migrationsText), `Contrato backend: RPC '${name}' usada por ${files[0]} não foi encontrada nas migrations.`);
}

// 3) Static Expo Router destinations must resolve to a route file.
function normalizeRoute(value) {
  let route = String(value).split('?')[0].split('#')[0];
  if (!route.startsWith('/')) return null;
  route = route.replace(/\/\([^/]+\)/g, '');
  route = route.replace(/\/+$/, '') || '/';
  return route;
}
function routeFromFile(file) {
  let rel = file.replace(/^app\//, '').replace(/\.(tsx?|jsx?)$/, '');
  if (rel === '_layout' || rel.endsWith('/_layout') || rel.startsWith('+')) return null;
  rel = rel.replace(/(^|\/)\([^/]+\)(?=\/|$)/g, '$1');
  rel = rel.replace(/\/index$/, '').replace(/^index$/, '');
  rel = rel.replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
  return `/${rel}`.replace(/\/$/, '') || '/';
}
const routePatterns = walk('app', ['.ts', '.tsx']).map(routeFromFile).filter(Boolean);
function matchesRoute(target) {
  const t = normalizeRoute(target);
  if (!t) return true;
  const ts = t === '/' ? [] : t.slice(1).split('/');
  return routePatterns.some((pattern) => {
    const ps = pattern === '/' ? [] : pattern.slice(1).split('/');
    if (ps.length !== ts.length) return false;
    return ps.every((segment, i) => /^\[.+\]$/.test(segment) || segment === ts[i]);
  });
}
const routeRegexes = [
  /router\.(?:push|replace|navigate)\(\s*['"](\/[^'"$]*)['"]/g,
  /href\s*=\s*['"](\/[^'"$]*)['"]/g,
  /pathname\s*:\s*['"](\/[^'"$]*)['"]/g,
];
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const regex of routeRegexes) {
    for (const match of text.matchAll(regex)) {
      const target = match[1];
      if (target.startsWith('//')) continue;
      // '/player/' + id and similar prefixes are intentionally dynamic, not static destinations.
      if (target !== '/' && target.endsWith('/')) continue;
      assert(matchesRoute(target), `Rota inexistente: '${target}' referenciada em ${file}.`);
    }
  }
}

// 4) Privileged Supabase secrets must never be bundled into app/src client code.
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  assert(!/SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEYS?|SECRET_KEY)/i.test(text), `Segurança: segredo privilegiado do Supabase referenciado no cliente: ${file}.`);
}

// 5) Basic repository contracts for the major player-facing surfaces.
const requiredSurfaces = [
  'app/(tabs)/index.tsx', 'app/(tabs)/packs.tsx', 'app/(tabs)/bag.tsx', 'app/(tabs)/trade.tsx', 'app/(tabs)/battles.tsx', 'app/(tabs)/profile.tsx',
  'app/player/[id].tsx', 'app/store.tsx', 'app/marketplace.tsx', 'app/market-offers.tsx', 'app/guilds.tsx', 'app/guild-wars.tsx', 'app/decks.tsx', 'app/deck/[id].tsx',
  'app/battle-pass.tsx', 'app/tournaments.tsx', 'app/team-battle/[id].tsx', 'app/battle/[id].tsx', 'app/auto-open.tsx', 'app/auto-open-plus.tsx', 'app/pack-queue.tsx',
  'app/gamepasses.tsx', 'app/codes.tsx', 'app/friends.tsx', 'app/chat/[id].tsx', 'app/inbox.tsx', 'app/economy.tsx', 'app/collector-pass.tsx', 'app/bag-pro.tsx',
  'app/marketplace-pro.tsx', 'app/museum-pro.tsx', 'app/replay-pro.tsx',
  'src/services/auth.ts', 'src/services/bag.ts', 'src/services/battles.ts', 'src/services/teamBattles.ts', 'src/services/trades.ts', 'src/services/decks.ts',
  'supabase/functions/open-pack/index.ts', 'supabase/functions/battle-action/index.ts', 'supabase/functions/team-battle-action/index.ts',
  'supabase/functions/trade-action/index.ts', 'supabase/functions/player-action/index.ts', 'supabase/functions/deck-action/index.ts', 'supabase/functions/admin-action/index.ts',
];
for (const file of requiredSurfaces) assert(existsSync(file), `Superfície principal ausente: ${file}`);

// 6) Game Boy battles must expose manual attack selection in every game_v1 mode.
const battleScreenText = readFileSync('app/battle/[id].tsx', 'utf8');
assert(battleScreenText.includes("battleData.engine_version === 'game_v1' || battleData.mode === 'draft3'"), 'Batalha Game Boy: carregamento do estado de ataque voltou a ficar restrito ao Draft 3.');
assert(battleScreenText.includes("battle.status === 'revealing' && (battle.engine_version === 'game_v1' || battle.mode === 'draft3')"), 'Batalha Game Boy: UI de golpes voltou a ficar restrita ao Draft 3.');
assert(existsSync('supabase/migrations/20260904193000_game_v1_manual_attacks_all_battle_modes.sql'), 'Migração Game Boy de ataques manuais ausente.');

if (failures.length) {
  console.error(`\n❌ Auditoria completa encontrou ${failures.length} problema(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('✅ Auditoria completa de contratos passou.');
console.log(`   ${sourceFiles.length} arquivos cliente verificados; ${routePatterns.length} rotas; ${rpcCalls.size} RPCs; ${invokedEdges.size} Edge Functions referenciadas.`);
if (warnings.length) for (const warning of warnings) console.warn(`⚠️ ${warning}`);
