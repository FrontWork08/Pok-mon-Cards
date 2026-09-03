import { supabase } from '@/lib/supabase';

export type GuildRole = 'leader' | 'officer' | 'member';

export type GuildChatMessage = {
  id: string;
  guildId: string;
  playerId: string;
  body: string;
  username: string;
  profileIcon: string;
  titleId: string | null;
  title: string | null;
  titleIcon: string | null;
  createdAt: string;
};

export type GuildMember = {
  id: string;
  username: string;
  level: number;
  role: GuildRole;
  joinedAt: string;
};

export type GuildMission = {
  id: string;
  icon: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
};

export type Guild = {
  id: string;
  name: string;
  color: string;
  motto: string;
  leaderId: string | null;
  leaderUsername: string | null;
  memberCount: number;
  collectionValueUsd: number;
  rank: number;
  xp: number;
  level: number;
  members: GuildMember[];
  missions: GuildMission[];
};

export type GuildInvite = {
  id: string;
  guildId: string;
  guildName: string;
  guildColor: string;
  invitedBy: string;
  invitedByUsername: string;
  createdAt: string;
};

export type GuildWeeklyReward = {
  guildId: string | null;
  weekStart: string;
  completedMissions: number;
  claimed: boolean;
  claimable: boolean;
  coins: number;
  diamonds: number;
  collectionValueUsd: number;
  packs: number;
  wins: number;
};

export type GuildWarContributor = {
  playerId:string;
  username:string;
  guildId:string;
  points:number;
  wins:number;
  matches:number;
};
export type GuildWar = {
  id:string;
  weekStart:string;
  status:'active'|'completed';
  startsAt:string;
  endsAt:string;
  guildA:{id:string;name:string;color:string;score:number};
  guildB:{id:string;name:string;color:string;score:number};
  winnerGuildId:string|null;
  contributors:GuildWarContributor[];
};
export type GuildWarGymDefender = {
  id:string;
  playerId:string;
  username:string;
  guildId:string;
  cardId:string;
  pokemonName:string;
  imageSmall:string|null;
  rarity:string|null;
  types:string[];
  maxHp:number;
  currentHp:number;
  maxDamage:number;
  wins:number;
  placedAt:string;
  updatedAt:string;
};

export type GuildWarGymEvent = {
  id:number;
  gymId:string;
  eventType:'defender_set'|'heal'|'attack'|'capture'|'cosmetic';
  actorId:string|null;
  guildId:string|null;
  message:string;
  metadata:Record<string,unknown>;
  createdAt:string;
};

export type GuildWarGym = {
  id:string;
  slot:number;
  key:string;
  name:string;
  ownerGuild:{id:string;name:string;color:string}|null;
  controlledSince:string;
  captureCount:number;
  lastAttackedAt:string|null;
  flareKey:'banner'|'champion'|'legendary'|'galaxy'|null;
  flareUntil:string|null;
  defenders:GuildWarGymDefender[];
};

export type GuildWarGymBoard = {
  warId:string;
  status:'active'|'completed';
  startsAt:string;
  endsAt:string;
  guildA:{id:string;name:string;color:string};
  guildB:{id:string;name:string;color:string};
  gyms:GuildWarGym[];
  events:GuildWarGymEvent[];
};

export type GuildGymAttackResult = {
  gymId:string;
  conquered:boolean;
  ownerGuildId:string;
  defendersDefeated:number;
  defendersRemaining:number;
  attackersFainted:number;
  teamSize:number;
};

export type GuildCollectiveBooster = {
  id?:string;
  guildId:string|null;
  weekStart?:string;
  progress:number;
  target:number;
  status:'none'|'building'|'ready';
  readyAt?:string|null;
  claimed:boolean;
  claimable:boolean;
};

export type GuildHub = {
  guilds: Guild[];
  myMembership: { guildId: string; role: GuildRole; joinedAt: string } | null;
  myInvites: GuildInvite[];
  weeklyReward: GuildWeeklyReward;
  wars: GuildWar[];
  collectiveBooster: GuildCollectiveBooster;
};

export type GuildStory = {
  type:'battle_win'|'pack_open'|'member_join'|string;
  actor:string;
  text:string;
  createdAt:string;
  metadata:Record<string,unknown>;
};

function normalizeWeeklyReward(data: any): GuildWeeklyReward {
  return {
    guildId: data?.guildId ?? null,
    weekStart: String(data?.weekStart ?? ''),
    completedMissions: Number(data?.completedMissions ?? 0),
    claimed: Boolean(data?.claimed),
    claimable: Boolean(data?.claimable),
    coins: Number(data?.coins ?? 0),
    diamonds: Number(data?.diamonds ?? 0),
    collectionValueUsd: Number(data?.collectionValueUsd ?? 0),
    packs: Number(data?.packs ?? 0),
    wins: Number(data?.wins ?? 0),
  };
}

function normalizeWars(data:any):GuildWar[]{
  return Array.isArray(data?.wars)?data.wars.map((war:any)=>({
    ...war,
    guildA:{...war.guildA,score:Number(war.guildA?.score??0)},
    guildB:{...war.guildB,score:Number(war.guildB?.score??0)},
    contributors:Array.isArray(war.contributors)?war.contributors.map((c:any)=>({
      ...c,points:Number(c.points??0),wins:Number(c.wins??0),matches:Number(c.matches??0),
    })):[],
  })):[];
}
function normalizeCollective(data:any):GuildCollectiveBooster{
  return {
    id:data?.id?String(data.id):undefined,
    guildId:data?.guildId??null,
    weekStart:data?.weekStart?String(data.weekStart):undefined,
    progress:Number(data?.progress??0),
    target:Number(data?.target??40),
    status:data?.status??'none',
    readyAt:data?.readyAt??null,
    claimed:Boolean(data?.claimed),
    claimable:Boolean(data?.claimable),
  };
}

function normalizeHub(data: any, weeklyReward?: any, wars?:any, collective?:any): GuildHub {
  return {
    guilds: Array.isArray(data?.guilds) ? data.guilds.map((guild: any) => ({
      ...guild,
      memberCount: Number(guild.memberCount ?? 0),
      collectionValueUsd: Number(guild.collectionValueUsd ?? 0),
      rank: Number(guild.rank ?? 0),
      xp: Number(guild.xp ?? 0),
      level: Number(guild.level ?? 1),
      members: Array.isArray(guild.members) ? guild.members.map((member: any) => ({ ...member, level: Number(member.level ?? 1) })) : [],
      missions: Array.isArray(guild.missions) ? guild.missions.map((mission: any) => ({
        ...mission,
        progress: Number(mission.progress ?? 0),
        target: Number(mission.target ?? 0),
        completed: Boolean(mission.completed),
      })) : [],
    })) : [],
    myMembership: data?.myMembership ?? null,
    myInvites: Array.isArray(data?.myInvites) ? data.myInvites : [],
    weeklyReward: normalizeWeeklyReward(weeklyReward),
    wars: normalizeWars(wars),
    collectiveBooster: normalizeCollective(collective),
  };
}

export async function getGuildHub(): Promise<GuildHub> {
  const [hubResult, rewardResult, warsResult, collectiveResult] = await Promise.all([
    supabase.rpc('get_guild_hub'),
    supabase.rpc('get_guild_weekly_reward_status'),
    supabase.rpc('get_guild_wars'),
    supabase.rpc('get_guild_collective_booster_status'),
  ]);
  if (hubResult.error) throw hubResult.error;
  if (rewardResult.error) throw rewardResult.error;
  if (warsResult.error) throw warsResult.error;
  if (collectiveResult.error) throw collectiveResult.error;
  return normalizeHub(hubResult.data, rewardResult.data, warsResult.data, collectiveResult.data);
}

export async function getMyGuildStoryFeed(limit=12):Promise<GuildStory[]>{
  const {data,error}=await supabase.rpc('get_my_guild_story_feed',{p_limit:limit});
  if(error)throw error;
  return Array.isArray(data)?data.map((row:any)=>({
    type:String(row?.type??'activity'),
    actor:String(row?.actor??'Treinador'),
    text:String(row?.text??'fez algo na guilda'),
    createdAt:String(row?.createdAt??''),
    metadata:row?.metadata&&typeof row.metadata==='object'?row.metadata:{},
  })):[];
}

function guildGymError(error:any){
  const raw=String(error?.message??error??'Não foi possível concluir a ação no ginásio.');
  const messages:Record<string,string>={
    WAR_NOT_FOUND:'A Guerra de Guildas não foi encontrada.',
    WAR_NOT_ACTIVE:'Esta Guerra de Guildas não está ativa.',
    GYM_NOT_FOUND:'O ginásio não foi encontrado.',
    NOT_IN_THIS_GUILD_WAR:'Sua guilda não participa deste confronto.',
    GYM_NOT_OWNED_BY_YOUR_GUILD:'Sua guilda não domina este ginásio.',
    CARD_NOT_OWNED_OR_NOT_POKEMON:'Escolha um Pokémon que esteja disponível na sua Bag.',
    DEFENDER_DAMAGED_CANNOT_REPLACE:'Esse defensor já tomou dano. Cure-o antes de trocar a defesa.',
    DEFENDER_NOT_FOUND:'O defensor não foi encontrado.',
    CANNOT_HEAL_ENEMY_DEFENDER:'Você só pode restaurar HP de defensores da sua própria guilda.',
    DEFENDER_ALREADY_DEFEATED:'Esse Pokémon já foi derrotado e não pode ser restaurado.',
    DEFENDER_ALREADY_FULL_HP:'Esse Pokémon já está com o HP máximo.',
    INSUFFICIENT_COINS:'Você precisa de 🪙 25.000 para restaurar 50 HP.',
    ATTACK_TEAM_MUST_HAVE_1_TO_6_POKEMON:'Monte um time de ataque com até 6 Pokémon.',
    ATTACK_TEAM_HAS_DUPLICATES:'Não repita a mesma carta no time de ataque.',
    ATTACK_CARD_NOT_OWNED_OR_NOT_POKEMON:'Seu time contém uma carta indisponível na Bag.',
    CANNOT_ATTACK_YOUR_OWN_GYM:'Você não pode atacar um ginásio dominado pela sua guilda.',
    GYM_HAS_NO_OWNER:'Esse ginásio ainda não possui uma guilda dominante.',
    INVALID_GYM_OWNER:'O domínio desse ginásio está inconsistente. Atualize a tela e tente novamente.',
  };
  const key=Object.keys(messages).find((candidate)=>raw.includes(candidate));
  return new Error(key?messages[key]:raw);
}

function normalizeGuildWarGymBoard(data:any):GuildWarGymBoard{
  return {
    warId:String(data?.warId??''),
    status:data?.status==='completed'?'completed':'active',
    startsAt:String(data?.startsAt??''),
    endsAt:String(data?.endsAt??''),
    guildA:{
      id:String(data?.guildA?.id??''),
      name:String(data?.guildA?.name??'Guilda A'),
      color:String(data?.guildA?.color??'#FFD447'),
    },
    guildB:{
      id:String(data?.guildB?.id??''),
      name:String(data?.guildB?.name??'Guilda B'),
      color:String(data?.guildB?.color??'#68D9FF'),
    },
    gyms:Array.isArray(data?.gyms)?data.gyms.map((gym:any)=>({
      id:String(gym?.id??''),
      slot:Number(gym?.slot??0),
      key:String(gym?.key??''),
      name:String(gym?.name??'Ginásio'),
      ownerGuild:gym?.ownerGuild?{
        id:String(gym.ownerGuild.id??''),
        name:String(gym.ownerGuild.name??'Guilda'),
        color:String(gym.ownerGuild.color??'#FFD447'),
      }:null,
      controlledSince:String(gym?.controlledSince??''),
      captureCount:Number(gym?.captureCount??0),
      lastAttackedAt:gym?.lastAttackedAt?String(gym.lastAttackedAt):null,
      flareKey:gym?.flareKey==='banner'||gym?.flareKey==='champion'||gym?.flareKey==='legendary'||gym?.flareKey==='galaxy'?gym.flareKey:null,
      flareUntil:gym?.flareUntil?String(gym.flareUntil):null,
      defenders:Array.isArray(gym?.defenders)?gym.defenders.map((d:any)=>({
        id:String(d?.id??''),
        playerId:String(d?.playerId??''),
        username:String(d?.username??'Treinador'),
        guildId:String(d?.guildId??''),
        cardId:String(d?.cardId??''),
        pokemonName:String(d?.pokemonName??'Pokémon'),
        imageSmall:d?.imageSmall?String(d.imageSmall):null,
        rarity:d?.rarity?String(d.rarity):null,
        types:Array.isArray(d?.types)?d.types.map(String):[],
        maxHp:Number(d?.maxHp??1),
        currentHp:Number(d?.currentHp??0),
        maxDamage:Number(d?.maxDamage??10),
        wins:Number(d?.wins??0),
        placedAt:String(d?.placedAt??''),
        updatedAt:String(d?.updatedAt??''),
      })):[],
    })):[],
    events:Array.isArray(data?.events)?data.events.map((event:any)=>({
      id:Number(event?.id??0),
      gymId:String(event?.gymId??''),
      eventType:event?.eventType??'attack',
      actorId:event?.actorId?String(event.actorId):null,
      guildId:event?.guildId?String(event.guildId):null,
      message:String(event?.message??''),
      metadata:event?.metadata&&typeof event.metadata==='object'?event.metadata:{},
      createdAt:String(event?.createdAt??''),
    })):[],
  };
}

export async function getGuildWarGyms(warId:string):Promise<GuildWarGymBoard>{
  const {data,error}=await supabase.rpc('get_guild_war_gyms',{p_war_id:warId});
  if(error)throw guildGymError(error);
  return normalizeGuildWarGymBoard(data);
}

export async function setGuildWarGymDefender(warId:string,gymId:string,cardId:string){
  const {data,error}=await supabase.rpc('set_guild_war_gym_defender',{
    p_war_id:warId,
    p_gym_id:gymId,
    p_card_id:cardId,
  });
  if(error)throw guildGymError(error);
  return data;
}

export async function healGuildWarGymDefender(defenderId:string){
  const {data,error}=await supabase.rpc('heal_guild_war_gym_defender',{p_defender_id:defenderId});
  if(error)throw guildGymError(error);
  return {
    defenderId:String(data?.defenderId??defenderId),
    healedHp:Number(data?.healedHp??0),
    costCoins:Number(data?.costCoins??25000),
    currentHp:Number(data?.currentHp??0),
    maxHp:Number(data?.maxHp??0),
  };
}

export async function attackGuildWarGym(warId:string,gymId:string,cardIds:string[]):Promise<GuildGymAttackResult>{
  const {data,error}=await supabase.rpc('attack_guild_war_gym',{
    p_war_id:warId,
    p_gym_id:gymId,
    p_card_ids:cardIds,
  });
  if(error)throw guildGymError(error);
  return {
    gymId:String(data?.gymId??gymId),
    conquered:Boolean(data?.conquered),
    ownerGuildId:String(data?.ownerGuildId??''),
    defendersDefeated:Number(data?.defendersDefeated??0),
    defendersRemaining:Number(data?.defendersRemaining??0),
    attackersFainted:Number(data?.attackersFainted??0),
    teamSize:Number(data?.teamSize??cardIds.length),
  };
}

let guildGymChannelSequence=0;
export function subscribeToGuildWarGyms(warId:string,onChange:()=>void){
  guildGymChannelSequence+=1;
  let disposed=false;
  let timer:ReturnType<typeof setTimeout>|null=null;
  const refresh=()=>{
    if(disposed)return;
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>{
      timer=null;
      if(!disposed)onChange();
    },120);
  };
  const channel=supabase
    .channel(`guild-war-gyms:${warId}:${guildGymChannelSequence}:${Date.now()}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'guild_war_gyms',filter:`war_id=eq.${warId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'guild_war_gym_defenders',filter:`war_id=eq.${warId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'guild_war_gym_events',filter:`war_id=eq.${warId}`},refresh)
    .subscribe();

  return ()=>{
    disposed=true;
    if(timer)clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}

export async function claimGuildWeeklyReward() {
  const { data, error } = await supabase.rpc('claim_guild_weekly_reward');
  if (error) throw error;
  return {
    guildId: String(data?.guildId ?? ''),
    weekStart: String(data?.weekStart ?? ''),
    completedMissions: Number(data?.completedMissions ?? 0),
    coins: Number(data?.coins ?? 0),
    diamonds: Number(data?.diamonds ?? 0),
    claimed: Boolean(data?.claimed),
  };
}

export async function claimGuildCollectiveBooster(){
  const {data,error}=await supabase.rpc('claim_guild_collective_booster');
  if(error) throw error;
  return {
    boosterId:String(data?.boosterId??''),
    guildId:String(data?.guildId??''),
    cards:Array.isArray(data?.cards)?data.cards:[],
    claimed:Boolean(data?.claimed),
  };
}

async function guildAction(args: {
  action: string;
  guildId?: string | null;
  targetId?: string | null;
  role?: GuildRole | null;
  inviteId?: string | null;
}) {
  const { data, error } = await supabase.rpc('guild_action', {
    p_action: args.action,
    p_guild_id: args.guildId ?? null,
    p_target_id: args.targetId ?? null,
    p_role: args.role ?? null,
    p_invite_id: args.inviteId ?? null,
  });
  if (error) throw error;
  return data;
}

export const joinGuild = (guildId: string) => guildAction({ action: 'join', guildId });
export const leaveGuild = () => guildAction({ action: 'leave' });
export const inviteToGuild = (guildId: string, targetId: string) => guildAction({ action: 'invite', guildId, targetId });
export const respondGuildInvite = (inviteId: string, accept: boolean) => guildAction({ action: accept ? 'respond_accept' : 'respond_decline', inviteId });
export const kickGuildMember = (guildId: string, targetId: string) => guildAction({ action: 'kick', guildId, targetId });
export const setGuildMemberRole = (guildId: string, targetId: string, role: 'officer' | 'member') => guildAction({ action: 'set_role', guildId, targetId, role });
export const adminSetGuildLeader = (guildId: string, targetId: string | null) => guildAction({ action: 'admin_set_leader', guildId, targetId });

let guildChannelSequence = 0;

export function subscribeToGuilds(onChange: () => void) {
  guildChannelSequence += 1;
  const channelName = `guild-hub-live-${guildChannelSequence}-${Date.now()}`;
  let disposed = false;

  const handleChange = () => {
    if (!disposed) onChange();
  };

  const channel = supabase.channel(channelName);
  channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guilds' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_members' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_invites' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_weekly_reward_claims' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_wars' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_war_player_points' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_collective_boosters' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_collective_booster_claims' }, handleChange);

  channel.subscribe();

  return () => {
    if (disposed) return;
    disposed = true;
    void supabase.removeChannel(channel);
  };
}


function mapGuildChatMessage(row: any): GuildChatMessage {
  return {
    id: String(row.id),
    guildId: String(row.guild_id),
    playerId: String(row.player_id),
    body: String(row.body ?? ''),
    username: String(row.sender_username ?? 'Treinador'),
    profileIcon: String(row.sender_profile_icon ?? 'pokeball'),
    titleId: row.sender_title_id == null ? null : String(row.sender_title_id),
    title: row.sender_title == null ? null : String(row.sender_title),
    titleIcon: row.sender_title_icon == null ? null : String(row.sender_title_icon),
    createdAt: String(row.created_at ?? ''),
  };
}

export async function getGuildChatMessages(guildId: string, limit = 60): Promise<GuildChatMessage[]> {
  const { data, error } = await supabase
    .from('guild_chat_messages')
    .select('id,guild_id,player_id,body,sender_username,sender_profile_icon,sender_title_id,sender_title,sender_title_icon,created_at')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) throw error;
  return (data ?? []).map(mapGuildChatMessage).reverse();
}

export async function sendGuildChatMessage(guildId: string, body: string) {
  const message = body.trim();
  if (!message) throw new Error('Digite uma mensagem.');
  if (message.length > 280) throw new Error('A mensagem pode ter no máximo 280 caracteres.');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const playerId = auth.user?.id;
  if (!playerId) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('guild_chat_messages')
    .insert({ guild_id: guildId, player_id: playerId, body: message })
    .select('id,guild_id,player_id,body,sender_username,sender_profile_icon,sender_title_id,sender_title,sender_title_icon,created_at')
    .single();
  if (error) throw error;
  return mapGuildChatMessage(data);
}

let guildChatSequence = 0;
export function subscribeToGuildChat(guildId: string, onChange: () => void) {
  guildChatSequence += 1;
  const channel = supabase
    .channel(`guild-chat:${guildId}:${guildChatSequence}:${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'guild_chat_messages', filter: `guild_id=eq.${guildId}` },
      onChange,
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
