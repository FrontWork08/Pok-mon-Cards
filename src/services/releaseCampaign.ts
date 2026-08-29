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
