import { supabase } from '@/lib/supabase';

function message(error: any, fallback: string) {
  const raw = String(error?.message ?? '');
  if (raw.includes('GAMEPASS_REQUIRED')) return 'Esta Gamepass é necessária para usar este recurso.';
  if (raw.includes('GUILD_REQUIRED')) return 'Entre em uma guilda para usar o Guild Pro.';
  if (raw.includes('GUILD_MANAGER_REQUIRED')) return 'Somente líder ou oficial pode alterar cargos e identidade Pro.';
  return raw || fallback;
}

async function rpc<T>(name: string, args?: Record<string, unknown>, fallback = 'Não foi possível concluir a operação.'): Promise<T> {
  const { data, error } = await supabase.rpc(name, args ?? {});
  if (error) throw new Error(message(error, fallback));
  return data as T;
}

export type BagProPreset = { id: string; name: string; filters: Record<string, unknown>; sortMode: string; updatedAt: string };
export type BagProFolder = { id: string; name: string; icon: string; count: number; updatedAt: string };
export type BagProFolderCard = { id: string; name: string; setName: string; rarity: string | null; image: string | null; marketPriceUsd: number | null; quantity: number };
export type BagProDashboard = { presets: BagProPreset[]; folders: BagProFolder[]; sortModes: string[] };

export function getBagProDashboard() { return rpc<BagProDashboard>('get_bag_pro_dashboard', {}, 'Não foi possível carregar o Bag Pro.'); }
export function saveBagProPreset(input: { id?: string | null; name: string; filters: Record<string, unknown>; sortMode: string }) {
  return rpc<{id:string;ok:boolean}>('save_bag_pro_preset', { p_id: input.id ?? null, p_name: input.name, p_filters: input.filters, p_sort_mode: input.sortMode });
}
export function deleteBagProPreset(id: string) { return rpc<boolean>('delete_bag_pro_preset', { p_id: id }); }
export function createBagProFolder(name: string, icon = 'folder') { return rpc<string>('create_bag_pro_folder', { p_name: name, p_icon: icon }); }
export function deleteBagProFolder(id: string) { return rpc<boolean>('delete_bag_pro_folder', { p_id: id }); }
export function setBagProFolderCard(folderId: string, cardId: string, enabled: boolean) {
  return rpc('set_bag_pro_folder_card', { p_folder_id: folderId, p_card_id: cardId, p_enabled: enabled });
}
export function getBagProFolderCards(folderId: string) { return rpc<BagProFolderCard[]>('get_bag_pro_folder_cards', { p_folder_id: folderId }); }

export type MarketProWatch = { cardId:string;name:string;setName:string;image:string|null;marketPriceUsd:number|null;targetPriceUsd:number|null;targetListingCoins:number|null;notifyBelow:boolean;updatedAt:string };
export type MarketProSelected = { cardId:string;name:string;setName:string;image:string|null;marketPriceUsd:number|null;priceHistory:Array<{priceUsd:number;recordedAt:string}>;listingStats:{count:number;minCoins:number|null;avgCoins:number|null;maxCoins:number|null};recommendedCoins:number|null };
export type MarketProDashboard = { watches:MarketProWatch[]; seller:{activeListings:number;soldListings:number;grossCoins:number;netCoins:number}; selectedCard:MarketProSelected|null };
export function getMarketplaceProDashboard(cardId?: string | null) { return rpc<MarketProDashboard>('get_marketplace_pro_dashboard', { p_card_id: cardId ?? null }, 'Não foi possível carregar o Marketplace Pro.'); }
export function setMarketplaceProWatch(cardId:string,targetPriceUsd:number|null,targetListingCoins:number|null,enabled=true) {
  return rpc('set_marketplace_pro_watch',{p_card_id:cardId,p_target_price_usd:targetPriceUsd,p_target_listing_coins:targetListingCoins,p_enabled:enabled});
}

export type CollectorGoal = { id:string;kind:'set'|'type'|'unique'|'value';key:string;label:string;target:number;progress:number;updatedAt:string };
export type CollectorSet = { setId:string;setName:string;owned:number;total:number;percent:number;missing:number };
export type CollectorDashboard = { summary:{uniqueCards:number;collectionValueUsd:number;totalCopies:number};bySet:CollectorSet[];byType:Array<{type:string;owned:number;copies:number}>;nearCompleteSets:CollectorSet[];goals:CollectorGoal[] };
export function getCollectorPassDashboard() { return rpc<CollectorDashboard>('get_collector_pass_dashboard', {}, 'Não foi possível carregar o Collector Pass.'); }
export function saveCollectorGoal(input:{id?:string|null;kind:CollectorGoal['kind'];key?:string;label:string;target:number}) { return rpc<string>('save_collector_pro_goal',{p_id:input.id??null,p_kind:input.kind,p_key:input.key??'',p_label:input.label,p_target:input.target}); }
export function deleteCollectorGoal(id:string) { return rpc<boolean>('delete_collector_pro_goal',{p_id:id}); }

export type GuildProRole = 'strategist'|'recruiter'|'collector'|'defender'|'event_lead'|'market_lead';
export type GuildProDashboard = { guild:{id:string;name:string;color:string;motto:string;level:number;xp:number;baseRole:string};settings:{accentColor:string;badge:string;announcement:string;updatedAt?:string};members:Array<{playerId:string;username:string;baseRole:string;proRole:GuildProRole|null;joinedAt:string}>;audit:Array<{id:number;action:string;actorId:string;actorUsername:string|null;targetId:string|null;targetUsername:string|null;metadata:Record<string,unknown>;createdAt:string}>;roleOptions:GuildProRole[];canManage:boolean };
export function getGuildProDashboard(){return rpc<GuildProDashboard>('get_guild_pro_dashboard',{},'Não foi possível carregar o Guild Pro.');}
export function setGuildProMemberRole(playerId:string,role:GuildProRole|null){return rpc('set_guild_pro_member_role',{p_target_id:playerId,p_role_key:role});}
export function saveGuildProSettings(accentColor:string,badge:string,announcement:string){return rpc('save_guild_pro_settings',{p_accent_color:accentColor,p_badge:badge,p_announcement:announcement});}

export type BattleStyle = { arenaStyle:'classic'|'kanto_night'|'neon_grid'|'champion_gold'|'galaxy_void'; entranceFx:'flash'|'scan'|'spark'|'warp'|'none'; switchFx:'pulse'|'slide'|'spark'|'warp'|'none'; updatedAt?:string };
export type BattleStyleState = { active:boolean;style:BattleStyle };
export function getMyBattleStyle(){return rpc<BattleStyleState>('get_my_battle_style',{},'Não foi possível carregar seu estilo de batalha.');}
export function setMyBattleStyle(style:BattleStyle){return rpc<BattleStyle>('set_my_battle_style',{p_arena_style:style.arenaStyle,p_entrance_fx:style.entranceFx,p_switch_fx:style.switchFx});}

export type MuseumProDashboard = { summary:{uniqueCards:number;totalCopies:number;collectionValueUsd:number;packsOpened:number;battlesPlayed:number;wins:number;tradesCompleted:number};topCards:Array<{id:string;name:string;setName:string;rarity:string|null;image:string|null;marketPriceUsd:number|null;quantity:number}>;rarities:Array<{rarity:string;unique:number;copies:number}>;sets:Array<{setId:string;setName:string;owned:number;valueUsd:number}>;activityByMonth:Array<{month:string;packs:number;battles:number}>;displayCards:Array<{slot:number;id:string;name:string;image:string|null;rarity:string|null;marketPriceUsd:number|null}> };
export function getMuseumProDashboard(){return rpc<MuseumProDashboard>('get_museum_pro_dashboard',{},'Não foi possível carregar o Museum Pro.');}

export type ReplayProBattle = { id:string;mode:string;status:string;ranked:boolean;engineVersion:string;createdAt:string;completedAt:string|null;winnerId:string|null;won:boolean;opponentId:string;opponentUsername:string|null;myScore:number;opponentScore:number;ratingBefore:number|null;ratingAfter:number|null;rounds:number;favorite:boolean;label:string;notes:string };
export type ReplayProDashboard = {limit:number;favorites:number;summary:{total:number;wins:number;ranked:number};battles:ReplayProBattle[]};
export function getReplayProDashboard(limit=100){return rpc<ReplayProDashboard>('get_replay_pro_dashboard',{p_limit:limit},'Não foi possível carregar o Replay Pro.');}
export function setReplayProFavorite(battleId:string,favorite:boolean,label='',notes=''){return rpc('set_replay_pro_favorite',{p_battle_id:battleId,p_favorite:favorite,p_label:label,p_notes:notes});}
export function compareReplayProBattles(a:string,b:string){return rpc<{a:Record<string,any>;b:Record<string,any>}>('compare_replay_pro_battles',{p_battle_a:a,p_battle_b:b});}
