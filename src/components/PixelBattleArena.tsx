import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/ThemeProvider';

export type PixelBattleFighter = {
  name: string;
  pokemonId?: number | null;
  pokedexNumber?: number | null;
  /** @deprecated Battle arenas must never use card artwork as a Pokémon sprite. */
  fallbackImage?: string | null;
  hp?: number | null;
  maxHp?: number | null;
  attackName?: string | null;
  damage?: number | null;
  firstPlayer?: boolean;
  knockedOut?: boolean;
};

type Props = {
  my: PixelBattleFighter | null;
  rival: PixelBattleFighter | null;
  resultKey?: string | number | null;
  winner?: 'me' | 'rival' | null;
  title?: string;
  subtitle?: string;
  turnOnly?: boolean;
};

const USE_NATIVE_DRIVER = true;
const POKEAPI_SPRITE_PREFIX = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';

function validPokemonId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function spriteUrl(id: number, back = false) {
  return `${POKEAPI_SPRITE_PREFIX}${back ? 'back/' : ''}${id}.png`;
}

function safePokemonSpriteUrl(value: string | null | undefined) {
  const url = String(value ?? '').trim();
  return url.startsWith(POKEAPI_SPRITE_PREFIX) ? url : null;
}

function spriteCandidates(fighter: PixelBattleFighter | null, back = false) {
  const ids = [validPokemonId(fighter?.pokemonId), validPokemonId(fighter?.pokedexNumber)]
    .filter((value): value is number => value != null)
    .filter((value, index, array) => array.indexOf(value) === index);
  const urls: string[] = [];
  if (back) ids.forEach((id) => urls.push(spriteUrl(id, true)));
  ids.forEach((id) => urls.push(spriteUrl(id, false)));
  const safeFallback = safePokemonSpriteUrl(fighter?.fallbackImage);
  if (safeFallback) urls.push(safeFallback);
  return urls.filter((url, index, array) => array.indexOf(url) === index);
}

function hpPercent(fighter: PixelBattleFighter | null) {
  if (!fighter) return 100;
  const max = Math.max(1, Number(fighter.maxHp ?? fighter.hp ?? 1));
  const current = Math.max(0, Math.min(max, Number(fighter.hp ?? max)));
  return Math.max(0, Math.min(100, (current / max) * 100));
}

function attackLabel(fighter: PixelBattleFighter | null) {
  const attack = String(fighter?.attackName ?? '').trim();
  return attack && attack !== '__NO_ATTACK__' ? attack : 'Sem ataque';
}

function damageLabel(fighter: PixelBattleFighter | null) {
  const damage = Math.max(0, Number(fighter?.damage ?? 0));
  return damage > 0 ? `${Math.round(damage)} de dano` : 'sem dano';
}

function SpriteUnavailable({ label, size }: { label: string; size: number }) {
  return <View style={styles.spriteUnavailable}>
    <Ionicons name="paw" size={size} color="#59636F" />
    <Text numberOfLines={1} style={styles.spriteUnavailableText}>{label}</Text>
  </View>;
}

export function PixelBattleArena({ my, rival, resultKey = null, winner = null, title = 'ARENA 2D', subtitle = 'Batalha por turnos • HP, golpes, PP, tipos e velocidade', turnOnly = false }: Props) {
  const{effectsReduced}=useAppTheme();
  const myIdle = useRef(new Animated.Value(0)).current;
  const rivalIdle = useRef(new Animated.Value(0)).current;
  const myAction = useRef(new Animated.Value(0)).current;
  const rivalAction = useRef(new Animated.Value(0)).current;
  const myHit = useRef(new Animated.Value(0)).current;
  const rivalHit = useRef(new Animated.Value(0)).current;
  const myOpacity = useRef(new Animated.Value(1)).current;
  const rivalOpacity = useRef(new Animated.Value(1)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const [mySpriteIndex, setMySpriteIndex] = useState(0);
  const [rivalSpriteIndex, setRivalSpriteIndex] = useState(0);
  const [message, setMessage] = useState('Os Pokémon estão prontos.');
  const [replayNonce, setReplayNonce] = useState(0);

  const mySprites = useMemo(() => spriteCandidates(my, true), [my?.fallbackImage, my?.pokemonId, my?.pokedexNumber]);
  const rivalSprites = useMemo(() => spriteCandidates(rival, false), [rival?.fallbackImage, rival?.pokemonId, rival?.pokedexNumber]);
  const mySprite = mySprites[mySpriteIndex] ?? null;
  const rivalSprite = rivalSprites[rivalSpriteIndex] ?? null;
  const myUsesFrontFallback = Boolean(mySprite && !mySprite.includes('/back/'));

  useEffect(() => { setMySpriteIndex(0); }, [my?.name, my?.pokemonId, my?.pokedexNumber, my?.fallbackImage]);
  useEffect(() => { setRivalSpriteIndex(0); }, [rival?.name, rival?.pokemonId, rival?.pokedexNumber, rival?.fallbackImage]);

  useEffect(() => {
    if(effectsReduced){myIdle.setValue(0);rivalIdle.setValue(0);return;}
    const myLoop = Animated.loop(Animated.sequence([
      Animated.timing(myIdle, { toValue: -1, duration: 780, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(myIdle, { toValue: 1, duration: 780, useNativeDriver: USE_NATIVE_DRIVER }),
    ]));
    const rivalLoop = Animated.loop(Animated.sequence([
      Animated.timing(rivalIdle, { toValue: 1, duration: 850, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(rivalIdle, { toValue: -1, duration: 850, useNativeDriver: USE_NATIVE_DRIVER }),
    ]));
    myLoop.start();
    rivalLoop.start();
    return () => {
      myLoop.stop();
      rivalLoop.stop();
    };
  }, [effectsReduced,myIdle, rivalIdle]);

  useEffect(() => {
    myAction.stopAnimation(); rivalAction.stopAnimation(); myHit.stopAnimation(); rivalHit.stopAnimation();
    myOpacity.stopAnimation(); rivalOpacity.stopAnimation(); flash.stopAnimation();
    myAction.setValue(0); rivalAction.setValue(0); myHit.setValue(0); rivalHit.setValue(0);
    myOpacity.setValue(1); rivalOpacity.setValue(1); flash.setValue(0);

    if (resultKey == null || !my || !rival || (!winner && !turnOnly)) {
      setMessage('Os Pokémon estão prontos.');
      return;
    }
    if(effectsReduced){
      if(winner)setMessage(`${winner === 'me' ? my.name : rival.name} venceu o confronto.`);
      else setMessage('Turno concluído. Escolha o próximo golpe.');
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => {
      const timer = setTimeout(() => { if (!cancelled) fn(); }, ms);
      timers.push(timer);
    };
    const lunge = (value: Animated.Value) => Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: 150, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(value, { toValue: 0, duration: 190, useNativeDriver: USE_NATIVE_DRIVER }),
    ]);
    const shake = (value: Animated.Value) => Animated.sequence([
      Animated.timing(value, { toValue: -1, duration: 45, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(value, { toValue: 1, duration: 55, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(value, { toValue: -.7, duration: 45, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(value, { toValue: .7, duration: 45, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(value, { toValue: 0, duration: 55, useNativeDriver: USE_NATIVE_DRIVER }),
    ]);
    const hitFlash = () => Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 55, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(flash, { toValue: 0, duration: 150, useNativeDriver: USE_NATIVE_DRIVER }),
    ]);

    const myGoesFirst = Boolean(my.firstPlayer);
    const first = myGoesFirst ? 'me' : 'rival';
    const second = first === 'me' ? 'rival' : 'me';
    const fighter = (side: 'me' | 'rival') => side === 'me' ? my : rival;
    const action = (side: 'me' | 'rival') => side === 'me' ? myAction : rivalAction;
    const targetHit = (side: 'me' | 'rival') => side === 'me' ? rivalHit : myHit;

    const runStrike = (side: 'me' | 'rival', delayMs: number) => {
      const attacker = fighter(side);
      const attack = attackLabel(attacker);
      const hasAttack = attack !== 'Sem ataque' && Number(attacker?.damage ?? 0) > 0;
      later(() => {
        setMessage(hasAttack
          ? `${attacker?.name ?? 'Pokémon'} usou ${attack} • ${damageLabel(attacker)}`
          : `${attacker?.name ?? 'Pokémon'} não causou dano.`);
        if (!hasAttack) return;
        Animated.parallel([lunge(action(side)), shake(targetHit(side)), hitFlash()]).start();
      }, delayMs);
    };

    runStrike(first, 220);
    runStrike(second, 1180);
    later(() => {
      if (turnOnly || !winner) {
        setMessage('Turno concluído. Escolha o próximo golpe.');
        return;
      }
      const loserOpacity = winner === 'me' ? rivalOpacity : myOpacity;
      Animated.timing(loserOpacity, { toValue: .28, duration: 420, useNativeDriver: USE_NATIVE_DRIVER }).start();
      setMessage(`${winner === 'me' ? my.name : rival.name} venceu o confronto.`);
    }, 2250);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [effectsReduced,flash, my, myAction, myHit, myOpacity, replayNonce, resultKey, rival, rivalAction, rivalHit, rivalOpacity, turnOnly, winner]);

  const myHp = hpPercent(my);
  const rivalHp = hpPercent(rival);
  const myActionX = myAction.interpolate({ inputRange: [0, 1], outputRange: [0, 44] });
  const rivalActionX = rivalAction.interpolate({ inputRange: [0, 1], outputRange: [0, -44] });
  const myHitX = myHit.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });
  const rivalHitX = rivalHit.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });
  const myIdleY = myIdle.interpolate({ inputRange: [-1, 1], outputRange: [-3, 3] });
  const rivalIdleY = rivalIdle.interpolate({ inputRange: [-1, 1], outputRange: [-3, 3] });

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {resultKey != null ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Repetir animação da batalha" onPress={() => setReplayNonce((value) => value + 1)} style={styles.replay}>
            <Ionicons name="refresh" size={15} color="#FFD447" />
            <Text style={styles.replayText}>REPLAY</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.stage}>
        <View style={styles.skyBand} />
        <View style={styles.horizon} />
        <View style={styles.grassBand} />
        <View style={styles.groundBand} />
        <View style={[styles.pixelPatch, styles.pixelPatchA]} />
        <View style={[styles.pixelPatch, styles.pixelPatchB]} />
        <Animated.View pointerEvents="none" style={[styles.impactFlash, { opacity: flash }]} />

        <View style={[styles.statusBox, styles.rivalStatus]}>
          <Text numberOfLines={1} style={styles.statusName}>{rival?.name ?? 'Rival'}</Text>
          <View style={styles.hpRow}><Text style={styles.hpLabel}>HP</Text><View style={styles.hpTrack}><View style={[styles.hpFill, { width: `${rivalHp}%` }]} /></View></View>
          <Text style={styles.hpText}>{rival?.hp != null ? `${Math.max(0, Number(rival.hp))}/${Math.max(1, Number(rival.maxHp ?? rival.hp))}` : '—'}</Text>
        </View>

        <View style={[styles.statusBox, styles.myStatus]}>
          <Text numberOfLines={1} style={styles.statusName}>{my?.name ?? 'Seu Pokémon'}</Text>
          <View style={styles.hpRow}><Text style={styles.hpLabel}>HP</Text><View style={styles.hpTrack}><View style={[styles.hpFill, { width: `${myHp}%` }]} /></View></View>
          <Text style={styles.hpText}>{my?.hp != null ? `${Math.max(0, Number(my.hp))}/${Math.max(1, Number(my.maxHp ?? my.hp))}` : '—'}</Text>
        </View>

        <View style={[styles.platform, styles.rivalPlatform]} />
        <View style={[styles.platform, styles.myPlatform]} />

        <Animated.View style={[styles.rivalSpriteWrap, { opacity: rivalOpacity, transform: [{ translateY: rivalIdleY }, { translateX: rivalActionX }, { translateX: rivalHitX }] }]}>
          {rivalSprite ? (
            <Animated.Image source={{ uri: rivalSprite }} resizeMode="contain" style={styles.rivalSprite} onError={() => setRivalSpriteIndex((index) => index + 1)} />
          ) : (
            <SpriteUnavailable label={rival?.name ?? 'Pokémon'} size={56} />
          )}
        </Animated.View>

        <Animated.View style={[styles.mySpriteWrap, { opacity: myOpacity, transform: [{ translateY: myIdleY }, { translateX: myActionX }, { translateX: myHitX }] }]}>
          {mySprite ? (
            <Animated.Image source={{ uri: mySprite }} resizeMode="contain" style={[styles.mySprite, myUsesFrontFallback ? styles.myFrontSpriteFallback : null]} onError={() => setMySpriteIndex((index) => index + 1)} />
          ) : (
            <SpriteUnavailable label={my?.name ?? 'Pokémon'} size={62} />
          )}
        </Animated.View>

        <View style={styles.messageBox}>
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { width: '100%', maxWidth: 760, alignSelf: 'center', borderRadius: 18, borderWidth: 1, borderColor: '#2B3440', backgroundColor: '#080B0F', overflow: 'hidden' },
  header: { minHeight: 54, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: '#0D1218' },
  kicker: { color: '#FFD447', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  subtitle: { color: '#81909E', fontSize: 7, fontWeight: '700', marginTop: 3 },
  replay: { minHeight: 36, borderRadius: 10, borderWidth: 1, borderColor: '#554A1E', backgroundColor: '#19160B', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  replayText: { color: '#FFD447', fontSize: 7, fontWeight: '900' },
  stage: { height: 350, position: 'relative', overflow: 'hidden', backgroundColor: '#A7D9E9' },
  skyBand: { position: 'absolute', left: 0, right: 0, top: 0, height: 155, backgroundColor: '#A7D9E9' },
  horizon: { position: 'absolute', left: 0, right: 0, top: 142, height: 22, backgroundColor: '#82B968' },
  grassBand: { position: 'absolute', left: 0, right: 0, top: 160, height: 75, backgroundColor: '#9AC879' },
  groundBand: { position: 'absolute', left: 0, right: 0, top: 232, bottom: 0, backgroundColor: '#D2BD83' },
  pixelPatch: { position: 'absolute', width: 9, height: 9, backgroundColor: '#789F5B', opacity: .72 },
  pixelPatchA: { left: '18%', top: 181 },
  pixelPatchB: { right: '15%', top: 211 },
  impactFlash: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#FFFFFF', zIndex: 20 },
  platform: { position: 'absolute', height: 34, borderRadius: 999, backgroundColor: '#8B7B55', opacity: .38, transform: [{ scaleX: 1.8 }] },
  rivalPlatform: { width: 90, right: 50, top: 137 },
  myPlatform: { width: 105, left: 48, bottom: 69 },
  rivalSpriteWrap: { position: 'absolute', right: 24, top: 76, width: 150, height: 130, alignItems: 'center', justifyContent: 'flex-end', zIndex: 7 },
  mySpriteWrap: { position: 'absolute', left: 17, bottom: 54, width: 180, height: 155, alignItems: 'center', justifyContent: 'flex-end', zIndex: 8 },
  rivalSprite: { width: 128, height: 128 },
  mySprite: { width: 150, height: 150 },
  myFrontSpriteFallback: { transform: [{ scaleX: -1 }] },
  spriteUnavailable: { width: 128, minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: 4 },
  spriteUnavailableText: { maxWidth: 116, color: '#59636F', fontSize: 7, fontWeight: '900', textAlign: 'center' },
  statusBox: { position: 'absolute', width: 168, minHeight: 65, borderRadius: 5, borderWidth: 3, borderColor: '#38423C', backgroundColor: '#F4F0D8', paddingHorizontal: 8, paddingVertical: 5, zIndex: 12 },
  rivalStatus: { left: 12, top: 18 },
  myStatus: { right: 12, bottom: 49 },
  statusName: { color: '#22291F', fontSize: 10, fontWeight: '900' },
  hpRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  hpLabel: { color: '#D09824', fontSize: 7, fontWeight: '900' },
  hpTrack: { flex: 1, height: 7, borderRadius: 99, borderWidth: 1, borderColor: '#5B604B', backgroundColor: '#2B312D', overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: '#55B66B' },
  hpText: { color: '#41473C', textAlign: 'right', fontSize: 7, fontWeight: '900', marginTop: 2 },
  messageBox: { position: 'absolute', left: 8, right: 8, bottom: 7, minHeight: 38, borderRadius: 5, borderWidth: 3, borderColor: '#4B5064', backgroundColor: '#F7F7F0', paddingHorizontal: 9, paddingVertical: 7, zIndex: 25 },
  message: { color: '#252936', fontSize: 9, lineHeight: 13, fontWeight: '900' },
});