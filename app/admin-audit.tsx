import { type ReactNode, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { PremiumBackground } from '@/components/PremiumBackground';
import {
  ADMIN_PERMISSION_OPTIONS,
  getAdminAccountAudit,
  getAdminPlayers,
  getAdminTeam,
  getMyAdminAccess,
  grantCoinsBatch,
  grantDiamondsBatch,
  removeCoinsBatch,
  removeDiamondsBatch,
  setAdminAccess,
  type AdminAccess,
  type AdminAccountAudit,
  type AdminPermission,
  type AdminPlayer,
  type AdminTeamMember,
} from '@/services/admin';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

function formatDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR') : '—';
}

function formatNumber(value: unknown) {
  return Number(value ?? 0).toLocaleString('pt-BR');
}

function currencyIcon(value: unknown) {
  return value === 'diamonds' ? '💎' : '🪙';
}

function packDiscountLabel(value: unknown) {
  if (value === 'admin_abuse_coin_free') return 'Admin Abuse: Coins grátis';
  if (value === 'admin_abuse_diamond_half') return 'Admin Abuse: 50% OFF';
  if (value === 'none') return 'Sem desconto';
  return value ? String(value) : 'Sem desconto';
}

function hasPermission(access: AdminAccess | null, permission: AdminPermission) {
  return Boolean(access?.isOwner || access?.permissions?.includes(permission));
}

export default function AdminAuditScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();

  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [team, setTeam] = useState<AdminTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [loadingMorePacks, setLoadingMorePacks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [auditSearch, setAuditSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [audit, setAudit] = useState<AdminAccountAudit | null>(null);

  const [teamSearch, setTeamSearch] = useState('');
  const [adminTargetId, setAdminTargetId] = useState<string | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<Set<AdminPermission>>(new Set());

  const [coinCorrection, setCoinCorrection] = useState('1000');
  const [diamondCorrection, setDiamondCorrection] = useState('1');
  const [correctionNote, setCorrectionNote] = useState('Correção após auditoria');

  const loadBase = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [nextAccess, nextPlayers] = await Promise.all([
        getMyAdminAccess(),
        getAdminPlayers(),
      ]);
      setAccess(nextAccess);
      setPlayers(nextPlayers);
      setTeam(nextAccess.isOwner ? await getAdminTeam() : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar a área administrativa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadBase();
  }, [loadBase]));

  const visibleAuditPlayers = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    if (query.length < 2) return [] as AdminPlayer[];
    return players
      .filter((player) =>
        player.username.toLowerCase().includes(query) || player.id.toLowerCase().includes(query),
      )
      .slice(0, 15);
  }, [auditSearch, players]);

  const visibleTeamPlayers = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();
    if (query.length < 2) return [] as AdminPlayer[];
    return players
      .filter((player) =>
        player.username.toLowerCase().includes(query) || player.id.toLowerCase().includes(query),
      )
      .slice(0, 15);
  }, [players, teamSearch]);

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId],
  );

  const adminTarget = useMemo(
    () => players.find((player) => player.id === adminTargetId) ?? null,
    [players, adminTargetId],
  );

  const currentAdminTarget = useMemo(
    () => team.find((member) => member.playerId === adminTargetId) ?? null,
    [adminTargetId, team],
  );

  const selectAuditPlayer = useCallback(async (player: AdminPlayer) => {
    if (!hasPermission(access, 'audit_users')) {
      setError('Sua conta de admin não possui permissão para auditar usuários.');
      return;
    }
    try {
      setSelectedPlayerId(player.id);
      setAuditLoading(true);
      setError(null);
      setNotice(null);
      setAudit(await getAdminAccountAudit(player.id, 0, 25));
      setAuditSearch(player.username);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível auditar este jogador.');
    } finally {
      setAuditLoading(false);
    }
  }, [access]);

  const refreshAudit = useCallback(async () => {
    if (!selectedPlayerId || !hasPermission(access, 'audit_users')) return;
    try {
      setAuditLoading(true);
      const limit = Math.max(25, audit?.packHistory.length ?? 25);
      setAudit(await getAdminAccountAudit(selectedPlayerId, 0, limit));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar a auditoria.');
    } finally {
      setAuditLoading(false);
    }
  }, [access, audit?.packHistory.length, selectedPlayerId]);

  const loadMorePacks = useCallback(async () => {
    if (!selectedPlayerId || !audit?.packs?.hasMore || loadingMorePacks) return;
    try {
      setLoadingMorePacks(true);
      const offset = audit.packHistory.length;
      const next = await getAdminAccountAudit(selectedPlayerId, offset, 25);
      setAudit((current) => current ? {
        ...next,
        packHistory: current.packHistory.concat(next.packHistory),
        packs: {
          ...next.packs,
          offset: 0,
          hasMore: current.packHistory.length + next.packHistory.length < Number(next.packs.total ?? 0),
        },
      } : next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar mais packs.');
    } finally {
      setLoadingMorePacks(false);
    }
  }, [audit, loadingMorePacks, selectedPlayerId]);

  const chooseAdminTarget = useCallback((player: AdminPlayer) => {
    const existing = team.find((member) => member.playerId === player.id);
    setAdminTargetId(player.id);
    setPermissionDraft(new Set(existing?.permissions ?? []));
    setTeamSearch(player.username);
  }, [team]);

  const editTeamMember = useCallback((member: AdminTeamMember) => {
    if (member.role === 'owner') return;
    setAdminTargetId(member.playerId);
    setPermissionDraft(new Set(member.permissions));
    setTeamSearch(member.username);
  }, []);

  const togglePermission = useCallback((permission: AdminPermission) => {
    setPermissionDraft((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }, []);

  const saveAdmin = useCallback(async () => {
    if (!access?.isOwner || !adminTargetId || working) return;
    try {
      setWorking(true);
      setError(null);
      const result = await setAdminAccess(adminTargetId, true, [...permissionDraft]);
      setNotice('Acesso de @' + result.username + ' salvo com ' + result.permissions.length + ' permissão(ões).');
      setTeam(await getAdminTeam());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar o acesso administrativo.');
    } finally {
      setWorking(false);
    }
  }, [access?.isOwner, adminTargetId, permissionDraft, working]);

  const revokeAdmin = useCallback((member: AdminTeamMember) => {
    if (!access?.isOwner || member.role === 'owner' || working) return;
    Alert.alert(
      'Remover acesso de admin?',
      '@' + member.username + ' perderá imediatamente o acesso administrativo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'REMOVER ADMIN',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setWorking(true);
                setError(null);
                await setAdminAccess(member.playerId, false, []);
                setNotice('Acesso administrativo de @' + member.username + ' removido.');
                setTeam(await getAdminTeam());
                if (adminTargetId === member.playerId) {
                  setAdminTargetId(null);
                  setPermissionDraft(new Set());
                  setTeamSearch('');
                }
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Não foi possível remover o admin.');
              } finally {
                setWorking(false);
              }
            })();
          },
        },
      ],
    );
  }, [access?.isOwner, adminTargetId, working]);

  const applyCurrencyCorrection = useCallback(async (
    currency: 'coins' | 'diamonds',
    direction: 'add' | 'remove',
  ) => {
    if (!selectedPlayerId || working) return;
    const raw = currency === 'coins' ? coinCorrection : diamondCorrection;
    const amount = Number(raw.replace(/[^0-9]/g, '')) || 0;
    if (amount < 1) {
      setError('Informe um valor maior que zero.');
      return;
    }
    const permission: AdminPermission = direction === 'add' ? 'economy_grant' : 'economy_remove';
    if (!hasPermission(access, permission)) {
      setError('Sua conta de admin não possui permissão para essa correção.');
      return;
    }
    if (correctionNote.trim().length < 3) {
      setError('Informe um motivo para a correção ficar registrada.');
      return;
    }

    try {
      setWorking(true);
      setError(null);
      if (currency === 'coins' && direction === 'add') {
        await grantCoinsBatch([selectedPlayerId], amount, correctionNote);
      } else if (currency === 'coins') {
        await removeCoinsBatch([selectedPlayerId], amount, correctionNote);
      } else if (direction === 'add') {
        await grantDiamondsBatch([selectedPlayerId], amount, correctionNote);
      } else {
        await removeDiamondsBatch([selectedPlayerId], amount, correctionNote);
      }
      setNotice('Correção aplicada e registrada no histórico administrativo.');
      await refreshAudit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível aplicar a correção.');
    } finally {
      setWorking(false);
    }
  }, [
    access,
    coinCorrection,
    correctionNote,
    diamondCorrection,
    refreshAudit,
    selectedPlayerId,
    working,
  ]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <PremiumBackground />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.yellow} />
          <Text style={[styles.small, { color: colors.muted }]}>Carregando segurança administrativa...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <PremiumBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="arrow-back" size={19} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.yellow }]}>ADMIN SECURITY</Text>
            <Text style={[styles.title, { color: colors.text }]}>Auditoria & Equipe Admin</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Investigue contas, encontre sinais de abuso e limite cada administrador ao que ele pode fazer.
            </Text>
          </View>
          <Pressable
            onPress={() => { void loadBase(); }}
            style={[styles.iconButton, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
          >
            <Ionicons name="refresh" size={19} color={colors.yellow} />
          </Pressable>
        </View>

        {notice ? (
          <View style={[styles.notice, { borderColor: '#2F9E68', backgroundColor: '#153426' }]}>
            <Ionicons name="checkmark-circle" size={20} color="#65D894" />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {error ? (
          <View style={[styles.notice, { borderColor: '#8B3D4E', backgroundColor: '#351A24' }]}>
            <Ionicons name="warning" size={20} color="#FF8290" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={[styles.accessCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.accessIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name={access?.isOwner ? 'key' : 'shield-checkmark'} size={24} color={colors.yellow} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {access?.isOwner ? 'DONO DO JOGO' : 'ADMIN DELEGADO'}
            </Text>
            <Text style={[styles.small, { color: colors.muted }]}>
              {access?.isOwner
                ? 'Acesso total. Somente o dono pode nomear ou remover outros administradores.'
                : formatNumber(access?.permissions?.length) + ' permissões administrativas atribuídas.'}
            </Text>
          </View>
        </View>

        {access?.isOwner ? (
          <Pressable onPress={() => router.push('/admin-card-grant')} style={[styles.accessCard, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
            <View style={[styles.accessIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="add-circle" size={24} color={colors.yellow} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>ADICIONAR QUALQUER CARTA</Text>
              <Text style={[styles.small, { color: colors.muted }]}>Exclusivo do Criador • não aparece entre as permissões delegáveis. Escolha qualquer carta e envie para sua conta ou para outro jogador.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.yellow} />
          </Pressable>
        ) : null}

        <Collapsible title="Auditar conta de jogador" defaultExpanded>
          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>BUSCAR USUÁRIO OU ID</Text>
            <TextInput
              value={auditSearch}
              onChangeText={setAuditSearch}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Digite pelo menos 2 caracteres"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            />
            {visibleAuditPlayers.map((player) => (
              <Pressable
                key={player.id}
                onPress={() => { void selectAuditPlayer(player); }}
                style={[styles.searchRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.searchName, { color: colors.text }]}>@{player.username}</Text>
                  <Text style={[styles.small, { color: colors.muted }]}>
                    Nv. {player.level} • 🪙 {formatNumber(player.coins)} • 💎 {formatNumber(player.diamonds)}
                  </Text>
                </View>
                <Ionicons name="search" size={18} color={colors.accent} />
              </Pressable>
            ))}
            {auditLoading ? <ActivityIndicator color={colors.yellow} /> : null}
          </View>

          {audit && selectedPlayer ? (
            <AuditResult
              audit={audit}
              colors={colors}
              selectedPlayer={selectedPlayer}
              coinCorrection={coinCorrection}
              setCoinCorrection={setCoinCorrection}
              diamondCorrection={diamondCorrection}
              setDiamondCorrection={setDiamondCorrection}
              correctionNote={correctionNote}
              setCorrectionNote={setCorrectionNote}
              canGrant={hasPermission(access, 'economy_grant')}
              canRemove={hasPermission(access, 'economy_remove')}
              working={working}
              onCorrection={applyCurrencyCorrection}
              onRefresh={() => { void refreshAudit(); }}
              onLoadMore={() => { void loadMorePacks(); }}
              loadingMorePacks={loadingMorePacks}
            />
          ) : null}
        </Collapsible>

        {access?.isOwner ? (
          <Collapsible title="Equipe administrativa" defaultExpanded>
            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Admins atuais</Text>
              <Text style={[styles.small, { color: colors.muted }]}>
                O dono é imutável. Admins delegados só conseguem executar as permissões marcadas.
              </Text>

              {team.map((member) => (
                <View
                  key={member.playerId}
                  style={[
                    styles.teamRow,
                    {
                      backgroundColor: colors.surfaceAlt,
                      borderColor: member.role === 'owner' ? colors.yellow : colors.border,
                    },
                  ]}
                >
                  <Pressable
                    disabled={member.role === 'owner'}
                    onPress={() => editTeamMember(member)}
                    style={{ flex: 1 }}
                  >
                    <Text style={[styles.searchName, { color: colors.text }]}>@{member.username}</Text>
                    <Text style={[styles.small, { color: colors.muted }]}>
                      {member.role === 'owner'
                        ? 'DONO • acesso total'
                        : formatNumber(member.permissions.length) + ' permissões • desde ' + formatDate(member.createdAt)}
                    </Text>
                  </Pressable>
                  {member.role !== 'owner' ? (
                    <Pressable
                      disabled={working}
                      onPress={() => revokeAdmin(member)}
                      style={styles.revokeButton}
                    >
                      <Ionicons name="trash-outline" size={16} color="#FF9AA7" />
                    </Pressable>
                  ) : (
                    <Ionicons name="key" size={18} color={colors.yellow} />
                  )}
                </View>
              ))}

              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>DAR OU EDITAR ADMIN</Text>
              <TextInput
                value={teamSearch}
                onChangeText={setTeamSearch}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Buscar usuário"
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              />
              {visibleTeamPlayers.map((player) => (
                <Pressable
                  key={player.id}
                  onPress={() => chooseAdminTarget(player)}
                  style={[
                    styles.searchRow,
                    {
                      backgroundColor: adminTargetId === player.id ? colors.accentSoft : colors.surfaceAlt,
                      borderColor: adminTargetId === player.id ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.searchName, { color: colors.text, flex: 1 }]}>@{player.username}</Text>
                  <Ionicons name="person-add" size={18} color={colors.accent} />
                </Pressable>
              ))}

              {adminTarget ? (
                <>
                  <View style={[styles.selectedAdmin, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
                    <Ionicons name="shield" size={20} color={colors.yellow} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.searchName, { color: colors.text }]}>@{adminTarget.username}</Text>
                      <Text style={[styles.small, { color: colors.muted }]}>
                        {currentAdminTarget ? 'Editando permissões atuais' : 'Novo admin delegado'}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>O QUE ESTE ADMIN PODE FAZER</Text>
                  <View style={styles.permissionGrid}>
                    {ADMIN_PERMISSION_OPTIONS.map((permission) => {
                      const active = permissionDraft.has(permission.id);
                      return (
                        <Pressable
                          key={permission.id}
                          onPress={() => togglePermission(permission.id)}
                          style={[
                            styles.permissionCard,
                            {
                              backgroundColor: active ? colors.accentSoft : colors.surfaceAlt,
                              borderColor: active ? colors.accent : colors.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={active ? 'checkmark-circle' : 'ellipse-outline'}
                            size={19}
                            color={active ? colors.yellow : colors.muted}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.permissionTitle, { color: colors.text }]}>{permission.label}</Text>
                            <Text style={[styles.permissionDesc, { color: colors.muted }]}>{permission.description}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable
                    disabled={working}
                    onPress={() => { void saveAdmin(); }}
                    style={[styles.primaryButton, { backgroundColor: colors.yellow, opacity: working ? 0.55 : 1 }]}
                  >
                    {working ? <ActivityIndicator size="small" color="#07111F" /> : <Ionicons name="shield-checkmark" size={18} color="#07111F" />}
                    <Text style={styles.primaryButtonText}>
                      {currentAdminTarget ? 'SALVAR PERMISSÕES' : 'DAR ADMIN COM ESTAS PERMISSÕES'}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </Collapsible>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AuditResult({
  audit,
  colors,
  selectedPlayer,
  coinCorrection,
  setCoinCorrection,
  diamondCorrection,
  setDiamondCorrection,
  correctionNote,
  setCorrectionNote,
  canGrant,
  canRemove,
  working,
  onCorrection,
  onRefresh,
  onLoadMore,
  loadingMorePacks,
}: {
  audit: AdminAccountAudit;
  colors: any;
  selectedPlayer: AdminPlayer;
  coinCorrection: string;
  setCoinCorrection: (value: string) => void;
  diamondCorrection: string;
  setDiamondCorrection: (value: string) => void;
  correctionNote: string;
  setCorrectionNote: (value: string) => void;
  canGrant: boolean;
  canRemove: boolean;
  working: boolean;
  onCorrection: (currency: 'coins' | 'diamonds', direction: 'add' | 'remove') => Promise<void>;
  onRefresh: () => void;
  onLoadMore: () => void;
  loadingMorePacks: boolean;
}) {
  const account = audit.account ?? {};
  const auth = account.auth ?? {};
  const collection = audit.collection ?? {};
  const social = audit.social ?? {};
  const economy = audit.economy ?? {};
  const activity = audit.activity ?? {};
  const progression = audit.progression ?? {};
  const topCards = Array.isArray(collection.mostValuableCards) ? collection.mostValuableCards : [];

  return (
    <View style={styles.auditStack}>
      <View style={[styles.auditHero, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: colors.yellow }]}>CONTA AUDITADA</Text>
          <Text style={[styles.auditName, { color: colors.text }]}>@{selectedPlayer.username}</Text>
          <Text selectable style={[styles.accountId, { color: colors.muted }]}>{String(account.id ?? '')}</Text>
        </View>
        <Pressable
          onPress={onRefresh}
          style={[styles.iconButton, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
        >
          <Ionicons name="refresh" size={18} color={colors.yellow} />
        </Pressable>
      </View>

      <View style={styles.metricGrid}>
        <Metric label="COINS" value={'🪙 ' + formatNumber(account.coins)} colors={colors} />
        <Metric label="DIAMANTES" value={'💎 ' + formatNumber(account.diamonds)} colors={colors} />
        <Metric label="NÍVEL / XP" value={formatNumber(account.level) + ' / ' + formatNumber(account.xp)} colors={colors} />
        <Metric label="ELO" value={formatNumber(account.battleRating)} colors={colors} />
        <Metric label="PACKS" value={formatNumber(audit.packs?.total)} colors={colors} />
        <Metric label="VALOR COLEÇÃO" value={formatUsd(Number(collection.marketValueUsd ?? 0))} colors={colors} />
      </View>

      {audit.flags?.length ? audit.flags.map((flag) => (
        <View
          key={flag.code}
          style={[
            styles.flag,
            {
              backgroundColor: flag.severity === 'high' ? '#351A24' : flag.severity === 'medium' ? '#362B13' : '#10284B',
              borderColor: flag.severity === 'high' ? '#A84250' : flag.severity === 'medium' ? '#D9A441' : '#285A9A',
            },
          ]}
        >
          <Ionicons
            name={flag.severity === 'info' ? 'information-circle' : 'warning'}
            size={20}
            color={flag.severity === 'high' ? '#FF8290' : flag.severity === 'medium' ? '#FFD447' : '#7DB3F1'}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.flagTitle}>{flag.title}</Text>
            <Text style={styles.flagText}>{flag.detail}</Text>
          </View>
        </View>
      )) : (
        <View style={[styles.notice, { borderColor: '#2F9E68', backgroundColor: '#153426' }]}>
          <Ionicons name="shield-checkmark" size={20} color="#65D894" />
          <Text style={styles.noticeText}>Nenhum sinal automático forte de abuso foi encontrado.</Text>
        </View>
      )}

      <Collapsible title="Dados completos da conta">
        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <InfoRow label="ID" value={String(account.id ?? '—')} colors={colors} selectable />
          <InfoRow label="E-mail" value={String(auth.email ?? '—')} colors={colors} selectable />
          <InfoRow label="Telefone" value={String(auth.phone ?? '—')} colors={colors} selectable />
          <InfoRow label="Conta criada" value={formatDate(account.createdAt)} colors={colors} />
          <InfoRow label="Último login" value={formatDate(auth.lastSignInAt)} colors={colors} />
          <InfoRow label="Status" value={String(account.accountStatus ?? '—')} colors={colors} />
          <InfoRow label="Suspenso até" value={formatDate(account.suspendedUntil)} colors={colors} />
          <InfoRow label="Avisos" value={formatNumber(account.warningCount)} colors={colors} />
          <InfoRow label="Último prêmio diário" value={formatDate(account.lastDailyClaimAt)} colors={colors} />
          <InfoRow label="Batalhas" value={formatNumber(account.battleWins) + ' V / ' + formatNumber(account.battleLosses) + ' D'} colors={colors} />
          <InfoRow label="Guilda" value={social.guild?.guildName ? String(social.guild.guildName) + ' • ' + String(social.guild.role) : 'Sem guilda'} colors={colors} />
          <InfoRow label="Amigos aceitos" value={formatNumber(social.acceptedFriends)} colors={colors} />
        </View>
      </Collapsible>

      <Collapsible title="Correção rápida de economia">
        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            value={correctionNote}
            onChangeText={setCorrectionNote}
            placeholder="Motivo da correção"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          />
          <View style={styles.correctionGrid}>
            <CorrectionBox
              title="COINS"
              value={coinCorrection}
              onChange={setCoinCorrection}
              colors={colors}
              working={working}
              canGrant={canGrant}
              canRemove={canRemove}
              onAdd={() => { void onCorrection('coins', 'add'); }}
              onRemove={() => { void onCorrection('coins', 'remove'); }}
            />
            <CorrectionBox
              title="DIAMANTES"
              value={diamondCorrection}
              onChange={setDiamondCorrection}
              colors={colors}
              working={working}
              canGrant={canGrant}
              canRemove={canRemove}
              onAdd={() => { void onCorrection('diamonds', 'add'); }}
              onRemove={() => { void onCorrection('diamonds', 'remove'); }}
            />
          </View>
        </View>
      </Collapsible>

      <Collapsible title="Coleção e cartas valiosas">
        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.metricGrid}>
            <Metric label="ÚNICAS" value={formatNumber(collection.uniqueCards)} colors={colors} />
            <Metric label="CÓPIAS" value={formatNumber(collection.totalCopies)} colors={colors} />
            <Metric label="DUPLICADAS" value={formatNumber(collection.duplicateCopies)} colors={colors} />
            <Metric label="COTADAS" value={formatNumber(collection.pricedUniqueCards)} colors={colors} />
          </View>
          <View style={styles.cardGrid}>
            {topCards.map((card: any) => (
              <View key={String(card.id)} style={[styles.topCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                {card.image ? <Image source={{ uri: card.image }} style={styles.topCardImage} resizeMode="contain" /> : null}
                <Text numberOfLines={1} style={[styles.permissionTitle, { color: colors.text }]}>{card.name}</Text>
                <Text numberOfLines={1} style={[styles.small, { color: colors.muted }]}>{String(card.rarity ?? '—')} • ×{formatNumber(card.quantity)}</Text>
                <Text style={styles.priceText}>{formatUsd(Number(card.marketPriceUsd ?? 0))}</Text>
              </View>
            ))}
          </View>
        </View>
      </Collapsible>

      <Collapsible title={'Histórico de packs (' + formatNumber(audit.packs?.total) + ')'}>
        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.metricGrid}>
            <Metric label="ÚLTIMAS 24H" value={formatNumber(audit.packs?.last24h)} colors={colors} />
            <Metric label="MÁX./MINUTO" value={formatNumber(audit.packs?.maxPerMinute)} colors={colors} />
            <Metric label="PREÇO ANTIGO" value={formatNumber(audit.packs?.legacySpecialPricingOpenings)} colors={colors} />
            <Metric label="ADMIN ABUSE" value={formatNumber(audit.packs?.adminAbuseEventOpenings)} colors={colors} />
            <Metric label="SEM SNAPSHOT" value={formatNumber(audit.packs?.legacyPriceUnknownOpenings)} colors={colors} />
            <Metric label="DESCONTO SEM MOTIVO" value={formatNumber(audit.packs?.unexplainedDiscountOpenings)} colors={colors} />
          </View>
          {audit.packHistory.map((opening: any) => (
            <View key={String(opening.id)} style={[styles.simpleRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.searchName, { color: colors.text }]}>{String(opening.packName ?? 'Booster')}</Text>
                <Text style={[styles.small, { color: colors.muted }]}>
                  {formatDate(opening.openedAt)} • {formatNumber(opening.cardCount)} cartas
                </Text>
                {opening.priceSnapshotStatus === 'recorded' ? (
                  <>
                    <Text style={[styles.small, { color: colors.text }]}>
                      Pago: {currencyIcon(opening.currencyAtOpen)} {formatNumber(opening.pricePaid)}
                      {' • '}Base: {currencyIcon(opening.currencyAtOpen)} {formatNumber(opening.basePriceAtOpen)}
                    </Text>
                    <Text style={[styles.small, { color: colors.muted }]}>
                      {packDiscountLabel(opening.pricingContext?.discountKind)}
                      {' • '}EV na abertura: {formatUsd(Number(opening.expectedValueUsdAtOpen ?? 0))}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.small, { color: '#D9A441' }]}>
                    Preço pago não registrado — abertura anterior ao snapshot de cobrança
                  </Text>
                )}
                <Text style={[styles.small, { color: colors.muted }]}>
                  Preço atual: {currencyIcon(opening.currentCurrency)} {formatNumber(opening.currentPackPrice)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.priceText}>{formatUsd(Number(opening.currentValueUsd ?? 0))}</Text>
                <Text style={[styles.small, { color: colors.muted }]}>valor atual das cartas</Text>
              </View>
            </View>
          ))}
          {audit.packs?.hasMore ? (
            <Pressable
              disabled={loadingMorePacks}
              onPress={onLoadMore}
              style={[styles.secondaryButton, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
            >
              {loadingMorePacks ? <ActivityIndicator size="small" color={colors.yellow} /> : <Ionicons name="chevron-down" size={18} color={colors.yellow} />}
              <Text style={[styles.secondaryButtonText, { color: colors.yellow }]}>CARREGAR MAIS PACKS</Text>
            </Pressable>
          ) : null}
        </View>
      </Collapsible>

      <Collapsible title="Economia e transações">
        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AuditArray title="Ajustes administrativos" rows={economy.adminCurrencyAdjustments} colors={colors} render={(row: any) =>
            formatDate(row.createdAt) + ' • ' + (row.currency === 'diamonds' ? '💎 ' : '🪙 ') + (Number(row.amount) >= 0 ? '+' : '') + formatNumber(row.amount) + ' • saldo ' + formatNumber(row.balanceAfter) + (row.note ? ' • ' + row.note : '')
          } />
          <AuditArray title="Vendas de duplicadas" rows={economy.duplicateSales} colors={colors} render={(row: any) =>
            formatDate(row.createdAt) + ' • ' + formatNumber(row.quantity) + '× ' + String(row.cardName ?? row.cardId) + ' • +🪙 ' + formatNumber(row.totalCoins)
          } />
          <AuditArray title="Coins para Diamantes" rows={economy.diamondExchanges} colors={colors} render={(row: any) =>
            formatDate(row.createdAt) + ' • -🪙 ' + formatNumber(row.coinsSpent) + ' • +💎 ' + formatNumber(row.diamonds)
          } />
          <AuditArray title="Códigos resgatados" rows={economy.codeRedemptions} colors={colors} render={(row: any) =>
            formatDate(row.redeemedAt) + ' • código ' + String(row.code ?? row.codeId)
          } />
        </View>
      </Collapsible>

      <Collapsible title="Batalhas, trocas e progressão">
        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AuditArray title="Batalhas recentes" rows={activity.battles} colors={colors} render={(row: any) =>
            formatDate(row.updatedAt) + ' • ' + String(row.mode ?? 'battle') + ' • ' + String(row.status) + ' • ' + String(row.challengerUsername ?? '?') + ' vs ' + String(row.opponentUsername ?? '?')
          } />
          <AuditArray title="Trocas recentes" rows={activity.trades} colors={colors} render={(row: any) =>
            formatDate(row.updatedAt) + ' • ' + String(row.status) + ' • ' + String(row.senderUsername ?? '?') + ' → ' + String(row.receiverUsername ?? '?')
          } />
          <AuditArray title="Histórico de moderação" rows={audit.moderation} colors={colors} render={(row: any) =>
            formatDate(row.createdAt) + ' • ' + String(row.action) + ' • por @' + String(row.actorUsername ?? 'admin') + (row.reason ? ' • ' + row.reason : '')
          } />
          <InfoRow label="Guild booster claims" value={formatNumber(social.guildBoosterClaims)} colors={colors} />
          <InfoRow label="Recompensas guilda" value={formatNumber(social.guildWeeklyRewards?.claims)} colors={colors} />
          <InfoRow label="Missões diárias" value={formatNumber(progression.dailyMissions?.rows)} colors={colors} />
          <InfoRow label="Missões V2" value={formatNumber(progression.missionsV2?.rows)} colors={colors} />
          <AuditArray title="Battle Pass" rows={progression.battlePass} colors={colors} render={(row: any) =>
            'Temporada ' + String(row.seasonId) + ' • nível ' + formatNumber(row.level) + ' • XP ' + formatNumber(row.xp) + ' • VIP ' + (row.vipUnlocked ? 'sim' : 'não')
          } />
        </View>
      </Collapsible>
    </View>
  );
}

function CorrectionBox({
  title,
  value,
  onChange,
  colors,
  working,
  canGrant,
  canRemove,
  onAdd,
  onRemove,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  colors: any;
  working: boolean;
  canGrant: boolean;
  canRemove: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={[styles.correctionCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{title}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
      />
      <View style={styles.actionRow}>
        <ActionButton label="ADICIONAR" icon="add-circle" disabled={!canGrant || working} onPress={onAdd} positive />
        <ActionButton label="RETIRAR" icon="remove-circle" disabled={!canRemove || working} onPress={onRemove} />
      </View>
    </View>
  );
}

function AuditArray({
  title,
  rows,
  colors,
  render,
}: {
  title: string;
  rows: any;
  colors: any;
  render: (row: any) => string;
}) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    <View style={styles.auditArray}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{title.toUpperCase()}</Text>
      {list.length ? list.map((row, index) => (
        <View key={String(row.id ?? row.codeId ?? row.createdAt ?? index)} style={[styles.auditLine, { borderColor: colors.border }]}>
          <Text style={[styles.auditLineText, { color: colors.text }]}>{render(row)}</Text>
        </View>
      )) : <Text style={[styles.small, { color: colors.muted }]}>Nenhum registro.</Text>}
    </View>
  );
}

function InfoRow({
  label,
  value,
  colors,
  selectable,
}: {
  label: string;
  value: string;
  colors: any;
  selectable?: boolean;
}) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
      <Text selectable={selectable} style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function Metric({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={[styles.metric, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  disabled,
  onPress,
  positive,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled: boolean;
  onPress: () => void;
  positive?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        {
          backgroundColor: positive ? '#153426' : '#351A24',
          borderColor: positive ? '#2F9E68' : '#8B3D4E',
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={16} color={positive ? '#65D894' : '#FF8290'} />
      <Text style={[styles.actionButtonText, { color: positive ? '#A9F1C6' : '#FFD7DD' }]}>{label}</Text>
    </Pressable>
  );
}

function Collapsible({
  title,
  children,
  defaultExpanded = false,
}: {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={styles.collapsible}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={[styles.collapsibleHeader, { backgroundColor: colors.surface, borderColor: expanded ? colors.accent : colors.border }]}
      >
        <Text style={[styles.collapsibleTitle, { color: colors.text }]}>{title}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={expanded ? colors.yellow : colors.muted} />
      </Pressable>
      {expanded ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden' },
  content: { width: '100%', maxWidth: 1280, alignSelf: 'center', padding: 16, paddingBottom: 42, gap: 12 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { fontSize: 27, lineHeight: 32, fontWeight: '900', marginTop: 2 },
  subtitle: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  notice: { borderRadius: 15, borderWidth: 1, padding: 12, flexDirection: 'row', gap: 9, alignItems: 'center' },
  noticeText: { flex: 1, color: '#C9F7DA', fontSize: 10, fontWeight: '700', lineHeight: 15 },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 10, fontWeight: '700', lineHeight: 15 },
  accessCard: { borderRadius: 19, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  accessIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '900' },
  small: { fontSize: 9, lineHeight: 14 },
  panel: { borderRadius: 19, borderWidth: 1, padding: 13, gap: 10 },
  fieldLabel: { fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, fontSize: 12 },
  searchRow: { minHeight: 54, borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchName: { fontSize: 12, fontWeight: '900' },
  auditStack: { gap: 10 },
  auditHero: { borderRadius: 19, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  auditName: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  accountId: { fontSize: 8, marginTop: 3 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metric: { flexGrow: 1, flexBasis: 135, minWidth: 120, borderRadius: 14, borderWidth: 1, padding: 10 },
  metricLabel: { fontSize: 7, fontWeight: '900', letterSpacing: .7 },
  metricValue: { fontSize: 14, fontWeight: '900', marginTop: 4 },
  flag: { borderRadius: 15, borderWidth: 1, padding: 11, flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  flagTitle: { color: '#fff', fontSize: 11, fontWeight: '900' },
  flagText: { color: '#C1CBD8', fontSize: 9, lineHeight: 14, marginTop: 2 },
  infoRow: { minHeight: 38, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7, flexDirection: 'row', gap: 10, alignItems: 'center' },
  infoLabel: { width: 120, fontSize: 8, fontWeight: '800' },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 9, fontWeight: '800' },
  correctionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  correctionCard: { flexGrow: 1, flexBasis: 240, minWidth: 220, borderRadius: 15, borderWidth: 1, padding: 10, gap: 8 },
  actionRow: { flexDirection: 'row', gap: 7 },
  actionButton: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionButtonText: { fontSize: 8, fontWeight: '900' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  topCard: { width: 112, borderRadius: 13, borderWidth: 1, padding: 7 },
  topCardImage: { width: '100%', aspectRatio: .72, borderRadius: 7, marginBottom: 5 },
  priceText: { color: '#65D894', fontSize: 10, fontWeight: '900', marginTop: 3 },
  simpleRow: { borderRadius: 13, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  secondaryButton: { minHeight: 44, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryButtonText: { fontSize: 9, fontWeight: '900' },
  auditArray: { gap: 6 },
  auditLine: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 7 },
  auditLineText: { fontSize: 9, lineHeight: 14 },
  teamRow: { minHeight: 58, borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  revokeButton: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#351A24' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  selectedAdmin: { borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  permissionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  permissionCard: { flexGrow: 1, flexBasis: 245, minWidth: 220, borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  permissionTitle: { fontSize: 10, fontWeight: '900' },
  permissionDesc: { fontSize: 8, lineHeight: 12, marginTop: 2 },
  primaryButton: { minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: '#07111F', fontSize: 9, fontWeight: '900' },
  collapsible: { gap: 7 },
  collapsibleHeader: { minHeight: 56, borderRadius: 17, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  collapsibleTitle: { flex: 1, fontSize: 14, fontWeight: '900' },
  collapsibleBody: { gap: 8 },
});
