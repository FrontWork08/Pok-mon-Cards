const messages: Record<string, string> = {
  UNAUTHORIZED: 'Sua sessão expirou. Entre novamente para continuar.',
  APP_MAINTENANCE: 'O jogo está pausado para uma atualização. Tente novamente em alguns minutos.',
  FORBIDDEN: 'Você não tem permissão para executar esta ação.',
  BATTLE_NOT_FOUND: 'Esta batalha não existe mais.',
  ACTIVE_BATTLE_EXISTS: 'Você já tem uma batalha em andamento. Continue ou encerre essa batalha antes de buscar outra.',
  DRAFT_NEEDS_3_CARDS: 'Você precisa ter pelo menos 3 cartas disponíveis para entrar no Draft 3.',
  PLAYER_NOT_FOUND: 'Seu perfil de treinador não foi encontrado.',
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
  LEGACY_CARD_LOCKED: 'Esta é a última cópia de uma carta confirmada no seu Legado Beta. Ela está protegida até a migração 1.0.',
};

function errorText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'details', 'hint', 'code']) {
      const nested = item[key];
      if (nested != null) {
        const text = errorText(nested);
        if (text && text !== '[object Object]') return text;
      }
    }
    try {
      const json = JSON.stringify(value);
      if (json && json !== '{}') return json;
    } catch {}
  }
  return String(value ?? '');
}

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
  let raw = errorText(error);
  let status: number | null = null;
  let payloadCode: string | null = null;
  const response = (error as any)?.context as Response | undefined;

  if (response) {
    status = response.status || null;
    try {
      const payload = await response.clone().json();
      if (payload?.code) payloadCode = String(payload.code).toUpperCase();
      if (payload?.error) raw = errorText(payload.error);
      else if (payload?.message) raw = errorText(payload.message);
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
  const usableRaw = raw && raw !== '[object Object]' && !raw.includes('Edge Function returned a non-2xx status code') ? raw : '';
  const message = (code && messages[code]) || usableRaw || fallback;
  return new AppFunctionError(message, code, status);
}

export function isFunctionErrorCode(error: unknown, ...codes: string[]) {
  return error instanceof AppFunctionError && Boolean(error.code) && codes.includes(error.code!);
}
