import fs from 'node:fs';

function patchTeamBattle(){
  const path='app/team-battle/[id].tsx';
  let text=fs.readFileSync(path,'utf8');
  const importAnchor="import { BattleStyleArenaOverlay } from '@/components/BattleStyleArenaOverlay';";
  if(!text.includes('AdaptiveBattleArena')) text=text.replace(importAnchor,`${importAnchor}\nimport { AdaptiveBattleArena } from '@/components/AdaptiveBattleArena';`);
  const start='            <View style={[styles.arena, { backgroundColor: colors.surface, borderColor: colors.border }]}>';
  const end='\n\n            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>';
  if(text.includes(start)){
    const a=text.indexOf(start);const b=text.indexOf(end,a);
    if(b<0)throw new Error('TEAM_ARENA_END_NOT_FOUND');
    const arena=`            <AdaptiveBattleArena
              my={{
                name: myName,
                pokemonId: Number((state as any)?.myPokemonId ?? 0) || null,
                hp: myHp,
                maxHp: myMaxHp,
                types: Array.isArray((state as any)?.myTypes) ? (state as any).myTypes : [],
                attackName: String((state as any)?.myAttackName ?? ''),
                firstPlayer: true,
                knockedOut: myHp <= 0,
              }}
              rival={{
                name: opponentName,
                pokemonId: Number((state as any)?.opponentPokemonId ?? 0) || null,
                hp: opponentHp,
                maxHp: opponentMaxHp,
                types: Array.isArray((state as any)?.opponentTypes) ? (state as any).opponentTypes : [],
                firstPlayer: false,
                knockedOut: opponentHp <= 0,
              }}
              resultKey={\`${'${'}Number((state as any)?.lastTurnNo ?? 0)}:${'${'}Number((state as any)?.turn ?? 1)}\`}
              winner={null}
              turnOnly
              title={\`TURNO ${'${'}Number((state as any)?.turn ?? 1)} • ${'${'}opponentName} VS ${'${'}myName}\`}
              subtitle="Game Boy rules • modelos 3D não usam arte da carta"
            />`;
    text=text.slice(0,a)+arena+text.slice(b);
  }
  if(!text.includes('AdaptiveBattleArena'))throw new Error('ADAPTIVE_ARENA_PATCH_FAILED');
  fs.writeFileSync(path,text);
}

function patchBattleHub(){
  const path='app/(tabs)/battles.tsx';let text=fs.readFileSync(path,'utf8');
  if(text.includes('TRAINER ADVENTURE 1.2'))return;
  const anchor='      <AreaIdentityStrip area="competitive" />';
  if(!text.includes(anchor))throw new Error('BATTLE_HUB_ANCHOR_NOT_FOUND');
  const card=`
      <Pressable
        onPress={() => router.push('/adventure' as any)}
        style={{borderWidth:1,borderColor:'#4B89AF',backgroundColor:'#102534',borderRadius:16,padding:14,flexDirection:'row',alignItems:'center',gap:11}}
      >
        <View style={{width:46,height:46,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#19384C'}}><Ionicons name="map" size={24} color="#8DD7FF"/></View>
        <View style={{flex:1}}><Text style={{color:'#F0F7FC',fontSize:14,fontWeight:'900'}}>TRAINER ADVENTURE 1.2</Text><Text style={{color:'#89A2B5',fontSize:10,marginTop:2}}>Kanto • Battle Tower • Elite Four • Raids • Rogue • Desafios • Campeão • 3D</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#8DD7FF"/>
      </Pressable>`;
  text=text.replace(anchor,anchor+card);
  fs.writeFileSync(path,text);
}

patchTeamBattle();
patchBattleHub();
console.log('Trainer Collection 1.2 battle UI patched.');
