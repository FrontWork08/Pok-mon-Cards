import { existsSync, readFileSync } from 'node:fs';

const migration='supabase/migrations/20260911185000_harden_adventure_actor_rpcs.sql';
const failures=[];
if(!existsSync(migration)){
  failures.push('Migração de hardening das RPCs de aventura não existe.');
}else{
  const source=readFileSync(migration,'utf8');
  for(const fn of ['server_set_adventure_battle_team','server_list_adventure_team_battle_cards']){
    const start=source.indexOf('function public.'+fn);
    if(start<0){failures.push('Função não protegida na migração: '+fn);continue;}
    const next=source.indexOf('create or replace function',start+20);
    const block=source.slice(start,next<0?source.length:next);
    if(!/auth\.uid\(\)\s+is\s+null/i.test(block)||!/auth\.uid\(\)\s+is\s+distinct\s+from\s+p_actor_id/i.test(block)){
      failures.push(fn+' não vincula p_actor_id ao auth.uid().');
    }
  }
  if(!source.includes('from public, anon')) failures.push('Migração não revoga execução pública/anon.');
}
if(failures.length){
  console.error('❌ Auditoria de RPC actor-binding falhou:');
  failures.forEach(x=>console.error(' - '+x));
  process.exit(1);
}
console.log('✅ RPCs de aventura impedem actor-id spoofing e permanecem apenas para authenticated.');
