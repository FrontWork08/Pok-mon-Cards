import { ingestPokemon3DLabModel, type Pokemon3DLabIngestResult } from '@/services/pokemon3dLab';

export const ORIGINAL_3D_LAB_MODELS = [
  {
    pokemonId: 25 as const,
    name: 'Pikachu',
    sourceUrl: 'https://raw.githubusercontent.com/FrontWork08/Pok-mon-Cards/main/lab-assets/3d/25-pikachu-lab-v1.glb',
  },
  {
    pokemonId: 6 as const,
    name: 'Charizard',
    sourceUrl: 'https://raw.githubusercontent.com/FrontWork08/Pok-mon-Cards/main/lab-assets/3d/6-charizard-lab-v1.glb',
  },
  {
    pokemonId: 130 as const,
    name: 'Gyarados',
    sourceUrl: 'https://raw.githubusercontent.com/FrontWork08/Pok-mon-Cards/main/lab-assets/3d/130-gyarados-lab-v1.glb',
  },
] as const;

const SOURCE_AUTHOR = 'Trainer Collection 3D Lab';
const SOURCE_PERMISSION = 'Modelo original gerado internamente para teste técnico do TCC; não é asset oficial nem extraído de jogo. Pokémon e personagens pertencem aos respectivos titulares.';

export async function ingestOriginal3DLabModels(): Promise<Pokemon3DLabIngestResult[]> {
  const results: Pokemon3DLabIngestResult[] = [];
  for (const model of ORIGINAL_3D_LAB_MODELS) {
    results.push(await ingestPokemon3DLabModel({
      pokemonId: model.pokemonId,
      sourceUrl: model.sourceUrl,
      sourceAuthor: SOURCE_AUTHOR,
      sourceLicense: SOURCE_PERMISSION,
    }));
  }
  return results;
}
