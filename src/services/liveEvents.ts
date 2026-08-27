import { supabase } from '@/lib/supabase';

export type GlobalAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

export type FreeBoosterEvent = {
  id: string;
  event_type: 'free_boosters';
  title: string;
  active: boolean;
  starts_at: string;
  ends_at: string;
  created_at: string;
};

export async function getActiveGlobalAnnouncement() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('global_announcements')
    .select('id,title,body,severity,starts_at,ends_at,created_at')
    .eq('active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as GlobalAnnouncement | null;
}

export async function getActiveFreeBoosterEvent() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('admin_game_events')
    .select('id,event_type,title,active,starts_at,ends_at,created_at')
    .eq('event_type', 'free_boosters')
    .eq('active', true)
    .lte('starts_at', now)
    .gt('ends_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as FreeBoosterEvent | null;
}
