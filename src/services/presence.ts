import { supabase } from '@/lib/supabase';

export type OnlinePresence = {
  playerId: string;
  onlineAt: string;
};

function collectOnlineIds(channel: ReturnType<typeof supabase.channel>) {
  const state = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
  const ids = new Set<string>();
  Object.values(state).forEach((presences) => {
    presences.forEach((presence) => {
      const id = presence.playerId;
      if (typeof id === 'string' && id) ids.add(id);
    });
  });
  return ids;
}

export function subscribeOnlinePlayers(onChange: (onlineIds: Set<string>) => void) {
  const channel = supabase.channel('players-online');
  const emit = () => onChange(collectOnlineIds(channel));

  channel
    .on('presence', { event: 'sync' }, emit)
    .on('presence', { event: 'join' }, emit)
    .on('presence', { event: 'leave' }, emit)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function publishMyOnlinePresence(playerId: string, visible: boolean) {
  const channel = supabase.channel('players-online', {
    config: { presence: { key: `${playerId}-${Date.now()}-${Math.random().toString(36).slice(2)}` } },
  });
  let subscribed = false;
  let desiredVisible = visible;

  const apply = async () => {
    if (!subscribed) return;
    if (desiredVisible) {
      await channel.track({ playerId, onlineAt: new Date().toISOString() });
    } else {
      await channel.untrack();
    }
  };

  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    subscribed = true;
    void apply();
  });

  return {
    setVisible(next: boolean) {
      desiredVisible = next;
      return apply();
    },
    stop() {
      void channel.untrack().catch(() => null);
      void supabase.removeChannel(channel);
    },
  };
}
