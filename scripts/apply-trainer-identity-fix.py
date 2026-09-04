from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    s = p.read_text()
    n = s.count(old)
    if n < count:
        raise SystemExit(f"{path}: missing anchor ({n} < {count}): {old[:120]!r}")
    p.write_text(s.replace(old, new, count))


# Global chat: current photo + equipped theme.
replace("src/components/GlobalChatHomeCard.tsx",
        "import { useWallet } from '@/wallet/WalletProvider';",
        "import { useWallet } from '@/wallet/WalletProvider';\nimport { getProfileAvatarUrl } from '@/services/player';")
replace("src/components/GlobalChatHomeCard.tsx",
        "                    icon={message.profileIcon}\n                    size={31}",
        "                    icon={message.profileIcon}\n                    avatarUrl={getProfileAvatarUrl(message.avatarPath, message.avatarUpdatedAt)}\n                    frameId={message.frameId}\n                    backgroundId={message.backgroundId}\n                    size={31}")

# Guild chat.
replace("src/components/GuildChatPanel.tsx",
        "                    avatarUrl={getProfileAvatarUrl(avatars[message.playerId]?.avatarPath, avatars[message.playerId]?.avatarUpdatedAt)}\n                    color={guildColor}",
        "                    avatarUrl={getProfileAvatarUrl(avatars[message.playerId]?.avatarPath, avatars[message.playerId]?.avatarUpdatedAt)}\n                    frameId={avatars[message.playerId]?.frameId}\n                    backgroundId={avatars[message.playerId]?.backgroundId}\n                    color={guildColor}")

# Direct chat.
replace("app/chat/[id].tsx",
        "id,username,level,battle_rating,profile_icon,avatar_path,avatar_updated_at",
        "id,username,level,battle_rating,profile_icon,avatar_path,avatar_updated_at,equipped_frame_id,equipped_background_id")
replace("app/chat/[id].tsx",
        "            avatarUrl={getProfileAvatarUrl(friend?.avatar_path, friend?.avatar_updated_at)}\n            color={colors.accent}",
        "            avatarUrl={getProfileAvatarUrl(friend?.avatar_path, friend?.avatar_updated_at)}\n            frameId={friend?.equipped_frame_id}\n            backgroundId={friend?.equipped_background_id}\n            color={colors.accent}")

# Global search.
replace("src/services/globalSearch.ts",
        "  avatarUpdatedAt: string | null;\n};",
        "  avatarUpdatedAt: string | null;\n  frameId: string | null;\n  backgroundId: string | null;\n};")
replace("src/services/globalSearch.ts",
        "    avatarUpdatedAt: row.avatar_updated_at ? String(row.avatar_updated_at) : null,\n  }));",
        "    avatarUpdatedAt: row.avatar_updated_at ? String(row.avatar_updated_at) : null,\n    frameId: row.equipped_frame_id ? String(row.equipped_frame_id) : null,\n    backgroundId: row.equipped_background_id ? String(row.equipped_background_id) : null,\n  }));")
replace("app/search.tsx",
        "<TrainerAvatar icon={player.profileIcon} avatarUrl={avatar} color={colors.accent}",
        "<TrainerAvatar icon={player.profileIcon} avatarUrl={avatar} frameId={player.frameId} backgroundId={player.backgroundId} color={colors.accent}")

# Inbox conversation identities.
replace("src/services/notifications.ts",
        "import { supabase } from '@/lib/supabase';",
        "import { supabase } from '@/lib/supabase';\nimport { getPlayerAvatarMap } from '@/services/player';")
replace("src/services/notifications.ts",
        "export async function getConversationInbox() {\n  const { data, error } = await supabase.rpc('get_my_conversation_summaries');\n  if (error) throw error;\n  return data ?? [];\n}\n\nexport async function getUnreadConversationCount() {\n  const rows = await getConversationInbox();",
        "export async function getConversationInbox(withIdentity = true) {\n  const { data, error } = await supabase.rpc('get_my_conversation_summaries');\n  if (error) throw error;\n  const rows = data ?? [];\n  if (!withIdentity || !rows.length) return rows;\n  const identityMap = await getPlayerAvatarMap(rows.map((item: any) => String(item.friend_id ?? ''))).catch(() => ({}));\n  return rows.map((item: any) => ({ ...item, friend_identity: identityMap[String(item.friend_id ?? '')] ?? null }));\n}\n\nexport async function getUnreadConversationCount() {\n  const rows = await getConversationInbox(false);")
replace("app/inbox.tsx",
        "import { StatusPill } from '@/components/StatusPill';",
        "import { StatusPill } from '@/components/StatusPill';\nimport { TrainerAvatar } from '@/components/TrainerAvatar';\nimport { getProfileAvatarUrl } from '@/services/player';")
replace("app/inbox.tsx",
        "        <View style={[styles.avatar,{backgroundColor:colors.accentSoft}]}><Text style={[styles.avatarText,{color:colors.accent}]}>{String(item.friend_username??'?').slice(0,1).toUpperCase()}</Text></View>",
        "        <TrainerAvatar icon={item.friend_identity?.profileIcon} avatarUrl={getProfileAvatarUrl(item.friend_identity?.avatarPath,item.friend_identity?.avatarUpdatedAt)} frameId={item.friend_identity?.frameId} backgroundId={item.friend_identity?.backgroundId} color={colors.accent} backgroundColor={colors.accentSoft} size={43}/>")

# Trade Center.
replace("app/(tabs)/trade.tsx",
        "import { findPlayers } from '@/services/player';",
        "import { findPlayers, getProfileAvatarUrl } from '@/services/player';\nimport { TrainerAvatar } from '@/components/TrainerAvatar';")
replace("app/(tabs)/trade.tsx",
        "<View style={[styles.avatar,{backgroundColor:colors.accentSoft}]}><Text style={[styles.avatarText,{color:colors.text}]}>{friend.username.slice(0, 1).toUpperCase()}</Text></View>",
        "<TrainerAvatar icon={friend.profile_icon} avatarUrl={getProfileAvatarUrl(friend.avatar_path,friend.avatar_updated_at)} frameId={friend.equipped_frame_id} backgroundId={friend.equipped_background_id} color={colors.accent} backgroundColor={colors.accentSoft} size={40}/>")
replace("app/(tabs)/trade.tsx",
        "<View style={[styles.avatar,{backgroundColor:colors.accentSoft}]}><Text style={[styles.avatarText,{color:colors.text}]}>{player.username.slice(0, 1).toUpperCase()}</Text></View>",
        "<TrainerAvatar icon={player.profile_icon} avatarUrl={getProfileAvatarUrl(player.avatar_path,player.avatar_updated_at)} frameId={player.equipped_frame_id} backgroundId={player.equipped_background_id} color={colors.accent} backgroundColor={colors.accentSoft} size={40}/>")

# Trade detail.
replace("app/trade/[id].tsx",
        "import { getMyBag, type OwnedCardEntry } from '@/services/player';",
        "import { getMyBag, getPlayerAvatarMap, getProfileAvatarUrl, type OwnedCardEntry, type PlayerAvatarMeta } from '@/services/player';\nimport { TrainerAvatar } from '@/components/TrainerAvatar';")
replace("app/trade/[id].tsx",
        "  const [names, setNames] = useState<Record<string, string>>({});",
        "  const [names, setNames] = useState<Record<string, string>>({});\n  const [identities, setIdentities] = useState<Record<string, PlayerAvatarMeta>>({});")
replace("app/trade/[id].tsx",
        "      const participantIds = [tradeData.sender_id, tradeData.receiver_id];\n      const { data: players } = await supabase.from('players').select('id,username').in('id', participantIds);\n      setNames(Object.fromEntries((players ?? []).map((player) => [player.id, player.username])));",
        "      const participantIds = [tradeData.sender_id, tradeData.receiver_id];\n      const [{ data: players }, identityMap] = await Promise.all([\n        supabase.from('players').select('id,username').in('id', participantIds),\n        getPlayerAvatarMap(participantIds).catch(() => ({})),\n      ]);\n      setNames(Object.fromEntries((players ?? []).map((player) => [player.id, player.username])));\n      setIdentities(identityMap);")
replace("app/trade/[id].tsx",
        "<Participant label=\"VOCÊ\" name={names[userId] ?? 'Treinador'} confirmed={myConfirmed} />",
        "<Participant label=\"VOCÊ\" name={names[userId] ?? 'Treinador'} confirmed={myConfirmed} identity={identities[userId]} />")
replace("app/trade/[id].tsx",
        "<Participant label=\"OUTRO TREINADOR\" name={names[otherId] ?? 'Treinador'} confirmed={otherConfirmed} />",
        "<Participant label=\"OUTRO TREINADOR\" name={names[otherId] ?? 'Treinador'} confirmed={otherConfirmed} identity={identities[otherId]} />")
replace("app/trade/[id].tsx",
        "function Participant({ label, name, confirmed }: { label: string; name: string; confirmed: boolean }) {\n  const { colors } = useAppTheme();\n  return <View style={styles.participant}><View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.avatarText, { color: colors.text }]}>{name.slice(0, 1).toUpperCase()}</Text></View><View><Text style={[styles.participantLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.participantName, { color: colors.text }]}>@{name}</Text><Text style={[styles.confirmState, { color: confirmed ? '#65D894' : colors.muted }]}>{confirmed ? '✓ Confirmado' : 'Aguardando confirmação'}</Text></View></View>;\n}",
        "function Participant({ label, name, confirmed, identity }: { label: string; name: string; confirmed: boolean; identity?: PlayerAvatarMeta }) {\n  const { colors } = useAppTheme();\n  return <View style={styles.participant}><TrainerAvatar icon={identity?.profileIcon} avatarUrl={getProfileAvatarUrl(identity?.avatarPath,identity?.avatarUpdatedAt)} frameId={identity?.frameId} backgroundId={identity?.backgroundId} color={colors.accent} backgroundColor={colors.surfaceAlt} size={46}/><View><Text style={[styles.participantLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.participantName, { color: colors.text }]}>@{name}</Text><Text style={[styles.confirmState, { color: confirmed ? '#65D894' : colors.muted }]}>{confirmed ? '✓ Confirmado' : 'Aguardando confirmação'}</Text></View></View>;\n}")

# Marketplace seller identity.
replace("src/services/marketplace.ts",
        "  sellerIcon: string;\n  shopName: string;",
        "  sellerIcon: string;\n  sellerAvatarPath: string | null;\n  sellerAvatarUpdatedAt: string | null;\n  sellerFrameId: string | null;\n  sellerBackgroundId: string | null;\n  shopName: string;")
replace("src/services/marketplace.ts",
        "    sellerIcon: String(seller?.profile_icon ?? 'pokeball'),\n    shopName:",
        "    sellerIcon: String(seller?.profile_icon ?? 'pokeball'),\n    sellerAvatarPath: seller?.avatar_path ? String(seller.avatar_path) : null,\n    sellerAvatarUpdatedAt: seller?.avatar_updated_at ? String(seller.avatar_updated_at) : null,\n    sellerFrameId: seller?.equipped_frame_id ? String(seller.equipped_frame_id) : null,\n    sellerBackgroundId: seller?.equipped_background_id ? String(seller.equipped_background_id) : null,\n    shopName:")
replace("src/services/marketplace.ts",
        "'seller:players!market_listings_seller_id_fkey(id,username,profile_icon)'",
        "'seller:players!market_listings_seller_id_fkey(id,username,profile_icon,avatar_path,avatar_updated_at,equipped_frame_id,equipped_background_id)'")
replace("app/marketplace.tsx",
        "import { getCardDetail, getOwnedCard, type CardDetailEntry, type OwnedCardEntry } from '@/services/player';",
        "import { getCardDetail, getOwnedCard, getProfileAvatarUrl, type CardDetailEntry, type OwnedCardEntry } from '@/services/player';")
replace("app/marketplace.tsx",
        "<TrainerAvatar icon={item.sellerIcon} size={38} color={themeColor} backgroundColor={premiumTheme?`${themeColor}18`:colors.surfaceAlt}/>",
        "<TrainerAvatar icon={item.sellerIcon} avatarUrl={getProfileAvatarUrl(item.sellerAvatarPath,item.sellerAvatarUpdatedAt)} frameId={item.sellerFrameId} backgroundId={item.sellerBackgroundId} size={38} color={themeColor} backgroundColor={premiumTheme?`${themeColor}18`:colors.surfaceAlt}/>")

# Wallet provider carries own current equipped frame/background everywhere.
replace("src/wallet/WalletProvider.tsx",
        "  avatarUpdatedAt: string | null;\n  coins: number;",
        "  avatarUpdatedAt: string | null;\n  frameId: string | null;\n  backgroundId: string | null;\n  coins: number;")
replace("src/wallet/WalletProvider.tsx",
        "  const [avatarUpdatedAt, setAvatarUpdatedAt] = useState<string | null>(null);\n  const [coins, setCoins] = useState(0);",
        "  const [avatarUpdatedAt, setAvatarUpdatedAt] = useState<string | null>(null);\n  const [frameId, setFrameId] = useState<string | null>(null);\n  const [backgroundId, setBackgroundId] = useState<string | null>(null);\n  const [coins, setCoins] = useState(0);")
# Reset theme state anywhere the avatar cache itself is reset.
replace("src/wallet/WalletProvider.tsx",
        "      setAvatarUpdatedAt(null);",
        "      setAvatarUpdatedAt(null);\n      setFrameId(null);\n      setBackgroundId(null);",
        count=2)
replace("src/wallet/WalletProvider.tsx",
        ".select('username,profile_icon,avatar_path,avatar_updated_at,coins,diamonds')",
        ".select('username,profile_icon,avatar_path,avatar_updated_at,equipped_frame_id,equipped_background_id,coins,diamonds')")
replace("src/wallet/WalletProvider.tsx",
        "      setAvatarUpdatedAt(data.avatar_updated_at ?? null);\n      setCoins(Number(data.coins ?? 0));",
        "      setAvatarUpdatedAt(data.avatar_updated_at ?? null);\n      setFrameId(data.equipped_frame_id ?? null);\n      setBackgroundId(data.equipped_background_id ?? null);\n      setCoins(Number(data.coins ?? 0));")
replace("src/wallet/WalletProvider.tsx",
        "            avatar_updated_at?: string | null;\n            coins?: number | string;",
        "            avatar_updated_at?: string | null;\n            equipped_frame_id?: string | null;\n            equipped_background_id?: string | null;\n            coins?: number | string;")
replace("src/wallet/WalletProvider.tsx",
        "          if ('avatar_updated_at' in row) setAvatarUpdatedAt(row.avatar_updated_at ?? null);\n          if (row.coins != null)",
        "          if ('avatar_updated_at' in row) setAvatarUpdatedAt(row.avatar_updated_at ?? null);\n          if ('equipped_frame_id' in row) setFrameId(row.equipped_frame_id ?? null);\n          if ('equipped_background_id' in row) setBackgroundId(row.equipped_background_id ?? null);\n          if (row.coins != null)")
replace("src/wallet/WalletProvider.tsx",
        "    () => ({ userId, username, profileIcon, avatarPath, avatarUpdatedAt, coins, diamonds, loading, refresh }),\n    [userId, username, profileIcon, avatarPath, avatarUpdatedAt, coins, diamonds, loading, refresh],",
        "    () => ({ userId, username, profileIcon, avatarPath, avatarUpdatedAt, frameId, backgroundId, coins, diamonds, loading, refresh }),\n    [userId, username, profileIcon, avatarPath, avatarUpdatedAt, frameId, backgroundId, coins, diamonds, loading, refresh],")

# Navigation + Home use live wallet identity.
replace("src/components/TrainerNavigation.tsx",
        "const {userId,username,profileIcon,avatarPath,avatarUpdatedAt}=useWallet();",
        "const {userId,username,profileIcon,avatarPath,avatarUpdatedAt,frameId,backgroundId}=useWallet();")
replace("src/components/TrainerNavigation.tsx",
        "<TrainerAvatar icon={profileIcon} avatarUrl={avatarUrl} color={colors.accent} backgroundColor={colors.surface} size={40}/>",
        "<TrainerAvatar icon={profileIcon} avatarUrl={avatarUrl} frameId={frameId} backgroundId={backgroundId} color={colors.accent} backgroundColor={colors.surface} size={40}/>")
replace("src/components/TrainerNavigation.tsx",
        "<TrainerAvatar icon={profileIcon} avatarUrl={avatarUrl} color={colors.accent} backgroundColor={colors.surface} size={48}/>",
        "<TrainerAvatar icon={profileIcon} avatarUrl={avatarUrl} frameId={frameId} backgroundId={backgroundId} color={colors.accent} backgroundColor={colors.surface} size={48}/>")
replace("app/(tabs)/index.tsx",
        "import { getTrainerJourneySummary, type TrainerJourneySummary } from '@/services/career';",
        "import { getTrainerJourneySummary, type TrainerJourneySummary } from '@/services/career';\nimport { useWallet } from '@/wallet/WalletProvider';")
replace("app/(tabs)/index.tsx",
        "  const themeVisual = getThemeVisual(themeName);",
        "  const themeVisual = getThemeVisual(themeName);\n  const {frameId,backgroundId}=useWallet();")
replace("app/(tabs)/index.tsx",
        "            avatarUrl={avatarUrl}\n            color={colors.yellow}",
        "            avatarUrl={avatarUrl}\n            frameId={frameId}\n            backgroundId={backgroundId}\n            color={colors.yellow}")

# Store gift picker + QR.
replace("app/store.tsx",
        "                    avatarUrl={getProfileAvatarUrl(friend.avatar_path??null,friend.avatar_updated_at??null)}\n                    color={selected?colors.yellow:colors.accent}",
        "                    avatarUrl={getProfileAvatarUrl(friend.avatar_path??null,friend.avatar_updated_at??null)}\n                    frameId={friend.equipped_frame_id}\n                    backgroundId={friend.equipped_background_id}\n                    color={selected?colors.yellow:colors.accent}")
replace("app/friend-qr.tsx",
        "              avatarUrl={avatarUrl}\n              color={colors.accent}",
        "              avatarUrl={avatarUrl}\n              frameId={profile.equipped_frame_id}\n              backgroundId={profile.equipped_background_id}\n              color={colors.accent}")

# Wire the dedicated audit into normal verification.
p = Path('package.json')
s = p.read_text()
old = 'node scripts/apk-security-audit.mjs\"'
new = 'node scripts/apk-security-audit.mjs && node scripts/trainer-identity-audit.mjs\"'
if old not in s:
    raise SystemExit('package.json verify anchor missing')
p.write_text(s.replace(old, new, 1))

print('Trainer identity patch applied.')
