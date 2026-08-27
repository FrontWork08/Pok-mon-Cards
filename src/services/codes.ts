import { supabase } from '@/lib/supabase';

export type RedeemResult = {
  code: string;
  reward: {
    coins?: number;
    diamonds?: number;
    cardId?: string;
    cardQuantity?: number;
  };
  coins: number;
  diamonds: number;
};

export async function redeemCode(code: string): Promise<RedeemResult> {
  const normalized = code.trim().replace(/\s+/g, '').toUpperCase();
  const { data, error } = await supabase.rpc('redeem_code', { p_code: normalized });
  if (error) {
    const map: Record<string, string> = {
      CODE_NOT_FOUND: 'Código não encontrado.',
      CODE_INACTIVE: 'Este código foi desativado.',
      CODE_EXPIRED: 'Este código expirou.',
      CODE_ALREADY_REDEEMED: 'Você já resgatou este código nesta conta.',
      CODE_LIMIT_REACHED: 'O limite total de resgates deste código foi atingido.',
      INVALID_CODE: 'Digite um código válido.',
    };
    const key = Object.keys(map).find((item) => error.message.includes(item));
    throw new Error(key ? map[key] : error.message);
  }
  const value = data as any;
  return {
    code: String(value.code),
    reward: value.reward ?? {},
    coins: Number(value.coins ?? 0),
    diamonds: Number(value.diamonds ?? 0),
  };
}
