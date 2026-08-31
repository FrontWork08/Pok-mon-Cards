import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CurrencyBar } from '@/components/CurrencyBar';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { getProfileAvatarUrl } from '@/services/player';
import { isCurrentUserAdmin } from '@/services/market';
import { getUnreadConversationCount } from '@/services/notifications';
import { getMyRankSnapshot, type RankSnapshot } from '@/services/rankStatus';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

type MenuItem = {
  label: string;
  description: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  adminOnly?: boolean;
};

const MENU_ITEMS: MenuItem[] = [
  { label: 'Início', description: 'Voltar direto para o hub principal', href: '/(tabs)', icon: 'home' },
  { label: 'Inbox', description: 'Mensagens, convites e avisos', href: '/inbox', icon: 'mail-unread' },
  { label: 'Passe de Batalha', description: '50 níveis, recompensas grátis, VIP e missões', href: '/battle-pass', icon: 'ribbon' },
  { label: 'Temporada & Jornada', description: 'Ranque, streak, eventos e recompensas', href: '/season', icon: 'flame' },
  { label: 'Card Chase', description: 'Wishlist e alertas de cartas desejadas', href: '/wishlist', icon: 'star' },
  { label: 'Vitrine do Perfil', description: 'Escolha suas 6 cartas de destaque', href: '/showcase', icon: 'sparkles' },
  { label: 'Conquistas e Títulos', description: 'Progresso e títulos equipáveis', href: '/achievements', icon: 'ribbon' },
  { label: 'Ranking de Coleções', description: 'Contas com maior valor de mercado', href: '/collection-ranking', icon: 'podium' },
  { label: 'Guildas Pokémon', description: 'Equipe, missões e ranking coletivo', href: '/guilds', icon: 'shield' },
  { label: 'Guild Wars', description: 'Confrontos semanais entre guildas', href: '/guild-wars', icon: 'flash' },
  { label: 'Copa Trainer', description: 'Torneio de 8 jogadores com bracket', href: '/tournaments', icon: 'trophy' },
  { label: 'Cosméticos', description: 'Molduras e backgrounds desbloqueáveis', href: '/cosmetics', icon: 'color-wand' },
  { label: 'Mercado de Treinadores', description: 'Lojas e ofertas em tempo real', href: '/marketplace', icon: 'storefront' },
  { label: 'Resgatar Código', description: 'Recompensas únicas por conta', href: '/codes', icon: 'ticket' },
  { label: 'Amigos e Chat', description: 'Amizades e conversas', href: '/friends', icon: 'people' },
  { label: 'QR de amizade', description: 'Mostre seu Trainer Link para adicionar amigos', href: '/friend-qr', icon: 'qr-code' },
  { label: 'Meus Decks', description: 'Monte suas equipes de batalha', href: '/decks', icon: 'albums' },
  { label: 'Missões', description: 'Objetivos diários e semanais', href: '/missions', icon: 'checkbox' },
  { label: 'Pokédex', description: 'Espécies e cartas descobertas', href: '/pokedex', icon: 'book' },
  { label: 'Coleções por Set', description: 'Acompanhe o progresso dos sets', href: '/sets', icon: 'layers' },
  { label: 'Histórico de Packs', description: 'Reveja seus melhores pulls', href: '/history', icon: 'time' },
  { label: 'Admin Center', description: 'Economia, usuários e sistema', href: '/admin', icon: 'shield-checkmark', adminOnly: true },
];

export function TrainerNavigation() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { userId, username, profileIcon, avatarPath, avatarUpdatedAt } = useWallet();
  const avatarUrl = getProfileAvatarUrl(avatarPath, avatarUpdatedAt);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unread, setUnread] = useState(0);
  const [rankSnapshot, setRankSnapshot] = useState<RankSnapshot | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      setUnread(0);
      setRankSnapshot(null);
      return;
    }
    Promise.all([
      isCurrentUserAdmin().catch(() => false),
      getUnreadConversationCount().catch(() => 0),
      getMyRankSnapshot().catch(() => null),
    ]).then(([admin, count, snapshot]) => {
      setIsAdmin(admin);
      setUnread(count);
      setRankSnapshot(snapshot);
    });
  }, [userId]);

  useEffect(() => {
    if (!userId || !open) return;
    void getUnreadConversationCount().then(setUnread).catch(() => null);
  }, [open, userId]);

  if (!userId) return null;

  function navigate(href: string) {
    setOpen(false);
    requestAnimationFrame(() => router.replace(href as never));
  }

  return (
    <>
      <View style={styles.row}>
        <Pressable
          accessibilityLabel="Abrir menu"
          onPress={() => setOpen(true)}
          style={[styles.menuButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="menu" size={24} color={colors.text} />
          {unread > 0 ? <View style={styles.unreadDot} /> : null}
        </Pressable>
        <View style={styles.currency}><CurrencyBar compact /></View>
        <Pressable accessibilityLabel="Abrir perfil" onPress={() => router.replace('/(tabs)/profile')}>
          <TrainerAvatar icon={profileIcon} avatarUrl={avatarUrl} color={colors.accent} backgroundColor={colors.surface} size={40} />
        </Pressable>
      </View>
      {rankSnapshot ? <View style={styles.rankStrip}>
        <Pressable onPress={() => router.replace('/(tabs)/battles')} style={[styles.rankPill,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="trophy" size={14} color={colors.yellow}/><Text style={[styles.rankPillText,{color:colors.text}]}>RANQUEADA #{rankSnapshot.battle.rank}</Text><Text style={[styles.rankPillSub,{color:colors.muted}]}>ELO {rankSnapshot.battle.rating}</Text></Pressable>
        <Pressable onPress={() => router.replace('/collection-ranking')} style={[styles.rankPill,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="diamond" size={14} color="#68D9FF"/><Text style={[styles.rankPillText,{color:colors.text}]}>COLEÇÃO #{rankSnapshot.collection.rank}</Text><Text style={[styles.rankPillSub,{color:colors.muted}]}>TOP {rankSnapshot.collection.total ? Math.max(1,Math.ceil(rankSnapshot.collection.rank/rankSnapshot.collection.total*100)) : 0}%</Text></Pressable>
      </View> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.drawer, { backgroundColor: colors.bg, borderColor: colors.border }] }>
            <View style={[styles.drawerHeader, { borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }] }>
              <TrainerAvatar icon={profileIcon} avatarUrl={avatarUrl} color={colors.accent} backgroundColor={colors.surface} size={48} />
              <View style={styles.headerText}>
                <Text style={[styles.kicker, { color: colors.yellow }]}>TRAINER MENU</Text>
                <Text numberOfLines={1} style={[styles.username, { color: colors.text }]}>@{username ?? 'Treinador'}</Text>
              </View>
              <Pressable accessibilityLabel="Fechar menu" onPress={() => setOpen(false)} style={styles.close}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.menuList} showsVerticalScrollIndicator={false}>
              {MENU_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
                <Pressable
                  key={item.href}
                  onPress={() => navigate(item.href)}
                  style={({ pressed }) => [styles.item, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
                >
                  <View style={[styles.itemIcon, { backgroundColor: colors.accentSoft }] }>
                    <Ionicons name={item.icon} size={20} color={item.adminOnly ? '#FF5CCF' : colors.accent} />
                  </View>
                  <View style={styles.itemText}>
                    <Text style={[styles.itemLabel, { color: colors.text }]}>{item.label}</Text>
                    <Text style={[styles.itemDescription, { color: colors.muted }]}>{item.description}</Text>
                  </View>
                  {item.href === '/inbox' && unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(unread, 99)}</Text></View> : null}
                  <Ionicons name="chevron-forward" size={17} color={colors.muted} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankStrip:{width:'100%',flexDirection:'row',gap:6,marginTop:6},
  rankPill:{flex:1,minHeight:34,borderRadius:11,borderWidth:1,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:5},
  rankPillText:{fontSize:7,fontWeight:'900'},
  rankPillSub:{fontSize:7,fontWeight:'700',marginLeft:'auto'},
  menuButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { position: 'absolute', right: 5, top: 5, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5D73', borderWidth: 1, borderColor: '#fff' },
  currency: { flex: 1, alignItems: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.7)', flexDirection: 'row' },
  drawer: { width: '88%', maxWidth: 390, height: '100%', borderRightWidth: 1 },
  drawerHeader: { paddingTop: 22, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1 },
  headerText: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  username: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  close: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  menuList: { padding: 12, gap: 7, paddingBottom: 34 },
  item: { minHeight: 62, borderRadius: 16, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pressed: { opacity: .7 },
  itemIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, minWidth: 0 },
  itemLabel: { fontSize: 12, fontWeight: '900' },
  itemDescription: { fontSize: 8, marginTop: 2 },
  badge: { minWidth: 23, height: 23, paddingHorizontal: 5, borderRadius: 12, backgroundColor: '#E64D66', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
});
