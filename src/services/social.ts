import { supabase } from '@/lib/supabase';
import { getSessionUserId } from '@/lib/session';

export type SocialPlayer = {
  id: string;
  username: string;
  level: number;
  profile_icon?: string | null;
  avatar_path?: string | null;
  avatar_updated_at?: string | null;
};

export type SocialState = {
  friends: SocialPlayer[];
  incoming: SocialPlayer[];
  outgoing: SocialPlayer[];
};

export async function getMySocial(): Promise<SocialState> {
  const userId = await getSessionUserId(true);

  const { data: relationships, error } = await supabase
    .from('friendships')
    .select('requester_id,addressee_id,status,created_at')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = relationships ?? [];
  const otherIds = Array.from(new Set(rows.map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id)));

  if (otherIds.length === 0) return { friends: [], incoming: [], outgoing: [] };

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id,username,level,profile_icon,avatar_path,avatar_updated_at')
    .in('id', otherIds);

  if (playersError) throw playersError;
  const byId = new Map((players ?? []).map((player) => [player.id, player as SocialPlayer]));

  const friends: SocialPlayer[] = [];
  const incoming: SocialPlayer[] = [];
  const outgoing: SocialPlayer[] = [];

  for (const row of rows) {
    const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
    const player = byId.get(otherId);
    if (!player) continue;

    if (row.status === 'accepted') friends.push(player);
    else if (row.status === 'pending' && row.addressee_id === userId) incoming.push(player);
    else if (row.status === 'pending' && row.requester_id === userId) outgoing.push(player);
  }

  return { friends, incoming, outgoing };
}


export async function getMyFriendCount(): Promise<number> {
  const userId = await getSessionUserId(true);
  const { count, error } = await supabase
    .from('friendships')
    .select('requester_id', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) throw error;
  return Number(count ?? 0);
}

export type PublicRelationshipState = 'self' | 'friend' | 'incoming' | 'outgoing' | 'none';

export async function getRelationshipWith(playerId: string): Promise<PublicRelationshipState> {
  const myId = await getSessionUserId(true);
  if (myId === playerId) return 'self';

  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id,addressee_id,status,created_at')
    .or(`and(requester_id.eq.${myId},addressee_id.eq.${playerId}),and(requester_id.eq.${playerId},addressee_id.eq.${myId})`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return 'none';
  if (data.status === 'accepted') return 'friend';
  if (data.status === 'pending' && data.addressee_id === myId) return 'incoming';
  if (data.status === 'pending' && data.requester_id === myId) return 'outgoing';
  return 'none';
}
