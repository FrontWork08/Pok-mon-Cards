import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';

export type Pokemon3DLabInspection = {
  meshCount: number;
  materialCount: number;
  textureCount: number;
  animationNames: string[];
  animations: Record<string, string>;
  extensions: string[];
};

export type Pokemon3DLabIngestResult = {
  pokemon_id: number;
  form_key: 'lab';
  storage_path: string;
  version: number;
  sha256: string;
  byte_size: number;
  animations: Record<string, string>;
  enabled: boolean;
  source_url: string;
  source_author: string;
  source_license: string;
  source_license_url: string | null;
  inspection: Pokemon3DLabInspection;
  isolated: true;
  productionFormUntouched: true;
};

export async function ingestPokemon3DLabModel(input: {
  pokemonId: 6 | 25 | 130;
  sourceUrl: string;
  sourceAuthor: string;
  sourceLicense: string;
  sourceLicenseUrl?: string;
}) {
  const { data, error } = await supabase.functions.invoke('pokemon-3d-lab-ingest', {
    body: input,
  });
  if (error) {
    throw await normalizeFunctionError(error, 'Não foi possível importar o GLB para o laboratório 3D.');
  }
  if (data?.error) throw new Error(String(data.error));
  return data?.data as Pokemon3DLabIngestResult;
}
