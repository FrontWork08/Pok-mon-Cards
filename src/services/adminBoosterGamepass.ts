import { supabase } from '@/lib/supabase';
import type { GamepassId } from '@/services/gamepasses';

export type GamepassGrant = {
  playerId: string;
  username: string;
  gamepassId: GamepassId;
  gamepassName: string;
  active: boolean;
  grantedAt: string | null;
  updatedAt: string | null;
  note: string | null;
};

export type BoosterGamepassGrant = GamepassGrant;

export async function listGamepasses(): Promise<GamepassGrant[]> {
  const { data, error } = await supabase.rpc('owner_list_gamepasses');
  if (error) throw error;
  return Array.isArray(data) ? data.map((item: any) => ({
    playerId: String(item.playerId ?? ''),
    username: String(item.username ?? 'Treinador'),
    gamepassId: String(item.gamepassId ?? 'booster_auto_open') as GamepassId,
    gamepassName: String(item.gamepassName ?? item.gamepassId ?? 'Gamepass'),
    active: Boolean(item.active),
    grantedAt: item.grantedAt ? String(item.grantedAt) : null,
    updatedAt: item.updatedAt ? String(item.updatedAt) : null,
    note: item.note ? String(item.note) : null,
  })) : [];
}

export async function setGamepass(
  targetIds: string[],
  gamepassId: GamepassId,
  enabled: boolean,
  note?: string,
) {
  const ids = [...new Set(targetIds.filter(Boolean))];
  const { data, error } = await supabase.rpc('owner_set_gamepass', {
    p_target_ids: ids,
    p_gamepass_id: gamepassId,
    p_enabled: enabled,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  return data as {
    gamepassId: GamepassId;
    enabled: boolean;
    recipientCount: number;
    recipients: Array<{ id: string; username: string; active: boolean }>;
  };
}

// Compatibilidade com chamadas antigas do Auto Booster.
export async function listBoosterAutoGamepasses(): Promise<BoosterGamepassGrant[]> {
  return (await listGamepasses()).filter((grant) => grant.gamepassId === 'booster_auto_open');
}

export async function setBoosterAutoGamepass(targetIds: string[], enabled: boolean, note?: string) {
  return setGamepass(targetIds, 'booster_auto_open', enabled, note);
}
