import { Screen } from '@/components/Screen';
import { FeatureCard } from '@/components/FeatureCard';

export default function TradeScreen() {
  return (
    <Screen title="Trade" subtitle="Negocie cards com seus amigos.">
      <FeatureCard title="NOVA TROCA" description="Escolha um amigo, monte sua oferta e selecione os cards desejados." />
      <FeatureCard title="VALIDAÇÃO" description="A transferência só acontece após confirmação e validação final do inventário pelo servidor." />
    </Screen>
  );
}
