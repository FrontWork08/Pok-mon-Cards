import fs from 'node:fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, text) { fs.writeFileSync(file, text); }
function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`patch marker missing: ${label}`);
  return text.replace(from, to);
}

// 1) Make model registry resolution form-aware while preserving default production behavior.
{
  const file = 'src/services/pokemon3dModels.ts';
  let s = read(file);
  s = replaceOnce(s,
    "const manifestCache = new Map<number, { expiresAt: number; value: Pokemon3DModelManifest | null }>();",
    "const manifestCache = new Map<string, { expiresAt: number; value: Pokemon3DModelManifest | null }>();",
    'manifest cache key type');
  s = replaceOnce(s,
    "function safeFilePart(value: string) {\n  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || 'default';\n}\n",
    "function normalizeFormKey(value: unknown) {\n  const raw = typeof value === 'string' ? value.trim() : '';\n  if (!raw || raw.length > 40 || !/^[a-zA-Z0-9_-]+$/.test(raw)) return null;\n  return raw;\n}\n\nfunction safeFilePart(value: string) {\n  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || 'default';\n}\n",
    'form key normalizer');
  s = replaceOnce(s,
    "async function getManifest(pokemonId: number) {\n  const id = validPokemonId(pokemonId);\n  if (!id) return null;\n  const cached = manifestCache.get(id);",
    "async function getManifest(pokemonId: number, formKeyInput = 'default') {\n  const id = validPokemonId(pokemonId);\n  const formKey = normalizeFormKey(formKeyInput);\n  if (!id || !formKey) return null;\n  const cacheKey = `${id}:${formKey}`;\n  const cached = manifestCache.get(cacheKey);",
    'getManifest signature');
  s = s.replace(".eq('form_key', 'default')", ".eq('form_key', formKey)");
  s = s.replaceAll('manifestCache.set(id,', 'manifestCache.set(cacheKey,');
  s = replaceOnce(s,
    "export async function resolvePokemon3DModel(\n  pokemonId: unknown,\n  quality: 'low' | 'medium' | 'high' = 'medium',\n): Promise<Pokemon3DModelAsset | null> {\n  const id = validPokemonId(pokemonId);\n  if (!id) return null;\n  const manifest = await getManifest(id);",
    "export async function resolvePokemon3DModel(\n  pokemonId: unknown,\n  quality: 'low' | 'medium' | 'high' = 'medium',\n  formKeyInput = 'default',\n): Promise<Pokemon3DModelAsset | null> {\n  const id = validPokemonId(pokemonId);\n  const formKey = normalizeFormKey(formKeyInput);\n  if (!id || !formKey) return null;\n  const manifest = await getManifest(id, formKey);",
    'resolve signature');
  s = replaceOnce(s,
    "export function invalidatePokemon3DManifest(pokemonId?: unknown) {\n  const id = validPokemonId(pokemonId);\n  if (id) manifestCache.delete(id);\n  else manifestCache.clear();\n}\n",
    "export function invalidatePokemon3DManifest(pokemonId?: unknown, formKeyInput?: unknown) {\n  const id = validPokemonId(pokemonId);\n  const formKey = normalizeFormKey(formKeyInput);\n  if (id && formKey) {\n    manifestCache.delete(`${id}:${formKey}`);\n    return;\n  }\n  if (id) {\n    for (const key of manifestCache.keys()) {\n      if (key.startsWith(`${id}:`)) manifestCache.delete(key);\n    }\n    return;\n  }\n  manifestCache.clear();\n}\n",
    'scoped invalidation');
  write(file, s);
}

// 2) Allow the native arena to resolve an isolated model form.
{
  const file = 'src/components/BattleArena3D.native.tsx';
  let s = read(file);
  s = replaceOnce(s,
    "  quality?: 'low' | 'medium' | 'high';\n};",
    "  quality?: 'low' | 'medium' | 'high';\n  modelFormKey?: string;\n};",
    'native prop');
  s = replaceOnce(s,
    "  quality: 'low' | 'medium' | 'high',\n  isCurrent: () => boolean,\n) {",
    "  quality: 'low' | 'medium' | 'high',\n  modelFormKey: string,\n  isCurrent: () => boolean,\n) {",
    'remote loader form param');
  s = replaceOnce(s,
    "  const asset = await resolvePokemon3DModel(pokemonId, quality);",
    "  const asset = await resolvePokemon3DModel(pokemonId, quality, modelFormKey);",
    'remote resolve form');
  s = replaceOnce(s,
    "  quality = 'medium',\n}: Props) {",
    "  quality = 'medium',\n  modelFormKey = 'default',\n}: Props) {",
    'native default form');
  s = replaceOnce(s,
    "  const sceneKey = `${myPokemonId ?? 'none'}:${rivalPokemonId ?? 'none'}:${quality}`;",
    "  const sceneKey = `${myPokemonId ?? 'none'}:${rivalPokemonId ?? 'none'}:${quality}:${modelFormKey}`;",
    'scene key form');
  s = s.replace(
    "loadRemoteCreature(myModel, myFallback, my, quality, isCurrent)",
    "loadRemoteCreature(myModel, myFallback, my, quality, modelFormKey, isCurrent)");
  s = s.replace(
    "loadRemoteCreature(rivalModel, rivalFallback, rival, quality, isCurrent)",
    "loadRemoteCreature(rivalModel, rivalFallback, rival, quality, modelFormKey, isCurrent)");
  s = replaceOnce(s,
    "  }, [my, myTint, quality, rival, rivalTint]);",
    "  }, [modelFormKey, my, myTint, quality, rival, rivalTint]);",
    'native deps');
  write(file, s);
}

// 3) Forward modelFormKey through adaptive arena; default remains production 'default'.
{
  const file = 'src/components/AdaptiveBattleArena.tsx';
  let s = read(file);
  s = replaceOnce(s,
    "  prefer3D?:boolean;\n};",
    "  prefer3D?:boolean;\n  modelFormKey?:string;\n};",
    'adaptive prop');
  s = replaceOnce(s,
    "export function AdaptiveBattleArena({my,rival,resultKey=null,winner=null,title,subtitle,turnOnly=false,prefer3D=true}:Props){",
    "export function AdaptiveBattleArena({my,rival,resultKey=null,winner=null,title,subtitle,turnOnly=false,prefer3D=true,modelFormKey='default'}:Props){",
    'adaptive default form');
  s = replaceOnce(s,
    "quality={quality}/>",
    "quality={quality} modelFormKey={modelFormKey}/>",
    'adaptive form forwarding');
  write(file, s);
}

// 4) Add owner-only import controls to the existing protected lab.
{
  const file = 'app/admin-3d-lab.tsx';
  let s = read(file);
  s = replaceOnce(s,
    "import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';",
    "import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';",
    'TextInput import');
  s = replaceOnce(s,
    "import { invalidatePokemon3DManifest, resolvePokemon3DModel } from '@/services/pokemon3dModels';",
    "import { invalidatePokemon3DManifest, resolvePokemon3DModel } from '@/services/pokemon3dModels';\nimport { ingestPokemon3DLabModel, type Pokemon3DLabIngestResult } from '@/services/pokemon3dLab';",
    'lab ingest import');
  s = replaceOnce(s,
    "  prefer3D: boolean;\n};",
    "  prefer3D: boolean;\n  modelFormKey: string;\n};",
    'lab arena form prop');
  s = replaceOnce(s,
    "  const [arenaAttempt, setArenaAttempt] = useState(0);\n  const [probe, setProbe]",
    "  const [arenaAttempt, setArenaAttempt] = useState(0);\n  const [importPokemonId, setImportPokemonId] = useState<6 | 25 | 130>(25);\n  const [sourceUrl, setSourceUrl] = useState('');\n  const [sourceAuthor, setSourceAuthor] = useState('');\n  const [sourceLicense, setSourceLicense] = useState('');\n  const [sourceLicenseUrl, setSourceLicenseUrl] = useState('');\n  const [importing, setImporting] = useState(false);\n  const [importError, setImportError] = useState<string | null>(null);\n  const [lastImport, setLastImport] = useState<Pokemon3DLabIngestResult | null>(null);\n  const [probe, setProbe]",
    'lab import state');
  s = s.replace("invalidatePokemon3DManifest();", "invalidatePokemon3DManifest(undefined, 'lab');");
  s = s.replace("resolvePokemon3DModel(pokemon.pokemonId, 'medium')", "resolvePokemon3DModel(pokemon.pokemonId, 'medium', 'lab')");
  s = replaceOnce(s,
    "  useEffect(() => {\n    if (allowed) void probeModels();\n  }, [allowed]);\n\n  async function startRenderer()",
    "  useEffect(() => {\n    if (allowed) void probeModels();\n  }, [allowed]);\n\n  async function importLabModel() {\n    if (importing) return;\n    setImporting(true);\n    setImportError(null);\n    try {\n      const result = await ingestPokemon3DLabModel({\n        pokemonId: importPokemonId,\n        sourceUrl: sourceUrl.trim(),\n        sourceAuthor: sourceAuthor.trim(),\n        sourceLicense: sourceLicense.trim(),\n        sourceLicenseUrl: sourceLicenseUrl.trim() || undefined,\n      });\n      setLastImport(result);\n      invalidatePokemon3DManifest(importPokemonId, 'lab');\n      await probeModels();\n      setRendererState('idle');\n      setArenaComponent(null);\n      setRendererError(null);\n    } catch (error) {\n      setImportError(error instanceof Error ? error.message : 'Falha ao importar GLB');\n    } finally {\n      setImporting(false);\n    }\n  }\n\n  async function startRenderer()",
    'lab import function');
  s = replaceOnce(s,
    "    <Pressable onPress={() => void probeModels()} style={[styles.secondary,{borderColor:colors.accent,backgroundColor:colors.accentSoft}]}><Ionicons name=\"cloud-download-outline\" size={17} color={colors.accent}/><Text style={[styles.secondaryText,{color:colors.text}]}>RETESTAR REGISTRO/CACHE 3D</Text></Pressable>\n",
    "    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:'#7C65D9'}]}>\n      <View style={styles.row}><Ionicons name=\"cube\" size={21} color=\"#BDA8FF\"/><Text style={[styles.title,{color:colors.text}]}>GLB real • forma LAB isolada</Text></View>\n      <Text style={[styles.body,{color:colors.muted}]}>Cole um link HTTPS direto para um GLB que você tenha direito de usar. O servidor valida o arquivo antes de salvar e nunca altera a forma default usada pelas batalhas normais.</Text>\n      <View style={styles.selectorRow}>\n        {([25,6,130] as const).map((id) => <Pressable key={id} onPress={() => setImportPokemonId(id)} style={[styles.selectorChip,{borderColor:importPokemonId===id?'#BDA8FF':colors.border,backgroundColor:importPokemonId===id?'#2C2448':colors.surface}]}>\n          <Text style={[styles.selectorText,{color:importPokemonId===id?'#E8DFFF':colors.muted}]}>#{id} {id===25?'Pikachu':id===6?'Charizard':'Gyarados'}</Text>\n        </Pressable>)}\n      </View>\n      <TextInput value={sourceUrl} onChangeText={setSourceUrl} autoCapitalize=\"none\" autoCorrect={false} placeholder=\"https://.../model.glb\" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,borderColor:colors.border,backgroundColor:'#08131F'}]} />\n      <TextInput value={sourceAuthor} onChangeText={setSourceAuthor} placeholder=\"Autor / fornecedor do modelo\" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,borderColor:colors.border,backgroundColor:'#08131F'}]} />\n      <TextInput value={sourceLicense} onChangeText={setSourceLicense} placeholder=\"Licença / permissão (ex.: CC BY 4.0)\" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,borderColor:colors.border,backgroundColor:'#08131F'}]} />\n      <TextInput value={sourceLicenseUrl} onChangeText={setSourceLicenseUrl} autoCapitalize=\"none\" autoCorrect={false} placeholder=\"Link da licença (opcional)\" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,borderColor:colors.border,backgroundColor:'#08131F'}]} />\n      {importError ? <Text selectable style={[styles.note,{color:'#FF8290'}]}>{importError}</Text> : null}\n      {lastImport ? <Text style={[styles.note,{color:'#65D894'}]}>Último import: #{lastImport.pokemon_id} • v{lastImport.version} • {(lastImport.byte_size/1024/1024).toFixed(2)} MB • {lastImport.inspection.meshCount} mesh(es) • {lastImport.inspection.animationNames.length} animação(ões)</Text> : null}\n      <Pressable onPress={() => void importLabModel()} disabled={importing} style={[styles.primary,{backgroundColor:importing?'#5C5870':colors.yellow},importing&&styles.disabled]}><Ionicons name={importing?'hourglass-outline':'cloud-upload-outline'} size={18} color={importing?'#FFF':'#08131F'}/><Text style={[styles.primaryText,{color:importing?'#FFF':'#08131F'}]}>{importing?'VALIDANDO GLB…':'IMPORTAR GLB PARA LAB'}</Text></Pressable>\n    </View>\n\n    <Pressable onPress={() => void probeModels()} style={[styles.secondary,{borderColor:colors.accent,backgroundColor:colors.accentSoft}]}><Ionicons name=\"cloud-download-outline\" size={17} color={colors.accent}/><Text style={[styles.secondaryText,{color:colors.text}]}>RETESTAR REGISTRO/CACHE 3D</Text></Pressable>\n",
    'lab import UI');
  s = replaceOnce(s,
    "          prefer3D\n        />",
    "          prefer3D\n          modelFormKey=\"lab\"\n        />",
    'lab renderer form');
  s = replaceOnce(s,
    "  probeStatus:{fontSize:10,fontWeight:'900'},\n",
    "  probeStatus:{fontSize:10,fontWeight:'900'},\n  selectorRow:{flexDirection:'row',flexWrap:'wrap',gap:7},\n  selectorChip:{borderWidth:1,borderRadius:999,paddingHorizontal:9,paddingVertical:7},\n  selectorText:{fontSize:9,fontWeight:'900'},\n  input:{minHeight:44,borderWidth:1,borderRadius:11,paddingHorizontal:11,fontSize:11},\n",
    'lab styles');
  write(file, s);
}

// 5) Wire the new invariant audit into verify.
{
  const file = 'package.json';
  let s = read(file);
  s = replaceOnce(s,
    "node scripts/three-glb-fixture-audit.mjs\"",
    "node scripts/three-glb-fixture-audit.mjs && node scripts/three-lab-isolation-audit.mjs\"",
    'verify audit');
  write(file, s);
}

console.log('Applied isolated real-model 3D lab patch.');
