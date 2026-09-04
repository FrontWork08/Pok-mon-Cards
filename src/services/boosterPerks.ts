import { supabase } from '@/lib/supabase';
import { createOperationId } from '@/lib/operationId';
import { normalizeFunctionError } from '@/services/functionErrors';
import type { OpenedCard } from '@/services/packs';

export type BoosterPerks = {
  lucky2xUses: number;
  lucky2xEnabled: boolean;
  luckyVaultGamepass: boolean;
  autoOpenGamepass: boolean;
  autoOpenPlusGamepass: boolean;
  packQueueGamepass: boolean;
  purchaseMethod: 'manual_real_money' | string;
  contactOwnerUsername: string | null;
  maxAutoOpenQuantity: number;
};

export type AutoOpenOptions = {
  stopAfterValueUsd?: number | null;
  stopAfterTier?: number | null;
};

export type AutoOpenResult = {
  batchId: string;
  packId: string;
  quantity: number;
  requestedQuantity: number;
  cards: OpenedCard[];
  totalCoinsSpent: number;
  totalDiamondsSpent: number;
  coins: number;
  diamonds: number;
  lucky2xUsedCount: number;
  lucky2xRemaining: number;
  stopTriggered: boolean;
  stopReason: 'value' | 'rarity' | null;
  highestValueUsd: number;
  highestRarityTier: number;
};

export async function getBoosterPerks(): Promise<BoosterPerks> {
  const { data, error } = await supabase.rpc('get_my_booster_perks');
  if (error) throw error;
  return {
    lucky2xUses: Number(data?.lucky2xUses ?? 0),
    lucky2xEnabled: data?.lucky2xEnabled == null ? true : Boolean(data.lucky2xEnabled),
    luckyVaultGamepass: Boolean(data?.luckyVaultGamepass),
    autoOpenGamepass: Boolean(data?.autoOpenGamepass),
    autoOpenPlusGamepass: Boolean(data?.autoOpenPlusGamepass),
    packQueueGamepass: Boolean(data?.packQueueGamepass),
    purchaseMethod: String(data?.purchaseMethod ?? 'manual_real_money'),
    contactOwnerUsername: data?.contactOwnerUsername ? String(data.contactOwnerUsername) : null,
    maxAutoOpenQuantity: Math.max(1, Number(data?.maxAutoOpenQuantity ?? 50)),
  };
}

let pendingAutoOpenOperation: { key: string; id: string } | null = null;

export async function autoOpenPacks(
  packId: string,
  quantity: number,
  options: AutoOpenOptions = {},
): Promise<AutoOpenResult> {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new Error('Escolha entre 1 e 100 boosters por abertura automática.');
  }

  const stopAfterValueUsd = options.stopAfterValueUsd == null || options.stopAfterValueUsd <= 0
    ? null
    : Number(options.stopAfterValueUsd);
  const stopAfterTier = options.stopAfterTier == null || options.stopAfterTier <= 0
    ? null
    : Math.floor(Number(options.stopAfterTier));

  const requestKey = `${packId}:${quantity}:${stopAfterValueUsd ?? '-'}:${stopAfterTier ?? '-'}`;
  const operationId = pendingAutoOpenOperation?.key === requestKey
    ? pendingAutoOpenOperation.id
    : createOperationId();
  pendingAutoOpenOperation = { key: requestKey, id: operationId };

  const { data, error } = await supabase.functions.invoke('open-pack', {
    body: {
      kind: 'auto_open',
      packId,
      quantity,
      operationId,
      stopAfterValueUsd,
      stopAfterTier,
    },
  });
  if (error) {
    throw await normalizeFunctionError(error, 'Não foi possível concluir a abertura automática.');
  }
  if (data?.error) {
    const raw = String(data.error);
    if (raw.includes('AUTO_OPEN_GAMEPASS_REQUIRED')) {
      throw new Error('A Gamepass de Abertura Automática não está ativa nesta conta.');
    }
    if (raw.includes('AUTO_OPEN_PLUS_REQUIRED')) {
      throw new Error('A Gamepass Auto Booster+ é necessária para lotes acima de 50 ou parada automática.');
    }
    if (raw.includes('INVALID_AUTO_OPEN_QUANTITY')) {
      throw new Error('Quantidade inválida para sua Gamepass. Auto Booster permite até 50; Auto Booster+ permite até 100.');
    }
    if (raw.includes('INVALID_STOP_VALUE') || raw.includes('INVALID_STOP_TIER')) {
      throw new Error('A regra de parada automática é inválida.');
    }
    throw await normalizeFunctionError(new Error(raw), 'Não foi possível concluir a abertura automática.');
  }

  pendingAutoOpenOperation = null;
  return {
    batchId: String(data?.batchId ?? operationId),
    packId: String(data?.packId ?? packId),
    quantity: Number(data?.quantity ?? quantity),
    requestedQuantity: Number(data?.requestedQuantity ?? quantity),
    cards: Array.isArray(data?.cards) ? data.cards : [],
    totalCoinsSpent: Number(data?.totalCoinsSpent ?? 0),
    totalDiamondsSpent: Number(data?.totalDiamondsSpent ?? 0),
    coins: Number(data?.coins ?? 0),
    diamonds: Number(data?.diamonds ?? 0),
    lucky2xUsedCount: Number(data?.lucky2xUsedCount ?? 0),
    lucky2xRemaining: Number(data?.lucky2xRemaining ?? 0),
    stopTriggered: Boolean(data?.stopTriggered),
    stopReason: data?.stopReason === 'value' || data?.stopReason === 'rarity' ? data.stopReason : null,
    highestValueUsd: Number(data?.highestValueUsd ?? 0),
    highestRarityTier: Number(data?.highestRarityTier ?? 1),
  };
}
