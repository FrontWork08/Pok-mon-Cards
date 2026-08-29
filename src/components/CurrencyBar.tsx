import { useState } from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

const COIN_PACKAGES = [
  { coins: 10000, price: 'R$ 5' },
  { coins: 25000, price: 'R$ 10' },
  { coins: 60000, price: 'R$ 20' },
  { coins: 160000, price: 'R$ 50' },
] as const;

export function CurrencyBar({ compact = false }: { compact?: boolean }) {
  const { colors } = useAppTheme();
  const { userId, coins, diamonds } = useWallet();
  const [storeOpen, setStoreOpen] = useState(false);
  if (!userId) return null;

  async function requestPackage(item: typeof COIN_PACKAGES[number]) {
    await Share.share({
      message:
        `Olá! Quero adicionar 🪙 ${item.coins.toLocaleString('pt-BR')} Coins ` +
        `(${item.price}) na minha conta do Trainer Collection. Vou enviar o Pix e o comprovante.`,
    }).catch(() => null);
  }

  return (
    <>
      <View style={[styles.bar, compact && styles.barCompact]}>
        <View style={[styles.currency, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.value, { color: colors.yellow }]}>🪙 {coins.toLocaleString('pt-BR')}</Text>
          <Pressable
            accessibilityLabel="Adicionar Coins"
            hitSlop={7}
            onPress={() => setStoreOpen(true)}
            style={[styles.plus, { backgroundColor: colors.yellow }]}
          >
            <Ionicons name="add" size={14} color="#07111F" />
          </Pressable>
        </View>
        <View style={[styles.currency, { backgroundColor: colors.surface, borderColor: '#68D9FF' }]}>
          <Ionicons name="diamond" size={14} color="#68D9FF" />
          <Text style={[styles.value, { color: '#68D9FF' }]}>{diamonds.toLocaleString('pt-BR')}</Text>
        </View>
      </View>

      <Modal visible={storeOpen} transparent animationType="fade" onRequestClose={() => setStoreOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sheetHeader}>
              <View style={[styles.storeIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="wallet" size={23} color={colors.yellow} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]}>Adicionar Coins</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>Valores somente para consulta.</Text>
              </View>
              <Pressable onPress={() => setStoreOpen(false)}><Ionicons name="close" size={23} color={colors.muted} /></Pressable>
            </View>
            <View style={styles.packageGrid}>
              {COIN_PACKAGES.map((item) => (
                <Pressable
                  key={item.coins}
                  onPress={() => void requestPackage(item)}
                  style={[styles.package, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                >
                  <Text style={[styles.packageCoins, { color: colors.yellow }]}>🪙 {item.coins.toLocaleString('pt-BR')}</Text>
                  <Text style={[styles.packagePrice, { color: colors.text }]}>{item.price}</Text>
                  <Text style={[styles.packageAction, { color: colors.accent }]}>SOLICITAR</Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.instructions, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
              <Ionicons name="chatbubble-ellipses" size={19} color={colors.accent} />
              <Text style={[styles.instructionsText, { color: colors.text }]}>
                Fale diretamente com o criador, peça a chave Pix e envie o comprovante. As Coins são adicionadas manualmente após a confirmação.
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  barCompact: { maxWidth: 260 },
  currency: { minHeight: 34, borderRadius: 12, borderWidth: 1, paddingLeft: 10, paddingRight: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { fontSize: 11, fontWeight: '900' },
  plus: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'flex-end', padding: 12 },
  sheet: { width: '100%', maxWidth: 620, alignSelf: 'center', borderRadius: 25, borderWidth: 1, padding: 16, gap: 14, marginBottom: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  storeIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '900' },
  subtitle: { fontSize: 10, marginTop: 2 },
  packageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  package: { flexGrow: 1, flexBasis: 120, minWidth: 115, borderRadius: 16, borderWidth: 1, padding: 13 },
  packageCoins: { fontSize: 13, fontWeight: '900' },
  packagePrice: { fontSize: 18, fontWeight: '900', marginTop: 6 },
  packageAction: { fontSize: 8, fontWeight: '900', letterSpacing: .8, marginTop: 7 },
  instructions: { borderRadius: 15, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  instructionsText: { flex: 1, fontSize: 10, lineHeight: 15, fontWeight: '700' },
});
