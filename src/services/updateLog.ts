import { supabase } from '@/lib/supabase';

export type AppUpdateLog = {
  id: number;
  version: string;
  title: string;
  summary: string;
  changes: string[];
  publishedAt: string;
};

export async function getLatestUpdateLogs(limit = 3): Promise<AppUpdateLog[]> {
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));
  const { data, error } = await supabase
    .from('app_update_logs')
    .select('id,version,title,summary,changes,published_at')
    .eq('active', true)
    .order('published_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: Number(row.id),
    version: String(row.version),
    title: String(row.title),
    summary: String(row.summary),
    changes: Array.isArray(row.changes) ? row.changes.map(String) : [],
    publishedAt: String(row.published_at),
  }));
}
