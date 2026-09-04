import { supabase } from '@/lib/supabase';

export type GamepassId =
  | 'booster_auto_open'
  | 'booster_auto_plus'
  | 'trainer_vip'
  | 'bag_pro'
  | 'deck_pro'
  | 'marketplace_pro'
  | 'collector_pass'
  | 'cosmetic_pass'
  | 'guild_pro'
  | 'battle_style_pass'
  | 'trainer_profile_plus'
  | 'lucky_vault'
  | 'pack_queue'
  | 'museum_pro'
  | 'replay_pro'
  | 'trainer_plus';

export type GamepassItem = {
  id: GamepassId;
  name: string;
  description: string;
  icon: string;
  category: string;
  sortOrder: number;
  includedInTrainerPlus: boolean;
  metadata: {
    benefits?: string[];
    route?: string;
    [key: string]: unknown;
  };
  activeDirect: boolean;
  active: boolean;
  viaTrainerPlus: boolean;
};

export type MyGamepasses = {
  purchaseMethod: 'manual_real_money' | string;
  contactOwnerUsername: string | null;
  items: GamepassItem[];
};

export async function getMyGamepasses(): Promise<MyGamepasses> {
  const { data, error } = await supabase.rpc('get_my_gamepasses');
  if (error) throw error;
  return {
    purchaseMethod: String(data?.purchaseMethod ?? 'manual_real_money'),
    contactOwnerUsername: data?.contactOwnerUsername ? String(data.contactOwnerUsername) : null,
    items: Array.isArray(data?.items)
      ? data.items.map((item: any) => ({
        id: String(item.id) as GamepassId,
        name: String(item.name ?? 'Gamepass'),
        description: String(item.description ?? ''),
        icon: String(item.icon ?? 'sparkles'),
        category: String(item.category ?? 'convenience'),
        sortOrder: Number(item.sortOrder ?? 0),
        includedInTrainerPlus: Boolean(item.includedInTrainerPlus),
        metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
        activeDirect: Boolean(item.activeDirect),
        active: Boolean(item.active),
        viaTrainerPlus: Boolean(item.viaTrainerPlus),
      }))
      : [],
  };
}

export function findGamepass(state: MyGamepasses | null | undefined, id: GamepassId) {
  return state?.items.find((item) => item.id === id) ?? null;
}

export function hasGamepass(state: MyGamepasses | null | undefined, id: GamepassId) {
  return Boolean(findGamepass(state, id)?.active);
}

export async function setLucky2xEnabled(enabled: boolean) {
  const { data, error } = await supabase.rpc('set_my_lucky_2x_enabled', { p_enabled: enabled });
  if (error) {
    if (error.message?.includes('LUCKY_VAULT_GAMEPASS_REQUIRED')) {
      throw new Error('A Gamepass Lucky Vault é necessária para pausar ou ativar o 2× Lucky.');
    }
    throw error;
  }
  return {
    enabled: Boolean(data?.enabled),
    lucky2xUses: Number(data?.lucky2xUses ?? 0),
  };
}
