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
  'supabase/migrations/20260831024112_economy_v2_core_balance.sql',
  'supabase/migrations/20260831024233_economy_v2_sinks_and_guardrails.sql',
  'supabase/migrations/20260831025059_economy_v2_release_guard.sql',
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

if (existsSync('app/collection-ranking.tsx')) {
  const ranking = read('app/collection-ranking.tsx');
  const weeklySection = ranking.split("!loading && mode === 'weekly'")[1]?.split("!loading && mode === 'global'")[0] ?? '';
  const avatarCount = (weeklySection.match(/<TrainerAvatar/g) ?? []).length;
  assert(avatarCount === 1, 'Regressão: ranking semanal deve renderizar exatamente um avatar por jogador.');
}

if (existsSync('app/friends.tsx')) {
  const friends = read('app/friends.tsx');
  const actions = friends.split('function FriendActions')[1]?.split('return (')[0] ?? '';
  assert(!actions.includes('>PERFIL<'), 'Regressão: botão Perfil voltou para a barra de ações dos amigos.');
  assert(friends.includes('Abrir perfil de @'), 'Regressão: username dos amigos deixou de abrir o perfil.');
  assert(friends.includes('playerInfo:{flex:1,minWidth:0}'), 'Regressão: layout social pode voltar a cortar as ações em telas estreitas.');
}

if (existsSync('supabase/migrations/20260830183500_unique_weekly_collection_scoring.sql')) {
  const weeklyUnique = read('supabase/migrations/20260830183500_unique_weekly_collection_scoring.sql');
  const ranking = read('app/collection-ranking.tsx');
  assert(weeklyUnique.includes("elem->>'isNew'"), 'Regressão: ranking semanal voltou a contar duplicatas de packs normais.');
  assert(weeklyUnique.includes('first_obtained_at'), 'Regressão: ranking semanal não valida primeira obtenção em packs de diamante.');
  assert(weeklyUnique.includes('count(distinct'), 'Regressão: packs do semanal precisam contar apenas aberturas com novidade.');
  assert(ranking.includes('GANHO SEMANAL ÚNICO'), 'Regressão: UI não explica o placar semanal único.');
  assert(ranking.includes('cartas únicas'), 'Regressão: contagem semanal não está identificada como única na UI.');
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
  assert(layout.includes('Redirect') && layout.includes('publicAuthRoute') && layout.includes('!publicAuthRoute'), 'Regressão: rotas privadas não estão protegidas após logout.');
  assert(layout.includes('walletLoading'), 'Regressão: auth guard precisa aguardar a restauração da sessão.');
  assert(wallet.includes('if (!nextUserId)'), 'Regressão: WalletProvider não limpa estado imediatamente no SIGNED_OUT.');
  assert(wallet.includes('setUserId(null)'), 'Regressão: logout não limpa o usuário global.');
}

if (existsSync('src/services/auth.ts') && existsSync('app/index.tsx') && existsSync('app/reset-password.tsx')) {
  const auth = read('src/services/auth.ts');
  const login = read('app/index.tsx');
  const reset = read('app/reset-password.tsx');
  assert(auth.includes('resetPasswordForEmail'), 'Regressão: serviço de recuperação de senha ausente.');
  assert(auth.includes('return GOOGLE_OAUTH_REDIRECT'), 'Regressão: recuperação nativa deixou de abrir o callback do APK.');
  assert(auth.includes('PASSWORD_RECOVERY_PENDING_KEY'), 'Regressão: recuperação nativa não preserva estado pendente no aparelho.');
  assert(auth.includes('isPendingPasswordRecoveryFor'), 'Regressão: callback code-only não pode identificar recuperação pendente.');
  assert(auth.includes('updateUser({ password })'), 'Regressão: atualização segura da nova senha ausente.');
  assert(login.includes('ESQUECI MINHA SENHA'), 'Regressão: login perdeu o botão de recuperação de senha.');
  assert(login.includes("event === 'PASSWORD_RECOVERY'"), 'Regressão: callback PASSWORD_RECOVERY não é tratado.');
  assert(read('src/lib/supabase.ts').includes('initialWebAuthUrl'), 'Regressão: URL inicial de recuperação não é preservada antes do Supabase processá-la.');
  assert(read('app/_layout.tsx').includes("event === 'PASSWORD_RECOVERY'"), 'Regressão: layout global não trata PASSWORD_RECOVERY.');
  assert(read('app/_layout.tsx').includes('isPasswordRecoveryUrl(url)'), 'Regressão: deep link nativo não diferencia reset de senha de OAuth comum.');
  assert(read('app/_layout.tsx').includes('pendingRecoveryForUser'), 'Regressão: layout não trata callbacks de recovery que chegam apenas com code.');
  assert(reset.includes('clearPendingPasswordRecovery'), 'Regressão: reset concluído precisa limpar o marcador nativo de recuperação.');
  assert(login.includes('clearPendingPasswordRecovery'), 'Regressão: login normal precisa limpar marcador de recuperação obsoleto.');
  assert(read('app/_layout.tsx').includes("pathname === '/reset-password'"), 'Regressão: rota de redefinição de senha não está liberada no auth guard.');
  assert(reset.includes('SALVAR NOVA SENHA'), 'Regressão: tela de definição da nova senha ausente.');
  assert(reset.includes('await signOut()'), 'Regressão: recuperação deve encerrar a sessão temporária após trocar a senha.');
}

if (existsSync('supabase/migrations/20260831024112_economy_v2_core_balance.sql')) {
  const economyCore = read('supabase/migrations/20260831024112_economy_v2_core_balance.sql');
  assert(economyCore.includes("'economy_v2',35000,5000,100000,800,15000"), 'Regressão: política-base da Economy 2.0 foi alterada sem auditoria.');
  assert(economyCore.includes('private.refresh_pack_economy()'), 'Regressão: preços dos boosters deixaram de acompanhar a Economy 2.0.');
}
if (existsSync('supabase/migrations/20260831024233_economy_v2_sinks_and_guardrails.sql')) {
  const economySinks = read('supabase/migrations/20260831024233_economy_v2_sinks_and_guardrails.sql');
  assert(economySinks.includes('DUPLICATE_SALES_PAUSED_DURING_FREE_EVENT'), 'Regressão: Admin Abuse voltou a permitir converter booster grátis em Coins.');
  assert(economySinks.includes('marketFeePercent') && economySinks.includes('*.08'), 'Regressão: taxa econômica de 8% do mercado foi removida.');
  assert(economySinks.includes('price::numeric*1.5'), 'Regressão: venda de repetidas perdeu o teto ligado ao booster.');
}
if (existsSync('supabase/migrations/20260831025059_economy_v2_release_guard.sql')) {
  const economyRelease = read('supabase/migrations/20260831025059_economy_v2_release_guard.sql');
  assert(economyRelease.includes('update public.redeem_codes set active=false'), 'Regressão: códigos Beta não são encerrados no reset 1.0.');
  assert(economyRelease.includes('update public.admin_game_events set active=false'), 'Regressão: eventos Beta não são encerrados no reset 1.0.');
}

if (failures.length) {
  console.error('\n❌ Auditoria de regressão falhou:');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}

console.log('✅ Auditoria de regressão passou.');
console.log('   Batalha, guilda, QR, Legado, Admin Abuse, atualização obrigatória e PWA permanecem protegidos.');
