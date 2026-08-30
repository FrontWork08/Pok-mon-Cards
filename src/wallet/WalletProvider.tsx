import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type WalletState = {
  userId: string | null;
  username: string | null;
  profileIcon: string | null;
  avatarPath: string | null;
  avatarUpdatedAt: string | null;
  coins: number;
  diamonds: number;
  loading: boolean;
  refresh: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: PropsWithChildren) {
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [profileIcon, setProfileIcon] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUpdatedAt, setAvatarUpdatedAt] = useState<string | null>(null);
  const [coins, setCoins] = useState(0);
  const [diamonds, setDiamonds] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const id = auth.user?.id ?? null;
    setUserId(id);
    if (!id) {
      setUsername(null);
      setProfileIcon(null);
      setAvatarPath(null);
      setAvatarUpdatedAt(null);
      setCoins(0);
      setDiamonds(0);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('players')
      .select('username,profile_icon,avatar_path,avatar_updated_at,coins,diamonds')
      .eq('id', id)
      .single();
    if (!error && data) {
      setUsername(data.username ?? null);
      setProfileIcon(data.profile_icon ?? null);
      setAvatarPath(data.avatar_path ?? null);
      setAvatarUpdatedAt(data.avatar_updated_at ?? null);
      setCoins(Number(data.coins ?? 0));
      setDiamonds(Number(data.diamonds ?? 0));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;

      if (!nextUserId) {
        // Clear authenticated UI state immediately on logout instead of waiting
        // for a follow-up getUser() round trip. This prevents stale private
        // screens (for example the profile) from remaining visible.
        setUserId(null);
        setUsername(null);
        setProfileIcon(null);
        setAvatarPath(null);
        setAvatarUpdatedAt(null);
        setCoins(0);
        setDiamonds(0);
        setLoading(false);
        return;
      }

      setUserId(nextUserId);
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
          const row = change.new as {
            username?: string;
            profile_icon?: string;
            avatar_path?: string | null;
            avatar_updated_at?: string | null;
            coins?: number | string;
            diamonds?: number | string;
          };
          if (row.username != null) setUsername(row.username);
          if (row.profile_icon != null) setProfileIcon(row.profile_icon);
          if ('avatar_path' in row) setAvatarPath(row.avatar_path ?? null);
          if ('avatar_updated_at' in row) setAvatarUpdatedAt(row.avatar_updated_at ?? null);
          if (row.coins != null) setCoins(Number(row.coins));
          if (row.diamonds != null) setDiamonds(Number(row.diamonds));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const value = useMemo(
    () => ({ userId, username, profileIcon, avatarPath, avatarUpdatedAt, coins, diamonds, loading, refresh }),
    [userId, username, profileIcon, avatarPath, avatarUpdatedAt, coins, diamonds, loading, refresh],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error('useWallet must be used inside WalletProvider');
  return value;
}
