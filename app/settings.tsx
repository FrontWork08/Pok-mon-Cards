import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { AppearanceMode, ThemeName } from '@/services/settings';

const themes: Array<{ id: ThemeName; name: string; icon: keyof typeof Ionicons.glyphMap; colors: string[] }> = [
  { id:'trainer', name:'Trainer', icon:'shield', colors:['#4D8DFF','#FFD54A'] },
  { id:'midnight', name:'Midnight', icon:'moon', colors:['#9B7BFF','#5EDCFF'] },
  { id:'poke_red', name:'Poké Red', icon:'radio-button-on', colors:['#FF5264','#FFD54A'] },
  { id:'electric', name:'Electric', icon:'flash', colors:['#FFD83D','#4F9BFF'] },
  { id:'ghost', name:'Ghost', icon:'skull', colors:['#A970FF','#E778D2'] },
  { id:'fire', name:'Fire', icon:'flame', colors:['#FF7A3D','#FFD04A'] },
  { id:'water', name:'Water', icon:'water', colors:['#42B9FF','#5EE4D2'] },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, appearance, themeName, settings, updatePreferences } = useAppTheme();
  const modes: Array<{ id: AppearanceMode; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id:'system', label:'Sistema', icon:'phone-portrait' }, { id:'dark', label:'Escuro', icon:'moon' }, { id:'light', label:'Claro', icon:'sunny' },
  ];

  return (
    <Screen title="Personalização" subtitle="Escolha aparência, tema visual e preferências sociais da sua conta.">
      <Pressable style={styles.backRow} onPress={() => router.back()}><Ionicons name="arrow-back" size={18} color={colors.muted} /><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>

      <View style={[styles.section,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.kicker,{color:colors.yellow}]}>APARÊNCIA</Text><Text style={[styles.title,{color:colors.text}]}>Modo da interface</Text>
        <View style={styles.modeRow}>{modes.map((mode)=><Pressable key={mode.id} onPress={()=>updatePreferences({appearance:mode.id})} style={[styles.mode,{borderColor:colors.border,backgroundColor:appearance===mode.id?colors.accentSoft:colors.surfaceAlt},appearance===mode.id&&{borderColor:colors.accent}]}><Ionicons name={mode.icon} size={20} color={appearance===mode.id?colors.accent:colors.muted}/><Text style={[styles.modeText,{color:appearance===mode.id?colors.text:colors.muted}]}>{mode.label}</Text>{appearance===mode.id?<Ionicons name="checkmark-circle" size={16} color={colors.accent}/>:null}</Pressable>)}</View>
      </View>

      <View style={[styles.section,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.kicker,{color:colors.yellow}]}>TEMAS</Text><Text style={[styles.title,{color:colors.text}]}>Identidade do Trainer Hub</Text><Text style={[styles.helper,{color:colors.muted}]}>O tema altera destaques, navegação, glows e componentes compatíveis. Vamos expandir isso progressivamente para todos os cards do app.</Text>
        <View style={styles.themeGrid}>{themes.map((theme)=><Pressable key={theme.id} onPress={()=>updatePreferences({theme:theme.id})} style={[styles.themeCard,{backgroundColor:colors.surfaceAlt,borderColor:themeName===theme.id?theme.colors[0]:colors.border}]}><View style={[styles.themeIcon,{backgroundColor:`${theme.colors[0]}22`}]}><Ionicons name={theme.icon} size={22} color={theme.colors[0]}/></View><Text style={[styles.themeName,{color:colors.text}]}>{theme.name}</Text><View style={styles.swatches}><View style={[styles.swatch,{backgroundColor:theme.colors[0]}]}/><View style={[styles.swatch,{backgroundColor:theme.colors[1]}]}/></View>{themeName===theme.id?<Ionicons name="checkmark-circle" size={18} color={theme.colors[0]}/>:null}</Pressable>)}</View>
      </View>

      <View style={[styles.section,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.kicker,{color:colors.yellow}]}>SOCIAL</Text><Text style={[styles.title,{color:colors.text}]}>Chat e batalhas</Text>
        <SettingToggle title="Notificações do chat" text="Avisar quando um amigo enviar mensagem." value={settings?.chat_notifications ?? true} onChange={(value)=>updatePreferences({chat_notifications:value})} colors={colors}/>
        <SettingToggle title="Convites de batalha" text="Permitir que amigos enviem desafios pelo chat." value={settings?.battle_invites ?? true} onChange={(value)=>updatePreferences({battle_invites:value})} colors={colors}/>
      </View>
    </Screen>
  );
}

function SettingToggle({title,text,value,onChange,colors}:{title:string;text:string;value:boolean;onChange:(value:boolean)=>void;colors:any}){return <View style={[styles.toggleRow,{borderTopColor:colors.border}]}><View style={{flex:1}}><Text style={[styles.toggleTitle,{color:colors.text}]}>{title}</Text><Text style={[styles.toggleText,{color:colors.muted}]}>{text}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{false:colors.border,true:colors.accent}}/></View>}

const styles=StyleSheet.create({
  backRow:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},section:{padding:16,borderRadius:20,borderWidth:1,gap:10},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.3},title:{fontSize:19,fontWeight:'900'},helper:{fontSize:10,lineHeight:15},modeRow:{flexDirection:'row',flexWrap:'wrap',gap:8},mode:{minWidth:130,flexGrow:1,flexDirection:'row',alignItems:'center',gap:7,padding:12,borderRadius:13,borderWidth:1},modeText:{flex:1,fontSize:11,fontWeight:'900'},themeGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},themeCard:{flexGrow:1,flexBasis:145,minWidth:135,padding:12,borderRadius:15,borderWidth:1,gap:8},themeIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center'},themeName:{fontSize:12,fontWeight:'900'},swatches:{flexDirection:'row',gap:5},swatch:{width:22,height:6,borderRadius:999},toggleRow:{flexDirection:'row',alignItems:'center',gap:12,paddingTop:12,borderTopWidth:1},toggleTitle:{fontSize:12,fontWeight:'900'},toggleText:{fontSize:9,lineHeight:14,marginTop:2},
});
