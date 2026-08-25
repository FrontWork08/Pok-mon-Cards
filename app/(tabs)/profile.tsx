import { Screen } from '@/components/Screen';
import { FeatureCard } from '@/components/FeatureCard';

export default function ProfileScreen() {
  return (
    <Screen title="Trainer Profile" subtitle="Sua identidade no jogo.">
      <FeatureCard title="TRAINER ID" value="---" description="Username único, nível, estatísticas e showcase de cards favoritos." />
      <FeatureCard title="AMIGOS" description="Adicione jogadores para acompanhar perfis e iniciar trocas." />
    </Screen>
  );
}
