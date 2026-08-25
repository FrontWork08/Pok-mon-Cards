import { Screen } from '@/components/Screen';
import { FeatureCard } from '@/components/FeatureCard';

export default function BagScreen() {
  return (
    <Screen title="Pokémon Bag" subtitle="Pesquise, filtre e organize seus cards.">
      <FeatureCard title="🔍 PESQUISA" description="Busca por Pokémon, set e número da Pokédex." />
      <FeatureCard title="FILTROS" description="Tipo, raridade, set, favoritos, obtidos e duplicatas." />
    </Screen>
  );
}
