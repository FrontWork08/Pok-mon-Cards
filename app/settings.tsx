import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { AppearanceMode, ThemeName } from '@/services/settings';
import { registerPushNotifications } from '@/services/notifications';
import { getMyProfile, setMyProfileIcon } from '@/services/player';
import { setRatingVisibility } from '@/services/achievements';
import { TrainerAvatar, type ProfileIcon } from '@/components/TrainerAvatar';
import { THEME_CATALOG } from '@/theme/themeCatalog';

const themes = Object.entries(THEME_CATALOG).map(([id, theme]) => ({
  id: id as ThemeName,
  name: theme.name,
  icon: theme.icon as keyof typeof Ionicons.glyphMap,
  colors: [theme.accent, theme.secondary],
  mascot: theme.mascot,
  image: theme.image,
}));

const profileIcons: Array<{ id: ProfileIcon; name: string }> = [
  { id:'pokeball', name:'Captura' }, { id:'trainer', name:'Treinador' },
  { id:'electric', name:'Elétrico' }, { id:'fire', name:'Fogo' },
  { id:'water', name:'Água' }, { id:'leaf', name:'Planta' },
  { id:'ghost', name:'Fantasma' }, { id:'dragon', name:'Dragão' },
  { id:'diamond', name:'Diamante' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, appearance, themeName, settings, updatePreferences } = useAppTheme();
  const [showRating, setShowRating] = useState(true);
  const [profileIcon, setProfileIcon] = useState<ProfileIcon>('pokeball');
  useEffect(() => { getMyProfile().then((profile) => {
    setShowRating(profile.show_battle_rating);
    setProfileIcon((profile.profile_icon || 'pokeball') as ProfileIcon);
  }).catch(() => null); }, []);
  const modes: Array<{ id: AppearanceMode; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id:'system', label:'Sistema', icon:'phone-portrait' }, { id:'dark', label:'Escuro', icon:'moon' }, { id:'light', label:'Claro', icon:'sunny' },
  ];

  async function toggleRating(value:boolean){
    const previous=showRating;setShowRating(value);
    try{await setRatingVisibility(value);}catch{setShowRating(previous);}
  }

  async function togglePush(value:boolean){
    await updatePreferences({push_notifications:value});
    if(value) await registerPushNotifications().catch(()=>null);
  }

  async function chooseProfileIcon(value: ProfileIcon) {
    const previous = profileIcon;
    setProfileIcon(value);
    try { await setMyProfileIcon(value); } catch { setProfileIcon(previous); }
  }

  return (
    <Screen title="Personalização" subtitle="Escolha aparência, tema visual e preferências sociais da sua conta.">
      <Pressable style={styles.backRow} onPress={() => goBackOrHome(router)}><Ionicons name="arrow-back" size={18} color={colors.muted} /><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>

      <View style={[styles.section,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.kicker,{color:colors.yellow}]}>APARÊNCIA</Text><Text style={[styles.title,{color:colors.text}]}>Modo da interface</Text>
        <View style={styles.modeRow}>{modes.map((mode)=><Pressable key={mode.id} onPress={()=>updatePreferences({appearance:mode.id})} style={[styles.mode,{borderColor:colors.border,backgroundColor:appearance===mode.id?colors.accentSoft:colors.surfaceAlt},appearance===mode.id&&{borderColor:colors.accent}]}><Ionicons name={mode.icon} size={20} color={appearance===mode.id?colors.accent:colors.muted}/><Text style={[styles.modeText,{color:appearance===mode.id?colors.text:colors.muted}]}>{mode.label}</Text>{appearance===mode.id?<Ionicons name="checkmark-circle" size={16} color={colors.accent}/>:null}</Pressable>)}</View>
      </View>

      <View style={[styles.section,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.kicker,{color:colors.yellow}]}>TEMAS</Text><Text style={[styles.title,{color:colors.text}]}>Identidade do Trainer Hub</Text><Text style={[styles.helper,{color:colors.muted}]}>O tema altera destaques, navegação, glows e componentes compatíveis.</Text>
        <View style={styles.themeGrid}>{themes.map((theme)=><Pressable key={theme.id} onPress={()=>updatePreferences({theme:theme.id})} style={[styles.themeCard,{backgroundColor:colors.surfaceAlt,borderColor:themeName===theme.id?theme.colors[0]:colors.border}]}><Image source={{uri:theme.image}} resizeMode="contain" style={styles.themePokemon}/><View style={[styles.themeIcon,{backgroundColor:`${theme.colors[0]}22`}]}><Ionicons name={theme.icon} size={22} color={theme.colors[0]}/></View><View style={styles.themeCopy}><Text style={[styles.themeName,{color:colors.text}]}>{theme.name}</Text><Text style={[styles.themeMascot,{color:colors.muted}]}>{theme.mascot}</Text><View style={styles.swatches}><View style={[styles.swatch,{backgroundColor:theme.colors[0]}]}/><View style={[styles.swatch,{backgroundColor:theme.colors[1]}]}/></View></View>{themeName===theme.id?<Ionicons name="checkmark-circle" size={18} color={theme.colors[0]}/>:null}</Pressable>)}</View>
      </View>

      <View style={[styles.section,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.kicker,{color:colors.yellow}]}>ÍCONE DO PERFIL</Text>
        <Text style={[styles.title,{color:colors.text}]}>Seu símbolo de treinador</Text>
        <Text style={[styles.helper,{color:colors.muted}]}>Aparece no perfil e nas áreas sociais sem enviar foto ou pesar o aplicativo.</Text>
        <View style={styles.iconGrid}>{profileIcons.map((item)=><Pressable key={item.id} onPress={()=>{void chooseProfileIcon(item.id);}} style={[styles.iconChoice,{backgroundColor:colors.surfaceAlt,borderColor:profileIcon===item.id?colors.accent:colors.border}]}><TrainerAvatar icon={item.id} size={44} color={profileIcon===item.id?colors.yellow:colors.accent} backgroundColor={colors.surface}/><Text style={[styles.iconName,{color:colors.text}]}>{item.name}</Text>{profileIcon===item.id?<Ionicons name="checkmark-circle" size={16} color={colors.accent}/>:null}</Pressable>)}</View>
      </View>

      <View style={[styles.section,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.kicker,{color:colors.yellow}]}>SOCIAL</Text><Text style={[styles.title,{color:colors.text}]}>Chat e batalhas</Text>
        <SettingToggle title="Notificações do chat" text="Avisar quando um amigo enviar mensagem." value={settings?.chat_notifications ?? true} onChange={(value)=>updatePreferences({chat_notifications:value})} colors={colors}/>
        <SettingToggle title="Push no celular" text="Receber mensagens, convites e resultados mesmo com o app fechado." value={settings?.push_notifications ?? true} onChange={togglePush} colors={colors}/>
        <SettingToggle title="Exibir meu ELO" text="Mostrar pontos e símbolo do rank para outros treinadores no perfil e ranking." value={showRating} onChange={toggleRating} colors={colors}/>
        <SettingToggle title="Mostrar quando estou online" text="Permitir que seus amigos vejam seu status online em tempo real. Desative para aparecer como offline." value={settings?.show_online_status ?? true} onChange={(value)=>updatePreferences({show_online_status:value})} colors={colors}/>
        <SettingToggle title="Convites de batalha" text="Permitir que amigos enviem desafios pelo chat." value={settings?.battle_invites ?? true} onChange={(value)=>updatePreferences({battle_invites:value})} colors={colors}/>
        <SettingToggle title="Som nas batalhas" text="Usar efeitos sonoros nas revelações e resultados." value={settings?.battle_sounds ?? true} onChange={(value)=>updatePreferences({battle_sounds:value})} colors={colors}/>
        <SettingToggle title="Vibração nas batalhas" text="Vibrar ao travar, revelar e concluir uma partida." value={settings?.battle_vibration ?? true} onChange={(value)=>updatePreferences({battle_vibration:value})} colors={colors}/>
      </View>
    </Screen>
  );
}

function SettingToggle({title,text,value,onChange,colors}:{title:string;text:string;value:boolean;onChange:(value:boolean)=>void|Promise<void>;colors:any}){return <View style={[styles.toggleRow,{borderTopColor:colors.border}]}><View style={{flex:1}}><Text style={[styles.toggleTitle,{color:colors.text}]}>{title}</Text><Text style={[styles.toggleText,{color:colors.muted}]}>{text}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{false:colors.border,true:colors.accent}}/></View>}

const styles=StyleSheet.create({
  backRow:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},section:{padding:16,borderRadius:20,borderWidth:1,gap:10},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.3},title:{fontSize:19,fontWeight:'900'},helper:{fontSize:10,lineHeight:15},modeRow:{flexDirection:'row',flexWrap:'wrap',gap:8},mode:{minWidth:130,flexGrow:1,flexDirection:'row',alignItems:'center',gap:7,padding:12,borderRadius:13,borderWidth:1},modeText:{flex:1,fontSize:11,fontWeight:'900'},themeGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},themeCard:{position:'relative',overflow:'hidden',flexGrow:1,flexBasis:145,minWidth:135,padding:12,borderRadius:15,borderWidth:1,gap:8},themePokemon:{position:'absolute',right:-10,bottom:-20,width:92,height:118,opacity:.30},themeCopy:{flex:1,minWidth:0},themeMascot:{fontSize:8,fontWeight:'800',marginTop:2},themeIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center'},themeName:{fontSize:12,fontWeight:'900'},swatches:{flexDirection:'row',gap:5},swatch:{width:22,height:6,borderRadius:999},iconGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},iconChoice:{flexGrow:1,flexBasis:125,minWidth:118,borderWidth:1,borderRadius:15,padding:10,alignItems:'center',gap:7},iconName:{fontSize:10,fontWeight:'900'},toggleRow:{flexDirection:'row',alignItems:'center',gap:12,paddingTop:12,borderTopWidth:1},toggleTitle:{fontSize:12,fontWeight:'900'},toggleText:{fontSize:9,lineHeight:14,marginTop:2},
});
