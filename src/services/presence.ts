import { supabase } from '@/lib/supabase';

export type OnlinePresence = {
  playerId: string;
  onlineAt: string;
};

type PresenceListener = (onlineIds: Set<string>) => void;

let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let subscribed = false;
let publisherActive = false;
let publisherPlayerId: string | null = null;
let publisherVisible = false;
const listeners = new Set<PresenceListener>();

function collectOnlineIds() {
  const state = (sharedChannel?.presenceState() ?? {}) as Record<string, Array<Record<string, unknown>>>;
  const ids = new Set<string>();
  Object.values(state).forEach((presences) => {
    presences.forEach((presence) => {
      const id = presence.playerId;
      if (typeof id === 'string' && id) ids.add(id);
    });
  });
  return ids;
}

function emit() {
  const ids = collectOnlineIds();
  listeners.forEach((listener) => listener(new Set(ids)));
}

async function applyPublisher() {
  if (!sharedChannel || !subscribed || !publisherActive || !publisherPlayerId) return;
  if (publisherVisible) {
    await sharedChannel.track({
      playerId: publisherPlayerId,
      onlineAt: new Date().toISOString(),
    });
  } else {
    await sharedChannel.untrack();
  }
}

function ensureChannel() {
  if (sharedChannel) return sharedChannel;

  const channel = supabase.channel('players-online', {
    config: { presence: { key: `client-${Date.now()}-${Math.random().toString(36).slice(2)}` } },
  });
  sharedChannel = channel;

  channel
    .on('presence', { event: 'sync' }, emit)
    .on('presence', { event: 'join' }, emit)
    .on('presence', { event: 'leave' }, emit)
    .subscribe((status) => {
      subscribed = status === 'SUBSCRIBED';
      if (subscribed) {
        void applyPublisher().catch(() => null);
        emit();
      }
    });

  return channel;
}

function maybeCloseChannel() {
  if (listeners.size > 0 || publisherActive || !sharedChannel) return;
  const channel = sharedChannel;
  sharedChannel = null;
  subscribed = false;
  void supabase.removeChannel(channel);
}

export function subscribeOnlinePlayers(onChange: PresenceListener) {
  listeners.add(onChange);
  ensureChannel();
  emit();

  return () => {
    listeners.delete(onChange);
    maybeCloseChannel();
  };
}

export function publishMyOnlinePresence(playerId: string, visible: boolean) {
  publisherActive = true;
  publisherPlayerId = playerId;
  publisherVisible = visible;
  ensureChannel();
  void applyPublisher().catch(() => null);

  return {
    async setVisible(next: boolean) {
      publisherVisible = next;
      await applyPublisher();
    },
    stop() {
      publisherActive = false;
      publisherPlayerId = null;
      publisherVisible = false;
      if (sharedChannel && subscribed) void sharedChannel.untrack().catch(() => null);
      maybeCloseChannel();
    },
  };
}
