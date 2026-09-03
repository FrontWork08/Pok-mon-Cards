import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
// Battle-rule hardening migrations are part of the release regression contract.
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const requiredFiles = [
  'supabase/migrations/20260901180938_battle_rules_v6_exhaustive_catalog_resolution.sql',
  'supabase/migrations/20260902111731_battle_rules_future_quarantine_and_regressions.sql',
  'supabase/migrations/20260902115736_fix_bot_timeout_and_diversify_ranked_ai.sql',
  'supabase/migrations/20260902120727_fix_restricted_entry_battle_cards.sql',
  'supabase/migrations/20260902122117_guard_elo_to_ranked_battles_only.sql',
  'supabase/migrations/20260902122420_guard_forfeit_elo_to_ranked_battles.sql',
  'supabase/migrations/20260902134744_draft3_manual_attack_selection.sql',
  'supabase/migrations/20260902145620_make_owned_cosmetic_application_free.sql',
  'supabase/migrations/20260902145710_zero_cosmetic_application_metadata.sql',
  'supabase/migrations/20260902150615_neutralize_bot_elo_after_daily_limit.sql',
  'supabase/migrations/20260902185822_expose_locked_battle_fighters_for_pixel_arena.sql',
  'src/components/PixelBattleArena.tsx',
  'src/components/PokemonTypeSymbolFilter.tsx',
  'supabase/migrations/20260901135056_battle_rules_v5_official_tcg_virtual_energy.sql',
  'supabase/migrations/20260901131651_cap_coin_packs_at_25k.sql',
  'supabase/migrations/20260901120813_lower_coin_pack_prices_further.sql',
  'supabase/migrations/20260901115912_lower_coin_packs_more_and_optimize_bulk_duplicate_sales.sql',
  'supabase/migrations/20260901115248_lower_coin_pack_prices.sql',
  'supabase/migrations/20260831202010_booster_quality_pull_boost.sql',
  'supabase/migrations/20260831201910_booster_luck_small_raise.sql',
  'supabase/migrations/20260831183747_bag_card_theme_preview.sql',
  'supabase/migrations/20260831171936_universal_visual_themes.sql',
  'src/components/MarketplaceListingSurface.tsx',
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
  'supabase/functions/battle-action/index.ts',
  'src/services/battles.ts',
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


if (existsSync('app/deck/[id].tsx')) {
  const deckEditor = read('app/deck/[id].tsx');
  assert(deckEditor.includes('styles.saveDock'), 'Regressão de UX: salvar deck deixou de ficar fixo e voltou para o fim da lista.');
  assert(deckEditor.includes('SALVAR DECK'), 'Regressão de UX: botão fixo de salvar deck foi removido.');
  assert(deckEditor.includes("position: 'absolute'") && deckEditor.includes('saveDockInner'), 'Regressão de UX: barra fixa de salvar deck perdeu o posicionamento persistente.');
  const deckFooter = deckEditor.split('const footer = (')[1]?.split('return (')[0] ?? '';
  assert(!deckFooter.includes('SALVAR DECK'), 'Regressão de UX: salvar deck voltou a depender de rolar até o ListFooterComponent.');
  assert(deckEditor.includes('PokemonTypeSymbolFilter'), 'Regressão de UX: editor de deck deixou de usar símbolos de tipo.');
}

if (existsSync('app/battle/[id].tsx')) {
  const battle = read('app/battle/[id].tsx');
  assert(battle.includes('forfeitBattle'), 'Regressão: tela de batalha perdeu a desistência.');
  assert(battle.includes('ratingNeutral'), 'Regressão: UI perdeu indicação de desistência neutra antes da seleção.');
  assert(battle.includes('loadBattleState'), 'Regressão de performance: batalha perdeu o carregamento dinâmico separado.');
  assert(battle.includes('loadStaticBattleResources'), 'Regressão de performance: recursos estáticos da batalha não estão separados.');
  assert(battle.includes('realtimeRefreshTimer'), 'Regressão de performance: eventos realtime da batalha perderam o coalescing.');
  assert(!battle.includes('setInterval(tick, 250)'), 'Regressão de performance: cronômetro da batalha voltou a renderizar 4x por segundo.');
  assert(battle.includes('Regra v6 TCG'), 'Regressão de batalha: UI deixou de informar as regras TCG v6.');
  assert(!battle.includes('Regra v5 TCG'), 'Regressão de batalha: UI voltou a anunciar a v5 como regra ativa.');
  assert(!battle.includes('Regra v4: vence quem consegue o nocaute mais rápido'), 'Regressão de batalha: UI voltou a anunciar a fórmula antiga v4 como regra ativa.');
  assert(battle.includes('virtualEnergy'), 'Regressão de batalha: histórico deixou de renderizar o estado de Energia virtual da v6.');
  assert(battle.includes('temporariamente bloqueada na rankeada'), 'Regressão de UX: carta em quarentena perdeu a mensagem amigável na batalha.');
  assert(battle.includes("timeoutRound.current = '';"), 'Regressão de batalha: tempo 0 perdeu o retry seguro após diferença de relógio.');
  assert(battle.includes('setTimeout(resolve, 350)'), 'Regressão de batalha: retry do timeout voltou a ser imediato e pode travar no 0.');
  assert(battle.includes('ESCOLHA DE ATAQUE'), 'Regressão Draft 3: tela perdeu a fase manual de escolha de ataque.');
  assert(battle.includes('USAR ESTE ATAQUE'), 'Regressão Draft 3: botão de confirmação de ataque foi removido.');
  assert(battle.includes('Energia virtual começa em 0 e sobe +1 por turno'), 'Regressão Draft 3: UI deixou de explicar o custo de Energia do ataque manual.');
  assert(battle.includes("battle?.status === 'revealing'"), 'Regressão Draft 3: tela deixou de reconhecer a fase revealing de ataque.');
  assert(battle.includes('PixelBattleArena'), 'Regressão de UX: Draft 3 perdeu a arena 2D experimental.');
  assert(battle.includes('arenaResultRound'), 'Regressão de UX: arena 2D deixou de exibir a animação após resolver a rodada.');
  assert(battle.includes('opponentPokedexNumber'), 'Regressão de UX: arena 2D perdeu o sprite do Pokémon rival.');
  assert(battle.includes('enableCombatSort') && battle.includes('enableTypeFilter'), 'Regressão de UX: batalha deixou de ativar filtros TCG de ataque/defesa/tipo.');
  assert(battle.includes('sourceOptions={drafting') && battle.includes('onSourceChange={setSourceDeck}'), 'Regressão Draft 3: seletor deixou de permitir escolher deck como fonte.');
  assert(battle.includes('standardPickerBag.filter'), 'Regressão Draft 3: deck escolhido voltou a ser ignorado durante o draft público.');
  assert(battle.includes('DraftCardPreviewModal') && battle.includes('TOQUE PARA AMPLIAR'), 'Regressão Draft 3: carta pública do rival deixou de abrir visualização ampliada.');
  assert(battle.includes('HP / DEFESA') && battle.includes('MAIOR ATAQUE') && battle.includes('ATAQUES'), 'Regressão Draft 3: visualização ampliada perdeu características de batalha.');
  const stateLoader = battle.split('const loadBattleState')[1]?.split('const loadStaticBattleResources')[0] ?? '';
  assert(!stateLoader.includes('getMyBag()') && !stateLoader.includes('getMyDecks()'), 'Regressão de performance: realtime da batalha voltou a baixar Bag/Decks completos.');
}

if (existsSync('supabase/migrations/20260901135056_battle_rules_v5_official_tcg_virtual_energy.sql')) {
  const battleV5 = read('supabase/migrations/20260901135056_battle_rules_v5_official_tcg_virtual_energy.sql');
  assert(battleV5.includes('private.battle_v5_hash_roll'), 'Regressão v5: sorteios determinísticos do duelo TCG foram removidos.');
  assert(battleV5.includes('private.battle_v5_attack_plan'), 'Regressão v5: planejador de ataques TCG foi removido.');
  assert(battleV5.includes('private.battle_simulate_duel_v5'), 'Regressão v5: simulador por turnos foi removido.');
  assert(battleV5.includes("'engine','official_tcg_virtual_energy'"), 'Regressão v5: motor deixou de registrar Energia virtual oficial.');
  assert(battleV5.includes("'first_player_no_attack'"), 'Regressão v5: primeiro jogador voltou a poder atacar no primeiro turno.');
  assert(battleV5.includes('c_energy:=least(12,c_energy+1)') && battleV5.includes('o_energy:=least(12,o_energy+1)'), 'Regressão v5: Energia virtual deixou de ser anexada uma vez por turno.');
  assert(battleV5.includes("'energy_discard_bonus'") && battleV5.includes("'coin_multiplier'") && battleV5.includes("'virtual_hand_energy_multiplier'"), 'Regressão v5: dano +/× e descarte de Energia perderam suporte.');
  assert(battleV5.includes("'cooldown_skip'") && battleV5.includes("'paralyzed_skip'") && battleV5.includes('c_poison') && battleV5.includes('c_burn'), 'Regressão v5: recarga ou Condições Especiais perderam suporte.');
  assert(battleV5.includes('remaining hp becomes 10'), 'Regressão v5: habilidades defensivas de sobrevivência deixaram de ser aplicadas.');
  assert(battleV5.includes('rules_version=5'), 'Regressão v5: rodadas novas deixaram de ser marcadas com regra 5.');
  assert(battleV5.includes('v_sim:=private.battle_simulate_duel_v5'), 'Regressão v5: resolver de batalha deixou de usar a simulação TCG.');
  assert(battleV5.includes('revoke all on function public.server_resolve_battle_round(uuid) from public,anon,authenticated'), 'Regressão de segurança v5: resolver interno de batalha não pode ficar exposto ao cliente.');
}


if (existsSync('supabase/migrations/20260901180938_battle_rules_v6_exhaustive_catalog_resolution.sql')) {
  const battleV6 = read('supabase/migrations/20260901180938_battle_rules_v6_exhaustive_catalog_resolution.sql');
  assert(battleV6.includes('private.battle_v6_hash_roll'), 'Regressão v6: sorteios determinísticos foram removidos.');
  assert(battleV6.includes('private.battle_v6_attack_plan'), 'Regressão v6: planejador de ataques foi removido.');
  assert(battleV6.includes('private.battle_simulate_duel_v6'), 'Regressão v6: simulador por turnos foi removido.');
  assert(battleV6.includes('private.battle_v6_defense_adjustment'), 'Regressão v6: Abilities defensivas deixaram de ser resolvidas.');
  assert(battleV6.includes('private.battle_v6_has_victory_star') && battleV6.includes('private.battle_v6_attack_coin_heads'), 'Regressão v6: Victory Star/rerrolagem de moedas perdeu suporte.');
  assert(battleV6.includes('poisonCheckupDamage') && battleV6.includes('selfPoisonCheckupDamage'), 'Regressão v6: Poison reforçado deixou de persistir no Checkup.');
  assert(battleV6.includes('selfNextAttackBonus') && battleV6.includes('bônus por ter sido curado neste turno'), 'Regressão v6: efeitos entre turnos de ataque/cura perderam suporte.');
  assert(battleV6.includes('healDefenderDamage') && battleV6.includes('defenderEnergyDiscardAllCoinCount'), 'Regressão v6: cura bilateral ou descarte condicional de Energia perdeu suporte.');
  assert(battleV6.includes('v_sim:=private.battle_simulate_duel_v6'), 'Regressão v6: resolver deixou de usar a simulação v6.');
  assert(battleV6.includes('rules_version=6'), 'Regressão v6: rodadas novas deixaram de ser marcadas com regra 6.');
  assert(battleV6.includes("'tcg_v6_resolved'"), 'Regressão v6: evento de resolução v6 deixou de ser registrado.');
  assert(battleV6.includes('revoke all on function public.server_resolve_battle_round(uuid) from public,anon,authenticated'), 'Regressão de segurança v6: resolver interno ficou exposto ao cliente.');
  assert(battleV6.includes('grant execute on function public.server_resolve_battle_round(uuid) to service_role'), 'Regressão de segurança v6: service_role perdeu acesso ao resolver interno.');
}


if (existsSync('supabase/migrations/20260902111731_battle_rules_future_quarantine_and_regressions.sql')) {
  const hardening = read('supabase/migrations/20260902111731_battle_rules_future_quarantine_and_regressions.sql');
  assert(hardening.includes('trg_00_audit_card_battle_rules'), 'Regressão v6: auditoria automática de regras novas foi removida.');
  assert(hardening.includes('BATTLE_RULE_REVIEW_REQUIRED'), 'Regressão v6: cartas com regras novas deixaram de ser bloqueadas até revisão.');
  assert(hardening.includes('battle_v6_regression_suite'), 'Regressão v6: suíte de regressão do servidor foi removida.');
  assert(hardening.includes('battle_rule_attack_baseline'), 'Regressão v6: baseline de textos de ataque foi removida.');
  assert(hardening.includes('battle_rule_coverage_issues'), 'Regressão v6: fila de regras complexas pendentes foi removida.');
  assert(hardening.includes('dano textual condicionado a cara'), 'Regressão v6: dano textual condicionado a moeda perdeu a proteção.');
  assert(hardening.includes("v_old := 'if v_base=0 and v_text not like ''%benched pokémon%'' then'"), 'Regressão v6: correção do falso bloqueio por menção ao Banco desapareceu.');
}


if (existsSync('supabase/migrations/20260902115736_fix_bot_timeout_and_diversify_ranked_ai.sql')) {
  const botTimeout = read('supabase/migrations/20260902115736_fix_bot_timeout_and_diversify_ranked_ai.sql');
  assert(botTimeout.includes('private.ranked_bot_take_turn'), 'Regressão de IA: timeout voltou a tratar bot como inventário comum.');
  assert(botTimeout.includes('current_species') && botTimeout.includes('recent_species'), 'Regressão de IA: seleção perdeu diversidade por espécie atual/recente.');
  assert(botTimeout.includes('diverse_pool'), 'Regressão de IA: pool forte diversificado foi removido.');
  assert(botTimeout.includes('autoResolvedSelection'), 'Regressão de batalha: timeout não confirma mais a seleção automática completa.');
}


if (existsSync('supabase/migrations/20260902120727_fix_restricted_entry_battle_cards.sql')) {
  const restrictedEntry = read('supabase/migrations/20260902120727_fix_restricted_entry_battle_cards.sql');
  assert(restrictedEntry.includes('battle_v6_entry_setup_turns'), 'Regressão v6: regra de setup para cartas com entrada restrita foi removida.');
  assert(restrictedEntry.includes('entry_setup_skip'), 'Regressão v6: simulador deixou de consumir o setup de Hero\'s Spirit/Shell Survival.');
  assert(restrictedEntry.includes('palafinEntrySetup'), 'Regressão v6: Palafin ex perdeu o teste específico de Hero\'s Spirit.');
  assert(restrictedEntry.includes('palafinCooldown'), 'Regressão v6: Giga Impact do Palafin perdeu o teste de cooldown.');
  assert(restrictedEntry.includes('shedinjaEntrySetup'), 'Regressão v6: Shedinja perdeu o teste de entrada por Cast-Off Shell.');
  assert(restrictedEntry.includes('v_setup_penalty:=0.88'), 'Regressão de balanceamento: força calculada ignora novamente o custo de setup das cartas restritas.');
}


if (existsSync('supabase/migrations/20260902122117_guard_elo_to_ranked_battles_only.sql')) {
  const eloGuard = read('supabase/migrations/20260902122117_guard_elo_to_ranked_battles_only.sql');
  assert(eloGuard.includes('if v_reward and b.is_ranked then'), 'Regressão de ELO: partida casual voltou a alterar rating.');
}


if (existsSync('supabase/migrations/20260902122420_guard_forfeit_elo_to_ranked_battles.sql')) {
  const forfeitGuard = read('supabase/migrations/20260902122420_guard_forfeit_elo_to_ranked_battles.sql');
  assert(forfeitGuard.includes('if b.is_ranked and v_reward then'), 'Regressão de ELO: desistência casual voltou a alterar rating.');
  assert(forfeitGuard.includes('v_neutral := v_neutral or not b.is_ranked or not v_reward;'), 'Regressão de UX/ELO: desistência sem rating deixou de ser marcada como neutra.');
}


if (existsSync('supabase/migrations/20260902150615_neutralize_bot_elo_after_daily_limit.sql')) {
  const botEloLimit = read('supabase/migrations/20260902150615_neutralize_bot_elo_after_daily_limit.sql');
  assert(botEloLimit.includes('ranked_bot_elo_scale'), 'Regressão de ELO: escala diária contra bots foi removida.');
  assert(botEloLimit.includes('when coalesce(p_prior,0)<6 then 1::numeric'), 'Regressão de ELO: primeiras 6 partidas contra bot perderam escala integral.');
  assert(botEloLimit.includes('when p_prior<12 then .35::numeric'), 'Regressão de ELO: partidas 7–12 contra bot perderam escala de 35%.');
  assert(botEloLimit.includes('else 0::numeric'), 'Regressão de ELO: após o limite diário o bot voltou a ganhar ou tirar pontos.');
  assert(botEloLimit.includes('v_scale:=private.ranked_bot_elo_scale(v_prior);'), 'Regressão de ELO: conclusão contra bot deixou de usar a escala neutra após o limite.');
}


if (existsSync('supabase/migrations/20260902134744_draft3_manual_attack_selection.sql')) {
  const manualDraft = read('supabase/migrations/20260902134744_draft3_manual_attack_selection.sql');
  assert(manualDraft.includes('private.battle_attack_choices'), 'Regressão Draft 3: escolhas privadas de ataque foram removidas.');
  assert(manualDraft.includes('battle_v6_manual_attack_name'), 'Regressão Draft 3: simulador deixou de forçar o ataque escolhido.');
  assert(manualDraft.includes('server_choose_battle_attack'), 'Regressão Draft 3: RPC de escolha manual de ataque foi removida.');
  assert(manualDraft.includes('server_get_battle_attack_state'), 'Regressão Draft 3: estado privado da escolha de ataque foi removido.');
  assert(manualDraft.includes("'attack_selection_started'"), 'Regressão Draft 3: transição carta → ataque foi removida.');
  assert(manualDraft.includes("'manual_attacks_revealed'"), 'Regressão Draft 3: ataques escolhidos deixaram de ser revelados após a rodada.');
  assert(manualDraft.includes("'manualAttackChoice'"), 'Regressão Draft 3: histórico deixou de registrar o ataque manual.');
  assert(manualDraft.includes("'revealing'"), 'Regressão Draft 3: fase de escolha de ataque deixou de existir.');
  assert(manualDraft.includes("'resolveReady'"), 'Regressão Draft 3: timeout deixou de concluir a escolha de ataque.');
  assert(manualDraft.includes("revoke all on function public.server_choose_battle_attack"), 'Regressão de segurança: escolha de ataque ficou exposta diretamente ao cliente.');
}

if (existsSync('src/services/battles.ts')) {
  const battleService = read('src/services/battles.ts');
  assert(battleService.includes("action: 'attack_state'"), 'Regressão Draft 3: serviço perdeu leitura segura do estado de ataque.');
  assert(battleService.includes("action: 'attack'"), 'Regressão Draft 3: serviço perdeu envio da escolha de ataque.');
  assert(battleService.includes("'revealing'"), 'Regressão Draft 3: batalha em escolha de ataque deixou de contar como ativa.');
  assert(battleService.includes('pokedex_numbers'), 'Regressão de arena 2D: histórico deixou de carregar números da Pokédex para sprites.');
}

if (existsSync('supabase/functions/battle-action/index.ts')) {
  const battleAction = read('supabase/functions/battle-action/index.ts');
  assert(battleAction.includes('body.action === "attack_state"'), 'Regressão Draft 3: Edge Function perdeu o estado privado de ataque.');
  assert(battleAction.includes('body.action === "attack"'), 'Regressão Draft 3: Edge Function perdeu a escolha manual de ataque.');
  assert(battleAction.includes('attackSelectionRequired'), 'Regressão Draft 3: Edge Function voltou a resolver antes da escolha do ataque.');
  assert(battleAction.includes('resolveReady'), 'Regressão Draft 3: timeout do Edge Function não respeita mais a fase de ataque.');
}


if (existsSync('src/components/PokemonTypeSymbolFilter.tsx')) {
  const typeFilterUi = read('src/components/PokemonTypeSymbolFilter.tsx');
  assert(typeFilterUi.includes('POKEMON_TYPE_SYMBOLS'), 'Regressão de UX: mapa central de símbolos de tipo foi removido.');
  assert(typeFilterUi.includes("water: { label: 'ÁGUA', icon: 'water'"), 'Regressão de UX: símbolo de Água foi removido.');
  assert(typeFilterUi.includes("fire: { label: 'FOGO', icon: 'flame'"), 'Regressão de UX: símbolo de Fogo foi removido.');
  assert(typeFilterUi.includes("lightning: { label: 'ELÉTRICO', icon: 'flash'"), 'Regressão de UX: símbolo Elétrico foi removido.');
  assert(typeFilterUi.includes('PokemonTypeSymbolFilter'), 'Regressão de UX: componente compartilhado de tipo foi removido.');
}

if (existsSync('app/trade/[id].tsx')) {
  const tradeDetail = read('app/trade/[id].tsx');
  assert(tradeDetail.includes('enableTypeFilter'), 'Regressão de UX: seletor de troca perdeu filtro simbólico por tipo.');
}

if (existsSync('app/legacy-selection.tsx')) {
  const legacySelection = read('app/legacy-selection.tsx');
  assert(legacySelection.includes('enableTypeFilter'), 'Regressão de UX: seletor do Legado perdeu filtro simbólico por tipo.');
  assert(legacySelection.includes('provisionalConfirmed'), 'Regressão do Legado: confirmação voltou a bloquear imediatamente antes do prazo.');
  assert(legacySelection.includes('campaign?.legacy_edit_deadline'), 'Regressão do Legado: tela deixou de respeitar o prazo de edição.');
  assert(legacySelection.includes("submission?.locked_at"), 'Regressão do Legado: tela deixou de diferenciar confirmação provisória de trava final.');
  assert(legacySelection.includes('REVISAR E CONFIRMAR'), 'Regressão de UX: confirmação do Legado voltou a dizer que bloqueia antes do prazo.');
}

if (existsSync('src/services/releaseCampaign.ts')) {
  const releaseCampaignService = read('src/services/releaseCampaign.ts');
  assert(releaseCampaignService.includes('legacy_edit_deadline: string | null'), 'Regressão do Legado: campanha perdeu o prazo explícito de edição.');
  assert(releaseCampaignService.includes("rpc('confirm_my_legacy_selection'"), 'Regressão do Legado: confirmação provisória deixou de usar a RPC protegida.');
  assert(releaseCampaignService.includes('locked_at: string | null'), 'Regressão do Legado: cliente perdeu o estado de trava final.');
  assert(releaseCampaignService.includes('LEGACY_EDIT_DEADLINE_PASSED'), 'Regressão de UX: cliente perdeu a mensagem de prazo encerrado.');
}

if (existsSync('supabase/migrations/20260903023019_legacy_editable_until_day_before_freeze.sql')) {
  const legacyDeadlineDb = read('supabase/migrations/20260903023019_legacy_editable_until_day_before_freeze.sql');
  assert(legacyDeadlineDb.includes("time zone 'America/Sao_Paulo'"), 'Regressão do Legado: prazo deixou de usar o horário de Brasília.');
  assert(legacyDeadlineDb.includes("time '23:59:59.999999'"), 'Regressão do Legado: edição não vai mais até o fim do dia anterior ao freeze.');
  assert(legacyDeadlineDb.includes('private.auto_lock_due_legacy_selections()'), 'Regressão do Legado: confirmação automática no prazo foi removida.');
  assert(legacyDeadlineDb.includes("c.selected_count=v_campaign.legacy_card_limit"), 'Regressão do Legado: 10 cartas salvas sem confirmação não são mais confirmadas automaticamente.');
  assert(legacyDeadlineDb.includes("v_legacy:=private.auto_lock_due_legacy_selections()"), 'Regressão do Legado: background tick deixou de executar a trava automática.');
  assert(legacyDeadlineDb.includes("and sub.locked_at is not null"), 'Regressão do Legado: confirmação provisória voltou a impedir edição antes da trava final.');
  assert(legacyDeadlineDb.includes("perform public.confirm_my_legacy_selection(p_campaign_id)"), 'Regressão do Legado: editar uma seleção já confirmada deixou de manter a confirmação provisória.');
  assert(legacyDeadlineDb.includes("or sub.locked_at is null"), 'Regressão do freeze: submissões provisórias podem chegar ao freeze sem trava final.');
  assert(legacyDeadlineDb.includes("revoke all on function private.auto_lock_due_legacy_selections()"), 'Regressão de segurança: job privado do Legado ficou executável pelo cliente.');
}

if (existsSync('supabase/migrations/20260903023545_harden_provisional_legacy_confirmation.sql')) {
  const legacyConfirmHardening = read('supabase/migrations/20260903023545_harden_provisional_legacy_confirmation.sql');
  assert(legacyConfirmHardening.includes('security invoker'), 'Regressão de segurança: confirmação provisória do Legado voltou a SECURITY DEFINER.');
  assert(legacyConfirmHardening.includes('grant update(selected_count,auto_filled_count,confirmed_at)'), 'Regressão de segurança: atualização provisória do Legado perdeu o grant mínimo por coluna.');
  assert(legacyConfirmHardening.includes('release_campaign_legacy_submissions.locked_at is null'), 'Regressão do Legado: submissão final travada pode voltar a ser alterada.');
  assert(legacyConfirmHardening.includes('LEGACY_EDIT_DEADLINE_PASSED'), 'Regressão do Legado: confirmação deixou de respeitar o prazo final.');
}

if (existsSync('src/components/CardPickerModal.tsx')) {
  const picker = read('src/components/CardPickerModal.tsx');
  assert(picker.includes('Visão geral TCG'), 'Regressão de UX: seletor de batalha deixou de apresentar visão TCG.');
  assert(picker.includes('MAIOR ATQ') && picker.includes('MAIOR HP / DEF'), 'Regressão de UX: seletor de batalha perdeu filtros de maior ataque/defesa.');
  assert(picker.includes('selectedType'), 'Regressão de UX: seletor de batalha perdeu filtro por tipo.');
  assert(picker.includes('PokemonTypeSymbolFilter'), 'Regressão de UX: seletor reutilizado deixou de usar o filtro simbólico compartilhado.');
  assert(picker.includes('FONTE DAS CARTAS') && picker.includes('sourceOptions'), 'Regressão de UX: seletor de batalha perdeu escolha entre Bag e decks.');
  assert(!picker.includes('PWR ${combat.battleRating}'), 'Regressão de UX: seletor voltou a sugerir que PWR decide a batalha.');
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

if (existsSync('supabase/migrations/20260831183747_bag_card_theme_preview.sql')) {
  const bagThemeDb = read('supabase/migrations/20260831183747_bag_card_theme_preview.sql');
  assert(bagThemeDb.includes('player_card_customizations pcc'), 'Regressão: paginação da Bag deixou de carregar temas aplicados às cartas.');
  assert(bagThemeDb.includes("'economyStyle'"), 'Regressão: resposta da Bag perdeu metadados do tema da carta.');
  assert(bagThemeDb.includes("style_metadata->>'effect'"), 'Regressão: Bag não identifica mais Galaxy Flow e outros efeitos.');
}

if (existsSync('app/(tabs)/bag.tsx')) {
  const bagUi = read('app/(tabs)/bag.tsx');
  assert(bagUi.includes('AuraFrame'), 'Regressão visual: cartas personalizadas da Bag perderam a moldura temática.');
  assert(bagUi.includes('entry.economyStyle'), 'Regressão visual: Bag não usa mais o tema salvo por carta.');
  assert(bagUi.includes('themeTag'), 'Regressão de UX: Bag deixou de identificar o nome do tema aplicado.');
  assert(bagUi.includes('PokemonTypeSymbolFilter'), 'Regressão de UX: Bag deixou de usar o filtro simbólico compartilhado.');
  assert(bagUi.includes('imageThemeTint') && bagUi.includes('imageThemeStroke'), 'Regressão visual: tema deixou de cobrir a imagem da carta na Bag.');
  assert(bagUi.includes("variant={galaxy?'galaxy':'energy'}"), 'Regressão visual: Galaxy Flow da Bag perdeu o efeito cósmico.');
  assert(bagUi.includes('cardThemed:{marginBottom:0}'), 'Regressão visual: cards temáticos voltaram a quebrar o espaçamento da grade.');
}

if (existsSync('app/sell-duplicates.tsx') && existsSync('src/services/cardSales.ts')) {
  const bulkUi = read('app/sell-duplicates.tsx');
  const bulkService = read('src/services/cardSales.ts');
  assert(bulkUi.includes('Promise.allSettled(['), 'Regressão de UX: refresh pós-venda em lote pode voltar a transformar sucesso em erro falso.');
  assert(!bulkUi.includes('await Promise.all([refreshWallet(), load()])'), 'Regressão de UX: venda concluída não pode falhar por causa do refresh visual posterior.');
  assert(bulkUi.includes("getDuplicateCardsForSale().then(setCards)"), 'Regressão de UX: lista de repetidas não sincroniza silenciosamente após venda em lote.');
  assert(bulkService.includes("data.ok !== true"), 'Regressão: cliente deixou de validar a confirmação da venda em lote.');
  assert(bulkService.includes('statement timeout') && bulkService.includes('Network request failed'), 'Regressão de UX: erros transitórios da venda em lote perderam mensagens seguras.');
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
  const fullBag = playerService.split('export async function getMyBag')[1]?.split('export async function getMyLegacyCardPool')[0] ?? '';
  assert(fullBag.includes('FULL_BAG_PAGE_SIZE'), 'Regressão: Bag completa deixou de paginar coleções grandes.');
  assert(fullBag.includes('.range(from, from + FULL_BAG_PAGE_SIZE - 1)'), 'Regressão: getMyBag voltou a depender de uma única resposta limitada pela API.');
  assert(fullBag.includes(".order('card_id', { ascending: true })"), 'Regressão: paginação da Bag completa perdeu ordenação estável e pode pular cartas.');
  assert(fullBag.includes('if (page.length < FULL_BAG_PAGE_SIZE) break;'), 'Regressão: paginação da Bag completa não percorre todas as páginas.');
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

if (existsSync('supabase/migrations/20260901131651_cap_coin_packs_at_25k.sql')) {
  const coinCap25k = read('supabase/migrations/20260901131651_cap_coin_packs_at_25k.sql');
  assert(coinCap25k.includes("'coinPackCeiling',25000") && coinCap25k.includes('coin_pack_ceiling=25000'), 'Regressão econômica: teto dos packs de coins deve permanecer em 25.000.');
  assert(coinCap25k.includes('least(\n            25000::bigint'), 'Regressão econômica: refresh automático deixou de aplicar o teto real de 25.000 coins.');
  assert(coinCap25k.includes("'coinPackFloor',2500"), 'Regressão econômica: piso dos packs de coins deve permanecer em 2.500.');
  assert(coinCap25k.includes("'boosterDiamondPriceMultiplier',0.90"), 'Regressão econômica: teto de coins não pode alterar preços de packs de diamante.');
  assert(coinCap25k.includes("coalesce(p_price,0)>=20000") && coinCap25k.includes("coalesce(p_price,0)>=12500"), 'Regressão de balanceamento: teto de 25k não pode reduzir o bônus de qualidade dos boosters.');
}

if (existsSync('supabase/migrations/20260901120813_lower_coin_pack_prices_further.sql')) {
  const coinReliefFurther = read('supabase/migrations/20260901120813_lower_coin_pack_prices_further.sql');
  assert(coinReliefFurther.includes("'boosterCoinPriceMultiplier',0.50"), 'Regressão econômica: packs de coins perderam a redução para 50% do preço-base.');
  assert(coinReliefFurther.includes("'boosterDiamondPriceMultiplier',0.90"), 'Regressão econômica: redução extra de coins não pode alterar packs de diamante.');
  assert(coinReliefFurther.includes("'coinPackFloor',2500") && coinReliefFurther.includes('coin_pack_ceiling=50000'), 'Regressão econômica: faixa de packs de coins deve permanecer entre 2.500 e 50.000.');
  assert(coinReliefFurther.includes("coalesce(p_price,0)>=30000") && coinReliefFurther.includes("coalesce(p_price,0)>=15000"), 'Regressão de balanceamento: redução de preço não pode reduzir o bônus de qualidade dos boosters.');
}

if (existsSync('supabase/migrations/20260901115912_lower_coin_packs_more_and_optimize_bulk_duplicate_sales.sql')) {
  const coinReliefMore = read('supabase/migrations/20260901115912_lower_coin_packs_more_and_optimize_bulk_duplicate_sales.sql');
  assert(coinReliefMore.includes("'boosterCoinPriceMultiplier',0.60"), 'Regressão econômica: packs de coins perderam a redução para 60% do preço-base.');
  assert(coinReliefMore.includes("'boosterDiamondPriceMultiplier',0.90"), 'Regressão econômica: redução extra de coins não pode alterar packs de diamante.');
  assert(coinReliefMore.includes("'coinPackFloor',3000") && coinReliefMore.includes('coin_pack_ceiling=60000'), 'Regressão econômica: faixa de packs de coins deve permanecer entre 3.000 e 60.000.');
  assert(coinReliefMore.includes("coalesce(p_price,0)>=40000") && coinReliefMore.includes("coalesce(p_price,0)>=20000"), 'Regressão de balanceamento: redução de preço não pode rebaixar a sorte dos boosters caros.');
  assert(coinReliefMore.includes('with owned as materialized') && coinReliefMore.includes('update public.player_cards pc') && coinReliefMore.includes('insert into private.card_duplicate_sales'), 'Regressão de performance: venda em lote voltou ao loop carta por carta.');
  assert(!coinReliefMore.includes('for v_row in'), 'Regressão de performance: venda de todas as repetidas não deve percorrer inventário em loop PL/pgSQL.');
}

if (existsSync('supabase/migrations/20260901115248_lower_coin_pack_prices.sql')) {
  const coinRelief = read('supabase/migrations/20260901115248_lower_coin_pack_prices.sql');
  assert(coinRelief.includes("'boosterCoinPriceMultiplier',0.75"), 'Regressão econômica: packs de coins perderam o desconto adicional.');
  assert(coinRelief.includes("'boosterDiamondPriceMultiplier',0.90"), 'Regressão econômica: ajuste de coins não deve alterar o preço dos packs de diamante.');
  assert(coinRelief.includes("'coinPackFloor',4000"), 'Regressão econômica: piso dos packs de coins voltou acima de 4.000.');
  assert(coinRelief.includes('coin_pack_ceiling=75000'), 'Regressão econômica: teto dos packs de coins voltou acima de 75.000.');
  assert(coinRelief.includes('undiscounted_price::numeric*0.75'), 'Regressão econômica: refresh automático não preserva o novo desconto de coins.');
}

if (existsSync('supabase/migrations/20260831202010_booster_quality_pull_boost.sql')) {
  const qualityBoost = read('supabase/migrations/20260831202010_booster_quality_pull_boost.sql');
  assert(qualityBoost.includes('private.pack_quality_pull_multiplier'), 'Regressão de balanceamento: boost de qualidade por preço foi removido dos boosters.');
  assert(qualityBoost.includes("coalesce(p_price,0)>=50000") && qualityBoost.includes("coalesce(p_price,0)>=25000"), 'Regressão de balanceamento: boosters caros deixaram de receber boost adicional.');
  assert(qualityBoost.includes("coalesce(p_cards_per_pack,0)<=4 then 1.12"), 'Regressão de balanceamento: mini-boosters perderam o pequeno bônus extra.');
  assert(qualityBoost.includes("* private.pack_quality_pull_multiplier(v_currency,v_pack.price,v_pack.cards_per_pack,rarity)"), 'Regressão de balanceamento: algoritmo de abertura deixou de aplicar o boost de qualidade.');
  assert(qualityBoost.includes("'qualityBoost',jsonb_build_object"), 'Regressão de auditoria: abertura não registra mais o boost de qualidade aplicado.');
  assert(qualityBoost.includes("grant execute on function private.pack_quality_pull_multiplier(text,bigint,integer,text) to service_role"), 'Regressão de segurança: helper de sorte deve permanecer restrito ao service role.');
  assert(!qualityBoost.includes('select private.refresh_pack_economy()'), 'Regressão econômica: aumentar sorte não deve aumentar automaticamente o preço dos boosters.');
}

if (existsSync('supabase/migrations/20260831201910_booster_luck_small_raise.sql')) {
  const boosterLuck = read('supabase/migrations/20260831201910_booster_luck_small_raise.sql');
  assert(boosterLuck.includes('when 7 then 0.40'), 'Regressão de balanceamento: Tier 7 perdeu o pequeno boost de chance.');
  assert(boosterLuck.includes('when 6 then 1.12'), 'Regressão de balanceamento: Tier 6 perdeu o pequeno boost de chance.');
  assert(boosterLuck.includes('when 5 then 3.30'), 'Regressão de balanceamento: Tier 5 perdeu o pequeno boost de chance.');
  assert(boosterLuck.includes('when 4 then 10.80'), 'Regressão de balanceamento: Tier 4 perdeu o pequeno boost de chance.');
  assert(boosterLuck.includes('when p_price<=100 then 0.39'), 'Regressão de balanceamento: cartas valiosas voltaram a ser penalizadas demais.');
  assert(boosterLuck.includes('when p_price<=400 then 0.12'), 'Regressão de balanceamento: chase cards voltaram a ser penalizadas demais.');
  assert(boosterLuck.includes('about 14.0% -> 15.0%'), 'Regressão de documentação: ajuste de sorte perdeu a meta de impacto moderado.');
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
  assert(wars.includes('PokemonTypeSymbolFilter'), 'Regressão de UX: Guerra de Guilda deixou de usar símbolos de tipo.');
}

if (existsSync('supabase/migrations/20260831171936_universal_visual_themes.sql')) {
  const universalThemes = read('supabase/migrations/20260831171936_universal_visual_themes.sql');
  assert(universalThemes.includes("'universalTheme', true"), 'Regressão: temas premium deixaram de ser universais.');
  assert(universalThemes.includes("'cardCompatible', true"), 'Regressão: molduras/backgrounds perderam compatibilidade com cartas.');
  assert(universalThemes.includes("'deckCompatible', true"), 'Regressão: molduras/backgrounds perderam compatibilidade com decks.');
  assert(universalThemes.includes("i.category in ('profile_frame','profile_background')"), 'Regressão: RPC não aceita temas de identidade em cartas/decks.');
  assert(universalThemes.includes('get_my_visual_style_options'), 'Regressão: seletor leve de temas visuais foi removido.');
  assert(universalThemes.includes('clear_card_economy_style'), 'Regressão: cartas perderam a opção de remover tema.');
  assert(universalThemes.includes('clear_deck_economy_style'), 'Regressão: decks perderam a opção de remover tema.');
  assert(universalThemes.includes("'alreadyApplied',true"), 'Regressão econômica: reaplicar o mesmo tema pode voltar a cobrar Coins.');
  assert(universalThemes.includes('revoke execute on function public.get_my_visual_style_options(text) from public,anon'), 'Regressão de segurança: opções de tema não podem ser anônimas.');
}


if (existsSync('supabase/migrations/20260902145620_make_owned_cosmetic_application_free.sql')) {
  const freeCosmetics = read('supabase/migrations/20260902145620_make_owned_cosmetic_application_free.sql');
  assert(freeCosmetics.includes("'applyCost',0"), 'Regressão de economia: seletor de cosméticos voltou a anunciar custo de aplicação.');
  assert(freeCosmetics.includes("'spentCoins',0"), 'Regressão de economia: aplicar cosmético possuído deixou de retornar custo zero.');
  assert(!freeCosmetics.includes('private.spend_player_coins'), 'Regressão de economia: aplicar cosmético possuído voltou a gastar Coins.');
}

if (existsSync('supabase/migrations/20260902145710_zero_cosmetic_application_metadata.sql')) {
  const zeroCosmeticMetadata = read('supabase/migrations/20260902145710_zero_cosmetic_application_metadata.sql');
  assert(zeroCosmeticMetadata.includes("'{applyCardCost}','0'::jsonb"), 'Regressão de economia: metadata applyCardCost deixou de ser zerado.');
  assert(zeroCosmeticMetadata.includes("'{applyDeckCost}','0'::jsonb"), 'Regressão de economia: metadata applyDeckCost deixou de ser zerado.');
  assert(zeroCosmeticMetadata.includes("'{applyCost}','0'::jsonb"), 'Regressão de economia: metadata applyCost deixou de ser zerado.');
}

if (existsSync('src/services/economy.ts')) {
  const economyThemeService = read('src/services/economy.ts');
  assert(economyThemeService.includes('getMyVisualStyleOptions'), 'Regressão: cliente perdeu seletor de temas compatíveis.');
  assert(economyThemeService.includes('clearCardEconomyStyle'), 'Regressão: cliente perdeu remoção de tema de carta.');
  assert(economyThemeService.includes('clearDeckEconomyStyle'), 'Regressão: cliente perdeu remoção de tema de deck.');
}

if (existsSync('app/economy.tsx')) {
  const economyThemeUi = read('app/economy.tsx');
  assert(economyThemeUi.includes("x.metadata?.cardCompatible===true"), 'Regressão: Economy Hub não mostra temas universais em cartas.');
  assert(economyThemeUi.includes("x.metadata?.deckCompatible===true"), 'Regressão: Economy Hub não mostra temas universais em decks.');
  assert(economyThemeUi.includes('COMPRA ÚNICA • APLICAÇÃO GRÁTIS'), 'Regressão de economia: Economy Hub voltou a anunciar taxa para aplicar cosmético possuído.');
  assert(economyThemeUi.includes('Aplicação grátis. O item já pertence à sua coleção.'), 'Regressão de UX: deck voltou a sugerir cobrança ao trocar tema possuído.');
  assert(!economyThemeUi.includes('Custo de aplicação:'), 'Regressão de economia: Economy Hub voltou a exibir custo de aplicação.');
}

if (existsSync('app/card/[id].tsx')) {
  const cardThemeUi = read('app/card/[id].tsx');
  assert(cardThemeUi.includes('TEMAS DA SUA COLEÇÃO'), 'Regressão: carta perdeu o seletor direto de temas.');
  assert(cardThemeUi.includes("getMyVisualStyleOptions('card')"), 'Regressão: carta não carrega temas universais.');
  assert(cardThemeUi.includes('applyCardEconomyStyle'), 'Regressão: carta não aplica tema escolhido.');
  assert(cardThemeUi.includes('clearCardEconomyStyle'), 'Regressão: carta não consegue remover tema.');
  assert(cardThemeUi.includes('UNIVERSAL'), 'Regressão de UX: carta não identifica temas universais.');
  assert(cardThemeUi.includes('APLICAÇÃO GRÁTIS • COMPRA ÚNICA'), 'Regressão de economia: carta voltou a cobrar para aplicar tema já comprado.');
  assert(cardThemeUi.includes('imageColumn'), 'Regressão visual: área da carta perdeu o container de largura estável e pode colapsar em faixa vertical.');
  assert(cardThemeUi.includes('cardAuraShell'), 'Regressão visual: AuraFrame da carta não ocupa mais toda a área de exibição.');
  assert(cardThemeUi.includes('cardImageStage'), 'Regressão visual: tema deixou de cobrir a própria imagem da carta.');
  assert(cardThemeUi.includes('GalaxyFlowOverlay') && cardThemeUi.includes('opacity={0.70}'), 'Regressão visual: Galaxy Flow ficou fraco demais sobre a própria carta.');
  assert(cardThemeUi.includes('panelThemeWash') && cardThemeUi.includes('cardThemeWash'), 'Regressão visual: cosmético deixou de personalizar toda a área da carta.');
}

if (existsSync('app/deck/[id].tsx')) {
  const deckThemeUi = read('app/deck/[id].tsx');
  assert(deckThemeUi.includes('Personalizar deck'), 'Regressão: editor de deck perdeu seletor de temas.');
  assert(deckThemeUi.includes("getMyVisualStyleOptions('deck')"), 'Regressão: deck não carrega temas universais.');
  assert(deckThemeUi.includes('applyDeckEconomyStyle'), 'Regressão: deck não aplica tema escolhido.');
  assert(deckThemeUi.includes('clearDeckEconomyStyle'), 'Regressão: deck não consegue remover tema.');
  assert(deckThemeUi.includes('APLICAÇÃO GRÁTIS • COMPRA ÚNICA'), 'Regressão de economia: deck voltou a cobrar para aplicar tema já comprado.');
}

if (existsSync('app/store.tsx')) {
  const universalStoreUi = read('app/store.tsx');
  assert(universalStoreUi.includes('compatibilityRow'), 'Regressão de UX: Trainer Shop deixou de mostrar onde o tema pode ser usado.');
  assert(universalStoreUi.includes('CARTAS') && universalStoreUi.includes('DECKS'), 'Regressão de UX: usos universais sumiram da Trainer Shop.');
  assert(universalStoreUi.includes('COMPRA ÚNICA • depois de comprado, aplicar e trocar é grátis'), 'Regressão de UX: Trainer Shop deixou de explicar que cosmético é compra única.');
}

if (existsSync('src/components/AuraFrame.tsx')) {
  const auraFrame = read('src/components/AuraFrame.tsx');
  assert(auraFrame.includes('const sharedAuraFlow=new Animated.Value(0)'), 'Regressão de performance: AuraFrame deve compartilhar uma única animação entre cards.');
  assert(auraFrame.includes('sharedAuraUsers'), 'Regressão de performance: AuraFrame perdeu o controle global de assinantes.');
  assert(auraFrame.includes('<View style={styles.inner}>{children}</View>'), 'Regressão visual: AuraFrame perdeu o conteúdo interno.');
  assert(auraFrame.indexOf('<View style={styles.inner}>{children}</View>') < auraFrame.indexOf('styles.flowTop'), 'Regressão visual: efeitos do AuraFrame precisam ser renderizados acima de cards opacos.');
  assert(auraFrame.includes('styles.glowA') && auraFrame.includes('styles.glowB'), 'Regressão visual: AuraFrame perdeu o brilho interno.');
  assert(auraFrame.includes('styles.shine'), 'Regressão visual: AuraFrame perdeu o reflexo interno.');
  assert(auraFrame.includes("variant==='galaxy'?(") && auraFrame.includes('styles.nebula') && auraFrame.includes('styles.galaxyOrb'), 'Regressão visual: AuraFrame Galaxy perdeu o visual cósmico clássico.');
  assert(auraFrame.includes('styles.flowTop') && auraFrame.includes('styles.flowBottom'), 'Regressão visual: AuraFrame Galaxy perdeu os trilhos clássicos de energia.');
  assert(auraFrame.includes('AccessibilityInfo.isReduceMotionEnabled'), 'Regressão de acessibilidade: AuraFrame não respeita redução de movimento.');
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

if (existsSync('src/components/MarketplaceListingSurface.tsx')) {
  const marketSurface = read('src/components/MarketplaceListingSurface.tsx');
  assert(marketSurface.includes('MarketplaceListingSurface'), 'Regressão visual: superfície premium interna do Marketplace foi removida.');
  assert(marketSurface.includes('const marketFlow=new Animated.Value(0)'), 'Regressão de performance: efeitos internos do Marketplace devem compartilhar uma única animação.');
  assert(marketSurface.includes('styles.topRail') && marketSurface.includes('translateX:topRail'), 'Regressão visual: Marketplace perdeu fluxo interno superior.');
  assert(marketSurface.includes('styles.bottomRail') && marketSurface.includes('translateX:bottomRail'), 'Regressão visual: Marketplace perdeu fluxo interno inferior.');
  assert(marketSurface.includes('styles.shine'), 'Regressão visual: Marketplace perdeu reflexo interno premium.');
  assert(marketSurface.includes('visual.galaxy?(') && marketSurface.includes('styles.nebula') && marketSurface.includes('styles.nebulaSmall'), 'Regressão visual: Galaxy Market perdeu o efeito cósmico clássico.');
  assert(marketSurface.includes('styles.cornerGem') && marketSurface.includes('styles.spark'), 'Regressão visual: Galaxy Market perdeu brilhos e gemas do visual anterior.');
  assert(marketSurface.includes('<View style={styles.content}>{children}</View>'), 'Regressão visual: conteúdo do anúncio deixou de ser preservado abaixo dos efeitos.');
}

if (existsSync('app/marketplace.tsx')) {
  const marketUi = read('app/marketplace.tsx');
  assert(marketUi.includes('shopPreview'), 'Regressão visual: Marketplace perdeu a prévia do tema da loja.');
  assert(marketUi.includes('AuraBanner'), 'Regressão visual: Marketplace perdeu o banner premium.');
  assert(marketUi.includes('AuraFrame'), 'Regressão visual: anúncios deixaram de usar aura dinâmica.');
  assert(marketUi.includes('MarketplaceListingSurface'), 'Regressão visual: cards do Marketplace não usam mais a superfície premium interna.');
  assert(marketUi.includes('premiumInnerPanel'), 'Regressão visual: cabeçalho premium do anúncio voltou a ser chapado.');
  assert(marketUi.includes('premiumCardPanel'), 'Regressão visual: área da carta no anúncio voltou a esconder os efeitos.');
  assert(marketUi.includes('ownOfferButton'), 'Regressão visual: bloco SUA OFERTA perdeu o acabamento premium.');
  assert(marketUi.includes('getMyBagPage(offset,60'), 'Regressão do Marketplace: seletor de venda voltou a carregar apenas a primeira página da Bag.');
  assert(marketUi.includes('onEndReached={loadMoreInventory}'), 'Regressão do Marketplace: seletor de venda perdeu paginação infinita.');
  assert(marketUi.includes('inventory.length>=inventoryTotal'), 'Regressão do Marketplace: paginação deixou de parar somente após carregar todas as cartas filtradas.');
  assert(!marketUi.includes('Até 60 resultados por busca'), 'Regressão de UX: Marketplace voltou a informar um limite fixo de 60 cartas.');
  assert(marketUi.includes('MarketplaceCardPreviewModal'), 'Regressão do Marketplace: cartas deixaram de abrir a visualização detalhada.');
  assert(marketUi.includes('getCardDetail(entry.cards.id)') && marketUi.includes('getCardDetail(item.card.id)'), 'Regressão do Marketplace: prévia deixou de carregar os dados TCG completos da carta.');
  assert(marketUi.includes('getBattleCardPreview(card)'), 'Regressão do Marketplace: visualização da carta perdeu HP/ATQ e estatísticas de batalha.');
  assert(marketUi.includes('ESCOLHER ESTA CARTA PARA VENDER'), 'Regressão de UX: prévia da carta perdeu a ação explícita de selecionar para venda.');
  assert(marketUi.includes('TOQUE PARA ABRIR A CARTA E VER ESTATÍSTICAS'), 'Regressão de UX: ofertas públicas deixaram de indicar que a carta é visualizável.');
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
  assert(compactIdentity.includes('const sharedFlow=new Animated.Value(0)'), 'Regressão de performance: banners densos devem compartilhar um único valor animado.');
  assert(compactIdentity.includes('let sharedLoop:Animated.CompositeAnimation|null=null'), 'Regressão de performance: animação compacta perdeu o loop compartilhado.');
  assert(compactIdentity.includes('sharedUsers'), 'Regressão de performance: animação compacta perdeu o controle global de assinantes.');
  assert(compactIdentity.includes('visual.galaxy ? (') && compactIdentity.includes('styles.nebulaRibbon'), 'Regressão visual: banner compacto Galaxy perdeu o visual cósmico anterior.');
  assert(compactIdentity.includes('styles.star') && compactIdentity.includes('styles.starSmall'), 'Regressão visual: banner compacto Galaxy perdeu as estrelas do visual anterior.');
  assert(!compactIdentity.includes('GalaxyFlowOverlay'), 'Regressão visual: banner compacto Galaxy voltou ao overlay de nebulosa naturalista que foi revertido.');
  assert(compactIdentity.includes('styles.railTop') && compactIdentity.includes('translateX:railForward'), 'Regressão visual: fluxo animado superior do banner compacto foi removido.');
  assert(compactIdentity.includes('styles.railBottom') && compactIdentity.includes('translateX:railBackward'), 'Regressão visual: fluxo animado inferior do banner compacto foi removido.');
  assert(compactIdentity.includes("content:{position:'relative',zIndex:2}"), 'Regressão visual: efeitos compactos não-Galaxy precisam continuar acima do conteúdo padrão.');
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
  assert(collectionIdentity.includes("textShadowColor:'#000000FF'") && collectionIdentity.includes('textShadowRadius:5'), 'Regressão de legibilidade: ranking de coleção perdeu sombra de legibilidade nos nomes.');
}

if (existsSync('app/(tabs)/battles.tsx')) {
  const battleIdentity = read('app/(tabs)/battles.tsx');
  assert(battleIdentity.includes('CompactTrainerBanner'), 'Regressão de identidade: Battle Arena perdeu banners premium.');
  assert(battleIdentity.includes('frameId={player.equipped_frame_id}'), 'Regressão de identidade: ranking ranqueado não usa moldura equipada.');
  assert(battleIdentity.includes('frameId={friend.equipped_frame_id}'), 'Regressão de identidade: cards de amigos na Battle Arena perderam a moldura.');
  assert(battleIdentity.includes('frameId={challenger?.equipped_frame_id}'), 'Regressão de identidade: convites de batalha perderam o banner do desafiante.');
  assert(battleIdentity.includes("textShadowColor:'#000000FF'"), 'Regressão de legibilidade: Battle Arena perdeu contraste forte nos nomes.');
  const battlesHub = read('app/(tabs)/battles.tsx');
  assert(battlesHub.includes('Regra v6 • veja o que faz um Pokémon vencer outro'), 'Regressão de UX: tela de batalhas voltou a mostrar versão antiga das regras.');
}

if (existsSync('app/friends.tsx')) {
  const friendsIdentity = read('app/friends.tsx');
  assert(friendsIdentity.includes('CompactTrainerBanner'), 'Regressão de identidade: lista de amigos perdeu banners premium.');
  assert(friendsIdentity.includes('player.equipped_frame_id'), 'Regressão de identidade: lista de amigos não usa moldura equipada.');
  assert(friendsIdentity.includes("textShadowColor:'#000000FF'"), 'Regressão de legibilidade: lista de amigos perdeu contraste forte nos nomes.');
}

if (existsSync('app/guilds.tsx')) {
  const guildIdentity = read('app/guilds.tsx');
  assert(guildIdentity.includes('CompactTrainerBanner'), 'Regressão de identidade: membros de guilda perderam banners premium.');
  assert(guildIdentity.includes('frameId={identity?.frameId}'), 'Regressão de identidade: membro da guilda não usa moldura equipada.');
  assert(guildIdentity.includes("textShadowColor:'#000000FF'"), 'Regressão de legibilidade: membros da guilda perderam contraste forte nos nomes.');
}

if (existsSync('app/battle/[id].tsx')) {
  const activeBattleIdentity = read('app/battle/[id].tsx');
  assert(activeBattleIdentity.includes('CompactTrainerBanner'), 'Regressão de identidade: batalha ativa perdeu banners dos jogadores.');
  assert(activeBattleIdentity.includes('equipped_frame_id,equipped_background_id'), 'Regressão de identidade: batalha ativa não carrega os cosméticos dos jogadores.');
  assert(activeBattleIdentity.includes("textShadowColor:'#000000FF'"), 'Regressão de legibilidade: batalha ativa perdeu contraste forte nos nomes.');
}

if (existsSync('src/components/PremiumProfileFrame.tsx')) {
  const premiumFrame = read('src/components/PremiumProfileFrame.tsx');
  for (const theme of ['indigo','champion','crimson','master','galaxy']) {
    assert(premiumFrame.includes(`theme: '${theme}'`), `Regressão visual: moldura premium perdeu o preset ${theme}.`);
  }
  assert(premiumFrame.includes('energyRail'), 'Regressão visual: molduras premium perderam o fluxo de energia.');
  assert(premiumFrame.includes('shine'), 'Regressão visual: molduras premium perderam o reflexo de luxo.');
  assert(premiumFrame.includes('cornerGem'), 'Regressão visual: molduras premium perderam os cristais de canto.');
  assert(premiumFrame.includes('GalaxyFlowOverlay'), 'Regressão visual: Galaxy Flow perdeu o overlay integrado à moldura.');
  assert(!premiumFrame.includes('naturalGalaxy'), 'Regressão visual: moldura Galaxy voltou ao modo naturalista que foi revertido.');
  assert(premiumFrame.includes('compact ? .72 : .92'), 'Regressão visual: intensidade clássica do Galaxy Flow foi alterada nas molduras.');
  assert(premiumFrame.includes('styles.orbitWide') && premiumFrame.includes('styles.energyRail'), 'Regressão visual: moldura Galaxy perdeu órbitas ou trilhos clássicos.');
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
  assert(galaxy.includes('nebulaA') && galaxy.includes('nebulaB') && galaxy.includes('nebulaC'), 'Regressão visual: Galaxy Flow clássico perdeu as nebulosas coloridas.');
  assert(galaxy.includes('flowRibbon') && galaxy.includes('orbitOuter') && galaxy.includes('orbitInner'), 'Regressão visual: Galaxy Flow clássico perdeu faixas ou órbitas neon.');
  assert(galaxy.includes("root:{overflow:'hidden',zIndex:18}"), 'Regressão visual: Galaxy Flow pode voltar a ficar atrás do conteúdo.');
  assert(galaxy.includes('const sharedDrift=new Animated.Value(.36)') && galaxy.includes('galaxyUsers'), 'Regressão de performance: Galaxy Flow deve continuar compartilhando animação entre instâncias.');
  assert(!galaxy.includes('cloudViolet') && !galaxy.includes('milkyCore'), 'Regressão visual: Galaxy Flow voltou à reformulação naturalista que foi revertida.');
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


if (existsSync('src/components/PixelBattleArena.tsx')) {
  const pixelArena = read('src/components/PixelBattleArena.tsx');
  assert(pixelArena.includes('raw.githubusercontent.com/PokeAPI/sprites'), 'Regressão de arena 2D: fonte dos sprites pixelados foi removida.');
  assert(pixelArena.includes("back/"), 'Regressão de arena 2D: sprite traseiro do Pokémon do jogador foi removido.');
  assert(pixelArena.includes('Animated.sequence'), 'Regressão de arena 2D: animações próprias de ataque/impacto foram removidas.');
  assert(pixelArena.includes('REPLAY'), 'Regressão de arena 2D: replay da simulação visual foi removido.');
  assert(pixelArena.includes('resultado continua vindo do motor TCG v6'), 'Regressão de batalha: arena visual deixou de declarar que não altera o motor v6.');
}

if (existsSync('supabase/migrations/20260902185822_expose_locked_battle_fighters_for_pixel_arena.sql')) {
  const pixelArenaDb = read('supabase/migrations/20260902185822_expose_locked_battle_fighters_for_pixel_arena.sql');
  assert(pixelArenaDb.includes("'opponentCardName'"), 'Regressão de arena 2D: estado seguro não envia o Pokémon rival após ambos travarem.');
  assert(pixelArenaDb.includes("'opponentPokedexNumber'"), 'Regressão de arena 2D: número da Pokédex rival foi removido.');
  assert(pixelArenaDb.includes("'myHp'") && pixelArenaDb.includes("'opponentHp'"), 'Regressão de arena 2D: HP dos lutadores deixou de alimentar a arena.');
  assert(pixelArenaDb.includes('revoke all on function public.server_get_battle_attack_state'), 'Regressão de segurança: estado da arena ficou exposto diretamente ao cliente.');
}

if (existsSync('src/components/PackOpeningModal.tsx')) {
  const opening = read('src/components/PackOpeningModal.tsx');
  assert(opening.includes('isGalaxyBoosterFx'), 'Regressão Galaxy Flow: abertura de booster não detecta efeito galáctico.');
  assert(opening.includes('GalaxyFlowOverlay'), 'Regressão Galaxy Flow: booster perdeu nebulosa animada.');
  assert(opening.includes("stage==='opening'?.86:stage==='cards'?.60:.70"), 'Regressão visual: Galaxy Flow do booster ficou invisível entre etapas.');
  assert(opening.includes('galaxyPortalOuter'), 'Regressão Galaxy Flow: booster perdeu portal cósmico.');
  assert(opening.includes('summaryPreviewCard'), 'Regressão de booster: cartas do resumo final deixaram de abrir visualização ampliada.');
  assert(opening.includes('TOQUE PARA VISUALIZAR'), 'Regressão de UX: resumo do booster deixou de indicar que as cartas são clicáveis.');
  assert(opening.includes('VOLTAR AO RESULTADO'), 'Regressão de booster: visualização ampliada não retorna mais ao resumo sem fechar o pack.');
  assert(opening.includes('setSummaryPreviewCard(card)'), 'Regressão de booster: toque na carta do resumo deixou de abrir a carta recebida.');
  assert(!opening.includes('A energia está saindo de dentro.'), 'Regressão de UX: abertura do booster voltou a exibir frases durante a animação.');
  assert(!opening.includes('O lacre foi rompido. Preparando suas recompensas'), 'Regressão de UX: abertura do booster voltou a exibir texto de carregamento.');
  assert(!opening.includes('RASGANDO O LACRE'), 'Regressão de UX: abertura do booster voltou a exibir legenda durante o rasgo.');
  assert(opening.includes("stage === 'sealed' ? ("), 'Regressão de UX: textos do booster deixaram de ficar restritos ao estado selado.');
  assert(opening.includes('boosterFxPulse') && opening.includes('boosterFxOrbit') && opening.includes('boosterFxDrift'), 'Regressão de cosmético: banner equipado do booster voltou a ficar estático.');
  assert(opening.includes('boosterFxFrameInner') && opening.includes('boosterFxSweep'), 'Regressão de cosmético: moldura animada do booster perdeu profundidade/brilho em movimento.');
  assert(opening.includes('boosterFxAmbientOrbitOuter') && opening.includes('boosterFxAmbientOrbitInner'), 'Regressão de cosmético: aura contínua ao redor do booster foi removida.');
  assert(opening.includes('boosterFxOrbitRotationReverse'), 'Regressão de cosmético: efeito orbital perdeu movimento em sentidos opostos.');
  assert(opening.includes("boosterFx.id.includes('galaxy') ? 5200 : 6800"), 'Regressão de cosmético: velocidade contínua do banner equipado foi removida.');
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


if (existsSync('supabase/migrations/20260903024351_make_creator_supreme_owner_exclusive.sql')) {
  const creatorTitleDb = read('supabase/migrations/20260903024351_make_creator_supreme_owner_exclusive.sql');
  assert(creatorTitleDb.includes("a.role='owner'"), 'Regressão: Criador Supremo voltou a considerar qualquer admin como criador.');
  assert(creatorTitleDb.includes("CREATOR_TITLE_OWNER_ONLY"), 'Regressão de segurança: título Criador Supremo perdeu a trava exclusiva do owner.');
  assert(creatorTitleDb.includes('trg_guard_creator_owner_achievement'), 'Regressão de segurança: achievement creator_owner perdeu o guard de banco.');
  assert(creatorTitleDb.includes('player_achievements_creator_owner_singleton_idx'), 'Regressão: mais de uma conta pode voltar a possuir Criador Supremo.');
  assert(creatorTitleDb.includes('players_creator_owner_equipped_singleton_idx'), 'Regressão: mais de uma conta pode voltar a equipar Criador Supremo.');
  assert(creatorTitleDb.includes("sender_title_id='creator_owner'"), 'Regressão: limpeza do título indevido no histórico de chat foi removida.');
}


if (existsSync('supabase/migrations/20260903031023_fix_legacy_selection_private_helper_permission.sql')) {
  const legacyPermissionFix = read('supabase/migrations/20260903031023_fix_legacy_selection_private_helper_permission.sql');
  assert(legacyPermissionFix.includes('legacy_card_is_available_for_current_user'), 'Regressão do Legado: salvamento voltou a chamar o helper privado amplo.');
  assert(legacyPermissionFix.includes("auth.uid() is not null"), 'Regressão de segurança: helper seguro do Legado deixou de exigir usuário autenticado.');
  assert(legacyPermissionFix.includes("legacy_card_is_available(auth.uid(),p_card_id)"), 'Regressão de segurança: helper seguro do Legado deixou de vincular a verificação ao próprio usuário.');
  assert(legacyPermissionFix.includes("grant execute on function private.legacy_card_is_available_for_current_user(text)"), 'Regressão do Legado: usuário autenticado perdeu permissão para validar suas próprias cartas.');
  assert(legacyPermissionFix.includes("revoke all on function private.legacy_card_is_available_for_current_user(text)\nfrom public,anon;"), 'Regressão de segurança: helper seguro do Legado ficou exposto a anon/public.');
  assert(legacyPermissionFix.includes('security invoker'), 'Regressão de segurança: save_my_legacy_selection deixou de executar com as permissões do próprio usuário.');
  assert(!legacyPermissionFix.includes("grant execute on function private.legacy_card_is_available(uuid,text)\nto authenticated"), 'Regressão de segurança: helper amplo de disponibilidade foi exposto ao cliente.');
}
