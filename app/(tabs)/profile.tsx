import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { FeatureCard } from '@/components/FeatureCard';
import { signOut } from '@/services/auth';
import { getMyProfile, PlayerProfile } from '@/services/player';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  async function handleSignOut() {
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível sair.';
      Alert.alert('Erro', message);
    }
  }

  return (
    <Screen title="Trainer Profile" subtitle="Sua identidade no jogo.">
      <FeatureCard
        title="TRAINER ID"
        value={profile ? `@${profile.username}` : '---'}
        description={profile ? `Nível ${profile.level} • ${profile.coins} moedas • ${profile.xp} XP` : 'Carregando perfil do treinador.'}
      />
      <FeatureCard title="AMIGOS" description="Adicione jogadores para acompanhar perfis e iniciar trocas." />
      <Pressable style={styles.logout} onPress={handleSignOut}>
        <Text style={styles.logoutText}>Sair da conta</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logout: {
    marginTop: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ff6b6b',
    paddingVertical: 13,
    alignItems: 'center',
  },
  logoutText: {
    color: '#ff8a8a',
    fontWeight: '800',
  },
});
