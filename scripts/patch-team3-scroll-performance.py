from pathlib import Path

p = Path('app/team-battle/[id].tsx')
text = p.read_text()

old = "import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';"
new = "import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';"
assert old in text, 'team3 react-native import anchor missing'
text = text.replace(old, new, 1)

anchor = "import { useWallet } from '@/wallet/WalletProvider';\n"
assert anchor in text, 'team3 import anchor missing'
text = text.replace(anchor, anchor + "import { VIRTUAL_LIST_PERF_PROPS } from '@/performance/scrollPerformance';\n", 1)

anchor = "  const [search, setSearch] = useState('');\n"
assert anchor in text, 'team3 state anchor missing'
text = text.replace(anchor, anchor + "  const [pickerOpen, setPickerOpen] = useState(false);\n", 1)

start_marker = "                <TextInput\n                  value={search}"
end_marker = "\n\n                <Pressable disabled={working || selected.length !== 3}"
start = text.index(start_marker)
end = text.index(end_marker, start)
replacement = '''                <Pressable
                  onPress={() => setPickerOpen(true)}
                  style={[styles.pickerTrigger, { backgroundColor: colors.surfaceAlt, borderColor: colors.accent }]}
                >
                  <View style={[styles.pickerTriggerIcon, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="albums" size={22} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.bold, { color: colors.text }]}>Escolher Pokémon</Text>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {selected.length}/3 escolhidos • lista otimizada para scroll
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color={colors.accent} />
                </Pressable>'''
text = text[:start] + replacement + text[end:]

modal_anchor = '''      </Screen>
    </>
  );
}'''
assert modal_anchor in text, 'team3 modal insertion anchor missing'
modal = '''      </Screen>

      <Modal visible={pickerOpen && state?.status === 'drafting' && !state?.myTeamLocked} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerOpen(false)} />
          <View style={[styles.pickerModal, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <View style={styles.pickerHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.leader, { color: colors.yellow }]}>EQUIPE 3×3 • SELETOR OTIMIZADO</Text>
                <Text style={[styles.title, { color: colors.text }]}>Escolha seus Pokémon</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>{selected.length}/3 selecionados • o primeiro será o líder</Text>
              </View>
              <Pressable onPress={() => setPickerOpen(false)} style={[styles.pickerClose, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar Pokémon ou coleção..."
              placeholderTextColor={colors.muted}
              style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <FlatList
              {...VIRTUAL_LIST_PERF_PROPS}
              data={cards}
              keyExtractor={(card) => card.cardId}
              style={styles.pickerList}
              contentContainerStyle={styles.pickerListContent}
              ListEmptyComponent={(
                <View style={styles.pickerEmpty}>
                  <Ionicons name="search" size={28} color={colors.muted} />
                  <Text style={[styles.subtitle, { color: colors.muted }]}>Nenhum Pokémon encontrado.</Text>
                </View>
              )}
              renderItem={({ item: card }) => {
                const index = selected.findIndex((item) => item.cardId === card.cardId);
                const active = index >= 0;
                const blocked = !active && selected.length >= 3;
                return (
                  <Pressable
                    disabled={blocked || working}
                    onPress={() => toggleCard(card)}
                    style={[styles.pickerCard, { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : colors.surface }, blocked && styles.pickerBlocked]}
                  >
                    {card.image ? <Image source={{ uri: card.image }} style={styles.cardImage} resizeMode="contain" resizeMethod="resize" fadeDuration={0} /> : <View style={[styles.cardImage, { backgroundColor: colors.surfaceAlt }]} />}
                    <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.cardName, { color: colors.text }]}>{card.name}</Text>
                      <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>{card.setName ?? card.rarity ?? 'Pokémon'}</Text>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>HP {card.hp ?? '—'} • SPD {card.speed ?? '—'}</Text>
                    </View>
                    {active ? <View style={[styles.pickBadge, { backgroundColor: colors.accent }]}><Text style={styles.pickBadgeText}>{index + 1}</Text></View> : <Ionicons name="add-circle-outline" size={22} color={blocked ? colors.muted : colors.accent} />}
                  </Pressable>
                );
              }}
            />

            <Pressable onPress={() => setPickerOpen(false)} style={[styles.primaryButton, { backgroundColor: colors.accent }]}>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>USAR {selected.length}/3 SELECIONADOS</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}'''
text = text.replace(modal_anchor, modal, 1)

old_styles = '''  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardPick: { width: '48.5%', minHeight: 116, borderWidth: 1.5, borderRadius: 13, padding: 8, flexDirection: 'row', gap: 8, alignItems: 'center', position: 'relative' },
  cardImage: { width: 58, height: 82, borderRadius: 6 },'''
new_styles = '''  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  pickerTrigger: { minHeight: 64, borderWidth: 1, borderRadius: 13, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  pickerTriggerIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(2,5,12,.84)', padding: 14, justifyContent: 'center' },
  pickerModal: { width: '100%', maxWidth: 720, height: '88%', alignSelf: 'center', borderWidth: 1, borderRadius: 22, padding: 12, gap: 10 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickerClose: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pickerList: { flex: 1 },
  pickerListContent: { gap: 7, paddingBottom: 8 },
  pickerCard: { minHeight: 100, borderWidth: 1.5, borderRadius: 13, padding: 8, flexDirection: 'row', gap: 9, alignItems: 'center', position: 'relative' },
  pickerBlocked: { opacity: 0.45 },
  pickerEmpty: { padding: 30, alignItems: 'center', gap: 8 },
  cardImage: { width: 58, height: 82, borderRadius: 6 },'''
assert old_styles in text, 'team3 styles anchor missing'
text = text.replace(old_styles, new_styles, 1)

p.write_text(text)
