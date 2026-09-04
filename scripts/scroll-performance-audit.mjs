import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const failures = [];
const requiredFlatListProps = [
  'initialNumToRender',
  'maxToRenderPerBatch',
  'updateCellsBatchingPeriod',
  'windowSize',
  'removeClippedSubviews',
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

for (const path of [...walk('app'), ...walk('src')].filter((value) => value.endsWith('.tsx'))) {
  const source = readFileSync(path, 'utf8');
  let cursor = 0;
  while ((cursor = source.indexOf('<FlatList', cursor)) >= 0) {
    const window = source.slice(cursor, cursor + 9000);
    const shared = window.includes('VIRTUAL_LIST_PERF_PROPS');
    const missing = shared ? [] : requiredFlatListProps.filter((prop) => !window.includes(prop));
    if (missing.length) {
      failures.push(`${path}: FlatList sem padrão de performance (${missing.join(', ')}).`);
    }
    cursor += 9;
  }
}

if (existsSync('src/components/Screen.tsx')) {
  const screen = readFileSync('src/components/Screen.tsx', 'utf8');
  if (!screen.includes('SMOOTH_SCROLL_VIEW_PROPS')) {
    failures.push('src/components/Screen.tsx: ScrollView base perdeu o padrão global de scroll suave.');
  }
}

if (existsSync('app/auto-open.tsx')) {
  const autoOpen = readFileSync('app/auto-open.tsx', 'utf8');
  if (autoOpen.includes('packs.map((pack)') || !autoOpen.includes('VIRTUAL_LIST_PERF_PROPS')) {
    failures.push('app/auto-open.tsx: seletor de booster voltou a renderizar o catálogo inteiro sem virtualização.');
  }
}

if (existsSync('app/team-battle/[id].tsx')) {
  const teamBattle = readFileSync('app/team-battle/[id].tsx', 'utf8');
  if (teamBattle.includes('cards.map((card)') || !teamBattle.includes('VIRTUAL_LIST_PERF_PROPS')) {
    failures.push('app/team-battle/[id].tsx: seletor 3×3 voltou a renderizar todos os Pokémon sem virtualização.');
  }
}

if (failures.length) {
  console.error('\n❌ Auditoria de scroll/performance falhou:');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}

console.log('✅ Auditoria de scroll/performance passou.');
console.log('   Listas longas continuam virtualizadas e novos seletores não podem regredir para renderização completa.');
