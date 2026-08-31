import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const requiredFiles = [
  'src/components/CompactTrainerBanner.tsx',
  'src/components/PremiumProfileFrame.tsx',
  'supabase/migrations/20260831141844_trainer_shop_gift_reset_guard.sql',
  'supabase/migrations/20260831141513_trainer_shop_friend_gifts.sql',
  'supabase/migrations/20260831135122_trainer_shop_catalog.sql',
  'supabase/migrations/20260831135024_bulk_duplicate_sales.sql',
  'src/services/store.ts',
  'app/store.tsx',
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
  'app/economy.tsx',
  'src/services/economy.ts',
  'src/components/AuraBanner.tsx',
  'src/components/AuraFrame.tsx',
  'src/components/GuildHeadquartersShowcase.tsx',
  'src/components/GalaxyFlowOverlay.tsx',
  'src/lib/session.ts',
  'src/services/home.ts',
  'supabase/migrations/20260831030951_economy_v21_permanent_sinks_schema.sql',
  'supabase/migrations/20260831031041_economy_v21_luxury_and_museum_schema.sql',
  'supabase/migrations/20260831031133_economy_v21_core_sink_actions.sql',
  'supabase/migrations/20260831031156_economy_v21_guild_and_global_projects.sql',
  'supabase/migrations/20260831031221_economy_v21_luxury_auctions.sql',
  'supabase/migrations/20260831031322_economy_v21_sink_hub_gym_and_health.sql',
  'supabase/migrations/20260831031343_economy_v21_reset_asset_laundering_guard.sql',
  'supabase/migrations/20260831031407_economy_v21_adaptive_advisor.sql',
  'supabase/migrations/20260831031803_economy_v21_premium_market_themes.sql',
  'supabase/migrations/20260831031837_economy_v21_gym_flare_payload.sql',
  'supabase/migrations/20260831032310_economy_v21_public_prestige_and_museum.sql',
  'supabase/migrations/20260831032715_economy_v21_allow_gym_cosmetic_events.sql',
  'supabase/migrations/20260831035207_economy_v21_revoke_anon_rpc_execute.sql',
  'supabase/migrations/20260831035416_economy_v21_performance_hardening.sql',
  'supabase/migrations/20260831104956_economy_v21_public_trophy_room.sql',
  'supabase/migrations/20260831121232_economy_v21_galaxy_flow_collection.sql',
  'supabase/migrations/20260831130337_economy_v21_booster_price_relief.sql',
  'supabase/migrations/20260831132415_home_dashboard_fast_path.sql',
  'supabase/migrations/20260831133220_profile_stats_fast_path.sql',
  'supabase/migrations/20260831133329_profile_stats_fast_path_v2.sql',
  'supabase/migrations/20260831133803_profile_stats_compact_payload.sql',
];

for (const file of requiredFiles) assert(existsSync(file), `Regressão: arquivo crítico ausente: ${file}`);

if (existsSync('app/battle/[id].tsx')) {
  const battle = read('app/battle/[id].tsx');
  assert(battle.includes('forfeitBattle'), 'Regressão: tela de batalha perdeu a desistência.');
  assert(battle.includes('ratingNeutral'), 'Regressão: UI perdeu indicação de desistência neutra antes da seleção.');
  assert(battle.includes('loadBattleState'), 'Regressão de performance: batalha perdeu o carregamento dinâmico separado.');
  assert(battle.includes('loadStaticBattleResources'), 'Regressão de performance: recursos estáticos da batalha não estão separados.');
  assert(battle.includes('realtimeRefreshTimer'), 'Regressão de performance: eventos realtime da batalha perderam o coalescing.');
  assert(!battle.includes('setInterval(tick, 250)'), 'Regressão de performance: cronômetro da batalha voltou a renderizar 4x por segundo.');
  const stateLoader = battle.split('const loadBattleState')[1]?.split('const loadStaticBattleResources')[0] ?? '';
  assert(!stateLoader.includes('getMyBag()') && !stateLoader.includes('getMyDecks()'), 'Regressão de performance: realtime da batalha voltou a baixar Bag/Decks completos.');
}

if (existsSync('src/lib/session.ts')) {
  const session = read('src/lib/session.ts');
  assert(session.includes('supabase.auth.getSession()'), 'Regressão de performance: helper de sessão voltou a validar usuário pela rede.');
  assert(!session.includes('supabase.auth.getUser()'), 'Regressão de performance: helper local não pode chamar auth.getUser().');
}

if (existsSync('app/_layout.tsx')) {
  const rootLayout = read('app/_layout.tsx');
  const appStackSection = rootLayout.split('function AppStack')[1] ?? rootLayout;
  assert(!appStackSection.includes('supabase.auth.getUser()'), 'Regressão de performance: layout global voltou a duplicar verificações /auth/v1/user.');
  assert(appStackSection.includes('60000'), 'Regressão de performance: fallback de manutenção voltou a fazer polling agressivo.');
}

if (existsSync('app/(tabs)/index.tsx')) {
  const home = read('app/(tabs)/index.tsx');
  assert(home.includes('getHomeDashboard'), 'Regressão de performance: Home deixou de usar o dashboard compacto.');
  assert(!home.includes('getMyBag()') && !home.includes('getMyTrades()'), 'Regressão de performance: Home voltou a baixar Bag/Trocas completas.');
}

if (existsSync('app/sell-duplicates.tsx') && existsSync('src/services/cardSales.ts')) {
  const salesUi = read('app/sell-duplicates.tsx');
  const salesService = read('src/services/cardSales.ts');
  assert(salesUi.includes('VENDER TODAS AS REPETIDAS'), 'Regressão: tela de repetidas perdeu a venda em lote.');
  assert(salesUi.includes('sellAllDuplicateCards'), 'Regressão: botão de venda em lote não está conectado ao serviço.');
  assert(salesService.includes("rpc('sell_all_duplicate_cards')"), 'Regressão: serviço perdeu a RPC de venda de todas as repetidas.');
}

if (existsSync('supabase/migrations/20260831135024_bulk_duplicate_sales.sql')) {
  const bulkSales = read('supabase/migrations/20260831135024_bulk_duplicate_sales.sql');
  assert(bulkSales.includes('set quantity=1'), 'Regressão: venda em lote precisa preservar uma cópia de cada carta.');
  assert(bulkSales.includes('DUPLICATE_SALES_PAUSED_DURING_FREE_EVENT'), 'Regressão: venda em lote precisa respeitar bloqueio durante boosters grátis.');
  assert(bulkSales.includes('private.duplicate_sale_coin_value'), 'Regressão: venda em lote deixou de usar a cotação econômica oficial.');
  assert(bulkSales.includes('grant execute on function public.sell_all_duplicate_cards() to authenticated'), 'Regressão de segurança: venda em lote deve ficar restrita a autenticados.');
}

if (existsSync('app/store.tsx') && existsSync('src/services/store.ts')) {
  const storeUi = read('app/store.tsx');
  const storeService = read('src/services/store.ts');
  assert(storeUi.includes('Trainer Shop'), 'Regressão: Trainer Shop perdeu a identidade principal.');
  for (const category of ['profile_frame','profile_background','card_style','deck_style','shop_theme','booster_fx','title','trophy']) {
    assert(storeService.includes(category), `Regressão: Trainer Shop perdeu a categoria ${category}.`);
  }
  assert(storeService.includes("rpc('get_trainer_shop_catalog')"), 'Regressão de performance: Trainer Shop deixou de usar catálogo leve.');
  assert(storeService.includes("rpc('purchase_economy_item'"), 'Regressão: Trainer Shop não está conectada à compra oficial.');
}

if (existsSync('supabase/migrations/20260831135122_trainer_shop_catalog.sql')) {
  const shopDb = read('supabase/migrations/20260831135122_trainer_shop_catalog.sql');
  assert(shopDb.includes("notForDirectSale"), 'Regressão: catálogo pode exibir itens exclusivos de evento/leilão como venda direta.');
  assert(shopDb.includes("luxuryOnly"), 'Regressão: catálogo permanente pode misturar itens exclusivos da rotação de luxo.');
  assert(shopDb.includes('current_luxury_rotation_ids'), 'Regressão: loja de luxo semanal perdeu sua rotação.');
  assert(shopDb.includes('grant execute on function public.get_trainer_shop_catalog() to authenticated'), 'Regressão de segurança: catálogo da loja deve ficar restrito a autenticados.');
}

if (existsSync('app/store.tsx') && existsSync('src/services/store.ts')) {
  const giftStoreUi = read('app/store.tsx');
  const giftStoreService = read('src/services/store.ts');
  assert(giftStoreUi.includes('PRESENTEAR UM AMIGO'), 'Regressão: Trainer Shop perdeu o botão de presentear.');
  assert(giftStoreUi.includes('setGiftItem(item);'), 'Regressão: botão de presentear deve abrir o modal imediatamente.');
  const openGiftSection = giftStoreUi.split('async function openGift')[1]?.split('function closeGift')[0] ?? '';
  assert(openGiftSection.indexOf('setGiftItem(item);') >= 0 && openGiftSection.indexOf('setGiftItem(item);') < openGiftSection.indexOf("if(!catalog?.live&&!catalog?.adminPreview)"), 'Regressão de UX: gate da Economy não pode fazer o botão de presente parecer quebrado.');
  assert(giftStoreUi.includes('giftInlineError'), 'Regressão de UX: erros de presente precisam aparecer dentro do modal.');
  assert(giftStoreUi.includes('DISPONÍVEL APÓS A MIGRAÇÃO 1.0'), 'Regressão de UX: presente bloqueado precisa explicar claramente a fase de liberação.');
  assert(giftStoreUi.includes('Escolha quem vai receber'), 'Regressão: fluxo de presente perdeu o seletor de amigos.');
  assert(giftStoreUi.includes('Escreva um recado'), 'Regressão: fluxo de presente perdeu o recado personalizado.');
  assert(giftStoreUi.includes('maxLength={180}'), 'Regressão: recado de presente perdeu o limite de segurança.');
  assert(giftStoreUi.includes('getMySocial'), 'Regressão: Trainer Shop deixou de carregar a lista real de amigos.');
  assert(giftStoreService.includes("rpc('gift_trainer_store_item'"), 'Regressão: serviço de presentes perdeu a RPC oficial.');
}

if (existsSync('supabase/migrations/20260831141513_trainer_shop_friend_gifts.sql')) {
  const giftsDb = read('supabase/migrations/20260831141513_trainer_shop_friend_gifts.sql');
  assert(giftsDb.includes("f.status='accepted'"), 'Regressão de segurança: presentes devem exigir amizade aceita.');
  assert(giftsDb.includes('GIFT_RECIPIENT_ALREADY_OWNS'), 'Regressão: presente deve proteger o limite de posse do destinatário.');
  assert(giftsDb.includes("'store_gift'"), 'Regressão econômica: compra para presente deve ser registrada como store_gift.');
  assert(giftsDb.includes("'🎁 Você recebeu um presente!'"), 'Regressão: destinatário perdeu a mensagem visual de presente recebido.');
  assert(giftsDb.includes("'giftMessage'"), 'Regressão: notificação do presente perdeu o recado do remetente.');
  assert(giftsDb.includes("char_length(message)<=180"), 'Regressão de segurança: recado no banco perdeu limite de 180 caracteres.');
  assert(giftsDb.includes('grant execute on function public.gift_trainer_store_item(text,uuid,text) to authenticated'), 'Regressão de segurança: RPC de presentes deve ser apenas para autenticados.');
  assert(giftsDb.includes('revoke execute on function public.gift_trainer_store_item(text,uuid,text) from public,anon'), 'Regressão de segurança: RPC de presentes não pode ser anônima.');
}

if (existsSync('src/services/notifications.ts') && existsSync('app/_layout.tsx')) {
  const giftNotifications = read('src/services/notifications.ts');
  const rootLayout = read('app/_layout.tsx');
  assert(giftNotifications.includes("'/store'"), 'Regressão: notificação de presente não consegue abrir a Trainer Shop.');
  assert(giftNotifications.includes("type.includes('gift')"), 'Regressão: roteador não reconhece notificações de presente.');
  assert(rootLayout.includes("liveNotification.type === 'store_gift'"), 'Regressão: presente recebido deixou de aparecer como aviso especial na tela.');
  assert(rootLayout.includes('giftNotificationEmoji'), 'Regressão visual: aviso de presente perdeu sua identidade especial.');
  assert(rootLayout.includes("notification?.type === 'store_gift' ? 11000 : 6000"), 'Regressão: presente recebido deve permanecer mais tempo visível.');
}

if (existsSync('supabase/migrations/20260831141844_trainer_shop_gift_reset_guard.sql')) {
  const giftReset = read('supabase/migrations/20260831141844_trainer_shop_gift_reset_guard.sql');
  assert(giftReset.includes("delete from public.notifications where type='store_gift'"), 'Regressão do reset: notificações Beta de presentes não são limpas.');
  assert(giftReset.includes('delete from public.trainer_store_gifts'), 'Regressão do reset: presentes Beta não são limpos.');
}

if (existsSync('app/(tabs)/packs.tsx')) {
  const packsPerf = read('app/(tabs)/packs.tsx');
  assert(!packsPerf.includes('getMyProfile'), 'Regressão de performance: Packs voltou a buscar perfil redundante.');
  assert(packsPerf.includes('const coins = wallet.coins'), 'Regressão de performance: Packs deixou de reutilizar WalletProvider.');
}

if (existsSync('supabase/migrations/20260831132415_home_dashboard_fast_path.sql')) {
  const homeDb = read('supabase/migrations/20260831132415_home_dashboard_fast_path.sql');
  assert(homeDb.includes('get_home_dashboard'), 'Regressão de performance: RPC compacta da Home ausente.');
  assert(homeDb.includes('grant execute on function public.get_home_dashboard() to authenticated'), 'Regressão de segurança: dashboard deve continuar restrito a autenticados.');
}

if (existsSync('supabase/migrations/20260831133329_profile_stats_fast_path_v2.sql')) {
  const profileDb = read('supabase/migrations/20260831133329_profile_stats_fast_path_v2.sql');
  assert(profileDb.includes('get_my_profile_stats_fast'), 'Regressão de performance: perfil perdeu a RPC compacta de estatísticas.');
  assert(profileDb.includes('mostValuableMarketCard'), 'Regressão: perfil compacto perdeu a carta mais valiosa de mercado.');
  assert(profileDb.includes('grant execute on function public.get_my_profile_stats_fast() to authenticated'), 'Regressão de segurança: stats de perfil devem continuar restritas a autenticados.');
}

if (existsSync('supabase/migrations/20260831133803_profile_stats_compact_payload.sql')) {
  const compactProfile = read('supabase/migrations/20260831133803_profile_stats_compact_payload.sql');
  assert(!compactProfile.includes("'tcg_data'"), 'Regressão de performance: resumo do perfil não deve carregar tcg_data completo das cartas.');
  assert(compactProfile.includes("'image_small'"), 'Regressão: resumo compacto precisa manter a imagem do card mais valioso.');
}

if (existsSync('src/services/player.ts')) {
  const playerService = read('src/services/player.ts');
  const profileStats = playerService.split('export async function getMyProfileStats')[1]?.split('\n}')[0] ?? '';
  assert(profileStats.includes("rpc('get_my_profile_stats_fast')"), 'Regressão de performance: perfil voltou a baixar a Bag inteira para calcular estatísticas.');
  assert(!profileStats.includes('getMyBag()'), 'Regressão de performance: getMyProfileStats voltou ao scan completo da Bag no cliente.');
}

if (existsSync('app/(tabs)/profile.tsx')) {
  const profileUi = read('app/(tabs)/profile.tsx');
  assert(profileUi.includes('getMyFriendCount'), 'Regressão de performance: perfil voltou a baixar o grafo social completo só para contar amigos.');
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

if (existsSync('app/economy.tsx') && existsSync('src/services/economy.ts')) {
  const economyScreen = read('app/economy.tsx');
  const economyService = read('src/services/economy.ts');
  assert(economyScreen.includes('AuraBanner'), 'Regressão visual: Economy 2.1 perdeu banners de aura animada.');
  assert(economyScreen.includes('GuildHeadquartersShowcase'), 'Regressão visual: evolução da sede da guilda deixou de aparecer na Economy 2.1.');
  assert(economyScreen.includes('GlobalProjectVisual'), 'Regressão visual: construção global deixou de evoluir visualmente.');
  assert(economyScreen.includes('StorePreview'), 'Regressão visual: Loja premium perdeu a prévia dos cosméticos.');
  assert(economyScreen.includes('auctionPedestal'), 'Regressão visual: leilão oficial perdeu o pedestal premium.');
  assert(economyScreen.includes('Prestígio de Trainer'), 'Regressão: hub da Economy 2.1 perdeu o Prestígio de Trainer.');
  assert(economyScreen.includes('Loja semanal de luxo'), 'Regressão: hub da Economy 2.1 perdeu a Loja semanal de luxo.');
  assert(economyScreen.includes('Museu da Coleção'), 'Regressão: hub da Economy 2.1 perdeu o Museu da Coleção.');
  assert(economyScreen.includes('Tesouro e Projetos da Guilda'), 'Regressão: hub da Economy 2.1 perdeu projetos de guilda.');
  assert(economyScreen.includes('Construção Global'), 'Regressão: hub da Economy 2.1 perdeu o projeto global.');
  assert(economyScreen.includes('Leilão oficial'), 'Regressão: hub da Economy 2.1 perdeu o leilão oficial.');
  assert(economyService.includes("ECONOMY_V2_NOT_LIVE"), 'Regressão: cliente não explica o bloqueio pré-reset da Economy 2.1.');
  assert(economyService.includes("purchase_economy_item"), 'Regressão: compra atômica da Economy 2.1 não está conectada.');
  assert(economyService.includes("contribute_guild_project"), 'Regressão: contribuição de guilda não está conectada.');
  assert(economyService.includes("place_economy_auction_bid"), 'Regressão: leilão oficial não está conectado.');
}

if (existsSync('supabase/migrations/20260831031133_economy_v21_core_sink_actions.sql')) {
  const actions = read('supabase/migrations/20260831031133_economy_v21_core_sink_actions.sql');
  assert(actions.includes('private.spend_player_coins'), 'Regressão: sinks deixaram de usar o débito atômico central.');
  assert(actions.includes('private.economy_v2_actor_allowed'), 'Regressão: compras permanentes podem ignorar o gate da migração 1.0.');
  assert(actions.includes("'trainer_prestige'"), 'Regressão: Prestígio deixou de registrar burn permanente.');
  assert(actions.includes("'museum_upgrade'"), 'Regressão: Museu deixou de registrar burn permanente.');
  assert(actions.includes("'market_listing_boost'"), 'Regressão: boost do Marketplace deixou de registrar burn permanente.');
}

if (existsSync('supabase/migrations/20260831031221_economy_v21_luxury_auctions.sql')) {
  const auctions = read('supabase/migrations/20260831031221_economy_v21_luxury_auctions.sql');
  assert(auctions.includes('coins=coins+v_auction.highest_bid_coins'), 'Regressão: lance superado precisa ser devolvido integralmente.');
  assert(auctions.includes("'luxury_auction'"), 'Regressão: somente o lance vencedor deve ser registrado como sink de leilão.');
  assert(auctions.includes("status='settled'"), 'Regressão: encerramento do leilão oficial não liquida o vencedor.');
}

if (existsSync('supabase/migrations/20260831031343_economy_v21_reset_asset_laundering_guard.sql')) {
  const resetGuard = read('supabase/migrations/20260831031343_economy_v21_reset_asset_laundering_guard.sql');
  assert(resetGuard.includes('delete from public.player_economy_items'), 'Regressão: reset pode deixar ativos permanentes comprados com Coins do Beta.');
  assert(resetGuard.includes('delete from public.player_prestige'), 'Regressão: Prestígio de teste pode sobreviver ao reset 1.0.');
  assert(resetGuard.includes('delete from public.guild_project_contributions'), 'Regressão: contribuições de guilda do Beta podem sobreviver ao reset.');
  assert(resetGuard.includes('delete from public.economy_global_project_contributions'), 'Regressão: contribuições globais do Beta podem sobreviver ao reset.');
}

if (existsSync('supabase/migrations/20260831031322_economy_v21_sink_hub_gym_and_health.sql')) {
  const health = read('supabase/migrations/20260831031322_economy_v21_sink_hub_gym_and_health.sql');
  assert(health.includes('soft_cap_enabled boolean not null default false'), 'Regressão: soft cap deve nascer DESATIVADO.');
  assert(health.includes("'permanentSinks'"), 'Regressão: painel Admin deixou de medir os sinks permanentes.');
  assert(health.includes("'coinsPerActivePlayer'"), 'Regressão: diagnóstico econômico perdeu a concentração média de Coins.');
}

if (existsSync('supabase/migrations/20260831031407_economy_v21_adaptive_advisor.sql')) {
  const advisor = read('supabase/migrations/20260831031407_economy_v21_adaptive_advisor.sql');
  assert(advisor.includes("'soft_cap_review'"), 'Regressão: advisor deixou de sinalizar cenário extremo de inflação.');
  assert(advisor.includes('continua DESATIVADO'), 'Regressão: advisor não deixa explícito que o soft cap é somente recomendação.');
}

if (existsSync('supabase/migrations/20260831031803_economy_v21_premium_market_themes.sql')) {
  const market = read('supabase/migrations/20260831031803_economy_v21_premium_market_themes.sql');
  assert(market.includes('PREMIUM_SHOP_THEME_LOCKED'), 'Regressão: Marketplace pode equipar tema premium sem posse.');
}

if (existsSync('supabase/migrations/20260831032715_economy_v21_allow_gym_cosmetic_events.sql')) {
  const gymEvents = read('supabase/migrations/20260831032715_economy_v21_allow_gym_cosmetic_events.sql');
  assert(gymEvents.includes("'cosmetic'"), 'Regressão: evento visual do ginásio não está permitido pela constraint.');
}

if (existsSync('supabase/migrations/20260831035207_economy_v21_revoke_anon_rpc_execute.sql')) {
  const security = read('supabase/migrations/20260831035207_economy_v21_revoke_anon_rpc_execute.sql');
  assert(security.includes('from public, anon'), 'Regressão: RPCs SECURITY DEFINER da Economy 2.1 podem voltar a ficar acessíveis para anônimos.');
  assert(security.includes('grant execute on function public.purchase_economy_item(text) to authenticated'), 'Regressão: compra Economy 2.1 precisa continuar disponível somente após autenticação.');
}

if (existsSync('supabase/migrations/20260831035416_economy_v21_performance_hardening.sql')) {
  const perf = read('supabase/migrations/20260831035416_economy_v21_performance_hardening.sql');
  assert(perf.includes('(select auth.uid())'), 'Regressão: policies da Economy 2.1 voltaram a reavaliar auth.uid() linha por linha.');
  assert(perf.includes('economy_auctions_highest_bidder_idx'), 'Regressão: leilões perderam índice de highest bidder.');
  assert(perf.includes('player_economy_items_item_idx'), 'Regressão: inventário econômico perdeu índice por item.');
}

if (existsSync('app/guild-wars.tsx')) {
  const wars = read('app/guild-wars.tsx');
  assert(wars.includes('onFlare={(flare) => onFlare(gym, flare)}'), 'Regressão: cards de ginásio perderam o handler de cosmético.');
  assert(wars.includes('AuraFrame'), 'Regressão visual: flare de ginásio perdeu a aura animada.');
  assert(wars.includes('if (!picker || bagLoaded) return;'), 'Regressão: picker de Pokémon pode voltar ao loop infinito de loading.');
  assert(!wars.includes('[picker, bagCards.length, bagLoading]'), 'Regressão: bagLoading não pode voltar a cancelar a própria requisição do picker.');
}

if (existsSync('src/components/AuraBanner.tsx')) {
  const aura = read('src/components/AuraBanner.tsx');
  assert(aura.includes('Animated.loop'), 'Regressão visual: aura de banner deixou de ter fluxo contínuo.');
  assert(aura.includes('AccessibilityInfo.isReduceMotionEnabled'), 'Regressão de acessibilidade: aura não respeita redução de movimento.');
  assert(aura.includes('flowTop') && aura.includes('flowBottom'), 'Regressão visual: fluxos de energia das bordas do banner desapareceram.');
}

if (existsSync('src/components/GuildHeadquartersShowcase.tsx')) {
  const hq = read('src/components/GuildHeadquartersShowcase.tsx');
  for (const landmark of ['Centro Pokémon','Hall da Fama','Estátua Lendária','Liga da Guilda','Sede Master']) {
    assert(hq.includes(landmark), `Regressão visual: sede perdeu a etapa ${landmark}.`);
  }
}

if (existsSync('app/player/[id].tsx')) {
  const profile = read('app/player/[id].tsx');
  assert(profile.includes('Sala de Troféus'), 'Regressão visual: perfil público perdeu a Sala de Troféus.');
  assert(profile.includes('AuraBanner'), 'Regressão visual: Prestígio público perdeu a aura.');
}

if (existsSync('app/marketplace.tsx')) {
  const marketUi = read('app/marketplace.tsx');
  assert(marketUi.includes('shopPreview'), 'Regressão visual: Marketplace perdeu a prévia do tema da loja.');
  assert(marketUi.includes('AuraBanner'), 'Regressão visual: Marketplace perdeu o banner premium.');
  assert(marketUi.includes('AuraFrame'), 'Regressão visual: anúncios deixaram de usar aura dinâmica.');
}

if (existsSync('app/card/[id].tsx')) {
  const cardDetail = read('app/card/[id].tsx');
  assert(cardDetail.includes('AuraFrame'), 'Regressão visual: personalização premium de carta perdeu a aura.');
}

if (existsSync('app/decks.tsx')) {
  const decks = read('app/decks.tsx');
  assert(decks.includes('AuraFrame'), 'Regressão visual: estilos premium de deck perderam a aura.');
}

if (existsSync('src/components/CompactTrainerBanner.tsx')) {
  const compactIdentity = read('src/components/CompactTrainerBanner.tsx');
  assert(compactIdentity.includes('CompactTrainerBanner'), 'Regressão de identidade: banner compacto premium foi removido.');
  for (const theme of ['galaxy','master','crimson','champion','indigo']) {
    assert(compactIdentity.includes(`key.includes('${theme}')`) || compactIdentity.includes(`frame.includes('${theme}')`), `Regressão de identidade: banner compacto perdeu o tema ${theme}.`);
  }
  assert(!compactIdentity.includes('Animated.loop'), 'Regressão de performance: banners de ranking não devem criar loops Animated por jogador.');
  assert(compactIdentity.includes('railTop') && compactIdentity.includes('railBottom'), 'Regressão visual: banner compacto perdeu trilhos de energia.');
}

if (existsSync('src/services/player.ts')) {
  const playerIdentity = read('src/services/player.ts');
  assert(playerIdentity.includes('equipped_frame_id,equipped_background_id,equipped_economy_title_id'), 'Regressão de identidade: mapa de avatares não carrega cosméticos equipados.');
  assert(playerIdentity.includes('frameId:'), 'Regressão de identidade: metadados de avatar perderam frameId.');
}

if (existsSync('app/collection-ranking.tsx')) {
  const collectionIdentity = read('app/collection-ranking.tsx');
  assert(collectionIdentity.includes('CompactTrainerBanner'), 'Regressão de identidade: ranking de coleções perdeu banners dos jogadores.');
  assert(collectionIdentity.includes('identityMeta?.frameId'), 'Regressão de identidade: ranking de coleções não usa a moldura equipada.');
}

if (existsSync('app/(tabs)/battles.tsx')) {
  const battleIdentity = read('app/(tabs)/battles.tsx');
  assert(battleIdentity.includes('CompactTrainerBanner'), 'Regressão de identidade: Battle Arena perdeu banners premium.');
  assert(battleIdentity.includes('frameId={player.equipped_frame_id}'), 'Regressão de identidade: ranking ranqueado não usa moldura equipada.');
  assert(battleIdentity.includes('frameId={friend.equipped_frame_id}'), 'Regressão de identidade: cards de amigos na Battle Arena perderam a moldura.');
  assert(battleIdentity.includes('frameId={challenger?.equipped_frame_id}'), 'Regressão de identidade: convites de batalha perderam o banner do desafiante.');
}

if (existsSync('app/friends.tsx')) {
  const friendsIdentity = read('app/friends.tsx');
  assert(friendsIdentity.includes('CompactTrainerBanner'), 'Regressão de identidade: lista de amigos perdeu banners premium.');
  assert(friendsIdentity.includes('player.equipped_frame_id'), 'Regressão de identidade: lista de amigos não usa moldura equipada.');
}

if (existsSync('app/guilds.tsx')) {
  const guildIdentity = read('app/guilds.tsx');
  assert(guildIdentity.includes('CompactTrainerBanner'), 'Regressão de identidade: membros de guilda perderam banners premium.');
  assert(guildIdentity.includes('frameId={identity?.frameId}'), 'Regressão de identidade: membro da guilda não usa moldura equipada.');
}

if (existsSync('app/battle/[id].tsx')) {
  const activeBattleIdentity = read('app/battle/[id].tsx');
  assert(activeBattleIdentity.includes('CompactTrainerBanner'), 'Regressão de identidade: batalha ativa perdeu banners dos jogadores.');
  assert(activeBattleIdentity.includes('equipped_frame_id,equipped_background_id'), 'Regressão de identidade: batalha ativa não carrega os cosméticos dos jogadores.');
}

if (existsSync('src/components/PremiumProfileFrame.tsx')) {
  const premiumFrame = read('src/components/PremiumProfileFrame.tsx');
  for (const theme of ['indigo','champion','crimson','master','galaxy']) {
    assert(premiumFrame.includes(`theme: '${theme}'`), `Regressão visual: moldura premium perdeu o preset ${theme}.`);
  }
  assert(premiumFrame.includes('energyRail'), 'Regressão visual: molduras premium perderam o fluxo de energia.');
  assert(premiumFrame.includes('shine'), 'Regressão visual: molduras premium perderam o reflexo de luxo.');
  assert(premiumFrame.includes('cornerGem'), 'Regressão visual: molduras premium perderam os cristais de canto.');
  assert(premiumFrame.includes('GalaxyFlowOverlay'), 'Regressão visual: Galaxy Flow perdeu a nebulosa integrada à moldura.');
  assert(premiumFrame.includes('AccessibilityInfo.isReduceMotionEnabled'), 'Regressão de acessibilidade: molduras premium não respeitam redução de movimento.');
}

if (existsSync('app/(tabs)/profile.tsx')) {
  const profileFrameUi = read('app/(tabs)/profile.tsx');
  assert(profileFrameUi.includes('PremiumProfileFrame'), 'Regressão visual: perfil próprio deixou de renderizar moldura premium.');
}

if (existsSync('app/player/[id].tsx')) {
  const publicFrameUi = read('app/player/[id].tsx');
  assert(publicFrameUi.includes('PremiumProfileFrame'), 'Regressão visual: perfil público deixou de exibir molduras premium.');
}

if (existsSync('app/cosmetics.tsx') && existsSync('app/store.tsx')) {
  const cosmeticsFrames = read('app/cosmetics.tsx');
  const storeFrames = read('app/store.tsx');
  assert(cosmeticsFrames.includes('PremiumProfileFrame'), 'Regressão visual: tela de cosméticos perdeu preview premium das molduras.');
  assert(storeFrames.includes('PremiumProfileFrame'), 'Regressão visual: Trainer Shop perdeu preview premium das molduras.');
}

if (existsSync('src/components/GalaxyFlowOverlay.tsx')) {
  const galaxy = read('src/components/GalaxyFlowOverlay.tsx');
  assert(galaxy.includes('GalaxyFlowOverlay'), 'Regressão visual: overlay Galaxy Flow foi removido.');
  assert(galaxy.includes('#8B5CFF') && galaxy.includes('#55E6FF'), 'Regressão visual: paleta cósmica Galaxy Flow foi alterada.');
  assert(galaxy.includes('AccessibilityInfo.isReduceMotionEnabled'), 'Regressão de acessibilidade: Galaxy Flow não respeita redução de movimento.');
  assert(galaxy.includes('flowRibbon') && galaxy.includes('orbit'), 'Regressão visual: Galaxy Flow perdeu órbitas ou correntes cósmicas.');
}

if (existsSync('supabase/migrations/20260831121232_economy_v21_galaxy_flow_collection.sql')) {
  const galaxyDb = read('supabase/migrations/20260831121232_economy_v21_galaxy_flow_collection.sql');
  for (const item of [
    'galaxy_frame_flow',
    'galaxy_bg_nebula',
    'galaxy_card_flow',
    'galaxy_deck_flow',
    'galaxy_shop_flow',
    'galaxy_fx_supernova',
    'galaxy_title_cosmic',
  ]) {
    assert(galaxyDb.includes(item), `Regressão Galaxy Flow: item ausente ${item}.`);
  }
  assert(galaxyDb.includes("'galaxy'::text"), 'Regressão Galaxy Flow: Marketplace perdeu o tema galaxy na constraint.');
  assert(galaxyDb.includes("when 'galaxy' then"), 'Regressão Galaxy Flow: ginásio perdeu o flare galáctico.');
  assert(galaxyDb.includes('750000'), 'Regressão Galaxy Flow: custo do flare de ginásio foi removido.');
}

if (existsSync('src/components/PackOpeningModal.tsx')) {
  const opening = read('src/components/PackOpeningModal.tsx');
  assert(opening.includes('isGalaxyBoosterFx'), 'Regressão Galaxy Flow: abertura de booster não detecta efeito galáctico.');
  assert(opening.includes('GalaxyFlowOverlay'), 'Regressão Galaxy Flow: booster perdeu nebulosa animada.');
  assert(opening.includes('galaxyPortalOuter'), 'Regressão Galaxy Flow: booster perdeu portal cósmico.');
}

if (existsSync('app/cosmetics.tsx')) {
  const cosmetics = read('app/cosmetics.tsx');
  assert(cosmetics.includes('GALAXY FLOW'), 'Regressão Galaxy Flow: tela de cosméticos não identifica a linha galáctica.');
  assert(cosmetics.includes("variant={galaxy?'galaxy':'energy'}"), 'Regressão Galaxy Flow: cosméticos galácticos perderam aura cósmica.');
}

if (existsSync('app/economy.tsx')) {
  const economyGalaxy = read('app/economy.tsx');
  assert(economyGalaxy.includes('Coleção Galaxy Flow'), 'Regressão Galaxy Flow: coleção dedicada sumiu da Economy 2.1.');
  assert(economyGalaxy.includes('GALAXY FLOW COLLECTION'), 'Regressão Galaxy Flow: banner da coleção sumiu.');
}

if (existsSync('app/marketplace.tsx')) {
  const marketGalaxy = read('app/marketplace.tsx');
  assert(marketGalaxy.includes("id:'galaxy'"), 'Regressão Galaxy Flow: tema Galaxy Market sumiu da UI.');
  assert(marketGalaxy.includes("shopTheme==='galaxy'"), 'Regressão Galaxy Flow: loja não ativa o fluxo de galáxia.');
}

if (existsSync('app/guild-wars.tsx')) {
  const gymGalaxy = read('app/guild-wars.tsx');
  assert(gymGalaxy.includes("'galaxy','GALAXY','750K'"), 'Regressão Galaxy Flow: botão do flare galáctico sumiu.');
  assert(gymGalaxy.includes("variant={gym.flareKey==='galaxy'?'galaxy':'energy'}"), 'Regressão Galaxy Flow: ginásio não usa aura galáctica.');
}

if (existsSync('app/card/[id].tsx')) {
  const cardGalaxy = read('app/card/[id].tsx');
  assert(cardGalaxy.includes('galaxyStyle'), 'Regressão Galaxy Flow: carta personalizada não detecta estilo galáctico.');
  assert(cardGalaxy.includes("variant={galaxyStyle?'galaxy':'energy'}"), 'Regressão Galaxy Flow: carta perdeu fluxo de galáxia.');
}

if (existsSync('app/decks.tsx')) {
  const deckGalaxy = read('app/decks.tsx');
  assert(deckGalaxy.includes('galaxyDeck'), 'Regressão Galaxy Flow: deck não detecta estilo galáctico.');
  assert(deckGalaxy.includes("variant={galaxyDeck?'galaxy':'energy'}"), 'Regressão Galaxy Flow: deck perdeu fluxo de galáxia.');
}

if (existsSync('app/(tabs)/packs.tsx')) {
  const packs = read('app/(tabs)/packs.tsx');
  assert(packs.includes('removeClippedSubviews={false}'), 'Regressão: clipping Android pode voltar a causar jitter na rolagem de Packs.');
  assert(packs.includes('overScrollMode="never"'), 'Regressão: overscroll Android voltou a ficar livre na lista de Packs.');
}

if (failures.length) {
  console.error('\n❌ Auditoria de regressão falhou:');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}

console.log('✅ Auditoria de regressão passou.');
console.log('   Batalha, performance, Home, guilda, QR, Legado, Economy 2.1, reset, ginásios, Packs, Admin Abuse, atualização obrigatória e PWA permanecem protegidos.');
