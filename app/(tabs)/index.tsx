import { Screen } from '@/components/Screen';
import { FeatureCard } from '@/components/FeatureCard';

export default function HomeScreen() {
  return (
    <Screen title="Pokémon Cards" subtitle="Sua jornada de colecionador começa aqui.">
      <FeatureCard title="COLEÇÃO" value="0 cards" description="Abra seu primeiro booster para começar sua Bag." />
      <FeatureCard title="POKÉDEX" value="0 descobertos" description="Cada espécie obtida avança sua Pokédex." />
      <FeatureCard title="TROCAS" value="0" description="Troque duplicatas com seus amigos de forma segura pelo servidor." />
    </Screen>
  );
}
