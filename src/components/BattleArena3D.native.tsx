import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import type { PixelBattleFighter } from '@/components/PixelBattleArena';
import {
  readPokemon3DModelArrayBuffer,
  resolvePokemon3DModel,
  type Pokemon3DAnimationRole,
  type Pokemon3DModelManifest,
} from '@/services/pokemon3dModels';

type Fighter3D = PixelBattleFighter & { types?: string[] | null };

type Props = {
  my: Fighter3D | null;
  rival: Fighter3D | null;
  resultKey?: string | number | null;
  winner?: 'me' | 'rival' | null;
  title?: string;
  subtitle?: string;
  quality?: 'low' | 'medium' | 'high';
};

type AnimationRuntime = {
  mixer: THREE.AnimationMixer | null;
  actions: Partial<Record<Pokemon3DAnimationRole, THREE.AnimationAction>>;
};

type BattleSnapshot = {
  my: Fighter3D | null;
  rival: Fighter3D | null;
  winner: 'me' | 'rival' | null;
  resultKey: string | number | null;
  actionStamp: number;
};

const TYPE_TINT: Record<string, number> = {
  fire: 0xe8663d,
  water: 0x4d8edb,
  grass: 0x60a854,
  electric: 0xe7c747,
  psychic: 0xb260a9,
  ice: 0x79c9d4,
  dragon: 0x6a62b8,
  dark: 0x4c4752,
  fairy: 0xd995b3,
  fighting: 0xad5f45,
  flying: 0x7fa8d9,
  poison: 0x8c5aa5,
  ground: 0xb69055,
  rock: 0x95805b,
  bug: 0x8da64a,
  ghost: 0x675e91,
  steel: 0x8897a5,
  normal: 0xa8a29a,
};

const ANIMATION_HINTS: Record<Pokemon3DAnimationRole, string[]> = {
  idle: ['idle', 'wait', 'stand', 'breath'],
  attack: ['attack', 'strike', 'move', 'skill', 'bite', 'punch', 'kick'],
  hit: ['hit', 'hurt', 'damage', 'impact'],
  faint: ['faint', 'ko', 'death', 'down', 'defeat'],
  victory: ['victory', 'win', 'celebrate', 'happy'],
};

function fighterPokemonId(fighter: Fighter3D | null) {
  for (const candidate of [fighter?.pokemonId, fighter?.pokedexNumber]) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
  }
  return null;
}

function tintFor(fighter: Fighter3D | null, fallback: number) {
  const type = String(fighter?.types?.[0] ?? '').toLowerCase();
  if (TYPE_TINT[type]) return TYPE_TINT[type];
  const text = String(fighter?.name ?? '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return text ? 0x555555 + (hash % 0x777777) : fallback;
}

function createExpoThreeRenderer(
  gl: ExpoWebGLRenderingContext,
  quality: 'low' | 'medium' | 'high',
) {
  const width = Math.max(1, gl.drawingBufferWidth);
  const height = Math.max(1, gl.drawingBufferHeight);
  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    getContext: () => gl,
  };
  return new THREE.WebGLRenderer({
    canvas: canvas as any,
    context: gl as any,
    antialias: quality !== 'low',
    alpha: false,
  });
}

function hpPercent(fighter: Fighter3D | null) {
  const max = Math.max(1, Number(fighter?.maxHp ?? fighter?.hp ?? 1));
  const current = Math.max(0, Math.min(max, Number(fighter?.hp ?? max)));
  return Math.max(0, Math.min(100, (current / max) * 100));
}

function makeCreature(color: number, quality: 'low' | 'medium' | 'high') {
  const segments = quality === 'high' ? 24 : quality === 'medium' ? 16 : 10;
  const group = new THREE.Group();
  const base = new THREE.Color(color);
  const material = new THREE.MeshStandardMaterial({ color: base, roughness: 0.68, metalness: 0.06 });
  const dark = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.62), roughness: 0.76 });
  const light = new THREE.MeshStandardMaterial({ color: base.clone().lerp(new THREE.Color(0xffffff), 0.28), roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, segments, Math.max(8, segments - 4)), material);
  body.scale.set(1, 0.9, 0.82);
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, segments, Math.max(8, segments - 4)), material);
  head.position.set(0, 0.72, 0.08);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.25, Math.max(8, segments - 4), 8), light);
  snout.scale.set(1.2, 0.7, 0.8);
  snout.position.set(0, 0.62, 0.47);
  group.add(snout);

  const earGeometry = new THREE.ConeGeometry(0.16, 0.48, Math.max(5, Math.floor(segments / 2)));
  const earLeft = new THREE.Mesh(earGeometry, dark);
  earLeft.position.set(-0.27, 1.16, 0.02);
  earLeft.rotation.z = 0.18;
  group.add(earLeft);
  const earRight = earLeft.clone();
  earRight.position.x = 0.27;
  earRight.rotation.z = -0.18;
  group.add(earRight);

  const limbGeometry = new THREE.CylinderGeometry(0.12, 0.15, 0.52, Math.max(6, Math.floor(segments / 2)));
  const limbPositions: Array<[number, number]> = [[-0.43, 0.22], [0.43, 0.22], [-0.43, -0.28], [0.43, -0.28]];
  for (const [x, z] of limbPositions) {
    const limb = new THREE.Mesh(limbGeometry, dark);
    limb.position.set(x, -0.58, z);
    limb.rotation.z = x < 0 ? -0.18 : 0.18;
    group.add(limb);
  }

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, Math.max(6, Math.floor(segments / 2))), dark);
  tail.position.set(0, 0.05, -0.72);
  tail.rotation.x = -1.05;
  group.add(tail);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x11151c });
  for (const x of [-0.17, 0.17]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMaterial);
    eye.position.set(x, 0.82, 0.46);
    group.add(eye);
  }

  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return group;
}

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

function normalizeModel(
  root: THREE.Object3D,
  manifest: Pokemon3DModelManifest,
  quality: 'low' | 'medium' | 'high',
) {
  root.rotation.y += Number(manifest.rotation_y || 0);
  root.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const modelHeight = Math.max(0.01, size.y);
  const targetHeight = quality === 'high' ? 1.82 : quality === 'medium' ? 1.76 : 1.68;
  const autoScale = targetHeight / modelHeight;
  root.scale.multiplyScalar(autoScale * Math.max(0.01, Number(manifest.scale || 1)));
  root.updateMatrixWorld(true);

  bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.x += -center.x + Number(manifest.offset_x || 0);
  root.position.y += -0.86 - bounds.min.y + Number(manifest.offset_y || 0);
  root.position.z += -center.z + Number(manifest.offset_z || 0);

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = quality === 'high';
      object.receiveShadow = quality !== 'low';
    }
  });
  root.updateMatrixWorld(true);
}

function findAnimationClip(
  clips: THREE.AnimationClip[],
  manifest: Pokemon3DModelManifest,
  role: Pokemon3DAnimationRole,
) {
  const explicit = String(manifest.animations?.[role] ?? '').trim().toLowerCase();
  if (explicit) {
    const exact = clips.find((clip) => clip.name.toLowerCase() === explicit);
    if (exact) return exact;
  }
  const hints = ANIMATION_HINTS[role];
  return clips.find((clip) => {
    const name = clip.name.toLowerCase();
    return hints.some((hint) => name.includes(hint));
  }) ?? null;
}

function makeAnimationRuntime(
  root: THREE.Object3D,
  clips: THREE.AnimationClip[],
  manifest: Pokemon3DModelManifest,
): AnimationRuntime {
  if (!clips.length) return { mixer: null, actions: {} };
  const mixer = new THREE.AnimationMixer(root);
  const actions: AnimationRuntime['actions'] = {};
  for (const role of Object.keys(ANIMATION_HINTS) as Pokemon3DAnimationRole[]) {
    const clip = findAnimationClip(clips, manifest, role);
    if (clip) actions[role] = mixer.clipAction(clip);
  }
  const idle = actions.idle;
  if (idle) {
    idle.reset();
    idle.setLoop(THREE.LoopRepeat, Infinity);
    idle.play();
  }
  return { mixer, actions };
}

function playAnimation(runtime: AnimationRuntime | null, role: Pokemon3DAnimationRole) {
  const action = runtime?.actions[role];
  if (!action) return false;
  action.reset();
  if (role === 'idle') {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  } else {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }
  action.fadeIn(0.08).play();
  return true;
}

async function loadRemoteCreature(
  container: THREE.Group,
  fallback: THREE.Object3D,
  fighter: Fighter3D | null,
  quality: 'low' | 'medium' | 'high',
  isCurrent: () => boolean,
) {
  const pokemonId = fighterPokemonId(fighter);
  if (!pokemonId) return null;
  const asset = await resolvePokemon3DModel(pokemonId, quality);
  if (!asset || !isCurrent()) return null;

  try {
    const buffer = await readPokemon3DModelArrayBuffer(asset.localUri);
    if (!isCurrent()) return null;
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
      loader.parse(buffer, '', (loaded) => resolve({
        scene: loaded.scene,
        animations: loaded.animations ?? [],
      }), reject);
    });
    if (!isCurrent()) {
      disposeObject(gltf.scene);
      return null;
    }
    normalizeModel(gltf.scene, asset.manifest, quality);
    container.remove(fallback);
    disposeObject(fallback);
    container.add(gltf.scene);
    return makeAnimationRuntime(gltf.scene, gltf.animations, asset.manifest);
  } catch (error) {
    console.warn('[3D] GLB parse/render failed; keeping procedural fallback', pokemonId, error);
    return null;
  }
}

export function BattleArena3D({
  my,
  rival,
  resultKey = null,
  winner = null,
  title = 'ARENA 3D',
  subtitle = 'Modo 3D nativo • modelos remotos com fallback automático',
  quality = 'medium',
}: Props) {
  const animationFrame = useRef<number | null>(null);
  const disposed = useRef(false);
  const contextGeneration = useRef(0);
  const [modelState, setModelState] = useState<'loading' | 'remote' | 'fallback'>('loading');
  const [contextError, setContextError] = useState<string | null>(null);
  const myTint = useMemo(() => tintFor(my, 0x5f8fd1), [my?.name, my?.types]);
  const rivalTint = useMemo(() => tintFor(rival, 0xc96868), [rival?.name, rival?.types]);
  const myPokemonId = fighterPokemonId(my);
  const rivalPokemonId = fighterPokemonId(rival);
  const sceneKey = `${myPokemonId ?? 'none'}:${rivalPokemonId ?? 'none'}:${quality}`;
  const battleRef = useRef<BattleSnapshot>({ my, rival, winner, resultKey, actionStamp: resultKey == null ? 0 : Date.now() });

  useEffect(() => {
    const previous = battleRef.current;
    battleRef.current = {
      my,
      rival,
      winner,
      resultKey,
      actionStamp: previous.resultKey !== resultKey && resultKey != null ? Date.now() : previous.actionStamp,
    };
  }, [my, rival, resultKey, winner]);

  useEffect(() => {
    setModelState('loading');
    setContextError(null);
  }, [sceneKey]);

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      contextGeneration.current += 1;
      if (animationFrame.current != null) cancelAnimationFrame(animationFrame.current);
    };
  }, []);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const generation = ++contextGeneration.current;
    let cleaned = false;
    const isCurrent = () => !disposed.current && contextGeneration.current === generation;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createExpoThreeRenderer(gl, quality);
      setContextError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao criar WebGLRenderer';
      console.warn('[3D] WebGLRenderer init failed', error);
      setModelState('fallback');
      setContextError(message);
      return;
    }
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = quality === 'high';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x091725);
    scene.fog = new THREE.Fog(0x091725, 6, 12);

    const camera = new THREE.PerspectiveCamera(
      42,
      gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight),
      0.1,
      40,
    );
    camera.position.set(0, 3.1, 7.4);
    camera.lookAt(0, 0.2, 0);

    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x20321f, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(3, 6, 4);
    keyLight.castShadow = quality === 'high';
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x6aa9ff, 16, 8);
    rimLight.position.set(-3, 2, -2);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(3.9, 4.2, 0.25, quality === 'high' ? 48 : 24),
      new THREE.MeshStandardMaterial({ color: 0x1b3b35, roughness: 0.9 }),
    );
    floor.position.y = -1.02;
    floor.receiveShadow = true;
    scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 2.12, quality === 'high' ? 48 : 24),
      new THREE.MeshBasicMaterial({ color: 0x78a8c8, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.88;
    scene.add(ring);

    const myModel = new THREE.Group();
    myModel.position.set(-1.65, -0.12, 0.55);
    myModel.rotation.y = 0.42;
    const myFallback = makeCreature(myTint, quality);
    myModel.add(myFallback);
    scene.add(myModel);

    const rivalModel = new THREE.Group();
    rivalModel.position.set(1.65, -0.12, -0.35);
    rivalModel.rotation.y = -2.7;
    const rivalFallback = makeCreature(rivalTint, quality);
    rivalModel.add(rivalFallback);
    scene.add(rivalModel);

    let myRuntime: AnimationRuntime | null = null;
    let rivalRuntime: AnimationRuntime | null = null;
    void Promise.all([
      loadRemoteCreature(myModel, myFallback, my, quality, isCurrent).then((runtime) => { myRuntime = runtime; return runtime; }),
      loadRemoteCreature(rivalModel, rivalFallback, rival, quality, isCurrent).then((runtime) => { rivalRuntime = runtime; return runtime; }),
    ]).then((runtimes) => {
      if (isCurrent()) setModelState(runtimes.some(Boolean) ? 'remote' : 'fallback');
    }).catch((error) => {
      console.warn('[3D] remote model hydration failed', error);
      if (isCurrent()) setModelState('fallback');
    });

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      myRuntime?.mixer?.stopAllAction();
      rivalRuntime?.mixer?.stopAllAction();
      disposeObject(scene);
      renderer.dispose();
    };

    const clock = new THREE.Clock();
    let lastResultKey: string | number | null = null;
    let firstTriggered = false;
    let secondTriggered = false;
    let outcomeTriggered = false;

    const animate = () => {
      if (!isCurrent()) {
        cleanup();
        return;
      }
      const delta = Math.min(0.05, clock.getDelta());
      const time = clock.elapsedTime;
      myRuntime?.mixer?.update(delta);
      rivalRuntime?.mixer?.update(delta);

      const battle = battleRef.current;
      if (battle.resultKey !== lastResultKey) {
        lastResultKey = battle.resultKey;
        firstTriggered = false;
        secondTriggered = false;
        outcomeTriggered = false;
      }

      const myBaseY = -0.12 + Math.sin(time * 2.1) * 0.055;
      const rivalBaseY = -0.12 + Math.sin(time * 2 + 1.4) * 0.055;
      myModel.position.set(-1.65, myBaseY, 0.55);
      rivalModel.position.set(1.65, rivalBaseY, -0.35);
      myModel.rotation.z = battle.my?.knockedOut ? 1.3 : Math.sin(time * 1.5) * 0.018;
      rivalModel.rotation.z = battle.rival?.knockedOut ? -1.3 : Math.sin(time * 1.42 + 1) * 0.018;

      const elapsed = battle.actionStamp > 0 ? Date.now() - battle.actionStamp : -1;
      if (elapsed >= 0 && elapsed <= 2400) {
        const first = battle.my?.firstPlayer ? 'me' : battle.rival?.firstPlayer ? 'rival' : 'me';
        const phase = (start: number) => Math.max(0, Math.min(1, (elapsed - start) / 220));
        const pulse = (value: number) => Math.sin(Math.PI * value);
        const firstStrike = pulse(phase(170));
        const secondStrike = pulse(phase(1100));
        myModel.position.x = -1.65 + (first === 'me' ? firstStrike : secondStrike) * 0.48;
        rivalModel.position.x = 1.65 - (first === 'rival' ? firstStrike : secondStrike) * 0.48;

        if (!firstTriggered && elapsed >= 120) {
          firstTriggered = true;
          if (first === 'me') {
            playAnimation(myRuntime, 'attack');
            playAnimation(rivalRuntime, 'hit');
          } else {
            playAnimation(rivalRuntime, 'attack');
            playAnimation(myRuntime, 'hit');
          }
        }
        if (!secondTriggered && elapsed >= 1020) {
          secondTriggered = true;
          if (first === 'me') {
            playAnimation(rivalRuntime, 'attack');
            playAnimation(myRuntime, 'hit');
          } else {
            playAnimation(myRuntime, 'attack');
            playAnimation(rivalRuntime, 'hit');
          }
        }
        if (!outcomeTriggered && elapsed >= 1550) {
          outcomeTriggered = true;
          if (battle.my?.knockedOut) playAnimation(myRuntime, 'faint');
          if (battle.rival?.knockedOut) playAnimation(rivalRuntime, 'faint');
          if (!battle.my?.knockedOut && battle.winner === 'me') playAnimation(myRuntime, 'victory');
          if (!battle.rival?.knockedOut && battle.winner === 'rival') playAnimation(rivalRuntime, 'victory');
        }
      }

      try {
        renderer.render(scene, camera);
        gl.endFrameEXP();
        animationFrame.current = requestAnimationFrame(animate);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha durante o frame 3D';
        console.warn('[3D] frame failed; stopping renderer safely', error);
        setContextError(message);
        setModelState('fallback');
        cleanup();
      }
    };
    animate();
  }, [my, myTint, quality, rival, rivalTint]);

  const myHpPercent = hpPercent(my);
  const rivalHpPercent = hpPercent(rival);
  const myCurrentHp = Math.max(0, Number(my?.hp ?? 0));
  const myMaxHp = Math.max(1, Number(my?.maxHp ?? my?.hp ?? 1));
  const rivalCurrentHp = Math.max(0, Number(rival?.hp ?? 0));
  const rivalMaxHp = Math.max(1, Number(rival?.maxHp ?? rival?.hp ?? 1));
  const badgeLabel = modelState === 'remote' ? '3D GLB' : modelState === 'loading' ? '3D…' : '3D';

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.badge}><Text style={styles.badgeText}>{badgeLabel}</Text></View>
      </View>
      <View style={styles.viewport}>
        {contextError ? (
          <View style={styles.renderError}>
            <Text style={styles.renderErrorTitle}>3D interrompido com segurança</Text>
            <Text style={styles.renderErrorText}>{contextError}</Text>
            <Text style={styles.renderErrorHint}>Use o botão 2D acima e reporte esta mensagem. A batalha não é afetada.</Text>
          </View>
        ) : (
          <GLView key={sceneKey} style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
        )}
        <View style={[styles.hpBox, styles.rivalHp]}>
          <Text numberOfLines={1} style={styles.name}>{rival?.name ?? 'Rival'}</Text>
          <View style={styles.hpTrack}>
            <View style={[styles.hpFill, { width: `${rivalHpPercent}%` as any }]} />
          </View>
          <Text style={styles.hpText}>{rivalCurrentHp}/{rivalMaxHp}</Text>
        </View>
        <View style={[styles.hpBox, styles.myHp]}>
          <Text numberOfLines={1} style={styles.name}>{my?.name ?? 'Seu Pokémon'}</Text>
          <View style={styles.hpTrack}>
            <View style={[styles.hpFill, { width: `${myHpPercent}%` as any }]} />
          </View>
          <Text style={styles.hpText}>{myCurrentHp}/{myMaxHp}</Text>
        </View>
        {winner ? (
          <View style={styles.result}>
            <Text style={styles.resultText}>{winner === 'me' ? 'VANTAGEM DO TREINADOR' : 'PRESSÃO DO RIVAL'}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function disposeBattleArena3D() {}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    borderColor: '#234965',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#08131F',
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0D1E2D',
  },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  kicker: { color: '#EAF5FF', fontSize: 13, fontWeight: '900', letterSpacing: 0.7 },
  subtitle: { color: '#8DA8BA', fontSize: 10, marginTop: 2 },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#173B55',
    borderWidth: 1,
    borderColor: '#3D789D',
  },
  badgeText: { color: '#8DD7FF', fontSize: 10, fontWeight: '900' },
  viewport: { height: 310, position: 'relative' },
  renderError: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#101923',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  renderErrorTitle: { color: '#FFB6C0', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  renderErrorText: { color: '#E5EDF3', fontSize: 10, lineHeight: 15, marginTop: 7, textAlign: 'center' },
  renderErrorHint: { color: '#8DA8BA', fontSize: 9, lineHeight: 14, marginTop: 7, textAlign: 'center' },
  hpBox: {
    position: 'absolute',
    width: '43%',
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(4,12,20,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(150,205,236,0.25)',
  },
  rivalHp: { right: 10, top: 10 },
  myHp: { left: 10, bottom: 10 },
  name: { color: '#F3F8FC', fontWeight: '800', fontSize: 11 },
  hpTrack: {
    height: 7,
    borderRadius: 99,
    backgroundColor: '#243443',
    marginTop: 5,
    overflow: 'hidden',
  },
  hpFill: { height: '100%', backgroundColor: '#65D894' },
  hpText: { color: '#B4C7D5', fontSize: 9, marginTop: 3, textAlign: 'right' },
  result: {
    position: 'absolute',
    top: '47%',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(6,17,28,0.82)',
  },
  resultText: { color: '#FFD447', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
});