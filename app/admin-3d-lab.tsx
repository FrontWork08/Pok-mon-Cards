import { Component, type ComponentType, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { getMyAdminAccess } from '@/services/admin';
import { invalidatePokemon3DManifest, resolvePokemon3DModel } from '@/services/pokemon3dModels';
import { ingestPokemon3DLabModel, type Pokemon3DLabIngestResult } from '@/services/pokemon3dLab';
import { useAppTheme } from '@/theme/ThemeProvider';

type LabPokemon = {
  name: string;
  pokemonId: number;
  pokedexNumber: number;
  hp: number;
  maxHp: number;
  attackName: string;
  damage: number;
  firstPlayer?: boolean;
  knockedOut?: boolean;
  types: string[];
};

type ProbeState = 'pending' | 'remote' | 'fallback' | 'error';

type ArenaProps = {
  my: LabPokemon;
  rival: LabPokemon;
  resultKey: number;
  winner: 'me' | 'rival' | null;
  title: string;
  subtitle: string;
  prefer3D: boolean;
  modelFormKey: string;
};

type BoundaryProps = { children: ReactNode; onError: (message: string) => void };
type BoundaryState = { failed: boolean };
class ArenaErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };
  static getDerivedStateFromError(): BoundaryState { return { failed: true }; }
  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : 'Falha inesperada no componente 3D');
  }
  render() { return this.state.failed ? null : this.props.children; }
}

const TEST_POKEMON: LabPokemon[] = [
  { name: 'Pikachu • teste pequeno', pokemonId: 25, pokedexNumber: 25, hp: 110, maxHp: 110, attackName: 'Thunderbolt', damage: 36, firstPlayer: true, types: ['electric'] },
  { name: 'Charizard • teste grande', pokemonId: 6, pokedexNumber: 6, hp: 170, maxHp: 170, attackName: 'Flamethrower', damage: 48, types: ['fire', 'flying'] },
  { name: 'Gyarados • teste alongado', pokemonId: 130, pokedexNumber: 130, hp: 190, maxHp: 190, attackName: 'Waterfall', damage: 44, types: ['water', 'flying'] },
];

const PAIRS: Array<[number, number]> = [[0, 1], [1, 2], [2, 0]];
const STRESS_CYCLES = 100;

function clonePokemon(source: LabPokemon, patch: Partial<LabPokemon> = {}): LabPokemon {
  return { ...source, ...patch, types: [...source.types] };
}

export default function Admin3DLabScreen() {
  const { colors } = useAppTheme();
  const [accessLoading, setAccessLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [pairIndex, setPairIndex] = useState(0);
  const [resultKey, setResultKey] = useState(0);
  const [winner, setWinner] = useState<'me' | 'rival' | null>(null);
  const [myPatch, setMyPatch] = useState<Partial<LabPokemon>>({});
  const [rivalPatch, setRivalPatch] = useState<Partial<LabPokemon>>({});
  const [stressRunning, setStressRunning] = useState(false);
  const [stressDone, setStressDone] = useState(0);
  const [stressErrors, setStressErrors] = useState(0);
  const [arenaComponent, setArenaComponent] = useState<ComponentType<ArenaProps> | null>(null);
  const [rendererState, setRendererState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [arenaAttempt, setArenaAttempt] = useState(0);
  const [importPokemonId, setImportPokemonId] = useState<6 | 25 | 130>(25);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceAuthor, setSourceAuthor] = useState('');
  const [sourceLicense, setSourceLicense] = useState('');
  const [sourceLicenseUrl, setSourceLicenseUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<Pokemon3DLabIngestResult | null>(null);
  const [probe, setProbe] = useState<Record<number, ProbeState>>({ 25: 'pending', 6: 'pending', 130: 'pending' });
  const stressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stressStep = useRef(0);

  const pair = PAIRS[pairIndex] ?? PAIRS[0];
  const my = useMemo(() => clonePokemon(TEST_POKEMON[pair[0]], myPatch), [myPatch, pair]);
  const rival = useMemo(() => clonePokemon(TEST_POKEMON[pair[1]], rivalPatch), [rivalPatch, pair]);

  useEffect(() => {
    let active = true;
    void getMyAdminAccess()
      .then((access) => {
        if (!active) return;
        setAllowed(Boolean(access.isOwner));
      })
      .catch(() => {
        if (active) setAllowed(false);
      })
      .finally(() => {
        if (active) setAccessLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (stressTimer.current) clearInterval(stressTimer.current);
  }, []);

  async function probeModels() {
    invalidatePokemon3DManifest(undefined, 'lab');
    setProbe({ 25: 'pending', 6: 'pending', 130: 'pending' });
    await Promise.all(TEST_POKEMON.map(async (pokemon) => {
      try {
        const asset = await resolvePokemon3DModel(pokemon.pokemonId, 'medium', 'lab');
        setProbe((current) => ({ ...current, [pokemon.pokemonId]: asset ? 'remote' : 'fallback' }));
      } catch {
        setProbe((current) => ({ ...current, [pokemon.pokemonId]: 'error' }));
      }
    }));
  }

  useEffect(() => {
    if (allowed) void probeModels();
  }, [allowed]);

  async function importLabModel() {
    if (importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const result = await ingestPokemon3DLabModel({
        pokemonId: importPokemonId,
        sourceUrl: sourceUrl.trim(),
        sourceAuthor: sourceAuthor.trim(),
        sourceLicense: sourceLicense.trim(),
        sourceLicenseUrl: sourceLicenseUrl.trim() || undefined,
      });
      setLastImport(result);
      invalidatePokemon3DManifest(importPokemonId, 'lab');
      await probeModels();
      setRendererState('idle');
      setArenaComponent(null);
      setRendererError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Falha ao importar GLB');
    } finally {
      setImporting(false);
    }
  }

  async function startRenderer() {
    if (rendererState === 'loading') return;
    setRendererState('loading');
    setRendererError(null);
    setArenaComponent(null);
    try {
      const module = await import('@/components/AdaptiveBattleArena');
      setArenaComponent(() => module.AdaptiveBattleArena as ComponentType<ArenaProps>);
      setArenaAttempt((value) => value + 1);
      setRendererState('ready');
    } catch (error) {
      setRendererState('error');
      setRendererError(error instanceof Error ? error.message : 'Não foi possível carregar o módulo 3D');
    }
  }

  function handleArenaError(message: string) {
    setRendererState('error');
    setRendererError(message);
    setArenaComponent(null);
    stopStress();
  }

  function resetBattle() {
    setMyPatch({});
    setRivalPatch({});
    setWinner(null);
    setResultKey((value) => value + 1);
  }

  function triggerAttack() {
    setMyPatch({ firstPlayer: true, knockedOut: false });
    setRivalPatch({ firstPlayer: false, hp: Math.max(1, rival.maxHp - my.damage), knockedOut: false });
    setWinner(null);
    setResultKey((value) => value + 1);
  }

  function triggerKo() {
    setMyPatch({ firstPlayer: true, knockedOut: false });
    setRivalPatch({ firstPlayer: false, hp: 0, knockedOut: true });
    setWinner('me');
    setResultKey((value) => value + 1);
  }

  function nextPair() {
    setPairIndex((value) => (value + 1) % PAIRS.length);
    setMyPatch({});
    setRivalPatch({});
    setWinner(null);
    setResultKey((value) => value + 1);
  }

  function stopStress() {
    if (stressTimer.current) clearInterval(stressTimer.current);
    stressTimer.current = null;
    setStressRunning(false);
  }

  function runStress() {
    stopStress();
    stressStep.current = 0;
    setStressDone(0);
    setStressErrors(0);
    setStressRunning(true);
    stressTimer.current = setInterval(() => {
      try {
        const step = ++stressStep.current;
        setPairIndex(step % PAIRS.length);
        const ko = step % 10 === 0;
        const rivalHp = ko ? 0 : 70 + (step % 5) * 15;
        setMyPatch({ firstPlayer: step % 2 === 0, knockedOut: false, hp: 90 + (step % 4) * 5 });
        setRivalPatch({ firstPlayer: step % 2 !== 0, knockedOut: ko, hp: rivalHp });
        setWinner(ko ? 'me' : null);
        setResultKey((value) => value + 1);
        setStressDone(step);
        if (step >= STRESS_CYCLES) stopStress();
      } catch {
        setStressErrors((value) => value + 1);
        stopStress();
      }
    }, 260);
  }

  if (accessLoading) {
    return <Screen title="3D Lab • Admin" subtitle="Validando acesso do proprietário"><ActivityIndicator size="large" color={colors.yellow} /></Screen>;
  }

  if (!allowed) {
    return <Screen title="3D Lab • Admin" subtitle="Área de teste isolada"><View style={[styles.card,{backgroundColor:colors.surface,borderColor:'#D96575'}]}><Ionicons name="lock-closed" size={24} color="#FF8290"/><Text style={[styles.title,{color:colors.text}]}>Acesso bloqueado</Text><Text style={[styles.body,{color:colors.muted}]}>Este laboratório foi limitado ao proprietário para não expor o teste 3D aos jogadores.</Text></View></Screen>;
  }

  const probeLabel = (id: number) => probe[id] === 'remote' ? 'GLB remoto pronto' : probe[id] === 'fallback' ? 'Fallback seguro' : probe[id] === 'error' ? 'Falha no probe' : 'Verificando…';
  const probeColor = (id: number) => probe[id] === 'remote' ? '#65D894' : probe[id] === 'fallback' ? '#FFD447' : probe[id] === 'error' ? '#FF8290' : colors.muted;

  return <Screen title="3D Lab • Primeiro teste" subtitle="Owner-only • nada aqui altera batalha, ELO, inventário ou economia">
    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={styles.row}><Ionicons name="shield-checkmark" size={21} color="#65D894"/><Text style={[styles.title,{color:colors.text}]}>Teste isolado</Text></View>
      <Text style={[styles.body,{color:colors.muted}]}>Objetivo: validar troca de espécies, remontagem da cena 3D, ataque, dano, KO, vitória e fallback em 100 ciclos antes de liberar qualquer lote de modelos.</Text>
      <Text style={[styles.note,{color:colors.muted}]}>Plataforma atual: {Platform.OS}. O teste visual real do GLView ocorre no Android/iOS; na Web a arena usa o fallback 2D.</Text>
    </View>

    <View style={styles.probeGrid}>
      {TEST_POKEMON.map((pokemon) => <View key={pokemon.pokemonId} style={[styles.probe,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text numberOfLines={1} style={[styles.probeName,{color:colors.text}]}>{pokemon.name}</Text>
        <Text style={[styles.probeMeta,{color:colors.muted}]}>#{String(pokemon.pokemonId).padStart(4,'0')}</Text>
        <Text style={[styles.probeStatus,{color:probeColor(pokemon.pokemonId)}]}>{probeLabel(pokemon.pokemonId)}</Text>
      </View>)}
    </View>

    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:'#7C65D9'}]}>
      <View style={styles.row}><Ionicons name="cube" size={21} color="#BDA8FF"/><Text style={[styles.title,{color:colors.text}]}>GLB real • forma LAB isolada</Text></View>
      <Text style={[styles.body,{color:colors.muted}]}>Cole um link HTTPS direto para um GLB que você tenha direito de usar. O servidor valida o arquivo antes de salvar e nunca altera a forma default usada pelas batalhas normais.</Text>
      <View style={styles.selectorRow}>
        {([25,6,130] as const).map((id) => <Pressable key={id} onPress={() => setImportPokemonId(id)} style={[styles.selectorChip,{borderColor:importPokemonId===id?'#BDA8FF':colors.border,backgroundColor:importPokemonId===id?'#2C2448':colors.surface}]}>
          <Text style={[styles.selectorText,{color:importPokemonId===id?'#E8DFFF':colors.muted}]}>#{id} {id===25?'Pikachu':id===6?'Charizard':'Gyarados'}</Text>
        </Pressable>)}
      </View>
      <TextInput value={sourceUrl} onChangeText={setSourceUrl} autoCapitalize="none" autoCorrect={false} placeholder="https://.../model.glb" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,borderColor:colors.border,backgroundColor:'#08131F'}]} />
      <TextInput value={sourceAuthor} onChangeText={setSourceAuthor} placeholder="Autor / fornecedor do modelo" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,borderColor:colors.border,backgroundColor:'#08131F'}]} />
      <TextInput value={sourceLicense} onChangeText={setSourceLicense} placeholder="Licença / permissão (ex.: CC BY 4.0)" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,borderColor:colors.border,backgroundColor:'#08131F'}]} />
      <TextInput value={sourceLicenseUrl} onChangeText={setSourceLicenseUrl} autoCapitalize="none" autoCorrect={false} placeholder="Link da licença (opcional)" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,borderColor:colors.border,backgroundColor:'#08131F'}]} />
      {importError ? <Text selectable style={[styles.note,{color:'#FF8290'}]}>{importError}</Text> : null}
      {lastImport ? <Text style={[styles.note,{color:'#65D894'}]}>Último import: #{lastImport.pokemon_id} • v{lastImport.version} • {(lastImport.byte_size/1024/1024).toFixed(2)} MB • {lastImport.inspection.meshCount} mesh(es) • {lastImport.inspection.animationNames.length} animação(ões)</Text> : null}
      <Pressable onPress={() => void importLabModel()} disabled={importing} style={[styles.primary,{backgroundColor:importing?'#5C5870':colors.yellow},importing&&styles.disabled]}><Ionicons name={importing?'hourglass-outline':'cloud-upload-outline'} size={18} color={importing?'#FFF':'#08131F'}/><Text style={[styles.primaryText,{color:importing?'#FFF':'#08131F'}]}>{importing?'VALIDANDO GLB…':'IMPORTAR GLB PARA LAB'}</Text></Pressable>
    </View>

    <Pressable onPress={() => void probeModels()} style={[styles.secondary,{borderColor:colors.accent,backgroundColor:colors.accentSoft}]}><Ionicons name="cloud-download-outline" size={17} color={colors.accent}/><Text style={[styles.secondaryText,{color:colors.text}]}>RETESTAR REGISTRO/CACHE 3D</Text></Pressable>

    {rendererState === 'idle' ? (
      <View style={[styles.card,{backgroundColor:colors.surface,borderColor:'#50D7F0'}]}>
        <View style={styles.row}><Ionicons name="cube-outline" size={21} color="#7FEAFF"/><Text style={[styles.title,{color:colors.text}]}>Render 3D ainda não iniciado</Text></View>
        <Text style={[styles.body,{color:colors.muted}]}>A tela do laboratório abre primeiro sem carregar o GLView. Toque abaixo para iniciar o renderizador de forma isolada.</Text>
        <Pressable onPress={() => void startRenderer()} style={[styles.primary,{backgroundColor:colors.yellow}]}><Ionicons name="play" size={18} color="#08131F"/><Text style={[styles.primaryText,{color:'#08131F'}]}>INICIAR TESTE 3D</Text></Pressable>
      </View>
    ) : rendererState === 'loading' ? (
      <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}><ActivityIndicator color={colors.yellow}/><Text style={[styles.body,{color:colors.muted}]}>Carregando módulo 3D de forma protegida…</Text></View>
    ) : rendererState === 'error' || !arenaComponent ? (
      <View style={[styles.card,{backgroundColor:colors.surface,borderColor:'#D96575'}]}>
        <View style={styles.row}><Ionicons name="warning-outline" size={21} color="#FF8290"/><Text style={[styles.title,{color:colors.text}]}>Render 3D bloqueado com segurança</Text></View>
        <Text selectable style={[styles.body,{color:'#FFB6C0'}]}>{rendererError ?? 'Falha desconhecida no renderizador.'}</Text>
        <Text style={[styles.note,{color:colors.muted}]}>O laboratório continua aberto para diagnóstico; nenhum dado do jogo foi alterado.</Text>
        <Pressable onPress={() => void startRenderer()} style={[styles.secondary,{borderColor:colors.accent,backgroundColor:colors.accentSoft}]}><Ionicons name="refresh" size={17} color={colors.accent}/><Text style={[styles.secondaryText,{color:colors.text}]}>TENTAR NOVAMENTE</Text></Pressable>
      </View>
    ) : (() => {
      const Arena = arenaComponent;
      return <ArenaErrorBoundary key={arenaAttempt} onError={handleArenaError}>
        <Arena
          my={my}
          rival={rival}
          resultKey={resultKey}
          winner={winner}
          title="ARENA 3D • LAB"
          subtitle={`${my.name} × ${rival.name} • teste sem efeito no servidor`}
          prefer3D
          modelFormKey="lab"
        />
      </ArenaErrorBoundary>;
    })()}

    <View style={styles.actions}>
      <Pressable onPress={triggerAttack} disabled={stressRunning} style={[styles.action,{backgroundColor:colors.surface,borderColor:colors.border},stressRunning&&styles.disabled]}><Ionicons name="flash" size={17} color="#FFD447"/><Text style={[styles.actionText,{color:colors.text}]}>ATAQUE</Text></Pressable>
      <Pressable onPress={triggerKo} disabled={stressRunning} style={[styles.action,{backgroundColor:colors.surface,borderColor:colors.border},stressRunning&&styles.disabled]}><Ionicons name="skull-outline" size={17} color="#FF8290"/><Text style={[styles.actionText,{color:colors.text}]}>KO + VITÓRIA</Text></Pressable>
      <Pressable onPress={nextPair} disabled={stressRunning} style={[styles.action,{backgroundColor:colors.surface,borderColor:colors.border},stressRunning&&styles.disabled]}><Ionicons name="swap-horizontal" size={17} color={colors.accent}/><Text style={[styles.actionText,{color:colors.text}]}>TROCAR PAR</Text></Pressable>
      <Pressable onPress={resetBattle} disabled={stressRunning} style={[styles.action,{backgroundColor:colors.surface,borderColor:colors.border},stressRunning&&styles.disabled]}><Ionicons name="refresh" size={17} color="#65D894"/><Text style={[styles.actionText,{color:colors.text}]}>RESET</Text></Pressable>
    </View>

    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:stressErrors? '#D96575':colors.border}]}>
      <View style={styles.row}><Ionicons name="speedometer-outline" size={21} color={stressErrors?'#FF8290':colors.accent}/><Text style={[styles.title,{color:colors.text}]}>Stress de troca/render</Text></View>
      <Text style={[styles.body,{color:colors.muted}]}>Alterna as três espécies, HP, primeiro atacante, KO e resultado. Cada troca de espécie força uma nova chave de cena no renderizador atual.</Text>
      <Text style={[styles.counter,{color:stressErrors?'#FF8290':colors.yellow}]}>{stressDone}/{STRESS_CYCLES} ciclos • {stressErrors} erro(s) capturado(s)</Text>
      <Pressable onPress={stressRunning?stopStress:runStress} style={[styles.primary,{backgroundColor:stressRunning?'#7A3441':colors.yellow}]}><Ionicons name={stressRunning?'stop':'play'} size={18} color={stressRunning?'#FFF':'#08131F'}/><Text style={[styles.primaryText,{color:stressRunning?'#FFF':'#08131F'}]}>{stressRunning?'PARAR TESTE':'RODAR 100 CICLOS'}</Text></Pressable>
    </View>

    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text style={[styles.title,{color:colors.text}]}>Critério deste primeiro passe</Text>
      <Text style={[styles.body,{color:colors.muted}]}>Só considero o teste visual aprovado no aparelho quando os 100 ciclos terminarem sem tela preta/crash, os três formatos trocarem corretamente, KO/vitória não deixarem modelo antigo preso e o fallback continuar funcionando quando não houver GLB remoto.</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  card:{borderWidth:1,borderRadius:16,padding:14,gap:8},
  row:{flexDirection:'row',alignItems:'center',gap:8},
  title:{fontSize:15,fontWeight:'900'},
  body:{fontSize:12,lineHeight:18},
  note:{fontSize:10,lineHeight:15},
  probeGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},
  probe:{flexGrow:1,flexBasis:150,borderWidth:1,borderRadius:13,padding:11,gap:3},
  probeName:{fontSize:11,fontWeight:'900'},
  probeMeta:{fontSize:9},
  probeStatus:{fontSize:10,fontWeight:'900'},
  selectorRow:{flexDirection:'row',flexWrap:'wrap',gap:7},
  selectorChip:{borderWidth:1,borderRadius:999,paddingHorizontal:9,paddingVertical:7},
  selectorText:{fontSize:9,fontWeight:'900'},
  input:{minHeight:44,borderWidth:1,borderRadius:11,paddingHorizontal:11,fontSize:11},
  secondary:{minHeight:44,borderWidth:1,borderRadius:12,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},
  secondaryText:{fontSize:10,fontWeight:'900'},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:8},
  action:{minHeight:42,borderWidth:1,borderRadius:12,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:6},
  actionText:{fontSize:9,fontWeight:'900'},
  disabled:{opacity:0.45},
  counter:{fontSize:13,fontWeight:'900'},
  primary:{minHeight:46,borderRadius:12,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  primaryText:{fontSize:11,fontWeight:'900'},
});
