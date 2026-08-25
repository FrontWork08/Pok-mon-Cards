import { Screen } from '@/components/Screen';
import { FeatureCard } from '@/components/FeatureCard';

export default function PacksScreen() {
  return (
    <Screen title="Packs" subtitle="Compre boosters e expanda sua coleção.">
      <FeatureCard title="LOJA" description="Os sets sincronizados com o catálogo aparecerão aqui com preço e regras próprias de raridade." />
      <FeatureCard title="ABERTURA SEGURA" description="O resultado do booster será sorteado no servidor e só então adicionado à sua Bag." />
    </Screen>
  );
}
