import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getUnseenGlobalAnnouncement, type GlobalAnnouncement } from '@/services/liveEvents';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/ThemeProvider';

const severityTheme = {
  info: { color: '#6FD3FF', icon: 'information-circle' as const, label: 'INFORMAÇÃO' },
  warning: { color: '#FFD166', icon: 'warning' as const, label: 'ATENÇÃO' },
  critical: { color: '#FF6B81', icon: 'alert-circle' as const, label: 'URGENTE' },
};

export function GlobalAnnouncementOverlay() {
  const { colors } = useAppTheme();
  const [announcement, setAnnouncement] = useState<GlobalAnnouncement | null>(null);
  const announcementRef = useRef<GlobalAnnouncement | null>(null);
  const claimingRef = useRef(false);

  const clearAnnouncement = useCallback(() => {
    announcementRef.current = null;
    setAnnouncement(null);
  }, []);

  const refresh = useCallback(async () => {
    if (announcementRef.current || claimingRef.current) return;
    claimingRef.current = true;
    try {
      const current = await getUnseenGlobalAnnouncement();
      if (!current) return;
      announcementRef.current = current;
      setAnnouncement(current);
    } finally {
      claimingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const removeChannel = () => {
      if (!channel) return;
      void supabase.removeChannel(channel);
      channel = null;
    };

    const connect = async () => {
      const { data } = await supabase.auth.getSession();
      if (disposed) return;

      if (!data.session?.user) {
        removeChannel();
        clearAnnouncement();
        return;
      }

      await refresh().catch(() => null);
      if (disposed || channel) return;

      channel = supabase
        .channel('global-announcements-overlay')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'global_announcements' },
          (change) => {
            const current = announcementRef.current;
            const next = change.new as { id?: string; active?: boolean } | null;
            if (
              current &&
              change.eventType === 'UPDATE' &&
              next?.id === current.id &&
              next.active === false
            ) {
              clearAnnouncement();
              return;
            }
            void refresh().catch(() => null);
          },
        )
        .subscribe();
    };

    void connect();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        removeChannel();
        clearAnnouncement();
        return;
      }
      // Defer Supabase work: starting it inside onAuthStateChange can lock
      // the auth client and leave signInWithPassword pending forever.
      setTimeout(() => { void connect(); }, 0);
    });

    return () => {
      disposed = true;
      authListener.subscription.unsubscribe();
      removeChannel();
    };
  }, [clearAnnouncement, refresh]);

  const visual = severityTheme[announcement?.severity ?? 'info'];

  return (
    <Modal
      transparent
      animationType="fade"
      visible={Boolean(announcement)}
      onRequestClose={clearAnnouncement}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: visual.color }]}>
          <View style={[styles.iconWrap, { backgroundColor: visual.color + '22' }]}>
            <Ionicons name={visual.icon} size={30} color={visual.color} />
          </View>
          <Text style={[styles.kicker, { color: visual.color }]}>{visual.label} GLOBAL</Text>
          <Text style={[styles.title, { color: colors.text }]}>{announcement?.title}</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{announcement?.body}</Text>
          <Pressable
            onPress={clearAnnouncement}
            style={[styles.button, { backgroundColor: visual.color }]}
          >
            <Text style={styles.buttonText}>ENTENDI</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '900', textAlign: 'center', marginTop: 5 },
  body: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 },
  button: {
    minHeight: 48,
    alignSelf: 'stretch',
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  buttonText: { color: '#07111F', fontSize: 11, fontWeight: '900', letterSpacing: .6 },
});
