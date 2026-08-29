import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { signOut } from '@/services/auth';
import { getMyProfile, getMyProfileStats, type PlayerProfile } from '@/services/player';
import { getMySocial } from '@/services/social';
import { formatUsd, isCurrentUserAdmin } from '@/services/market';
import { changeUsername } from '@/services/playerActions';
import { getTrainerRank } from '@/services/ranks';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { TrainerIdentityCard } from '@/components/TrainerIdentityCard';
import { getProfileMediaPublicUrl, removeMyProfilePhoto, uploadMyProfilePhoto } from '@/services/profileMedia';

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarWorking, setAvatarWorking] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [p, s, social, admin] = await Promise.all([
        getMyProfile(),
        getMyProfileStats(),
        getMySocial(),
        isCurrentUserAdmin().catch(() => false),
      ]);
      setProfile(p);
      setStats(s);
      setFriendCount(social.friends.length);
      setIsAdmin(admin);
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

  async function chooseProfilePhoto() {
    if (avatarWorking) return;
    try {
      setAvatarMenuOpen(false);
      setAvatarWorking(true);
      setError(null);

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Permita acesso às fotos para escolher uma imagem de perfil.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;

      await uploadMyProfilePhoto({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar sua foto.');
    } finally {
      setAvatarWorking(false);
    }
  }

  async function removeProfilePhoto() {
    if (avatarWorking) return;
    try {
      setAvatarMenuOpen(false);
      setAvatarWorking(true);
      setError(null);
      await removeMyProfilePhoto();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível remover sua foto.');
    } finally {
      setAvatarWorking(false);
    }
  }

  async function handleSignOut() { try { await signOut(); router.replace('/'); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível sair.'); } }
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
  const profilePhotoUrl = getProfileMediaPublicUrl(profile?.avatar_path);

  return <Screen title="Trainer Profile" subtitle="Sua identidade, cosméticos, valor de mercado da coleção, ranking global e progresso.">
    {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
    {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9FAF" /><Text style={styles.errorText}>{error}</Text></View> : null}

    <TrainerIdentityCard
      profile={profile}
      collectionValueUsd={collectionMarketValueUsd}
      isAdmin={isAdmin}
    />

    <View style={styles.identityActions}>
      <Pressable
        disabled={avatarWorking}
        onPress={() => setAvatarMenuOpen(true)}
        style={[styles.identityAction,{backgroundColor:colors.surface,borderColor:colors.border}]}
      >
        <View style={[styles.identityActionIcon,{backgroundColor:colors.accentSoft}]}>
          {avatarWorking
            ? <ActivityIndicator size="small" color={colors.yellow}/>
            : <Ionicons name="images" size={20} color={colors.yellow}/>}
        </View>
        <View style={styles.identityActionCopy}>
          <Text style={[styles.identityActionTitle,{color:colors.text}]}>Foto de perfil</Text>
          <Text style={[styles.identityActionHint,{color:colors.muted}]}>Galeria, corte quadrado e moldura equipada.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted}/>
      </Pressable>

      <Pressable
        onPress={openNicknameEditor}
        style={[styles.identityAction,{backgroundColor:colors.surface,borderColor:colors.border}]}
      >
        <View style={[styles.identityActionIcon,{backgroundColor:colors.accentSoft}]}>
          <Ionicons name="pencil" size={20} color={colors.accent}/>
        </View>
        <View style={styles.identityActionCopy}>
          <Text style={[styles.identityActionTitle,{color:colors.text}]}>Nickname</Text>
          <Text style={[styles.identityActionHint,{color:colors.muted}]}>@{profile?.username ?? 'trainer'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted}/>
      </Pressable>

      <Pressable
        onPress={() => router.push('/cosmetics')}
        style={[styles.identityAction,{backgroundColor:colors.surface,borderColor:colors.border}]}
      >
        <View style={[styles.identityActionIcon,{backgroundColor:colors.accentSoft}]}>
          <Ionicons name="color-wand" size={20} color={profileFrameColor}/>
        </View>
        <View style={styles.identityActionCopy}>
          <Text style={[styles.identityActionTitle,{color:colors.text}]}>Moldura & background</Text>
          <Text numberOfLines={1} style={[styles.identityActionHint,{color:colors.muted}]}>
            {frameDefinition?.name ?? 'Sem moldura'} • {backgroundDefinition?.name ?? 'Sem background'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted}/>
      </Pressable>
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
      <FeatureLink icon="ribbon" color={colors.yellow} title="Passe de Batalha" text="50 níveis, missões, recompensas grátis e trilha VIP." onPress={() => router.push('/battle-pass')} />
      <FeatureLink icon="flame" color={colors.yellow} title="Temporada & Jornada" text="Streak, ranque, eventos e recompensas da coleção." onPress={() => router.push('/season')} />
      <FeatureLink icon="sparkles" color={colors.yellow} title="Minha Vitrine" text="Escolha as 6 cartas que aparecem no seu perfil público." onPress={() => router.push('/showcase')} />
      <FeatureLink icon="star" color={colors.accent} title="Card Chase" text="Wishlist e alertas quando suas cartas desejadas aparecem." onPress={() => router.push('/wishlist')} />
      <FeatureLink icon="trophy" color={colors.yellow} title="Copa Trainer" text="Entre no torneio de 8 jogadores e acompanhe o bracket." onPress={() => router.push('/tournaments')} />
      <FeatureLink icon="color-wand" color={colors.accent} title="Cosméticos" text="Equipe molduras e backgrounds conquistados pelo seu progresso." onPress={() => router.push('/cosmetics')} />
      <FeatureLink icon="color-palette" color={colors.accent} title="Personalização" text="Modo claro/escuro, temas, push, som e vibração." onPress={() => router.push('/settings')} />
    </View>

    <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.progressTop}><Text style={[styles.progressTitle, { color: colors.text }]}>Progresso do nível</Text><Text style={[styles.progressValue, { color: colors.muted }]}>{levelXp} / 250 XP</Text></View><View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.fill, { width: `${Math.min(100, levelXp / 2.5)}%`, backgroundColor: colors.yellow }]} /></View><Text style={[styles.progressHint, { color: colors.muted }]}>Packs dão XP; batalhas dão XP extra e avançam missões.</Text></View>
    <Pressable style={styles.logout} onPress={handleSignOut}><Ionicons name="log-out-outline" size={18} color="#FF8A8A" /><Text style={styles.logoutText}>Sair da conta</Text></Pressable>

    <Modal visible={avatarMenuOpen} transparent animationType="fade" onRequestClose={() => !avatarWorking && setAvatarMenuOpen(false)}>
      <View style={styles.avatarBackdrop}>
        <View style={[styles.avatarModal,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <View style={styles.avatarModalHeader}>
            <TrainerAvatar icon={profile?.profile_icon} imageUrl={profilePhotoUrl} color={profileFrameColor} backgroundColor={profileBackgroundColor} size={82}/>
            <View style={{flex:1}}>
              <Text style={[styles.avatarModalTitle,{color:colors.text}]}>Foto de perfil</Text>
              <Text style={[styles.avatarModalHint,{color:colors.muted}]}>A foto aparece dentro da sua moldura e também no perfil visto pelos amigos.</Text>
            </View>
            <Pressable disabled={avatarWorking} onPress={() => setAvatarMenuOpen(false)}><Ionicons name="close" size={22} color={colors.muted}/></Pressable>
          </View>
          <Pressable disabled={avatarWorking} onPress={() => { void chooseProfilePhoto(); }} style={[styles.avatarAction,{backgroundColor:colors.yellow}]}>
            <Ionicons name="images" size={19} color="#07111F"/>
            <Text style={styles.avatarActionPrimary}>ESCOLHER DA GALERIA</Text>
          </Pressable>
          {profile?.avatar_path ? <Pressable disabled={avatarWorking} onPress={() => { void removeProfilePhoto(); }} style={[styles.avatarAction,{backgroundColor:colors.surfaceAlt,borderColor:colors.border,borderWidth:1}]}>
            <Ionicons name="person-circle-outline" size={19} color={colors.text}/>
            <Text style={[styles.avatarActionSecondary,{color:colors.text}]}>VOLTAR AO ÍCONE</Text>
          </Pressable> : null}
        </View>
      </View>
    </Modal>

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
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 12, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' }, errorText: { flex: 1, color: '#FFD7DD', fontWeight: '700', fontSize: 12 }, identityActions:{flexDirection:'row',flexWrap:'wrap',gap:9}, identityAction:{flexGrow:1,flexBasis:250,minWidth:240,minHeight:76,borderRadius:17,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:10}, identityActionIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center'}, identityActionCopy:{flex:1,minWidth:0}, identityActionTitle:{fontSize:11,fontWeight:'900'}, identityActionHint:{fontSize:8,lineHeight:12,marginTop:2},
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24, borderWidth: 1 }, avatarButton:{position:'relative'}, avatarEditBadge:{position:'absolute',right:-5,bottom:-5,width:28,height:28,borderRadius:10,borderWidth:2,alignItems:'center',justifyContent:'center'}, avatar: { width: 70, height: 70, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, avatarText: { fontSize: 30, fontWeight: '900' }, heroInfo: { flex: 1, minWidth: 190 }, rankSymbol: { fontSize: 24, fontWeight: '900' }, equippedTitle: { fontSize: 11, fontWeight: '900', marginTop: 2 }, cosmeticLabel: { fontSize: 8, fontWeight: '900', marginTop: 3, letterSpacing: .4 }, usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }, editNameButton: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, username: { flexShrink: 1, fontSize: 25, fontWeight: '900' }, meta: { fontSize: 12, marginTop: 4 }, coinBox: { minWidth: 130, padding: 12, borderRadius: 16 }, coinLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, coins: { fontSize: 18, fontWeight: '900', marginTop: 3 },
  rankPanel: { padding: 15, borderRadius: 20, borderWidth: 1 }, rankPanelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, rankName: { fontSize: 20, fontWeight: '900', marginTop: 3 }, rankPoints: { fontSize: 15, fontWeight: '900' },
  worthPanel: { padding: 16, borderRadius: 22, borderWidth: 1, gap: 12 }, worthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, worthKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, worthTotal: { fontSize: 30, fontWeight: '900', marginTop: 3 }, worthHint: { fontSize: 9, marginTop: 2 }, worthIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, worthDivider: { height: 1 }, worthBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, worthMetric: { flexGrow: 1, flexBasis: 150, minWidth: 130 }, worthMetricLabel: { fontSize: 7, fontWeight: '900', letterSpacing: .9 }, worthMetricText: { fontSize: 14, fontWeight: '900', marginTop: 3 }, worthMetricValue: { fontSize: 9, fontWeight: '900', marginTop: 2 }, topCardRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 8 }, topCardImage: { width: 50, height: 67, borderRadius: 6 }, topCardLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 1 }, topCardName: { fontSize: 13, fontWeight: '900', marginTop: 2 }, topCardMeta: { fontSize: 8, marginTop: 1 }, topCardValue: { fontSize: 10, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, stat: { flexGrow: 1, flexBasis: 145, minWidth: 135, padding: 14, borderRadius: 18, borderWidth: 1 }, statIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 9 }, statValue: { fontSize: 20, fontWeight: '900' }, statLabel: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, feature: { flexGrow: 1, flexBasis: 360, minWidth: 280, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 }, featureIcon: { width: 45, height: 45, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, featureBody: { flex: 1 }, featureTitle: { fontSize: 15, fontWeight: '900' }, featureText: { fontSize: 10, lineHeight: 15, marginTop: 3 }, badge: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D84B64' }, badgeText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  avatarBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.76)',justifyContent:'flex-end',padding:12}, avatarModal:{borderRadius:24,borderWidth:1,padding:16,gap:10,marginBottom:8}, avatarModalHeader:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:4}, avatarModalTitle:{fontSize:18,fontWeight:'900'}, avatarModalHint:{fontSize:9,lineHeight:14,marginTop:3}, avatarAction:{minHeight:50,borderRadius:15,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}, avatarActionPrimary:{color:'#07111F',fontSize:10,fontWeight:'900',letterSpacing:.4}, avatarActionSecondary:{fontSize:10,fontWeight:'900',letterSpacing:.4},
  progressCard: { padding: 15, borderRadius: 18, borderWidth: 1 }, progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, progressTitle: { fontSize: 14, fontWeight: '900' }, progressValue: { fontSize: 10, fontWeight: '800' }, track: { height: 8, borderRadius: 999, marginTop: 11, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 999 }, progressHint: { fontSize: 9, marginTop: 7 }, logout: { marginTop: 4, borderRadius: 14, borderWidth: 1, borderColor: '#C64E5A', paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, logoutText: { color: '#FF8A8A', fontWeight: '900', fontSize: 11 }, nicknameBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.74)', justifyContent: 'flex-end', padding: 12 }, nicknameModal: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 12, marginBottom: 8 }, nicknameHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, nicknameIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, nicknameTitle: { fontSize: 17, fontWeight: '900' }, nicknameHint: { fontSize: 9, lineHeight: 14, marginTop: 2 }, nicknameInputWrap: { minHeight: 52, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 4 }, nicknameAt: { fontSize: 16, fontWeight: '900' }, nicknameInput: { flex: 1, minHeight: 50, fontSize: 15, fontWeight: '800' }, nicknameMetaRow: { flexDirection: 'row', justifyContent: 'flex-end' }, nicknameCount: { fontSize: 9, fontWeight: '800' }, nicknameError: { color: '#FF8A9A', fontSize: 10, fontWeight: '800' }, nicknameSave: { minHeight: 50, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, nicknameSaveText: { color: '#07111F', fontSize: 10, fontWeight: '900', letterSpacing: .4 },
});
