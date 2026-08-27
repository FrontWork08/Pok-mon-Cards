import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type WalletState = {
  userId: string | null;
  coins: number;
  diamonds: number;
  loading: boolean;
  refresh: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: PropsWithChildren) {
  const [userId, setUserId] = useState<string | null>(null);
  const [coins, setCoins] = useState(0);
  const [diamonds, setDiamonds] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const id = auth.user?.id ?? null;
    setUserId(id);
    if (!id) {
      setCoins(0);
      setDiamonds(0);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('players')
      .select('coins,diamonds')
      .eq('id', id)
      .single();
    if (!error && data) {
      setCoins(Number(data.coins ?? 0));
      setDiamonds(Number(data.diamonds ?? 0));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => { void refresh(); }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`wallet:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${userId}` },
        (change) => {
          const row = change.new as { coins?: number | string; diamonds?: number | string };
          if (row.coins != null) setCoins(Number(row.coins));
          if (row.diamonds != null) setDiamonds(Number(row.diamonds));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const value = useMemo(
    () => ({ userId, coins, diamonds, loading, refresh }),
    [userId, coins, diamonds, loading, refresh],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error('useWallet must be used inside WalletProvider');
  return value;
}
