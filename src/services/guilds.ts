import { supabase } from '@/lib/supabase';

export type GuildRole = 'leader' | 'officer' | 'member';

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

export type GuildHub = {
  guilds: Guild[];
  myMembership: { guildId: string; role: GuildRole; joinedAt: string } | null;
  myInvites: GuildInvite[];
};

function normalizeHub(data: any): GuildHub {
  return {
    guilds: Array.isArray(data?.guilds) ? data.guilds.map((guild: any) => ({
      ...guild,
      memberCount: Number(guild.memberCount ?? 0),
      collectionValueUsd: Number(guild.collectionValueUsd ?? 0),
      rank: Number(guild.rank ?? 0),
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
  };
}

export async function getGuildHub(): Promise<GuildHub> {
  const { data, error } = await supabase.rpc('get_guild_hub');
  if (error) throw error;
  return normalizeHub(data);
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_invites' }, handleChange);

  channel.subscribe();

  return () => {
    if (disposed) return;
    disposed = true;
    void supabase.removeChannel(channel);
  };
}
