import { supabase } from '@/lib/supabase';

export type BoosterGamepassGrant = {
  playerId: string;
  username: string;
  active: boolean;
  grantedAt: string | null;
  updatedAt: string | null;
  note: string | null;
};

export async function listBoosterAutoGamepasses(): Promise<BoosterGamepassGrant[]> {
  const { data, error } = await supabase.rpc('owner_list_booster_auto_gamepasses');
  if (error) throw error;
  return Array.isArray(data) ? data.map((item: any) => ({
    playerId: String(item.playerId ?? ''),
    username: String(item.username ?? 'Treinador'),
    active: Boolean(item.active),
    grantedAt: item.grantedAt ? String(item.grantedAt) : null,
    updatedAt: item.updatedAt ? String(item.updatedAt) : null,
    note: item.note ? String(item.note) : null,
  })) : [];
}

export async function setBoosterAutoGamepass(
  targetIds: string[],
  enabled: boolean,
  note?: string,
) {
  const ids = [...new Set(targetIds.filter(Boolean))];
  const { data, error } = await supabase.rpc('owner_set_booster_auto_gamepass', {
    p_target_ids: ids,
    p_enabled: enabled,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  return data as {
    gamepassId: 'booster_auto_open';
    enabled: boolean;
    recipientCount: number;
    recipients: Array<{ id: string; username: string; active: boolean }>;
  };
}
