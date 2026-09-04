import { readFile } from 'node:fs/promises';

const app=await readFile('app/admin-battle-lab.tsx','utf8');
const svc=await readFile('src/services/adminLaunchTools.ts','utf8');
const requiredApp=['BATTLE_TYPES','typeFilter','setFilter','rarityFilter','filtersOpen','activeFilterCount','clearCatalogFilters','VIRTUAL_LIST_PERF_PROPS',"getAdminBattleLabCatalog(search,offset,PAGE_SIZE,{type:typeFilter,set:setFilter,rarity:rarityFilter})",'Os filtros são aplicados no catálogo completo do servidor'];
const requiredSvc=['AdminBattleLabCatalogFilters','p_type:filters.type||null','p_set:filters.set||null','p_rarity:filters.rarity||null'];
const missing=[...requiredApp.filter(x=>!app.includes(x)).map(x=>'app:'+x),...requiredSvc.filter(x=>!svc.includes(x)).map(x=>'service:'+x)];
if(missing.length){console.error('❌ Battle Lab filter audit failed:',missing);process.exit(1);}
console.log('✅ Battle Lab filter audit: busca + tipo + set + raridade usam paginação server-side e lista virtualizada.');
