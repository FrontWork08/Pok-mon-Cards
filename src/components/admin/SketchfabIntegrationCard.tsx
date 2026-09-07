import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  disconnectSketchfab,
  getSketchfabStatus,
  saveSketchfabConfig,
  startSketchfabOAuth,
  type SketchfabIntegrationStatus,
} from '@/services/sketchfab';
import { useAppTheme } from '@/theme/ThemeProvider';

function formatExpiry(value: string | null) {
  if (!value) return 'sem data de expiração';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'expiração desconhecida';
  return date.toLocaleString('pt-BR');
}

export function SketchfabIntegrationCard() {
  const { colors } = useAppTheme();
  const [status, setStatus] = useState<SketchfabIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [editingCredentials, setEditingCredentials] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getSketchfabStatus();
      setStatus(next);
      setEditingCredentials((current) => current || !next.configured);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao consultar Sketchfab');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  async function saveCredentials() {
    if (!clientId.trim() || !clientSecret.trim() || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveSketchfabConfig(clientId.trim(), clientSecret.trim());
      setClientSecret('');
      setClientId('');
      setEditingCredentials(false);
      setNotice('Credenciais salvas no backend. O Client Secret não fica no APK nem no GitHub.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar credenciais');
    } finally {
      setSaving(false);
    }
  }

  async function connect() {
    if (connecting) return;
    setConnecting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await startSketchfabOAuth(Platform.OS === 'web' ? 'web' : 'native');
      const supported = await Linking.canOpenURL(result.authorizeUrl);
      if (!supported) throw new Error('O dispositivo não conseguiu abrir o login do Sketchfab.');
      await Linking.openURL(result.authorizeUrl);
      setNotice('Login aberto no navegador. Depois de autorizar, volte ao app; o status será atualizado automaticamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar login Sketchfab');
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (disconnecting) return;
    setDisconnecting(true);
    setError(null);
    setNotice(null);
    try {
      await disconnectSketchfab();
      setNotice('Conta Sketchfab desconectada. Os tokens foram removidos do Vault.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desconectar Sketchfab');
    } finally {
      setDisconnecting(false);
    }
  }

  const redirectUri = status?.redirectUri ?? 'https://mhddpovueqvvncrforao.supabase.co/functions/v1/sketchfab-oauth';
  const configured = Boolean(status?.configured);
  const connected = Boolean(status?.connected);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: connected ? '#65D894' : '#4F68A9' }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBadge, { borderColor: connected ? '#65D894' : '#6E8BD7' }]}>
          <Ionicons name="cube-outline" size={19} color={connected ? '#65D894' : '#8DAAFF'} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Sketchfab • integração 3D</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>OAuth oficial • owner-only • tokens no Supabase Vault</Text>
        </View>
        <View style={[styles.statusPill, { borderColor: connected ? '#65D894' : configured ? '#FFD447' : '#6E8BD7' }]}>
          <Text style={[styles.statusText, { color: connected ? '#65D894' : configured ? '#FFD447' : '#8DAAFF' }]}>
            {connected ? 'CONECTADO' : configured ? 'PRONTO P/ LOGIN' : 'CONFIGURAR'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.yellow} />
          <Text style={[styles.body, { color: colors.muted }]}>Consultando integração segura…</Text>
        </View>
      ) : null}

      <Text style={[styles.body, { color: colors.muted }]}>Essa conexão permite que o backend peça o download oficial de modelos liberados pelo artista, registre autor/licença e mande o arquivo para o 3D Lab sem expor sua sessão no aplicativo.</Text>

      <View style={[styles.infoBox, { borderColor: colors.border }]}>
        <Text style={[styles.infoLabel, { color: colors.muted }]}>Redirect URI para registrar no Sketchfab</Text>
        <Text selectable style={[styles.mono, { color: colors.text }]}>{redirectUri}</Text>
        <Text style={[styles.note, { color: colors.muted }]}>Ao solicitar o Client ID/Secret, use grant type <Text style={{ fontWeight: '900' }}>Authorization Code</Text>. O Sketchfab redireciona para esse HTTPS; o servidor então devolve você ao Trainer Collection.</Text>
      </View>

      {!configured || editingCredentials ? (
        <View style={styles.credentialsBlock}>
          <TextInput
            value={clientId}
            onChangeText={setClientId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Sketchfab Client ID"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: '#08131F' }]}
          />
          <TextInput
            value={clientSecret}
            onChangeText={setClientSecret}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="Sketchfab Client Secret"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: '#08131F' }]}
          />
          <Pressable
            onPress={() => void saveCredentials()}
            disabled={saving || !clientId.trim() || !clientSecret.trim()}
            style={[styles.primary, { backgroundColor: saving || !clientId.trim() || !clientSecret.trim() ? '#47495A' : '#8DAAFF' }]}
          >
            {saving ? <ActivityIndicator color="#08131F" /> : <Ionicons name="shield-checkmark-outline" size={18} color="#08131F" />}
            <Text style={styles.primaryText}>{saving ? 'SALVANDO…' : 'SALVAR CREDENCIAIS NO VAULT'}</Text>
          </Pressable>
          {configured ? (
            <Pressable onPress={() => setEditingCredentials(false)} style={[styles.secondary, { borderColor: colors.border }]}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>CANCELAR</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {configured && !editingCredentials ? (
        <View style={styles.actionBlock}>
          <Text style={[styles.note, { color: colors.muted }]}>Client ID salvo: {status?.clientIdHint ?? 'configurado'}</Text>
          {!connected ? (
            <Pressable onPress={() => void connect()} disabled={connecting} style={[styles.primary, { backgroundColor: connecting ? '#47495A' : colors.yellow }]}>
              {connecting ? <ActivityIndicator color="#08131F" /> : <Ionicons name="log-in-outline" size={18} color="#08131F" />}
              <Text style={styles.primaryText}>{connecting ? 'ABRINDO SKETCHFAB…' : 'CONECTAR CONTA SKETCHFAB'}</Text>
            </Pressable>
          ) : (
            <View style={[styles.connectedBox, { borderColor: '#3D7658' }]}>
              <Text style={[styles.connectedTitle, { color: '#65D894' }]}>@{status?.username || 'Sketchfab'} conectado</Text>
              <Text style={[styles.note, { color: colors.muted }]}>Token válido até: {formatExpiry(status?.expiresAt ?? null)}. O backend tenta renovar automaticamente quando houver refresh token.</Text>
              <Pressable onPress={() => void disconnect()} disabled={disconnecting} style={[styles.secondary, { borderColor: '#7A3441' }]}>
                <Ionicons name="unlink-outline" size={16} color="#FF8290" />
                <Text style={[styles.secondaryText, { color: '#FFB6C0' }]}>{disconnecting ? 'DESCONECTANDO…' : 'DESCONECTAR SKETCHFAB'}</Text>
              </Pressable>
            </View>
          )}
          <Pressable onPress={() => setEditingCredentials(true)} style={[styles.linkButton, { borderColor: colors.border }]}>
            <Ionicons name="key-outline" size={15} color={colors.muted} />
            <Text style={[styles.linkText, { color: colors.muted }]}>ALTERAR CLIENT ID / SECRET</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable onPress={() => void Linking.openURL('https://sketchfab.com/developers/oauth')} style={[styles.linkButton, { borderColor: colors.border }]}>
        <Ionicons name="open-outline" size={15} color="#8DAAFF" />
        <Text style={[styles.linkText, { color: '#AFC0FF' }]}>ABRIR DOCUMENTAÇÃO / REGISTRO OAUTH DO SKETCHFAB</Text>
      </Pressable>

      {notice ? <Text style={[styles.feedback, { color: '#65D894' }]}>{notice}</Text> : null}
      {error ? <Text selectable style={[styles.feedback, { color: '#FF8290' }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconBadge: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '900' },
  subtitle: { fontSize: 9, fontWeight: '700' },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontSize: 8, fontWeight: '900' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { fontSize: 11, lineHeight: 17 },
  note: { fontSize: 9.5, lineHeight: 14 },
  infoBox: { borderWidth: 1, borderRadius: 13, padding: 11, gap: 5, backgroundColor: '#08131F' },
  infoLabel: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  mono: { fontSize: 9, lineHeight: 14, fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }) },
  credentialsBlock: { gap: 8 },
  actionBlock: { gap: 8 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, fontSize: 11 },
  primary: { minHeight: 48, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#08131F', fontSize: 10, fontWeight: '900' },
  secondary: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryText: { fontSize: 9, fontWeight: '900' },
  connectedBox: { borderWidth: 1, borderRadius: 13, padding: 11, gap: 7, backgroundColor: '#091A15' },
  connectedTitle: { fontSize: 11, fontWeight: '900' },
  linkButton: { minHeight: 38, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  linkText: { fontSize: 8.5, fontWeight: '900', textAlign: 'center' },
  feedback: { fontSize: 10, lineHeight: 15, fontWeight: '800' },
});
