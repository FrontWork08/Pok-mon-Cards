const messages: Record<string, string> = {
  UNAUTHORIZED: 'Sua sessão expirou. Entre novamente para continuar.',
  FORBIDDEN: 'Você não tem permissão para executar esta ação.',
  BATTLE_NOT_FOUND: 'Esta batalha não existe mais.',
  INVALID_STATUS: 'A batalha mudou de estado ou a rodada já foi resolvida. Atualizando…',
  NOT_EXPIRED: 'O cronômetro ainda não terminou no servidor.',
  SELECTION_EXPIRED: 'O tempo para escolher a carta terminou. O servidor fará a escolha automática.',
  ALREADY_LOCKED: 'Sua carta já está travada nesta rodada.',
  NOT_OWNED: 'Esta carta não está mais disponível na sua Bag.',
  CHALLENGER_NO_CARDS: 'O desafiante não possui cartas disponíveis para continuar.',
  OPPONENT_NO_CARDS: 'O oponente não possui cartas disponíveis para continuar.',
  BATTLE_NOT_COMPLETED: 'A batalha precisa terminar antes de criar uma revanche.',
  BATTLE_INVITES_DISABLED: 'Este treinador desativou convites de batalha.',
  INVITE_ALREADY_PENDING: 'Já existe um desafio recente aguardando resposta entre vocês.',
  NOT_FRIENDS: 'Vocês precisam ser amigos para iniciar uma batalha.',
  NOT_ENOUGH_COINS: 'Um dos jogadores não possui moedas suficientes para esta aposta.',
  INVALID_WAGER: 'O valor escolhido para a aposta não é válido.',
  STAKE_CARD_REQUIRED: 'Escolha uma carta para a aposta antes de continuar.',
  STAKE_CARD_NOT_OWNED: 'A carta escolhida para a aposta não está mais disponível.',
  TRADE_NOT_FOUND: 'Esta troca não existe mais.',
  TRADE_NOT_PENDING: 'Esta troca já foi encerrada ou concluída.',
  NOT_PARTICIPANT: 'Você não participa desta troca.',
  INSUFFICIENT_CARD_QUANTITY: 'Uma das cartas selecionadas não está mais disponível na quantidade informada.',
  PACK_NOT_FOUND: 'Este booster não está mais disponível.',
};

function detectCode(raw: string) {
  const upper = raw.toUpperCase();
  return Object.keys(messages).find((code) => upper.includes(code)) ?? null;
}

export class AppFunctionError extends Error {
  code: string | null;
  status: number | null;

  constructor(message: string, code: string | null = null, status: number | null = null) {
    super(message);
    this.name = 'AppFunctionError';
    this.code = code;
    this.status = status;
  }
}

export async function normalizeFunctionError(error: unknown, fallback = 'Não foi possível concluir esta ação.') {
  let raw = error instanceof Error ? error.message : String(error ?? '');
  let status: number | null = null;
  let payloadCode: string | null = null;
  const response = (error as any)?.context as Response | undefined;

  if (response) {
    status = response.status || null;
    try {
      const payload = await response.clone().json();
      if (payload?.code) payloadCode = String(payload.code).toUpperCase();
      if (payload?.error) raw = String(payload.error);
      else if (payload?.message) raw = String(payload.message);
    } catch {
      try {
        const text = await response.clone().text();
        if (text) raw = text;
      } catch {
        // Keep the original Functions error.
      }
    }
  }

  const code = payloadCode ?? detectCode(raw);
  const message = (code && messages[code]) || (raw && !raw.includes('Edge Function returned a non-2xx status code') ? raw : fallback);
  return new AppFunctionError(message, code, status);
}

export function isFunctionErrorCode(error: unknown, ...codes: string[]) {
  return error instanceof AppFunctionError && Boolean(error.code) && codes.includes(error.code!);
}
