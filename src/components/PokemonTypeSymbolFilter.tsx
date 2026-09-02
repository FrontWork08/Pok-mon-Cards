import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/ThemeProvider';

export const POKEMON_TYPE_SYMBOLS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; soft: string }> = {
  water: { label: 'ÁGUA', icon: 'water', color: '#59A9FF', soft: '#132A3D' },
  fire: { label: 'FOGO', icon: 'flame', color: '#FF725C', soft: '#3A1B18' },
  grass: { label: 'PLANTA', icon: 'leaf', color: '#6FD072', soft: '#19311E' },
  lightning: { label: 'ELÉTRICO', icon: 'flash', color: '#FFD447', soft: '#3A3214' },
  electric: { label: 'ELÉTRICO', icon: 'flash', color: '#FFD447', soft: '#3A3214' },
  psychic: { label: 'PSÍQUICO', icon: 'eye', color: '#D57CFF', soft: '#2F1B3A' },
  fighting: { label: 'LUTADOR', icon: 'barbell', color: '#D99463', soft: '#332318' },
  darkness: { label: 'SOMBRIO', icon: 'moon', color: '#8C93A0', soft: '#20242A' },
  dark: { label: 'SOMBRIO', icon: 'moon', color: '#8C93A0', soft: '#20242A' },
  metal: { label: 'METAL', icon: 'shield-half', color: '#B8C3CE', soft: '#252D34' },
  colorless: { label: 'INCOLOR', icon: 'star', color: '#D8D8D8', soft: '#303030' },
  dragon: { label: 'DRAGÃO', icon: 'diamond', color: '#C79BFF', soft: '#2B2035' },
  fairy: { label: 'FADA', icon: 'sparkles', color: '#FF9DD3', soft: '#371D2D' },
};

export function getPokemonTypeSymbol(type: string) {
  const key = String(type ?? '').trim().toLowerCase();
  return POKEMON_TYPE_SYMBOLS[key] ?? {
    label: String(type ?? '').toUpperCase(),
    icon: 'ellipse' as keyof typeof Ionicons.glyphMap,
    color: '#AAB4BF',
    soft: '#232A31',
  };
}

export function PokemonTypeSymbolFilter({
  types,
  selectedType,
  onChange,
  title = 'TIPO DO POKÉMON',
  allLabel = 'TODOS',
}: {
  types: string[];
  selectedType: string | null;
  onChange: (type: string | null) => void;
  title?: string;
  allLabel?: string;
}) {
  const { colors } = useAppTheme();
  const normalized = Array.from(new Set(types.map((type) => String(type ?? '').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  if (!normalized.length) return null;

  return (
    <View style={styles.group}>
      <Text style={[styles.title, { color: colors.muted }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mostrar todos os tipos"
          onPress={() => onChange(null)}
          style={[styles.allChip, {
            backgroundColor: selectedType == null ? colors.accentSoft : colors.surfaceAlt,
            borderColor: selectedType == null ? colors.accent : colors.border,
          }]}
        >
          <Ionicons name="apps" size={18} color={selectedType == null ? colors.accent : colors.muted}/>
          <Text style={[styles.allText, { color: selectedType == null ? colors.text : colors.muted }]}>{allLabel}</Text>
        </Pressable>
        {normalized.map((type) => {
          const visual = getPokemonTypeSymbol(type);
          const active = selectedType === type;
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar tipo ${visual.label}`}
              onPress={() => onChange(active ? null : type)}
              style={styles.typeButton}
            >
              <View style={[styles.circle, {
                backgroundColor: active ? visual.soft : 'transparent',
                borderColor: active ? visual.color : '#39414A',
              }]}>
                <Ionicons name={visual.icon} size={22} color={visual.color}/>
              </View>
              <Text numberOfLines={1} style={[styles.label, { color: active ? visual.color : '#8E9AA6' }]}>{visual.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  title: { fontSize: 8.5, fontWeight: '900', letterSpacing: 1.1 },
  row: { gap: 9, paddingRight: 8, alignItems: 'flex-start' },
  allChip: { minHeight: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  allText: { fontSize: 7, fontWeight: '900' },
  typeButton: { width: 48, alignItems: 'center', gap: 4 },
  circle: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  label: { width: 52, textAlign: 'center', fontSize: 5.5, fontWeight: '900', letterSpacing: .1 },
});
