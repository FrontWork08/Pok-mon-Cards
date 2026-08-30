import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const requiredFiles = [
  'app/friend-qr-scan.tsx',
  'app/reset-password.tsx',
  'src/components/FriendQrCard.tsx',
  'src/components/GuildChatPanel.tsx',
  'src/components/ReleaseCampaignNotice.tsx',
  'src/components/WebPwaBootstrap.tsx',
  'public/sw.js',
  'public/manifest.json',
  'supabase/migrations/20260828225000_guild_chat_and_battle_forfeit.sql',
  'supabase/migrations/20260828233356_admin_abuse_coin_free_diamond_half.sql',
  'supabase/migrations/20260829203710_auto_fill_legacy_with_most_valuable_cards.sql',
];

for (const file of requiredFiles) assert(existsSync(file), `Regressão: arquivo crítico ausente: ${file}`);

if (existsSync('app/battle/[id].tsx')) {
  const battle = read('app/battle/[id].tsx');
  assert(battle.includes('forfeitBattle'), 'Regressão: tela de batalha perdeu a desistência.');
  assert(battle.includes('ratingNeutral'), 'Regressão: UI perdeu indicação de desistência neutra antes da seleção.');
}

if (existsSync('src/services/ranks.ts')) {
  const ranks = read('src/services/ranks.ts');
  assert(ranks.includes('/ 50'), 'Regressão: divisões de ELO deixaram de avançar a cada 50 pontos.');
}

if (existsSync('app/guilds.tsx')) {
  assert(read('app/guilds.tsx').includes('GuildChatPanel'), 'Regressão: chat de guilda não está mais ligado à tela de guildas.');
}

if (existsSync('src/components/ReleaseCampaignNotice.tsx')) {
  const release = read('src/components/ReleaseCampaignNotice.tsx');
  assert(release.includes('ATUALIZAÇÃO OBRIGATÓRIA'), 'Regressão: modal de atualização obrigatória ausente.');
  assert(release.includes('compareVersions'), 'Regressão: comparação de versão mínima ausente.');
}

if (existsSync('app/friend-qr-scan.tsx')) {
  const scanner = read('app/friend-qr-scan.tsx');
  assert(scanner.includes('CameraView'), 'Regressão: scanner de QR perdeu a câmera.');
  assert(scanner.includes('parseFriendProfileDeepLink'), 'Regressão: scanner não valida Trainer Links.');
}

if (existsSync('supabase/migrations/20260828233356_admin_abuse_coin_free_diamond_half.sql')) {
  const abuse = read('supabase/migrations/20260828233356_admin_abuse_coin_free_diamond_half.sql');
  assert(/ceil|ceiling/i.test(abuse), 'Regressão: Admin Abuse precisa arredondar desconto ímpar de diamantes para cima.');
}

if (existsSync('supabase/migrations/20260829203710_auto_fill_legacy_with_most_valuable_cards.sql')) {
  const legacy = read('supabase/migrations/20260829203710_auto_fill_legacy_with_most_valuable_cards.sql');
  assert(/market_price_usd/i.test(legacy), 'Regressão: auto-fill do Legado não usa valor das cartas.');
  assert(/10|legacy_card_limit/i.test(legacy), 'Regressão: limite do Legado não está protegido.');
}

if (existsSync('src/components/WebPwaBootstrap.tsx') && existsSync('app/_layout.tsx')) {
  assert(read('app/_layout.tsx').includes('WebPwaBootstrap'), 'Regressão: PWA web deixou de registrar o service worker.');
  assert(read('public/sw.js').includes("url.origin !== self.location.origin"), 'Regressão: service worker deve limitar cache à mesma origem.');
}

if (existsSync('app/_layout.tsx') && existsSync('src/wallet/WalletProvider.tsx')) {
  const layout = read('app/_layout.tsx');
  const wallet = read('src/wallet/WalletProvider.tsx');
  assert(layout.includes('Redirect') && layout.includes("pathname !== '/'"), 'Regressão: rotas privadas não estão protegidas após logout.');
  assert(layout.includes('walletLoading'), 'Regressão: auth guard precisa aguardar a restauração da sessão.');
  assert(wallet.includes('if (!nextUserId)'), 'Regressão: WalletProvider não limpa estado imediatamente no SIGNED_OUT.');
  assert(wallet.includes('setUserId(null)'), 'Regressão: logout não limpa o usuário global.');
}

if (existsSync('src/services/auth.ts') && existsSync('app/index.tsx') && existsSync('app/reset-password.tsx')) {
  const auth = read('src/services/auth.ts');
  const login = read('app/index.tsx');
  const reset = read('app/reset-password.tsx');
  assert(auth.includes('resetPasswordForEmail'), 'Regressão: serviço de recuperação de senha ausente.');
  assert(auth.includes('updateUser({ password })'), 'Regressão: atualização segura da nova senha ausente.');
  assert(login.includes('ESQUECI MINHA SENHA'), 'Regressão: login perdeu o botão de recuperação de senha.');
  assert(login.includes("event === 'PASSWORD_RECOVERY'"), 'Regressão: callback PASSWORD_RECOVERY não é tratado.');
  assert(read('src/lib/supabase.ts').includes('initialWebAuthUrl'), 'Regressão: URL inicial de recuperação não é preservada antes do Supabase processá-la.');
  assert(read('app/_layout.tsx').includes("event === 'PASSWORD_RECOVERY'"), 'Regressão: layout global não trata PASSWORD_RECOVERY.');
  assert(read('app/_layout.tsx').includes("pathname === '/reset-password'"), 'Regressão: rota de redefinição de senha não está liberada no auth guard.');
  assert(reset.includes('SALVAR NOVA SENHA'), 'Regressão: tela de definição da nova senha ausente.');
  assert(reset.includes('await signOut()'), 'Regressão: recuperação deve encerrar a sessão temporária após trocar a senha.');
}

if (failures.length) {
  console.error('\n❌ Auditoria de regressão falhou:');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}

console.log('✅ Auditoria de regressão passou.');
console.log('   Batalha, guilda, QR, Legado, Admin Abuse, atualização obrigatória e PWA permanecem protegidos.');
