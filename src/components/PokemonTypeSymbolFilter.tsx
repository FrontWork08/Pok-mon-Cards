import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/ThemeProvider';

export const POKEMON_GAME_TYPES = [
  'normal',
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark',
  'fairy',
] as const;

const TYPE_ALIASES: Record<string, string> = {
  colorless: 'normal',
  lightning: 'electric',
  darkness: 'dark',
  metal: 'steel',
};

export function normalizePokemonGameType(type: string | null | undefined) {
  const key = String(type ?? '').trim().toLowerCase();
  return TYPE_ALIASES[key] ?? key;
}

export const POKEMON_TYPE_SYMBOLS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; soft: string }> = {
  normal: { label: 'NORMAL', icon: 'radio-button-on', color: '#A8A77A', soft: '#2E2E24' },
  fighting: { label: 'LUTADOR', icon: 'barbell', color: '#C22E28', soft: '#351A19' },
  flying: { label: 'VOADOR', icon: 'airplane', color: '#A98FF3', soft: '#29243A' },
  poison: { label: 'VENENO', icon: 'flask', color: '#A33EA1', soft: '#301C30' },
  ground: { label: 'TERRA', icon: 'layers', color: '#E2BF65', soft: '#352D18' },
  rock: { label: 'PEDRA', icon: 'diamond', color: '#B6A136', soft: '#332E18' },
  bug: { label: 'INSETO', icon: 'bug', color: '#A6B91A', soft: '#2B3017' },
  ghost: { label: 'FANTASMA', icon: 'skull', color: '#735797', soft: '#282034' },
  steel: { label: 'AÇO', icon: 'construct', color: '#B7B7CE', soft: '#2B2D34' },
  fire: { label: 'FOGO', icon: 'flame', color: '#EE8130', soft: '#3A2215' },
  water: { label: 'ÁGUA', icon: 'water', color: '#6390F0', soft: '#17273D' },
  grass: { label: 'PLANTA', icon: 'leaf', color: '#7AC74C', soft: '#20331A' },
  electric: { label: 'ELÉTRICO', icon: 'flash', color: '#F7D02C', soft: '#393315' },
  psychic: { label: 'PSÍQUICO', icon: 'eye', color: '#F95587', soft: '#3A1B29' },
  ice: { label: 'GELO', icon: 'snow', color: '#96D9D6', soft: '#1D3334' },
  dragon: { label: 'DRAGÃO', icon: 'diamond-outline', color: '#6F35FC', soft: '#251A43' },
  dark: { label: 'SOMBRIO', icon: 'moon', color: '#705746', soft: '#29221E' },
  fairy: { label: 'FADA', icon: 'sparkles', color: '#D685AD', soft: '#382330' },

  // Compatibilidade com dados antigos do TCG enquanto clientes/objetos em cache são atualizados.
  colorless: { label: 'NORMAL', icon: 'radio-button-on', color: '#A8A77A', soft: '#2E2E24' },
  lightning: { label: 'ELÉTRICO', icon: 'flash', color: '#F7D02C', soft: '#393315' },
  darkness: { label: 'SOMBRIO', icon: 'moon', color: '#705746', soft: '#29221E' },
  metal: { label: 'AÇO', icon: 'construct', color: '#B7B7CE', soft: '#2B2D34' },
};

export function getPokemonTypeSymbol(type: string) {
  const key = normalizePokemonGameType(type);
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
  const selectedKey = selectedType ? normalizePokemonGameType(selectedType) : null;

  const extras = Array.from(new Set(
    types
      .map((type) => normalizePokemonGameType(type))
      .filter((type) => Boolean(type) && !POKEMON_GAME_TYPES.includes(type as (typeof POKEMON_GAME_TYPES)[number])),
  )).sort((a, b) => a.localeCompare(b));

  // Filtros de Pokémon usam sempre os 18 tipos oficiais do jogo.
  // Tipos desconhecidos são mantidos no fim apenas por compatibilidade.
  const normalized = [...POKEMON_GAME_TYPES, ...extras];

  return (
    <View style={styles.group}>
      <Text style={[styles.title, { color: colors.muted }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mostrar todos os tipos"
          onPress={() => onChange(null)}
          style={[styles.allChip, {
            backgroundColor: selectedKey == null ? colors.accentSoft : colors.surfaceAlt,
            borderColor: selectedKey == null ? colors.accent : colors.border,
          }]}
        >
          <Ionicons name="apps" size={18} color={selectedKey == null ? colors.accent : colors.muted}/>
          <Text style={[styles.allText, { color: selectedKey == null ? colors.text : colors.muted }]}>{allLabel}</Text>
        </Pressable>
        {normalized.map((type) => {
          const visual = getPokemonTypeSymbol(type);
          const active = selectedKey === type;
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
  typeButton: { width: 50, alignItems: 'center', gap: 4 },
  circle: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  label: { width: 54, textAlign: 'center', fontSize: 5.5, fontWeight: '900', letterSpacing: .1 },
});
