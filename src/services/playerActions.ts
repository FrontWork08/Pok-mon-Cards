import { supabase } from '@/lib/supabase';

async function invokePlayerAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('player-action', { body });

  if (error) {
    let message = error.message || 'Não foi possível concluir a ação.';
    const response = (error as any).context as Response | undefined;

    if (response) {
      try {
        const payload = await response.clone().json();
        if (payload?.error) message = String(payload.error);
      } catch {
        // Keep the Functions error when the body is not JSON.
      }
    }

    if (message.includes('DAILY_NOT_READY')) throw new Error('Sua recompensa diária ainda não está disponível.');
    if (message.includes('CARD_NOT_OWNED')) throw new Error('Este card não está mais na sua Bag.');
    if (message.includes('CANNOT_FRIEND_SELF')) throw new Error('Você não pode adicionar a si mesmo.');
    if (message.includes('FRIEND_REQUEST_NOT_FOUND')) throw new Error('Essa solicitação de amizade não existe mais.');
    if (message.includes('USERNAME_TAKEN')) throw new Error('Esse nickname já está sendo usado por outro treinador.');
    if (message.includes('USERNAME_LENGTH')) throw new Error('O nickname precisa ter entre 3 e 24 caracteres.');
    if (message.includes('USERNAME_INVALID')) throw new Error('Esse nickname contém caracteres inválidos.');
    if (message.includes('ACHIEVEMENT_LOCKED')) throw new Error('Essa conquista ainda não foi desbloqueada.');
    throw new Error(message);
  }

  if (data?.error) throw new Error(String(data.error));
  return data?.data;
}

export async function setCardFavorite(cardId: string, favorite: boolean) {
  return invokePlayerAction({ action: 'favorite', cardId, favorite }) as Promise<{ favorite: boolean }>;
}

export type FriendAction = 'send' | 'accept' | 'decline' | 'remove';

export async function runFriendAction(targetId: string, friendAction: FriendAction) {
  return invokePlayerAction({ action: 'friend', targetId, friendAction }) as Promise<{ status: string }>;
}

export type DailyRewardResult = {
  coins: number;
  xp: number;
  level: number;
  rewardCoins: number;
  rewardXp: number;
  claimedAt: string;
};

export async function claimDailyReward() {
  return invokePlayerAction({ action: 'daily' }) as Promise<DailyRewardResult>;
}


export async function changeUsername(username: string) {
  return invokePlayerAction({ action: 'change_username', username }) as Promise<{ username: string }>;
}
