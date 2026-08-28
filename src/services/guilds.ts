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
