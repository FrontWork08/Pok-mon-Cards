import { supabase } from '@/lib/supabase';

export type SocialPlayer = {
  id: string;
  username: string;
  level: number;
};

export type SocialState = {
  friends: SocialPlayer[];
  incoming: SocialPlayer[];
  outgoing: SocialPlayer[];
};

export async function getMySocial(): Promise<SocialState> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) throw new Error('Usuário não autenticado.');

  const { data: relationships, error } = await supabase
    .from('friendships')
    .select('requester_id,addressee_id,status,created_at')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = relationships ?? [];
  const otherIds = Array.from(new Set(rows.map((row) => row.requester_id === user.id ? row.addressee_id : row.requester_id)));

  if (otherIds.length === 0) return { friends: [], incoming: [], outgoing: [] };

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id,username,level')
    .in('id', otherIds);

  if (playersError) throw playersError;
  const byId = new Map((players ?? []).map((player) => [player.id, player as SocialPlayer]));

  const friends: SocialPlayer[] = [];
  const incoming: SocialPlayer[] = [];
  const outgoing: SocialPlayer[] = [];

  for (const row of rows) {
    const otherId = row.requester_id === user.id ? row.addressee_id : row.requester_id;
    const player = byId.get(otherId);
    if (!player) continue;

    if (row.status === 'accepted') friends.push(player);
    else if (row.status === 'pending' && row.addressee_id === user.id) incoming.push(player);
    else if (row.status === 'pending' && row.requester_id === user.id) outgoing.push(player);
  }

  return { friends, incoming, outgoing };
}
