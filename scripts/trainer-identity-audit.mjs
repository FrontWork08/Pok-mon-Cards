import { readFile } from 'node:fs/promises';

const checks = [
  ['src/services/globalChat.ts', ['getPlayerAvatarMap', 'avatarPath', 'avatarUpdatedAt', 'frameId', 'backgroundId']],
  ['src/components/GlobalChatHomeCard.tsx', ['getProfileAvatarUrl(message.avatarPath', 'frameId={message.frameId}', 'backgroundId={message.backgroundId}']],
  ['src/components/GuildChatPanel.tsx', ['frameId={avatars[message.playerId]?.frameId}', 'backgroundId={avatars[message.playerId]?.backgroundId}']],
  ['app/chat/[id].tsx', ['equipped_frame_id,equipped_background_id', 'frameId={friend?.equipped_frame_id}', 'backgroundId={friend?.equipped_background_id}']],
  ['src/services/globalSearch.ts', ['frameId: string | null', 'backgroundId: string | null', 'equipped_frame_id', 'equipped_background_id']],
  ['app/search.tsx', ['frameId={player.frameId}', 'backgroundId={player.backgroundId}']],
  ['src/services/notifications.ts', ['getPlayerAvatarMap', 'friend_identity', 'getConversationInbox(false)']],
  ['app/inbox.tsx', ['item.friend_identity?.avatarPath', 'item.friend_identity?.frameId', 'item.friend_identity?.backgroundId']],
  ['app/(tabs)/trade.tsx', ['getProfileAvatarUrl', 'friend.avatar_path', 'friend.equipped_frame_id', 'player.avatar_path', 'player.equipped_frame_id']],
  ['app/trade/[id].tsx', ['getPlayerAvatarMap', 'identities', 'identity={identities[userId]}', 'identity={identities[otherId]}']],
  ['src/services/marketplace.ts', ['sellerAvatarPath', 'sellerAvatarUpdatedAt', 'sellerFrameId', 'sellerBackgroundId', 'avatar_path,avatar_updated_at,equipped_frame_id,equipped_background_id']],
  ['app/marketplace.tsx', ['getProfileAvatarUrl(item.sellerAvatarPath', 'frameId={item.sellerFrameId}', 'backgroundId={item.sellerBackgroundId}']],
  ['src/wallet/WalletProvider.tsx', ['frameId: string | null', 'backgroundId: string | null', 'equipped_frame_id,equipped_background_id']],
  ['src/components/TrainerNavigation.tsx', ['frameId={frameId}', 'backgroundId={backgroundId}']],
  ['app/(tabs)/index.tsx', ['frameId={frameId}', 'backgroundId={backgroundId}']],
  ['app/store.tsx', ['frameId={friend.equipped_frame_id}', 'backgroundId={friend.equipped_background_id}']],
  ['app/friend-qr.tsx', ['frameId={profile.equipped_frame_id}', 'backgroundId={profile.equipped_background_id}']],
];

const forbidden = [
  ['app/inbox.tsx', 'friend_username??\'?\').slice(0,1)'],
  ['app/(tabs)/trade.tsx', 'friend.username.slice(0, 1).toUpperCase()'],
  ['app/(tabs)/trade.tsx', 'player.username.slice(0, 1).toUpperCase()'],
  ['app/trade/[id].tsx', 'name.slice(0, 1).toUpperCase()'],
];

const failures = [];
for (const [file, needles] of checks) {
  const text = await readFile(file, 'utf8');
  for (const needle of needles) {
    if (!text.includes(needle)) failures.push(`${file}: missing ${needle}`);
  }
}

for (const [file, needle] of forbidden) {
  const text = await readFile(file, 'utf8');
  if (text.includes(needle)) failures.push(`${file}: legacy initials-only avatar still present`);
}

if (failures.length) {
  console.error('❌ Trainer identity audit failed:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log('✅ Trainer identity audit: fotos de perfil e temas equipados cobrem chat global/guilda, conversas, busca, inbox, trocas, mercado, navegação, home, loja e QR.');
