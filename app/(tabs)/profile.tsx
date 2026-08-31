import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { signOut } from '@/services/auth';
import {
  getMyProfile,
  getMyProfileStats,
  getProfileAvatarUrl,
  uploadMyProfileAvatar,
  removeMyProfileAvatar,
  type PlayerProfile,
} from '@/services/player';
import { getMySocial } from '@/services/social';
import { formatUsd } from '@/services/market';
import { changeUsername } from '@/services/playerActions';
import { getTrainerRank } from '@/services/ranks';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { getThemeVisual } from '@/theme/themeCatalog';

export default function ProfileScreen() {
  const { colors, themeName } = useAppTheme();
  const themeVisual = getThemeVisual(themeName);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [p, s, social] = await Promise.all([
        getMyProfile(),
        getMyProfileStats(),
        getMySocial(),
      ]);
      setProfile(p);
      setStats(s);
      setFriendCount(social.friends.length);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar seu perfil.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  function openNicknameEditor() {
    setNicknameDraft(profile?.username ?? '');
    setNicknameError(null);
    setNicknameOpen(true);
  }

  async function saveNickname() {
    const next = nicknameDraft.trim();
    if (nicknameSaving) return;
    if (next.length < 3 || next.length > 24) {
      setNicknameError('O nickname precisa ter entre 3 e 24 caracteres.');
      return;
    }
    if (next === profile?.username) {
      setNicknameOpen(false);
      return;
    }

    try {
      setNicknameSaving(true);
      setNicknameError(null);
      const result = await changeUsername(next);
      setProfile((current) => current ? { ...current, username: result.username } : current);
      setNicknameOpen(false);
    } catch (e) {
      setNicknameError(e instanceof Error ? e.message : 'Não foi possível alterar o nickname.');
    } finally {
      setNicknameSaving(false);
    }
  }

  async function chooseProfilePhoto(source: 'library' | 'camera') {
    if (avatarSaving) return;

    try {
      setAvatarSaving(true);
      setError(null);
      const ImagePicker = await import('expo-image-picker');

      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Permita o acesso à câmera para tirar sua foto de perfil.');
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error('Permita o acesso às fotos para escolher sua foto de perfil.');
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: .82,
            base64: true,
            cameraType: ImagePicker.CameraType.front,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: .82,
            base64: true,
          });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.base64) throw new Error('Não foi possível preparar a imagem selecionada.');

      const uploaded = await uploadMyProfileAvatar({
        base64: asset.base64,
        mimeType: asset.mimeType,
        previousPath: profile?.avatar_path,
      });

      setProfile((current) => current ? {
        ...current,
        avatar_path: uploaded.path,
        avatar_updated_at: uploaded.updatedAt,
      } : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar sua foto de perfil.');
    } finally {
      setAvatarSaving(false);
    }
  }

  async function clearProfilePhoto() {
    if (avatarSaving || !profile?.avatar_path) return;
    try {
      setAvatarSaving(true);
      setError(null);
      const result = await removeMyProfileAvatar(profile.avatar_path);
      setProfile((current) => current ? {
        ...current,
        avatar_path: result.path,
        avatar_updated_at: result.updatedAt,
      } : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível remover sua foto de perfil.');
    } finally {
      setAvatarSaving(false);
    }
  }

  async function handleSignOut() {
    try {
      setError(null);
      await signOut();
      setProfile(null);
      setStats(null);
      setFriendCount(0);
      router.replace('/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível sair.');
    }
  }
  const xp = Number(profile?.xp ?? 0);
  const levelXp = xp % 250;
  const collectionMarketValueUsd = Number(stats?.collectionMarketValueUsd ?? 0);
  const coins = Number(profile?.coins ?? 0);
  const topCard = stats?.mostValuableMarketCard ?? stats?.mostValuableCard;
  const trainerRank = getTrainerRank(profile?.battle_rating);
  const equippedDefinition = Array.isArray(profile?.equipped_title) ? profile?.equipped_title[0] : profile?.equipped_title;
  const frameDefinition = Array.isArray(profile?.equipped_frame) ? profile.equipped_frame[0] : profile?.equipped_frame;
  const backgroundDefinition = Array.isArray(profile?.equipped_background) ? profile.equipped_background[0] : profile?.equipped_background;
  const profileFrameColor = frameDefinition?.primary_color ?? colors.accent;
  const profileBackgroundColor = backgroundDefinition?.secondary_color ?? colors.accentSoft;
  const avatarUrl = getProfileAvatarUrl(profile?.avatar_path, profile?.avatar_updated_at);

  return <Screen title="Trainer Card" subtitle="Sua identidade na Trainer Collection: coleção, ranking, cosméticos e progresso.">
    {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
    {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9FAF" /><Text style={styles.errorText}>{error}</Text></View> : null}

    <View style={[styles.hero, { backgroundColor: profileBackgroundColor, borderColor: profileFrameColor, borderWidth: frameDefinition ? 2 : 1 }]}><View style={[styles.heroGlow,{backgroundColor:profileFrameColor}]} /><Image source={{uri:themeVisual.image}} resizeMode="contain" style={styles.heroPokemon}/><View style={styles.avatarEditor}>
  <TrainerAvatar icon={profile?.profile_icon} avatarUrl={avatarUrl} color={profileFrameColor} backgroundColor={backgroundDefinition?.primary_color ? backgroundDefinition.primary_color + '22' : colors.surfaceAlt} size={70}/>
  {avatarSaving ? <View style={styles.avatarLoading}><ActivityIndicator size="small" color="#fff"/></View> : null}
  <Pressable
    accessibilityLabel="Alterar foto de perfil"
    disabled={avatarSaving}
    onPress={() => { void chooseProfilePhoto('library'); }}
    style={[styles.avatarQuickEdit,{backgroundColor:colors.surface,borderColor:profileFrameColor,opacity:avatarSaving?.5:1}]}
  >
    <Ionicons name="camera" size={13} color={colors.yellow}/>
    <Text style={[styles.avatarQuickEditText,{color:colors.text}]}>ALTERAR FOTO</Text>
  </Pressable>
</View><View style={styles.heroInfo}><Text style={[styles.kicker, { color: colors.yellow }]}>TRAINER CARD • 1.0</Text><View style={styles.usernameRow}><Text style={[styles.rankSymbol, { color: colors.yellow }]}>{trainerRank.symbol}</Text><Text numberOfLines={1} style={[styles.username, { color: colors.text }]}>@{profile?.username ?? '---'}</Text><Pressable accessibilityLabel="Alterar nickname" onPress={openNicknameEditor} style={[styles.editNameButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="pencil" size={14} color={colors.yellow} /></Pressable></View>{equippedDefinition ? <Text style={[styles.equippedTitle, { color: colors.yellow }]}>{equippedDefinition.icon} {equippedDefinition.title}</Text> : null}{frameDefinition || backgroundDefinition ? <Text style={[styles.cosmeticLabel, { color: profileFrameColor }]}>{frameDefinition?.name ?? 'Sem moldura'} • {backgroundDefinition?.name ?? 'Sem background'}</Text> : null}<Text style={[styles.meta, { color: colors.muted }]}>Nível {profile?.level ?? 1} • {xp.toLocaleString('pt-BR')} XP • {trainerRank.displayName} • ELO {profile?.battle_rating ?? 1000}</Text></View><View style={[styles.coinBox, { backgroundColor: colors.surface }]}><Text style={[styles.coinLabel, { color: colors.muted }]}>CARTEIRA</Text><Text style={[styles.coins, { color: colors.yellow }]}>🪙 {coins.toLocaleString('pt-BR')}</Text><Text style={[styles.coins, { color: '#68D9FF' }]}>💎 {Number(profile?.diamonds ?? 0).toLocaleString('pt-BR')}</Text></View></View>

    <View style={[styles.avatarControls,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={styles.avatarControlsCopy}>
        <Text style={[styles.avatarControlsTitle,{color:colors.text}]}>Foto do Trainer</Text>
        <Text style={[styles.avatarControlsHint,{color:colors.muted}]}>Opcional. O ícone de treinador continua como fallback se você remover a foto.</Text>
      </View>
      <View style={styles.avatarButtons}>
        <Pressable disabled={avatarSaving} onPress={() => { void chooseProfilePhoto('library'); }} style={[styles.avatarButton,{borderColor:colors.border,backgroundColor:colors.surfaceAlt,opacity: avatarSaving ? .5 : 1}]}>
          <Ionicons name="images-outline" size={16} color={colors.accent}/>
          <Text style={[styles.avatarButtonText,{color:colors.text}]}>GALERIA</Text>
        </Pressable>
        <Pressable disabled={avatarSaving} onPress={() => { void chooseProfilePhoto('camera'); }} style={[styles.avatarButton,{borderColor:colors.border,backgroundColor:colors.surfaceAlt,opacity: avatarSaving ? .5 : 1}]}>
          <Ionicons name="camera-outline" size={16} color={colors.yellow}/>
          <Text style={[styles.avatarButtonText,{color:colors.text}]}>CÂMERA</Text>
        </Pressable>
        {profile?.avatar_path ? <Pressable disabled={avatarSaving} onPress={() => { void clearProfilePhoto(); }} style={[styles.avatarButton,{borderColor:'#6C3540',backgroundColor:'#351A24',opacity: avatarSaving ? .5 : 1}]}>
          <Ionicons name="trash-outline" size={16} color="#FF9FAF"/>
          <Text style={[styles.avatarButtonText,{color:'#FFB6C1'}]}>REMOVER</Text>
        </Pressable> : null}
      </View>
    </View>

    <View style={[styles.worthPanel, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
      <View style={styles.worthHeader}><View style={{ flex: 1 }}><Text style={[styles.worthKicker, { color: colors.yellow }]}>VALOR DE MERCADO DA COLEÇÃO</Text><Text style={[styles.worthTotal, { color: colors.text }]}>{formatUsd(collectionMarketValueUsd)}</Text><Text style={[styles.worthHint, { color: colors.muted }]}>Snapshot dos preços TCGplayer em USD</Text></View><View style={[styles.worthIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="cash" size={26} color={colors.yellow} /></View></View>
      <View style={[styles.worthDivider, { backgroundColor: colors.border }]} />
      <View style={styles.worthBreakdown}><WorthMetric label="COLEÇÃO EM USD" valueText={formatUsd(collectionMarketValueUsd)} /><WorthMetric label="SALDO DO JOGO" valueText={`🪙 ${coins.toLocaleString('pt-BR')}`} /><WorthMetric label="CARD MAIS CARO" valueText={topCard?.pokemon_name ?? '—'} subtext={topCard?.market_price_usd != null ? formatUsd(Number(topCard.market_price_usd)) : 'Preço indisponível'} /></View>
      {topCard ? <Pressable style={[styles.topCardRow, { backgroundColor: colors.surfaceAlt }]} onPress={() => router.push(`/card/${topCard.id}`)}>{topCard.image_small ? <Image source={{ uri: topCard.image_small }} resizeMode="contain" style={styles.topCardImage} /> : <View style={styles.topCardImage} />}<View style={{ flex: 1 }}><Text style={[styles.topCardLabel, { color: colors.muted }]}>CARD DE MAIOR VALOR DE MERCADO</Text><Text style={[styles.topCardName, { color: colors.text }]}>{topCard.pokemon_name}</Text><Text style={[styles.topCardMeta, { color: colors.muted }]}>{topCard.rarity ?? 'Sem raridade'}</Text></View><Text style={[styles.topCardValue, { color: colors.yellow }]}>{topCard.market_price_usd != null ? formatUsd(Number(topCard.market_price_usd)) : '—'}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable> : null}
    </View>

    <View style={[styles.rankPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.rankPanelTop}><View><Text style={[styles.kicker, { color: colors.yellow }]}>RANK DE TREINADOR</Text><Text style={[styles.rankName, { color: colors.text }]}>{trainerRank.symbol} {trainerRank.displayName}</Text></View><Text style={[styles.rankPoints, { color: colors.yellow }]}>{profile?.battle_rating ?? 1000} ELO</Text></View><View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.fill, { width: `${trainerRank.progress}%`, backgroundColor: colors.accent }]} /></View><Text style={[styles.progressHint, { color: colors.muted }]}>{trainerRank.nextAt ? `Faltam ${Math.max(0, trainerRank.nextAt - Number(profile?.battle_rating ?? 0))} pontos para a próxima divisão.` : 'Você alcançou a divisão máxima do Grand Trainer.'}</Text></View>

    <View style={styles.statsGrid}><Stat icon="albums" value={stats?.totalCards ?? 0} label="Cards" /><Stat icon="paw" value={stats?.species ?? 0} label="Pokédex" /><Stat icon="cube" value={stats?.packsOpened ?? 0} label="Packs" /><Stat icon="swap-horizontal" value={stats?.completedTrades ?? 0} label="Trocas" /><Stat icon="trophy" value={profile?.battle_wins ?? 0} label="Vitórias" /><Stat icon="people" value={friendCount} label="Amigos" /></View>

    <View style={styles.featureGrid}>
      <FeatureLink icon="qr-code" color={colors.accent} title="QR de amizade" text="Mostre seu Trainer Link para abrir seu perfil e receber pedidos de amizade." onPress={() => router.push('/friend-qr')} />
      <FeatureLink icon="ribbon" color={colors.yellow} title="Passe de Batalha" text="50 níveis, missões, recompensas grátis e trilha VIP." onPress={() => router.push('/battle-pass')} />
      <FeatureLink icon="flame" color={colors.yellow} title="Temporada & Jornada" text="Streak, ranque, eventos e recompensas da coleção." onPress={() => router.push('/season')} />
      <FeatureLink icon="sparkles" color={colors.yellow} title="Minha Vitrine" text="Escolha as 6 cartas que aparecem no seu perfil público." onPress={() => router.push('/showcase')} />
      <FeatureLink icon="star" color={colors.accent} title="Card Chase" text="Wishlist e alertas quando suas cartas desejadas aparecem." onPress={() => router.push('/wishlist')} />
      <FeatureLink icon="trophy" color={colors.yellow} title="Copa Trainer" text="Entre no torneio de 8 jogadores e acompanhe o bracket." onPress={() => router.push('/tournaments')} />
      <FeatureLink icon="cash" color={colors.yellow} title="Economy 2.0" text="Prestígio, Loja de Luxo, Museu, projetos coletivos e sinks permanentes de Coins." onPress={() => router.push('/economy')} />
      <FeatureLink icon="color-wand" color={colors.accent} title="Cosméticos" text="Equipe molduras e backgrounds conquistados pelo seu progresso." onPress={() => router.push('/cosmetics')} />
      <FeatureLink icon="color-palette" color={colors.accent} title="Personalização" text="Modo claro/escuro, temas, push, som e vibração." onPress={() => router.push('/settings')} />
    </View>

    <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.progressTop}><Text style={[styles.progressTitle, { color: colors.text }]}>Progresso do nível</Text><Text style={[styles.progressValue, { color: colors.muted }]}>{levelXp} / 250 XP</Text></View><View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.fill, { width: `${Math.min(100, levelXp / 2.5)}%`, backgroundColor: colors.yellow }]} /></View><Text style={[styles.progressHint, { color: colors.muted }]}>Packs dão XP; batalhas dão XP extra e avançam missões.</Text></View>
    <Pressable style={styles.logout} onPress={handleSignOut}><Ionicons name="log-out-outline" size={18} color="#FF8A8A" /><Text style={styles.logoutText}>Sair da conta</Text></Pressable>

    <Modal visible={nicknameOpen} transparent animationType="fade" onRequestClose={() => !nicknameSaving && setNicknameOpen(false)}>
      <View style={styles.nicknameBackdrop}>
        <View style={[styles.nicknameModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.nicknameHeader}>
            <View style={[styles.nicknameIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="person" size={21} color={colors.yellow} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.nicknameTitle, { color: colors.text }]}>Alterar nickname</Text><Text style={[styles.nicknameHint, { color: colors.muted }]}>3 a 24 caracteres. O nome precisa ser único.</Text></View>
            <Pressable disabled={nicknameSaving} onPress={() => setNicknameOpen(false)}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
          </View>

          <View style={[styles.nicknameInputWrap, { backgroundColor: colors.surfaceAlt, borderColor: nicknameError ? '#D45A6B' : colors.border }]}>
            <Text style={[styles.nicknameAt, { color: colors.muted }]}>@</Text>
            <TextInput
              value={nicknameDraft}
              onChangeText={(value) => { setNicknameDraft(value); setNicknameError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
              placeholder="Seu novo nickname"
              placeholderTextColor={colors.muted}
              style={[styles.nicknameInput, { color: colors.text }]}
              onSubmitEditing={saveNickname}
            />
          </View>

          <View style={styles.nicknameMetaRow}><Text style={[styles.nicknameCount, { color: colors.muted }]}>{nicknameDraft.trim().length}/24</Text></View>
          {nicknameError ? <Text style={styles.nicknameError}>{nicknameError}</Text> : null}

          <Pressable
            disabled={nicknameSaving || nicknameDraft.trim().length < 3}
            onPress={saveNickname}
            style={[styles.nicknameSave, { backgroundColor: colors.yellow }, (nicknameSaving || nicknameDraft.trim().length < 3) && { opacity: .45 }]}
          >
            {nicknameSaving ? <ActivityIndicator size="small" color="#07111F" /> : <Ionicons name="checkmark-circle" size={19} color="#07111F" />}
            <Text style={styles.nicknameSaveText}>{nicknameSaving ? 'SALVANDO...' : 'SALVAR NICKNAME'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  </Screen>;
}

function WorthMetric({ label, valueText, subtext }: { label: string; valueText: string; subtext?: string }) { const { colors } = useAppTheme(); return <View style={styles.worthMetric}><Text style={[styles.worthMetricLabel, { color: colors.muted }]}>{label}</Text><Text numberOfLines={1} style={[styles.worthMetricText, { color: colors.text }]}>{valueText}</Text>{subtext ? <Text numberOfLines={1} style={[styles.worthMetricValue, { color: colors.yellow }]}>{subtext}</Text> : null}</View>; }
function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) { const { colors } = useAppTheme(); return <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.statIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name={icon} size={18} color={colors.accent} /></View><Text style={[styles.statValue, { color: colors.text }]}>{Number(value).toLocaleString('pt-BR')}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text></View>; }
function FeatureLink({ icon, color, title, text, onPress, badge }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; text: string; onPress: () => void; badge?: number }) { const { colors } = useAppTheme(); return <Pressable style={[styles.feature, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onPress}><View style={[styles.featureIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={icon} size={23} color={color} /></View><View style={styles.featureBody}><Text style={[styles.featureTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.featureText, { color: colors.muted }]}>{text}</Text></View>{badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : <Ionicons name="chevron-forward" size={20} color={colors.muted} />}</Pressable>; }

const styles = StyleSheet.create({
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 12, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' }, errorText: { flex: 1, color: '#FFD7DD', fontWeight: '700', fontSize: 12 },
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: 18, borderRadius: 28, borderWidth: 1, overflow:'hidden', position:'relative', minHeight:150 },
  heroGlow:{position:'absolute',right:-65,top:-85,width:250,height:250,borderRadius:999,opacity:.13},
  heroPokemon:{position:'absolute',right:-18,bottom:-45,width:190,height:205,opacity:.19,transform:[{rotate:'6deg'}]},
  avatarEditor:{position:'relative',zIndex:2,alignItems:'center',gap:6},
  avatarQuickEdit:{minHeight:30,borderRadius:10,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
  avatarQuickEditText:{fontSize:7,fontWeight:'900',letterSpacing:.45},
  avatarLoading:{...StyleSheet.absoluteFillObject,borderRadius:22,backgroundColor:'rgba(0,0,0,.48)',alignItems:'center',justifyContent:'center'},
  avatarControls:{borderRadius:18,borderWidth:1,padding:12,flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},
  avatarControlsCopy:{flex:1,minWidth:190},
  avatarControlsTitle:{fontSize:12,fontWeight:'900'},
  avatarControlsHint:{fontSize:8,lineHeight:12,marginTop:2},
  avatarButtons:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},
  avatarButton:{minHeight:38,borderRadius:11,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
  avatarButtonText:{fontSize:7,fontWeight:'900',letterSpacing:.35},
  avatar: { width: 70, height: 70, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, avatarText: { fontSize: 30, fontWeight: '900' }, heroInfo: { flex: 1, minWidth: 190, zIndex:2 }, rankSymbol: { fontSize: 24, fontWeight: '900' }, equippedTitle: { fontSize: 11, fontWeight: '900', marginTop: 2 }, cosmeticLabel: { fontSize: 8, fontWeight: '900', marginTop: 3, letterSpacing: .4 }, usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }, editNameButton: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, username: { flexShrink: 1, fontSize: 25, fontWeight: '900' }, meta: { fontSize: 12, marginTop: 4 }, coinBox: { minWidth: 130, padding: 12, borderRadius: 16, zIndex:2, borderWidth:1, borderColor:'rgba(255,255,255,.08)' }, coinLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, coins: { fontSize: 18, fontWeight: '900', marginTop: 3 },
  rankPanel: { padding: 15, borderRadius: 20, borderWidth: 1 }, rankPanelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, rankName: { fontSize: 20, fontWeight: '900', marginTop: 3 }, rankPoints: { fontSize: 15, fontWeight: '900' },
  worthPanel: { padding: 16, borderRadius: 22, borderWidth: 1, gap: 12 }, worthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, worthKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, worthTotal: { fontSize: 30, fontWeight: '900', marginTop: 3 }, worthHint: { fontSize: 9, marginTop: 2 }, worthIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, worthDivider: { height: 1 }, worthBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, worthMetric: { flexGrow: 1, flexBasis: 150, minWidth: 130 }, worthMetricLabel: { fontSize: 7, fontWeight: '900', letterSpacing: .9 }, worthMetricText: { fontSize: 14, fontWeight: '900', marginTop: 3 }, worthMetricValue: { fontSize: 9, fontWeight: '900', marginTop: 2 }, topCardRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 8 }, topCardImage: { width: 50, height: 67, borderRadius: 6 }, topCardLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 1 }, topCardName: { fontSize: 13, fontWeight: '900', marginTop: 2 }, topCardMeta: { fontSize: 8, marginTop: 1 }, topCardValue: { fontSize: 10, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, stat: { flexGrow: 1, flexBasis: 145, minWidth: 135, padding: 14, borderRadius: 18, borderWidth: 1 }, statIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 9 }, statValue: { fontSize: 20, fontWeight: '900' }, statLabel: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, feature: { flexGrow: 1, flexBasis: 360, minWidth: 280, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 }, featureIcon: { width: 45, height: 45, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, featureBody: { flex: 1 }, featureTitle: { fontSize: 15, fontWeight: '900' }, featureText: { fontSize: 10, lineHeight: 15, marginTop: 3 }, badge: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D84B64' }, badgeText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  progressCard: { padding: 15, borderRadius: 18, borderWidth: 1 }, progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, progressTitle: { fontSize: 14, fontWeight: '900' }, progressValue: { fontSize: 10, fontWeight: '800' }, track: { height: 8, borderRadius: 999, marginTop: 11, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 999 }, progressHint: { fontSize: 9, marginTop: 7 }, logout: { marginTop: 4, borderRadius: 14, borderWidth: 1, borderColor: '#C64E5A', paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, logoutText: { color: '#FF8A8A', fontWeight: '900', fontSize: 11 }, nicknameBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.74)', justifyContent: 'flex-end', padding: 12 }, nicknameModal: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 12, marginBottom: 8 }, nicknameHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, nicknameIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, nicknameTitle: { fontSize: 17, fontWeight: '900' }, nicknameHint: { fontSize: 9, lineHeight: 14, marginTop: 2 }, nicknameInputWrap: { minHeight: 52, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 4 }, nicknameAt: { fontSize: 16, fontWeight: '900' }, nicknameInput: { flex: 1, minHeight: 50, fontSize: 15, fontWeight: '800' }, nicknameMetaRow: { flexDirection: 'row', justifyContent: 'flex-end' }, nicknameCount: { fontSize: 9, fontWeight: '800' }, nicknameError: { color: '#FF8A9A', fontSize: 10, fontWeight: '800' }, nicknameSave: { minHeight: 50, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, nicknameSaveText: { color: '#07111F', fontSize: 10, fontWeight: '900', letterSpacing: .4 },
});
