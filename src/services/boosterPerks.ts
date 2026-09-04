import { supabase } from '@/lib/supabase';
import { createOperationId } from '@/lib/operationId';
import { normalizeFunctionError } from '@/services/functionErrors';
import type { OpenedCard } from '@/services/packs';

export type BoosterPerks = {
  lucky2xUses: number;
  autoOpenGamepass: boolean;
  purchaseMethod: 'manual_real_money' | string;
  contactOwnerUsername: string | null;
  maxAutoOpenQuantity: number;
};

export type AutoOpenResult = {
  batchId: string;
  packId: string;
  quantity: number;
  cards: OpenedCard[];
  totalCoinsSpent: number;
  totalDiamondsSpent: number;
  coins: number;
  diamonds: number;
  lucky2xUsedCount: number;
  lucky2xRemaining: number;
};

export async function getBoosterPerks(): Promise<BoosterPerks> {
  const { data, error } = await supabase.rpc('get_my_booster_perks');
  if (error) throw error;
  return {
    lucky2xUses: Number(data?.lucky2xUses ?? 0),
    autoOpenGamepass: Boolean(data?.autoOpenGamepass),
    purchaseMethod: String(data?.purchaseMethod ?? 'manual_real_money'),
    contactOwnerUsername: data?.contactOwnerUsername ? String(data.contactOwnerUsername) : null,
    maxAutoOpenQuantity: Math.max(1, Number(data?.maxAutoOpenQuantity ?? 50)),
  };
}

let pendingAutoOpenOperation: string | null = null;

export async function autoOpenPacks(packId: string, quantity: number): Promise<AutoOpenResult> {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new Error('Escolha entre 1 e 50 boosters por abertura automática.');
  }
  const operationId = pendingAutoOpenOperation ?? createOperationId();
  pendingAutoOpenOperation = operationId;
  const { data, error } = await supabase.functions.invoke('open-pack', {
    body: { kind: 'auto_open', packId, quantity, operationId },
  });
  if (error) {
    throw await normalizeFunctionError(error, 'Não foi possível concluir a abertura automática.');
  }
  if (data?.error) {
    const raw = String(data.error);
    if (raw.includes('AUTO_OPEN_GAMEPASS_REQUIRED')) {
      throw new Error('A Gamepass de Abertura Automática não está ativa nesta conta.');
    }
    if (raw.includes('INVALID_AUTO_OPEN_QUANTITY')) {
      throw new Error('Escolha entre 1 e 50 boosters por vez.');
    }
    throw await normalizeFunctionError(new Error(raw), 'Não foi possível concluir a abertura automática.');
  }
  pendingAutoOpenOperation = null;
  return {
    batchId: String(data?.batchId ?? operationId),
    packId: String(data?.packId ?? packId),
    quantity: Number(data?.quantity ?? quantity),
    cards: Array.isArray(data?.cards) ? data.cards : [],
    totalCoinsSpent: Number(data?.totalCoinsSpent ?? 0),
    totalDiamondsSpent: Number(data?.totalDiamondsSpent ?? 0),
    coins: Number(data?.coins ?? 0),
    diamonds: Number(data?.diamonds ?? 0),
    lucky2xUsedCount: Number(data?.lucky2xUsedCount ?? 0),
    lucky2xRemaining: Number(data?.lucky2xRemaining ?? 0),
  };
}
