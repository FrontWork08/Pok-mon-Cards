import { supabase } from '@/lib/supabase';

export type ReleaseCampaignPhase =
  | 'notice'
  | 'legacy_selection'
  | 'freeze'
  | 'update_required'
  | 'completed';

export type ReleaseCampaign = {
  id: string;
  code: string;
  title: string;
  target_version: string;
  release_date: string;
  phase: ReleaseCampaignPhase;
  body: string;
  active: boolean;
  reward_coins: number;
  reward_diamonds: number;
  legacy_card_limit: number;
  legacy_selection_enabled: boolean;
  economy_frozen: boolean;
  force_update: boolean;
  download_url: string | null;
};

export type ReleaseCampaignVote = {
  campaign_id: string;
  player_id: string;
  vote: -1 | 1;
  feedback_text: string | null;
  responded_at: string;
};

export async function getActiveReleaseCampaign(playerId: string): Promise<{
  campaign: ReleaseCampaign | null;
  vote: ReleaseCampaignVote | null;
}> {
  const { data: campaign, error: campaignError } = await supabase
    .from('release_campaigns')
    .select(
      'id,code,title,target_version,release_date,phase,body,active,reward_coins,reward_diamonds,legacy_card_limit,legacy_selection_enabled,economy_frozen,force_update,download_url',
    )
    .eq('active', true)
    .order('release_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (campaignError) throw campaignError;
  if (!campaign) return { campaign: null, vote: null };

  const { data: vote, error: voteError } = await supabase
    .from('release_campaign_votes')
    .select('campaign_id,player_id,vote,feedback_text,responded_at')
    .eq('campaign_id', campaign.id)
    .eq('player_id', playerId)
    .maybeSingle();

  if (voteError) throw voteError;

  return {
    campaign: campaign as ReleaseCampaign,
    vote: (vote as ReleaseCampaignVote | null) ?? null,
  };
}

export async function submitReleaseCampaignVote(
  campaignId: string,
  playerId: string,
  vote: -1 | 1,
): Promise<ReleaseCampaignVote> {
  const { data, error } = await supabase
    .from('release_campaign_votes')
    .insert({
      campaign_id: campaignId,
      player_id: playerId,
      vote,
    })
    .select('campaign_id,player_id,vote,feedback_text,responded_at')
    .single();

  if (!error && data) return data as ReleaseCampaignVote;

  if (error?.code === '23505') {
    const { data: existing, error: existingError } = await supabase
      .from('release_campaign_votes')
      .select('campaign_id,player_id,vote,feedback_text,responded_at')
      .eq('campaign_id', campaignId)
      .eq('player_id', playerId)
      .single();
    if (existingError) throw existingError;
    return existing as ReleaseCampaignVote;
  }

  throw error;
}


export type LegacySelectionSubmission = {
  campaign_id: string;
  player_id: string;
  selected_count: number;
  auto_filled_count: number;
  confirmed_at: string;
};

export type LegacySelectionState = {
  cardIds: string[];
  sources: Record<string, 'manual' | 'automatic'>;
  submission: LegacySelectionSubmission | null;
};

function legacySelectionError(error: any): Error {
  const message = String(error?.message ?? error ?? '');
  if (message.includes('LEGACY_SELECTION_CLOSED')) return new Error('A escolha das cartas de legado ainda não está aberta.');
  if (message.includes('LEGACY_SELECTION_LOCKED')) return new Error('Seu legado já foi confirmado e não pode mais ser alterado.');
  if (message.includes('LEGACY_LIMIT_REACHED')) return new Error('Você atingiu o limite de cartas que podem ser preservadas.');
  if (message.includes('LEGACY_CARD_NOT_OWNED')) return new Error('Uma das cartas escolhidas não está mais na sua Bag nem em uma oferta ativa da sua loja.');
  if (message.includes('LEGACY_SELECT_AT_LEAST_ONE')) return new Error('Escolha pelo menos uma carta antes de confirmar seu legado.');
  if (message.includes('LEGACY_NOT_AUTHORIZED')) return new Error('Esta seleção não pertence à sua conta.');
  return error instanceof Error ? error : new Error(message || 'Não foi possível atualizar suas cartas de legado.');
}

export async function getLegacySelection(
  campaignId: string,
  playerId: string,
): Promise<LegacySelectionState> {
  const [{ data: rows, error: rowsError }, { data: submission, error: submissionError }] = await Promise.all([
    supabase
      .from('release_campaign_legacy_selections')
      .select('card_id,selected_at,selection_source')
      .eq('campaign_id', campaignId)
      .eq('player_id', playerId)
      .order('selected_at', { ascending: true }),
    supabase
      .from('release_campaign_legacy_submissions')
      .select('campaign_id,player_id,selected_count,auto_filled_count,confirmed_at')
      .eq('campaign_id', campaignId)
      .eq('player_id', playerId)
      .maybeSingle(),
  ]);

  if (rowsError) throw legacySelectionError(rowsError);
  if (submissionError) throw legacySelectionError(submissionError);

  return {
    cardIds: (rows ?? []).map((row) => String(row.card_id)),
    sources: Object.fromEntries((rows ?? []).map((row) => [
      String(row.card_id),
      row.selection_source === 'automatic' ? 'automatic' : 'manual',
    ])),
    submission: (submission as LegacySelectionSubmission | null) ?? null,
  };
}

export async function saveLegacySelection(
  campaignId: string,
  playerId: string,
  cardIds: string[],
): Promise<LegacySelectionState> {
  const desired = [...new Set(cardIds.filter(Boolean))];
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user?.id || auth.user.id !== playerId) {
    throw new Error('Sua sessão mudou. Entre novamente antes de salvar o Legado.');
  }

  try {
    const { error } = await supabase.rpc('save_my_legacy_selection', {
      p_campaign_id: campaignId,
      p_card_ids: desired,
    });
    if (error) throw error;
  } catch (error) {
    throw legacySelectionError(error);
  }

  return getLegacySelection(campaignId, playerId);
}

export async function confirmLegacySelection(
  campaignId: string,
  playerId: string,
): Promise<LegacySelectionSubmission> {
  try {
    const { data, error } = await supabase
      .from('release_campaign_legacy_submissions')
      .insert({
        campaign_id: campaignId,
        player_id: playerId,
        selected_count: 1,
      })
      .select('campaign_id,player_id,selected_count,auto_filled_count,confirmed_at')
      .single();

    if (error) throw error;
    return data as LegacySelectionSubmission;
  } catch (error) {
    throw legacySelectionError(error);
  }
}
