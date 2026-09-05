import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';

const SHORTCUTS = [
  { id: 'bag', title: 'Abrir Bag', params: { href: '/(tabs)/bag' } },
  { id: 'packs', title: 'Abrir Packs', params: { href: '/(tabs)/packs' } },
  { id: 'battles', title: 'Ir para Batalhas', params: { href: '/(tabs)/battles' } },
  { id: 'profile', title: 'Meu Trainer', params: { href: '/(tabs)/profile' } },
] as const;

const ALLOWED = new Set(SHORTCUTS.map((item) => item.params.href));

export function NativeQuickActionsBootstrap({ userId }: { userId?: string | null }) {
  const router = useRouter();
  const handledInitial = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let disposed = false;
    let remove: (() => void) | null = null;

    void import('expo-quick-actions').then(async (QuickActions) => {
      if (disposed) return;
      if (!userId) {
        await QuickActions.setItems([]).catch(() => null);
        return;
      }
      const supported = await QuickActions.isSupported().catch(() => false);
      if (!supported || disposed) return;
      await QuickActions.setItems([...SHORTCUTS]).catch(() => null);

      const open = (action: any) => {
        const href = String(action?.params?.href ?? '');
        if (!ALLOWED.has(href as any)) return;
        router.push(href as never);
      };
      if (!handledInitial.current && QuickActions.initial) {
        handledInitial.current = true;
        setTimeout(() => { if (!disposed) open(QuickActions.initial); }, 100);
      }
      const subscription = QuickActions.addListener(open);
      remove = () => subscription.remove();
    }).catch(() => null);

    return () => {
      disposed = true;
      remove?.();
    };
  }, [router, userId]);

  return null;
}
