import { supabase } from '@/lib/supabase';

export type AppRuntimeStatus = {
  id: number;
  maintenance_enabled: boolean;
  maintenance_message: string;
  enabled_at: string | null;
  enabled_by: string | null;
  updated_at: string;
};

const FALLBACK_STATUS: AppRuntimeStatus = {
  id: 1,
  maintenance_enabled: false,
  maintenance_message: 'Estamos aplicando uma atualização importante. O jogo voltará em breve.',
  enabled_at: null,
  enabled_by: null,
  updated_at: new Date(0).toISOString(),
};

export async function getMaintenanceStatus() {
  const { data, error } = await supabase
    .from('app_runtime_status')
    .select('id,maintenance_enabled,maintenance_message,enabled_at,enabled_by,updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? FALLBACK_STATUS) as AppRuntimeStatus;
}
