import { supabase } from '@/lib/supabase';
import { ingestPokemon3DLabModel, type Pokemon3DLabIngestResult } from '@/services/pokemon3dLab';

export const ORIGINAL_3D_LAB_MODELS = [
  {
    pokemonId: 25 as const,
    name: 'Pikachu',
    sourceUrl: 'https://storage.to3d.app/generated-3d/models/2026-09-07/task_9827bdc8-97d5-4f0c-b953-807032d0ee16_model.glb',
  },
  {
    pokemonId: 6 as const,
    name: 'Charizard',
    sourceUrl: 'https://storage.to3d.app/generated-3d/models/2026-09-07/task_06a805ae-0d96-4d62-9008-ef1b4e629b3a_model.glb',
  },
  {
    pokemonId: 130 as const,
    name: 'Gyarados',
    sourceUrl: 'https://storage.to3d.app/generated-3d/models/2026-09-07/task_178d5703-429d-4dae-8ba9-823327d5eb79_model.glb',
  },
] as const;

const SOURCE_AUTHOR = 'Trainer Collection 3D Lab / to3D';
const SOURCE_PERMISSION = 'Teste interno: GLB gerado via to3D a partir de referência visual. Não extraído de jogo; uso restrito ao 3D Lab.';

async function getRegisteredLabIds() {
  const ids = ORIGINAL_3D_LAB_MODELS.map((model) => model.pokemonId);
  const { data, error } = await supabase
    .from('pokemon_3d_models')
    .select('pokemon_id')
    .eq('form_key', 'lab')
    .eq('enabled', true)
    .in('pokemon_id', ids);

  if (error) throw new Error(`Não foi possível consultar os modelos 3D do LAB: ${error.message}`);
  return new Set((data ?? []).map((row) => Number(row.pokemon_id)));
}

export async function ensureOriginal3DLabModels(): Promise<{
  imported: Pokemon3DLabIngestResult[];
  readyIds: number[];
}> {
  const registered = await getRegisteredLabIds();
  const imported: Pokemon3DLabIngestResult[] = [];

  for (const model of ORIGINAL_3D_LAB_MODELS) {
    if (registered.has(model.pokemonId)) continue;
    const result = await ingestPokemon3DLabModel({
      pokemonId: model.pokemonId,
      sourceUrl: model.sourceUrl,
      sourceAuthor: SOURCE_AUTHOR,
      sourceLicense: SOURCE_PERMISSION,
    });
    imported.push(result);
    registered.add(model.pokemonId);
  }

  return {
    imported,
    readyIds: ORIGINAL_3D_LAB_MODELS
      .map((model) => model.pokemonId)
      .filter((id) => registered.has(id)),
  };
}

export async function ingestOriginal3DLabModels(): Promise<Pokemon3DLabIngestResult[]> {
  const result = await ensureOriginal3DLabModels();
  return result.imported;
}
