import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const failures=[];
const warnings=[];
const metrics={files:0,interactive:0,pressables:0,touchables:0,buttons:0,flatLists:0,scrollViews:0,images:0,timers:0,realtime:0,reviewedLargeScrolls:0};

// These screens were manually reviewed during the full-app performance pass.
// The fingerprints make the exemption self-invalidating: if a bound/pagination
// guard disappears later, the generic warning becomes visible again in CI.
const reviewedLargeScrollGuards=new Map([
  ['app/(tabs)/battles.tsx',[
    'getMyBattleHistory()',
    'getBattleLeaderboard(25)',
    '<ScrollView horizontal',
    'leaderboard.map(',
    'history.map(',
  ]],
  ['app/admin-audit.tsx',[
    '.slice(0, 15)',
    'getAdminAccountAudit(player.id, 0, 25)',
    'getAdminAccountAudit(selectedPlayerId, offset, 25)',
    'topCards.map(',
    'audit.packHistory.map(',
  ]],
  ['app/battle/[id].tsx',[
    'draft_pick_count}/6',
    'draftCards.map(',
    'manualAttackOptions.map(',
    'rounds.map(',
    'CardPickerModal',
  ]],
  ['app/card/[id].tsx',[
    'getCardPriceHistory(String(id), 30)',
    'CARD_TAGS.map',
    'priceHistory.map(',
    'passport.timeline.map(',
    'styleOptions.map(',
  ]],
  ['app/guild-wars.tsx',[
    'VIRTUAL_LIST_PERF_PROPS',
    '<FlatList',
    'recent.slice(0, 4).map(',
    'board.events.slice(0, 6).map(',
    'war.contributors.slice(0, 5).map(',
  ]],
]);

function walk(dir){
  if(!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name)=>{
    const path=join(dir,name);
    return statSync(path).isDirectory()?walk(path):[path];
  });
}

function lineOf(source,index){return source.slice(0,index).split('\n').length;}

function openingTags(source,name){
  const starts=[];
  const needle='<'+name;
  let from=0;
  while(true){
    const start=source.indexOf(needle,from);
    if(start<0) break;
    const after=source[start+needle.length]??'';
    if(/[A-Za-z0-9_$]/.test(after)){from=start+needle.length;continue;}
    let quote=null;
    let escaped=false;
    let braces=0;
    let end=-1;
    for(let i=start+needle.length;i<source.length;i++){
      const ch=source[i];
      if(quote){
        if(escaped){escaped=false;continue;}
        if(ch==='\\'){escaped=true;continue;}
        if(ch===quote) quote=null;
        continue;
      }
      if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
      if(ch==='{'){braces++;continue;}
      if(ch==='}'){braces=Math.max(0,braces-1);continue;}
      if(ch==='>'&&braces===0){end=i+1;break;}
    }
    if(end>start) starts.push({start,end,text:source.slice(start,end)});
    from=Math.max(start+needle.length,end>0?end:start+needle.length);
  }
  return starts;
}

function hasReviewedLargeScrollGuard(rel,source){
  const guards=reviewedLargeScrollGuards.get(rel);
  return Boolean(guards?.length&&guards.every((needle)=>source.includes(needle)));
}

const uiFiles=[...walk('app'),...walk(join('src','components'))]
  .filter((path)=>/\.(tsx|jsx)$/.test(path));

for(const path of uiFiles){
  const source=readFileSync(path,'utf8');
  metrics.files++;
  const rel=relative('.',path).replaceAll('\\','/');

  for(const name of ['Pressable','TouchableOpacity','TouchableHighlight','TouchableWithoutFeedback','Button']){
    for(const tag of openingTags(source,name)){
      metrics.interactive++;
      if(name==='Pressable') metrics.pressables++;
      else if(name==='Button') metrics.buttons++;
      else metrics.touchables++;
      const hasAction=/\bonPress\s*=|\bonLongPress\s*=/.test(tag.text);
      if(!hasAction){
        failures.push(`${rel}:${lineOf(source,tag.start)} <${name}> sem onPress/onLongPress; controle pode parecer clicável e não responder.`);
      }
      if(/\bdisabled\s*=\s*\{\s*true\s*\}/.test(tag.text)){
        failures.push(`${rel}:${lineOf(source,tag.start)} <${name}> permanentemente disabled={true}.`);
      }
      if(/\bpointerEvents\s*=\s*["']none["']/.test(tag.text)){
        failures.push(`${rel}:${lineOf(source,tag.start)} <${name}> usa pointerEvents="none" e não recebe toque.`);
      }
      const emptyHandler=/\bonPress\s*=\s*\{\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:\{\s*\}|null\b|undefined\b)\s*\}/s;
      if(emptyHandler.test(tag.text)){
        failures.push(`${rel}:${lineOf(source,tag.start)} <${name}> tem onPress vazio/no-op.`);
      }
      if(/\bonPress\s*=\s*\{\s*async\b/s.test(tag.text)&&!(/\bdisabled\s*=/.test(tag.text)||/working|loading|saving|pending|busy|submitting|processing|sending|action/i.test(tag.text))){
        warnings.push(`${rel}:${lineOf(source,tag.start)} handler async inline sem guarda visível contra toque repetido.`);
      }
    }
  }

  metrics.flatLists+=(source.match(/<FlatList(?=\s|>)/g)||[]).length;
  metrics.scrollViews+=(source.match(/<ScrollView(?=\s|>)/g)||[]).length;
  metrics.images+=(source.match(/<Image(?=\s|>)/g)||[]).length;
  metrics.timers+=(source.match(/\bsetInterval\s*\(/g)||[]).length;
  metrics.realtime+=(source.match(/\.channel\s*\(/g)||[]).length;

  if(/\bsetInterval\s*\(/.test(source)&&!(/\bclearInterval\s*\(/.test(source))){
    failures.push(`${rel}: cria setInterval sem clearInterval; risco de timer duplicado/vazamento após navegar.`);
  }
  if(/\.channel\s*\(/.test(source)&&!(/removeChannel\s*\(|\.unsubscribe\s*\(/.test(source))){
    failures.push(`${rel}: abre canal realtime sem cleanup visível; risco de listeners duplicados.`);
  }

  const scrollMapCount=(source.match(/\.map\s*\(/g)||[]).length;
  if(/<ScrollView(?=\s|>)/.test(source)&&scrollMapCount>=8&&Buffer.byteLength(source,'utf8')>45000){
    if(hasReviewedLargeScrollGuard(rel,source)){
      metrics.reviewedLargeScrolls++;
    }else{
      warnings.push(`${rel}: tela grande usa ScrollView com ${scrollMapCount} maps; revisar virtualização dos blocos de alta cardinalidade.`);
    }
  }

  const remoteImages=(source.match(/source\s*=\s*\{\s*\{\s*uri\s*:/g)||[]).length;
  if(remoteImages>=10&&!source.includes('VIRTUAL_LIST_PERF_PROPS')){
    warnings.push(`${rel}: ${remoteImages} imagens remotas e nenhuma lista virtualizada detectada; revisar custo de decode/render.`);
  }
}

const globalNav='src/components/GlobalBottomNavigation.tsx';
if(existsSync(globalNav)){
  const source=readFileSync(globalNav,'utf8');
  if(!/minHeight:\s*(?:4[4-9]|[5-9]\d|\d{3,})/.test(source)) failures.push(`${globalNav}: itens da navegação inferior precisam de alvo de toque >=44dp.`);
  if(!source.includes('if (active) return')&&!source.includes('if(active)return')) failures.push(`${globalNav}: tocar na aba já ativa ainda dispara navegação/render desnecessário.`);
}

const trainerNav='src/components/TrainerNavigation.tsx';
if(existsSync(trainerNav)){
  const source=readFileSync(trainerNav,'utf8');
  if(!source.includes('navigationLocked')) warnings.push(`${trainerNav}: menu global ainda pode receber duplo toque muito rápido; manter sob observação.`);
}

const screen='src/components/Screen.tsx';
if(existsSync(screen)){
  const source=readFileSync(screen,'utf8');
  if(!source.includes('SMOOTH_SCROLL_VIEW_PROPS')) failures.push(`${screen}: perdeu configuração compartilhada de scroll responsivo.`);
}

if(failures.length){
  console.error(`\n❌ Auditoria global de toque/performance falhou (${failures.length}):`);
  failures.forEach((item)=>console.error(' - '+item));
  if(warnings.length){console.error(`\n⚠️  Pontos para revisão (${warnings.length}):`);warnings.slice(0,80).forEach((item)=>console.error(' - '+item));}
  process.exit(1);
}

console.log('✅ Auditoria global de toque/performance passou.');
console.log(`   ${metrics.files} arquivos UI • ${metrics.interactive} controles interativos • ${metrics.flatLists} FlatLists • ${metrics.scrollViews} ScrollViews • ${metrics.images} Images.`);
console.log(`   Pressables ${metrics.pressables} • Touchables ${metrics.touchables} • Buttons ${metrics.buttons} • timers ${metrics.timers} • canais realtime ${metrics.realtime}.`);
if(metrics.reviewedLargeScrolls){
  console.log(`   ${metrics.reviewedLargeScrolls} tela(s) grande(s) com limites/paginação revisados e protegidos por fingerprint.`);
}
if(warnings.length){
  console.log(`⚠️  ${warnings.length} ponto(s) heurístico(s) para revisão manual contínua:`);
  warnings.slice(0,80).forEach((item)=>console.log(' - '+item));
}
