from pathlib import Path

p = Path('src/services/pokemon3dModels.ts')
s = p.read_text()

anchor = "const BUCKET = 'pokemon-3d';\n"
block = """const BUCKET = 'pokemon-3d';
const LAB_ASSET_COMMIT = 'e4bec85de903602876bbc7bcb55399fae4f74f9e';
const LAB_RAW_ROOT = `https://raw.githubusercontent.com/FrontWork08/Pok-mon-Cards/${LAB_ASSET_COMMIT}/lab-assets/3d`;
const BUILTIN_LAB_MANIFESTS: Record<number, Pokemon3DModelManifest> = {
  25: { pokemon_id: 25, form_key: 'lab', storage_path: `${LAB_RAW_ROOT}/25-pikachu-lab-v1.glb`, format: 'glb', version: 1, sha256: null, byte_size: 27316, scale: 1, offset_x: 0, offset_y: 0, offset_z: 0, rotation_y: 0, animations: { idle: 'Idle', attack: 'Attack', hit: 'Hit', faint: 'Faint', victory: 'Victory' }, min_app_version: null },
  6: { pokemon_id: 6, form_key: 'lab', storage_path: `${LAB_RAW_ROOT}/6-charizard-lab-v1.glb`, format: 'glb', version: 1, sha256: null, byte_size: 35160, scale: 1, offset_x: 0, offset_y: 0, offset_z: 0, rotation_y: 0, animations: { idle: 'Idle', attack: 'Attack', hit: 'Hit', faint: 'Faint', victory: 'Victory' }, min_app_version: null },
  130: { pokemon_id: 130, form_key: 'lab', storage_path: `${LAB_RAW_ROOT}/130-gyarados-lab-v1.glb`, format: 'glb', version: 1, sha256: null, byte_size: 47404, scale: 1, offset_x: 0, offset_y: 0, offset_z: 0, rotation_y: 0, animations: { idle: 'Idle', attack: 'Attack', hit: 'Hit', faint: 'Faint', victory: 'Victory' }, min_app_version: null },
};
"""
if anchor not in s:
    raise SystemExit('BUCKET anchor missing')
s = s.replace(anchor, block, 1)

anchor = "  const cacheKey = `${id}:${formKey}`;\n"
inject = """  if (formKey === 'lab' && BUILTIN_LAB_MANIFESTS[id]) {
    return BUILTIN_LAB_MANIFESTS[id];
  }
  const cacheKey = `${id}:${formKey}`;
"""
if anchor not in s:
    raise SystemExit('manifest anchor missing')
s = s.replace(anchor, inject, 1)

old = """  const cleanPath = manifest.storage_path.replace(/^\\/+/, '');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(cleanPath);
  const publicUrl = data.publicUrl;
  if (!publicUrl) return null;
"""
new = """  const publicUrl = manifest.storage_path.startsWith('https://')
    ? manifest.storage_path
    : supabase.storage.from(BUCKET).getPublicUrl(manifest.storage_path.replace(/^\\/+/, '')).data.publicUrl;
  if (!publicUrl) return null;
"""
if old not in s:
    raise SystemExit('download URL block missing')
s = s.replace(old, new, 1)

old = """  const cleanPath = manifest.storage_path.replace(/^\\/+/, '');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(cleanPath);
  if (!data.publicUrl) return null;

  const key = `${id}:${manifest.form_key}:${manifest.version}:${manifest.sha256 ?? ''}:${quality}`;
"""
new = """  const publicUrl = manifest.storage_path.startsWith('https://')
    ? manifest.storage_path
    : supabase.storage.from(BUCKET).getPublicUrl(manifest.storage_path.replace(/^\\/+/, '')).data.publicUrl;
  if (!publicUrl) return null;

  const key = `${id}:${manifest.form_key}:${manifest.version}:${manifest.sha256 ?? ''}:${quality}`;
"""
if old not in s:
    raise SystemExit('resolve URL block missing')
s = s.replace(old, new, 1)
s = s.replace("return localUri ? { manifest, localUri, publicUrl: data.publicUrl } : null;", "return localUri ? { manifest, localUri, publicUrl } : null;", 1)

p.write_text(s)

p = Path('app/admin-3d-lab.tsx')
s = p.read_text()
s = s.replace(
    'Teste recomendado: modelos low-poly originais do projeto, reconhecíveis por espécie, sem arquivos extraídos de jogos. Eles continuam exclusivos da forma LAB.',
    'Os 3 modelos originais de teste agora são carregados automaticamente pelo manifesto LAB. A importação manual abaixo fica apenas para testar outros GLBs autorizados.',
)
s = s.replace('IMPORTAR 3 MODELOS ORIGINAIS DE TESTE', 'REVALIDAR 3 MODELOS NO STORAGE')
p.write_text(s)
