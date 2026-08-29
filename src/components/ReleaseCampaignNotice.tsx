import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';
import {
  getActiveReleaseCampaign,
  submitReleaseCampaignVote,
  type ReleaseCampaign,
  type ReleaseCampaignVote,
} from '@/services/releaseCampaign';

function compareVersions(a: string, b: string) {
  const left = a.split('.').map((part) => Number(part.replace(/\D.*/, '')) || 0);
  const right = b.split('.').map((part) => Number(part.replace(/\D.*/, '')) || 0);
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function getDaysLeft(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const target = new Date(year, month - 1, day, 12, 0, 0, 0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86_400_000));
}

export function ReleaseCampaignNotice() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { userId } = useWallet();
  const insets = useSafeAreaInsets();
  const [campaign, setCampaign] = useState<ReleaseCampaign | null>(null);
  const [vote, setVote] = useState<ReleaseCampaignVote | null>(null);
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState<-1 | 0 | 1>(0);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let disposed = false;

    if (!userId) {
      setCampaign(null);
      setVote(null);
      setVisible(false);
      return;
    }

    getActiveReleaseCampaign(userId)
      .then((result) => {
        if (disposed || !result.campaign) return;
        const installedVersion = Constants.expoConfig?.version ?? '0.0.0';
        const alreadyOnTarget = compareVersions(
          installedVersion,
          result.campaign.target_version,
        ) >= 0;

        const legacySelectionOpen = result.campaign.phase === 'legacy_selection'
          && result.campaign.legacy_selection_enabled;

        if (alreadyOnTarget && !result.campaign.force_update && !legacySelectionOpen) {
          setCampaign(null);
          setVote(result.vote);
          setVisible(false);
          return;
        }

        setCampaign(result.campaign);
        setVote(result.vote);
        setVisible(true);
      })
      .catch((error) => {
        console.warn('Release campaign load failed:', error);
      });

    return () => {
      disposed = true;
    };
  }, [userId]);

  const daysLeft = useMemo(
    () => (campaign ? getDaysLeft(campaign.release_date) : 0),
    [campaign],
  );

  if (!campaign || !userId) return null;

  const activeCampaign = campaign;
  const activeUserId = userId;
  const forced = activeCampaign.force_update && Boolean(activeCampaign.download_url);
  const answered = Boolean(vote);

  async function respond(nextVote: -1 | 1) {
    if (submitting || vote) return;
    setSubmitting(nextVote);
    setErrorText('');
    try {
      const response = await submitReleaseCampaignVote(activeCampaign.id, activeUserId, nextVote);
      setVote(response);
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : 'Não foi possível registrar sua resposta agora.',
      );
    } finally {
      setSubmitting(0);
    }
  }

  async function openDownload() {
    if (!activeCampaign.download_url) return;
    await Linking.openURL(activeCampaign.download_url);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!forced) setVisible(false);
      }}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: '#E6B94F',
              paddingBottom: Math.max(insets.bottom + 12, 22),
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroIcon}>
              <Ionicons name="sparkles" size={29} color="#0B0D14" />
            </View>

            <Text style={styles.kicker}>
              {forced ? 'ATUALIZAÇÃO OBRIGATÓRIA' : 'LANÇAMENTO OFICIAL'}
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>
              {campaign.title}
            </Text>

            <View style={styles.dateBadge}>
              <Ionicons name="calendar-outline" size={17} color="#F2C75C" />
              <Text style={styles.dateText}>{formatDate(campaign.release_date)}</Text>
              <View style={styles.dateDivider} />
              <Text style={styles.countdownText}>
                {daysLeft === 0 ? 'É HOJE' : `FALTAM ${daysLeft} DIA${daysLeft === 1 ? '' : 'S'}`}
              </Text>
            </View>

            <Text style={[styles.body, { color: colors.muted }]}>
              {campaign.body}
            </Text>

            {!forced ? (
              <>
                <View style={[styles.infoBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <Text style={styles.infoTitle}>A BETA CONTINUA NORMALMENTE</Text>
                  <Text style={[styles.infoText, { color: colors.text }]}>
                    Você pode continuar abrindo packs, batalhando, trocando e usando o jogo durante estes dias.
                    O bloqueio econômico só será ativado perto da migração.
                  </Text>
                </View>

                <View style={styles.columns}>
                  <View style={[styles.column, { borderColor: '#4ECBA0' }]}>
                    <Text style={styles.keepTitle}>✓ SERÁ PRESERVADO</Text>
                    <Text style={[styles.columnText, { color: colors.muted }]}>
                      Conta e login{'\n'}
                      Tester e cargos Admin{'\n'}
                      Dono da guilda{'\n'}
                      Até {campaign.legacy_card_limit} cartas escolhidas
                    </Text>
                  </View>

                  <View style={[styles.column, { borderColor: '#FF8D79' }]}>
                    <Text style={styles.resetTitle}>↻ NOVO COMEÇO</Text>
                    <Text style={[styles.columnText, { color: colors.muted }]}>
                      Economia e saldos normais{'\n'}
                      Coleção restante{'\n'}
                      Progressão e rankings{'\n'}
                      Temporada da versão 1.0
                    </Text>
                  </View>
                </View>

                <View style={styles.rewardBox}>
                  <Text style={styles.rewardLabel}>RECOMPENSA DE VETERANO</Text>
                  <Text style={styles.rewardValue}>
                    🪙 {campaign.reward_coins.toLocaleString('pt-BR')} + 💎 {campaign.reward_diamonds}
                  </Text>
                  <Text style={[styles.rewardHint, { color: colors.muted }]}>
                    A escolha das {campaign.legacy_card_limit} cartas será liberada antes da atualização.
                  </Text>
                </View>

                <View style={[styles.pollBox, { borderColor: colors.border }]}>
                  <Text style={[styles.pollTitle, { color: colors.text }]}>
                    O que você acha desse plano para a 1.0?
                  </Text>

                  {answered ? (
                    <View style={styles.answeredRow}>
                      <View style={[styles.answeredIcon, { backgroundColor: vote?.vote === 1 ? '#173A2F' : '#44252A' }]}>
                        <Text style={styles.answeredEmoji}>{vote?.vote === 1 ? '👍' : '👎'}</Text>
                      </View>
                      <View style={styles.answeredCopy}>
                        <Text style={styles.answeredLabel}>JÁ RESPONDIDO</Text>
                        <Text style={[styles.answeredText, { color: colors.muted }]}>
                          Sua opinião já foi registrada nesta conta.
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.voteRow}>
                      <Pressable
                        disabled={Boolean(submitting)}
                        onPress={() => { void respond(1); }}
                        style={({ pressed }) => [
                          styles.voteButton,
                          styles.upVote,
                          { opacity: pressed || submitting === 1 ? 0.78 : 1 },
                        ]}
                      >
                        {submitting === 1 ? (
                          <ActivityIndicator size="small" color="#D8FFF1" />
                        ) : (
                          <Text style={styles.voteEmoji}>👍</Text>
                        )}
                        <Text style={styles.upVoteText}>GOSTEI</Text>
                      </Pressable>

                      <Pressable
                        disabled={Boolean(submitting)}
                        onPress={() => { void respond(-1); }}
                        style={({ pressed }) => [
                          styles.voteButton,
                          styles.downVote,
                          { opacity: pressed || submitting === -1 ? 0.78 : 1 },
                        ]}
                      >
                        {submitting === -1 ? (
                          <ActivityIndicator size="small" color="#FFE4E0" />
                        ) : (
                          <Text style={styles.voteEmoji}>👎</Text>
                        )}
                        <Text style={styles.downVoteText}>NÃO GOSTEI</Text>
                      </Pressable>
                    </View>
                  )}

                  {errorText ? (
                    <Text style={styles.errorText}>{errorText}</Text>
                  ) : null}
                </View>

                {campaign.phase === 'legacy_selection' && campaign.legacy_selection_enabled ? (
                  <View style={styles.legacyBox}>
                    <View style={styles.legacyHead}>
                      <View style={styles.legacyIcon}><Ionicons name="albums" size={22} color="#0B0D14" /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.legacyTitle}>ESCOLHA DE LEGADO LIBERADA</Text>
                        <Text style={[styles.legacyText, { color: colors.muted }]}>
                          Selecione e confirme até {campaign.legacy_card_limit} cartas antes do fechamento da economia Beta.
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => {
                        setVisible(false);
                        router.push('/legacy-selection');
                      }}
                      style={styles.legacyButton}
                    >
                      <Ionicons name="shield-checkmark" size={18} color="#07111F" />
                      <Text style={styles.legacyButtonText}>ESCOLHER MINHAS CARTAS</Text>
                    </Pressable>
                  </View>
                ) : null}

                <Pressable
                  onPress={() => setVisible(false)}
                  style={[styles.primaryButton, { backgroundColor: '#E6B94F' }]}
                >
                  <Text style={styles.primaryButtonText}>
                    {answered ? 'ENTENDI' : 'LEMBRAR DEPOIS'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.forceBox}>
                  <Ionicons name="download-outline" size={24} color="#F2C75C" />
                  <Text style={[styles.forceText, { color: colors.text }]}>
                    A versão {campaign.target_version} já está disponível. Para continuar jogando, instale o novo APK.
                  </Text>
                </View>

                <Pressable
                  onPress={() => { void openDownload(); }}
                  style={[styles.primaryButton, { backgroundColor: '#E6B94F' }]}
                >
                  <Ionicons name="download-outline" size={19} color="#090A0F" />
                  <Text style={styles.primaryButtonText}>BAIXAR NOVA VERSÃO</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '94%',
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: .45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
  },
  content: {
    paddingTop: 24,
    paddingHorizontal: 18,
    alignItems: 'stretch',
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: '#E6B94F',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  kicker: {
    color: '#F2C75C',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.7,
    textAlign: 'center',
    marginTop: 13,
  },
  title: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  dateBadge: {
    minHeight: 42,
    alignSelf: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#6B5626',
    backgroundColor: '#2A2416',
    paddingHorizontal: 12,
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    color: '#F7E2A4',
    fontSize: 11,
    fontWeight: '900',
  },
  dateDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#6B5626',
  },
  countdownText: {
    color: '#F2C75C',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: .55,
  },
  body: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 13,
  },
  infoBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
    marginTop: 15,
  },
  infoTitle: {
    color: '#70DCBA',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: .8,
  },
  infoText: {
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },
  columns: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 10,
  },
  column: {
    flex: 1,
    borderRadius: 15,
    borderWidth: 1,
    padding: 11,
  },
  keepTitle: {
    color: '#70DCBA',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: .45,
  },
  resetTitle: {
    color: '#FF9E8D',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: .45,
  },
  columnText: {
    fontSize: 9,
    lineHeight: 15,
    marginTop: 6,
  },
  rewardBox: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#6B5626',
    backgroundColor: '#282116',
    padding: 14,
    marginTop: 10,
    alignItems: 'center',
  },
  rewardLabel: {
    color: '#D8B158',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  rewardValue: {
    color: '#FFF0B7',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 4,
  },
  rewardHint: {
    fontSize: 9,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 5,
  },
  pollBox: {
    borderRadius: 17,
    borderWidth: 1,
    padding: 13,
    marginTop: 10,
  },
  pollTitle: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  voteRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
  },
  voteButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upVote: {
    backgroundColor: '#16372D',
    borderColor: '#3AA87E',
  },
  downVote: {
    backgroundColor: '#402329',
    borderColor: '#A94B59',
  },
  voteEmoji: {
    fontSize: 19,
  },
  upVoteText: {
    color: '#C9F8E8',
    fontSize: 9,
    fontWeight: '900',
  },
  downVoteText: {
    color: '#FFD5D8',
    fontSize: 9,
    fontWeight: '900',
  },
  answeredRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  answeredIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answeredEmoji: {
    fontSize: 21,
  },
  answeredCopy: {
    flex: 1,
  },
  answeredLabel: {
    color: '#F2C75C',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: .7,
  },
  answeredText: {
    fontSize: 9,
    lineHeight: 14,
    marginTop: 2,
  },
  errorText: {
    color: '#FF8D9A',
    fontSize: 9,
    lineHeight: 13,
    textAlign: 'center',
    marginTop: 9,
  },
  legacyBox: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#3B8F70',
    backgroundColor: '#142D25',
    padding: 13,
    marginTop: 10,
    gap: 10,
  },
  legacyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legacyIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#70DCBA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legacyTitle: {
    color: '#9BF0D1',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: .65,
  },
  legacyText: {
    fontSize: 9,
    lineHeight: 14,
    marginTop: 2,
  },
  legacyButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#70DCBA',
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legacyButtonText: {
    color: '#07111F',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: .45,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#090A0F',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: .6,
  },
  forceBox: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#6B5626',
    backgroundColor: '#282116',
    padding: 15,
    marginTop: 16,
    flexDirection: 'row',
    gap: 11,
    alignItems: 'center',
  },
  forceText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '700',
  },
});
