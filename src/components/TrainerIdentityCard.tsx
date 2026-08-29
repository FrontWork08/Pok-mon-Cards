import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { getProfileMediaPublicUrl } from '@/services/profileMedia';
import { type PlayerProfile } from '@/services/player';
import { formatUsd } from '@/services/market';
import { getTrainerRank } from '@/services/ranks';
import { useAppTheme } from '@/theme/ThemeProvider';

export function TrainerIdentityCard({
  profile,
  collectionValueUsd = 0,
  isAdmin = false,
  onPress,
  compact = false,
}: {
  profile: PlayerProfile | null;
  collectionValueUsd?: number;
  isAdmin?: boolean;
  onPress?: () => void;
  compact?: boolean;
}) {
  const { colors } = useAppTheme();
  const rank = getTrainerRank(profile?.battle_rating);
  const title = Array.isArray(profile?.equipped_title)
    ? profile?.equipped_title[0]
    : profile?.equipped_title;
  const frame = Array.isArray(profile?.equipped_frame)
    ? profile?.equipped_frame[0]
    : profile?.equipped_frame;
  const background = Array.isArray(profile?.equipped_background)
    ? profile?.equipped_background[0]
    : profile?.equipped_background;

  const frameColor = frame?.primary_color ?? colors.yellow;
  const secondaryFrame = frame?.secondary_color ?? colors.accent;
  const cardBg = background?.secondary_color ?? colors.surface;
  const avatarBg = background?.primary_color
    ? background.primary_color + '33'
    : colors.surfaceAlt;
  const avatarUrl = getProfileMediaPublicUrl(profile?.avatar_path);
  const levelXp = Number(profile?.xp ?? 0) % 250;
  const progress = Math.min(100, levelXp / 2.5);

  const body = (
    <View
      style={[
        styles.card,
        compact && styles.compactCard,
        {
          backgroundColor: cardBg,
          borderColor: frameColor,
          shadowColor: frameColor,
        },
      ]}
    >
      <View style={[styles.glowA, { backgroundColor: frameColor }]} />
      <View style={[styles.glowB, { backgroundColor: secondaryFrame }]} />

      <View style={styles.topRow}>
        <View style={[styles.brandBadge, { borderColor: frameColor, backgroundColor: colors.bg + 'AA' }]}>
          <Ionicons name="sparkles" size={12} color={frameColor} />
          <Text style={[styles.brandText, { color: frameColor }]}>TRAINER COLLECTION</Text>
        </View>

        <View style={styles.badges}>
          {isAdmin ? (
            <View style={[styles.roleBadge, { borderColor: '#FF6AD5', backgroundColor: '#36152F' }]}>
              <Ionicons name="shield-checkmark" size={11} color="#FF8CE1" />
              <Text style={[styles.roleText, { color: '#FFB1EA' }]}>ADMIN</Text>
            </View>
          ) : null}
          <View style={[styles.roleBadge, { borderColor: frameColor, backgroundColor: colors.bg + 'AA' }]}>
            <Text style={[styles.roleText, { color: frameColor }]}>LV {profile?.level ?? 1}</Text>
          </View>
        </View>
      </View>

      <View style={styles.identityRow}>
        <View style={[styles.avatarFrame, { borderColor: frameColor }]}>
          <TrainerAvatar
            icon={profile?.profile_icon}
            imageUrl={avatarUrl}
            color={frameColor}
            backgroundColor={avatarBg}
            size={compact ? 72 : 84}
          />
        </View>

        <View style={styles.identityCopy}>
          <Text style={[styles.label, { color: frameColor }]}>TRAINER ID</Text>
          <Text numberOfLines={1} style={[styles.username, compact && styles.usernameCompact, { color: colors.text }]}>
            @{profile?.username ?? 'trainer'}
          </Text>
          {title ? (
            <Text numberOfLines={1} style={[styles.title, { color: colors.yellow }]}>
              {title.icon} {title.title}
            </Text>
          ) : (
            <Text style={[styles.title, { color: colors.muted }]}>Colecionador Pokémon</Text>
          )}
          <View style={styles.rankRow}>
            <Text style={[styles.rankSymbol, { color: frameColor }]}>{rank.symbol}</Text>
            <Text style={[styles.rankText, { color: colors.text }]}>{rank.displayName}</Text>
            <Text style={[styles.rankDot, { color: colors.muted }]}>•</Text>
            <Text style={[styles.elo, { color: colors.muted }]}>{profile?.battle_rating ?? 1000} ELO</Text>
          </View>
        </View>

        {!compact ? (
          <View style={[styles.valuePanel, { borderColor: colors.border, backgroundColor: colors.bg + 'AA' }]}>
            <Text style={[styles.valueLabel, { color: colors.muted }]}>COLEÇÃO</Text>
            <Text style={[styles.valueText, { color: colors.text }]}>{formatUsd(collectionValueUsd)}</Text>
            <Text style={[styles.valueHint, { color: frameColor }]}>VALOR DE MERCADO</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.divider, { backgroundColor: frameColor + '55' }]} />

      <View style={styles.walletRow}>
        <View style={[styles.wallet, { backgroundColor: colors.bg + '99', borderColor: colors.border }]}>
          <Text style={styles.walletEmoji}>🪙</Text>
          <View>
            <Text style={[styles.walletLabel, { color: colors.muted }]}>COINS</Text>
            <Text style={[styles.walletValue, { color: colors.yellow }]}>
              {Number(profile?.coins ?? 0).toLocaleString('pt-BR')}
            </Text>
          </View>
        </View>

        <View style={[styles.wallet, { backgroundColor: colors.bg + '99', borderColor: '#68D9FF55' }]}>
          <Ionicons name="diamond" size={17} color="#68D9FF" />
          <View>
            <Text style={[styles.walletLabel, { color: colors.muted }]}>DIAMANTES</Text>
            <Text style={[styles.walletValue, { color: '#68D9FF' }]}>
              {Number(profile?.diamonds ?? 0).toLocaleString('pt-BR')}
            </Text>
          </View>
        </View>

        <View style={styles.levelBlock}>
          <View style={styles.levelHeader}>
            <Text style={[styles.levelLabel, { color: colors.muted }]}>PRÓXIMO NÍVEL</Text>
            <Text style={[styles.levelValue, { color: frameColor }]}>{levelXp}/250 XP</Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.bg + 'AA' }]}>
            <View style={[styles.fill, { width: `${progress}%`, backgroundColor: frameColor }]} />
          </View>
        </View>

        {onPress ? <Ionicons name="chevron-forward" size={20} color={frameColor} /> : null}
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir perfil do treinador"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    borderRadius: 26,
    borderWidth: 1.5,
    padding: 17,
    overflow: 'hidden',
    shadowOpacity: .2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  compactCard: { padding: 14 },
  glowA: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 100,
    right: -90,
    top: -95,
    opacity: .11,
  },
  glowB: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 90,
    left: -90,
    bottom: -100,
    opacity: .08,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brandBadge: {
    minHeight: 29,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  brandText: { fontSize: 7, fontWeight: '900', letterSpacing: 1.05 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  roleBadge: {
    minHeight: 27,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  roleText: { fontSize: 7, fontWeight: '900', letterSpacing: .65 },
  identityRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  avatarFrame: { borderWidth: 1, borderRadius: 28, padding: 3 },
  identityCopy: { flex: 1, minWidth: 155 },
  label: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  username: { fontSize: 26, lineHeight: 31, fontWeight: '900', marginTop: 2 },
  usernameCompact: { fontSize: 22, lineHeight: 27 },
  title: { fontSize: 10, fontWeight: '900', marginTop: 2 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' },
  rankSymbol: { fontSize: 14, fontWeight: '900' },
  rankText: { fontSize: 9, fontWeight: '900' },
  rankDot: { fontSize: 8 },
  elo: { fontSize: 8, fontWeight: '800' },
  valuePanel: {
    minWidth: 125,
    borderRadius: 15,
    borderWidth: 1,
    padding: 10,
  },
  valueLabel: { fontSize: 7, fontWeight: '900', letterSpacing: .9 },
  valueText: { fontSize: 17, fontWeight: '900', marginTop: 2 },
  valueHint: { fontSize: 6.5, fontWeight: '900', marginTop: 2, letterSpacing: .5 },
  divider: { height: 1, marginVertical: 13 },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  wallet: {
    minHeight: 46,
    minWidth: 110,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  walletEmoji: { fontSize: 16 },
  walletLabel: { fontSize: 6.5, fontWeight: '900', letterSpacing: .8 },
  walletValue: { fontSize: 12, fontWeight: '900', marginTop: 1 },
  levelBlock: { flex: 1, minWidth: 120 },
  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 5 },
  levelLabel: { fontSize: 6.5, fontWeight: '900', letterSpacing: .7 },
  levelValue: { fontSize: 7, fontWeight: '900' },
  track: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 5 },
  fill: { height: '100%', borderRadius: 999 },
  pressed: { opacity: .83 },
});
