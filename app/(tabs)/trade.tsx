import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { findPlayers } from '@/services/player';
import { getMyTrades } from '@/services/trades';

export default function TradeScreen() {
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getMyTrades().then((data) => setTrades(data ?? [])).catch(() => setTrades([]));
  }, []);

  async function searchPlayers() {
    try {
      setLoading(true);
      setPlayers(await findPlayers(search));
    } catch {
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Trade" subtitle="Negocie cards com seus amigos.">
      <Text style={styles.sectionTitle}>Encontrar treinador</Text>
      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={searchPlayers}
          placeholder="Buscar por username"
          placeholderTextColor="#7c8497"
          autoCapitalize="none"
          style={styles.search}
        />
        <Pressable style={styles.button} onPress={searchPlayers}>
          <Text style={styles.buttonText}>Buscar</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator /> : null}

      {players.map((player) => (
        <View key={player.id} style={styles.playerRow}>
          <View>
            <Text style={styles.playerName}>@{player.username}</Text>
            <Text style={styles.playerLevel}>Treinador nível {player.level}</Text>
          </View>
          <Pressable style={styles.tradeButton} disabled>
            <Text style={styles.tradeButtonText}>Trocar</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Minhas trocas</Text>
      {trades.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nenhuma troca ainda</Text>
          <Text style={styles.emptyText}>Quando uma oferta for criada ou recebida, ela aparecerá aqui.</Text>
        </View>
      ) : (
        trades.map((trade) => (
          <View key={trade.id} style={styles.tradeRow}>
            <View>
              <Text style={styles.tradeId}>Troca #{trade.id.slice(0, 8)}</Text>
              <Text style={styles.tradeMeta}>{trade.trade_cards?.length ?? 0} itens</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{String(trade.status).toUpperCase()}</Text>
            </View>
          </View>
        ))
      )}

      <Text style={styles.note}>A criação e confirmação de ofertas será liberada quando as funções server-side forem instaladas. O cliente nunca transfere cards diretamente.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 4 },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: { flex: 1, backgroundColor: '#151c31', color: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  button: { backgroundColor: '#2d6cff', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 16 },
  buttonText: { color: '#fff', fontWeight: '800' },
  playerRow: { backgroundColor: '#111725', padding: 14, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playerName: { color: '#fff', fontWeight: '900', fontSize: 16 },
  playerLevel: { color: '#8f99ad', marginTop: 3, fontSize: 12 },
  tradeButton: { backgroundColor: '#293146', paddingHorizontal: 15, paddingVertical: 9, borderRadius: 10 },
  tradeButtonText: { color: '#788399', fontWeight: '800' },
  empty: { backgroundColor: '#111725', padding: 20, borderRadius: 16 },
  emptyTitle: { color: '#fff', fontWeight: '800' },
  emptyText: { color: '#8f99ad', marginTop: 5 },
  tradeRow: { backgroundColor: '#111725', padding: 14, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tradeId: { color: '#fff', fontWeight: '800' },
  tradeMeta: { color: '#8f99ad', fontSize: 12, marginTop: 3 },
  statusBadge: { backgroundColor: '#1f2a44', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { color: '#80a9ff', fontSize: 10, fontWeight: '900' },
  note: { color: '#727c90', fontSize: 12, lineHeight: 18, marginTop: 8 },
});
