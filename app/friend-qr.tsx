import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { FriendQrCard, getFriendProfileDeepLink } from '@/components/FriendQrCard';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { getMyProfile, getProfileAvatarUrl, type PlayerProfile } from '@/services/player';
import { useAppTheme } from '@/theme/ThemeProvider';
import { goBackOrHome } from '@/navigation/goBackOrHome';

export default function FriendQrScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setNotice(null);
      setProfile(await getMyProfile());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível carregar seu QR de amizade.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const avatarUrl = getProfileAvatarUrl(profile?.avatar_path, profile?.avatar_updated_at);

  async function shareProfile() {
    if (!profile) return;
    try {
      const link = getFriendProfileDeepLink(profile.id);
      await Share.share({
        title: 'Trainer Collection',
        message: `Adicione @${profile.username} na Trainer Collection: ${link}`,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível compartilhar seu perfil.');
    }
  }

  return (
    <Screen
      title="QR de amizade"
      subtitle="Mostre seu Trainer Link para outro jogador abrir seu perfil e enviar o pedido de amizade."
    >
      <Pressable style={styles.back} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted} />
        <Text style={[styles.backText, { color: colors.muted }]}>Voltar</Text>
      </Pressable>

      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      {notice ? (
        <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="information-circle" size={18} color={colors.yellow} />
          <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
        </View>
      ) : null}

      {profile ? (
        <>
          <View style={[styles.identity, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TrainerAvatar
              icon={profile.profile_icon}
              avatarUrl={avatarUrl}
              color={colors.accent}
              backgroundColor={colors.surfaceAlt}
              size={58}
            />
            <View style={styles.identityCopy}>
              <Text style={[styles.identityKicker, { color: colors.yellow }]}>SEU TRAINER LINK</Text>
              <Text numberOfLines={1} style={[styles.identityName, { color: colors.text }]}>
                @{profile.username}
              </Text>
              <Text style={[styles.identityMeta, { color: colors.muted }]}>
                Nível {profile.level ?? 1} • ELO {profile.battle_rating ?? 1000}
              </Text>
            </View>
            <Ionicons name="people" size={24} color={colors.accent} />
          </View>

          <FriendQrCard playerId={profile.id} username={profile.username} />

          <View style={styles.actions}>
            <Pressable
              onPress={() => router.push('/friend-qr-scan')}
              style={[styles.primaryAction, { backgroundColor: colors.yellow }]}
            >
              <Ionicons name="scan" size={19} color="#07111F" />
              <Text style={styles.primaryActionText}>ESCANEAR QR DE AMIGO</Text>
            </Pressable>

            <Pressable
              onPress={shareProfile}
              style={[styles.secondaryAction, { backgroundColor: colors.surface, borderColor: colors.accent }]}
            >
              <Ionicons name="share-social" size={19} color={colors.accent} />
              <Text style={[styles.secondaryActionText, { color: colors.text }]}>COMPARTILHAR MEU LINK</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push(`/player/${profile.id}`)}
              style={[styles.secondaryAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="person-circle" size={19} color={colors.accent} />
              <Text style={[styles.secondaryActionText, { color: colors.text }]}>VER MEU PERFIL PÚBLICO</Text>
            </Pressable>
          </View>

          <View style={[styles.tip, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
            <Ionicons name="camera-outline" size={20} color={colors.accent} />
            <View style={styles.tipCopy}>
              <Text style={[styles.tipTitle, { color: colors.text }]}>Como usar</Text>
              <Text style={[styles.tipText, { color: colors.muted }]}>
                Use o scanner dentro do app para ler o QR de outro treinador. O código abre o Trainer Showcase, onde o pedido de amizade pode ser enviado.
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  backText: {
    fontSize: 11,
    fontWeight: '900',
  },
  notice: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  identity: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  identityKicker: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  identityName: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  identityMeta: {
    fontSize: 10,
    marginTop: 3,
  },
  actions: {
    width: '100%',
    gap: 9,
  },
  primaryAction: {
    minHeight: 50,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionText: {
    color: '#07111F',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  secondaryAction: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryActionText: {
    fontSize: 10,
    fontWeight: '900',
  },
  tip: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tipCopy: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
  tipText: {
    fontSize: 10,
    lineHeight: 16,
    marginTop: 3,
  },
});
