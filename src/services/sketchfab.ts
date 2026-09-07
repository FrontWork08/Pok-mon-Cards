import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';

export type SketchfabIntegrationStatus = {
  configured: boolean;
  clientIdHint: string | null;
  connected: boolean;
  username: string | null;
  sketchfabUserId: string | null;
  expiresAt: string | null;
  connectedAt: string | null;
  redirectUri: string;
};

export type SketchfabImportJob = {
  id: string;
  pokemon_id: number;
  model_uid: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  model_name: string | null;
  model_author: string | null;
  model_license: string | null;
  model_license_url: string | null;
  storage_path: string | null;
  model_version: number | null;
  byte_size: number | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

async function invokeSketchfab<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('sketchfab-oauth', {
    body: { action, ...body },
  });
  if (error) {
    throw await normalizeFunctionError(error, 'Não foi possível acessar a integração do Sketchfab.');
  }
  if (data?.error) throw new Error(String(data.error));
  return data?.data as T;
}

export function getSketchfabStatus() {
  return invokeSketchfab<SketchfabIntegrationStatus>('status');
}

export function saveSketchfabConfig(clientId: string, clientSecret: string) {
  return invokeSketchfab<{ configured: true; redirectUri: string }>('save_config', { clientId, clientSecret });
}

export function startSketchfabOAuth(platform: 'native' | 'web') {
  return invokeSketchfab<{ authorizeUrl: string; redirectUri: string; expiresAt: string }>('start', { platform });
}

export function disconnectSketchfab() {
  return invokeSketchfab<{ connected: false }>('disconnect');
}

export function queueSketchfabLabImport(pokemonId: 6 | 25 | 130, modelUid: string) {
  return invokeSketchfab<{ jobId: string }>('queue_import', { pokemonId, modelUid });
}

export function getSketchfabImportJob(jobId: string) {
  return invokeSketchfab<SketchfabImportJob>('job_status', { jobId });
}
