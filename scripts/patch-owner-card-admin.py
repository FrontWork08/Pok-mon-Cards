from pathlib import Path

p=Path('src/services/admin.ts')
s=p.read_text()
old="  | 'guilds_manage';"
new="""  | 'guilds_manage'
  | 'gamepasses_manage'
  | 'battle_lab_manage'
  | 'economy_control'
  | 'feature_flags_manage'
  | 'feedback_manage'
  | 'system_health_view';"""
if old not in s: raise SystemExit('AdminPermission anchor missing')
s=s.replace(old,new,1)
oldopt="  { id: 'guilds_manage', label: 'Guildas', description: 'Alterar liderança administrativa das guildas.' },"
newopt=oldopt+"""
  { id: 'gamepasses_manage', label: 'Gamepasses', description: 'Ativar e revogar Gamepasses manuais depois de confirmar a venda.' },
  { id: 'battle_lab_manage', label: 'Battle Lab', description: 'Usar catálogo e simulações administrativas de batalha.' },
  { id: 'economy_control', label: 'Controle da economia', description: 'Abrir diagnósticos, histórico e ferramentas avançadas da economia.' },
  { id: 'feature_flags_manage', label: 'Feature Flags', description: 'Ativar, pausar e ajustar recursos experimentais.' },
  { id: 'feedback_manage', label: 'Feedback', description: 'Ler, organizar e responder feedback dos jogadores.' },
  { id: 'system_health_view', label: 'Saúde do sistema', description: 'Ver diagnóstico do app e erros recentes.' },"""
if oldopt not in s: raise SystemExit('permission options anchor missing')
s=s.replace(oldopt,newopt,1)
p.write_text(s)

p=Path('supabase/functions/admin-action/index.ts')
s=p.read_text()
old='  "guilds_manage",\n]);'
new='''  "guilds_manage",
  "gamepasses_manage",
  "battle_lab_manage",
  "economy_control",
  "feature_flags_manage",
  "feedback_manage",
  "system_health_view",
]);'''
if old not in s: raise SystemExit('delegated permissions anchor missing')
s=s.replace(old,new,1)
marker='    if (body.action === "account_audit") {'
insert='''    if (body.action === "owner_search_cards") {
      if (!isOwner) return json({ error: "OWNER_ONLY" }, 403);
      const search = typeof body.search === "string" ? body.search : "";
      const offset = Math.max(0, Number(body.offset ?? 0) || 0);
      const limit = Math.max(1, Math.min(120, Number(body.limit ?? 80) || 80));
      const { data, error } = await admin.rpc("server_owner_search_cards", {
        p_actor_id: user.id,
        p_search: search,
        p_offset: offset,
        p_limit: limit,
      });
      if (error) throw error;
      return json({ data });
    }

    if (body.action === "owner_grant_card") {
      if (!isOwner) return json({ error: "OWNER_ONLY" }, 403);
      const targetId = typeof body.targetId === "string" ? body.targetId : "";
      const cardId = typeof body.cardId === "string" ? body.cardId : "";
      const quantity = Number(body.quantity ?? 1);
      const note = typeof body.note === "string" ? body.note : null;
      if (!targetId || !cardId) return json({ error: "INVALID_TARGET_OR_CARD" }, 400);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) return json({ error: "INVALID_CARD_QUANTITY" }, 400);
      const { data, error } = await admin.rpc("server_owner_grant_card", {
        p_actor_id: user.id,
        p_target_id: targetId,
        p_card_id: cardId,
        p_quantity: quantity,
        p_note: note,
      });
      if (error) throw error;
      return json({ data });
    }

'''
if marker not in s: raise SystemExit('account_audit anchor missing')
s=s.replace(marker,insert+marker,1)
p.write_text(s)

p=Path('app/admin-gamepasses.tsx')
s=p.read_text()
old="      if (!access.isOwner) throw new Error('Somente o dono do jogo pode ativar Gamepasses pagas.');"
new="      if (!access.isOwner && !access.permissions.includes('gamepasses_manage')) throw new Error('Sua conta de admin não possui permissão para gerenciar Gamepasses.');"
if old not in s: raise SystemExit('gamepass owner guard anchor missing')
s=s.replace(old,new,1)
s=s.replace('subtitle="Central do dono para registrar compras reais e ativar ou revogar qualquer Gamepass."','subtitle="Central autorizada para registrar compras reais e ativar ou revogar Gamepasses."',1)
s=s.replace('Ativação manual pelo dono','Ativação manual autorizada',1)
p.write_text(s)

p=Path('app/admin-audit.tsx')
s=p.read_text()
marker='        <Collapsible title="Auditar conta de jogador" defaultExpanded>'
insert='''        {access?.isOwner ? (
          <Pressable onPress={() => router.push('/admin-card-grant')} style={[styles.accessCard, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
            <View style={[styles.accessIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="add-circle" size={24} color={colors.yellow} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>ADICIONAR QUALQUER CARTA</Text>
              <Text style={[styles.small, { color: colors.muted }]}>Exclusivo do Criador • não aparece entre as permissões delegáveis. Escolha qualquer carta e envie para sua conta ou para outro jogador.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.yellow} />
          </Pressable>
        ) : null}

'''
if marker not in s: raise SystemExit('admin audit render anchor missing')
s=s.replace(marker,insert+marker,1)
p.write_text(s)

p=Path('app/admin.tsx')
s=p.read_text()
old='''      const [accessState, status, economyState, grants, events, guildState, codes, runtime, announcements, testerState, releaseState] = await Promise.all([
        getMyAdminAccess(),
        getAdminOverview(),
        refreshAdminEconomyAdvisor(),
        getCurrencyAdjustmentHistory(),
        getAdminEvents(),
        getGuildHub(),
        getAdminRedeemCodes(),
        getMaintenanceStatus(),
        getActiveGlobalAnnouncementsAdmin(),
        getTesterTitleHub(),
        getAdminReleaseCampaignStatus(),
        syncPlayers(),
      ]);'''
new='''      const accessState = await getMyAdminAccess();
      const canUseEconomyControl = accessState.isOwner || accessState.permissions.includes('economy_control');
      const [status, economyState, grants, events, guildState, codes, runtime, announcements, testerState, releaseState] = await Promise.all([
        getAdminOverview(),
        canUseEconomyControl ? refreshAdminEconomyAdvisor() : Promise.resolve(null),
        getCurrencyAdjustmentHistory(),
        getAdminEvents(),
        getGuildHub(),
        getAdminRedeemCodes(),
        getMaintenanceStatus(),
        getActiveGlobalAnnouncementsAdmin(),
        getTesterTitleHub(),
        getAdminReleaseCampaignStatus(),
        syncPlayers(),
      ]);'''
if old not in s: raise SystemExit('admin load Promise.all anchor missing')
s=s.replace(old,new,1)
s=s.replace('      setEconomyAdvisor(economyState);\n      setEconomyHealth(economyState.health);','      setEconomyAdvisor(economyState);\n      setEconomyHealth(economyState?.health ?? null);',1)
old2='''  async function refreshEconomyAdvisor() {
    if (economyAdvisorLoading) return;'''
new2='''  async function refreshEconomyAdvisor() {
    if (economyAdvisorLoading) return;
    if (!hasAdminPermission('economy_control')) {
      setError('Sua conta de admin não possui permissão para o Controle da Economia.');
      return;
    }'''
if old2 not in s: raise SystemExit('refreshEconomyAdvisor anchor missing')
s=s.replace(old2,new2,1)
p.write_text(s)
