import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { parseFriendProfileDeepLink } from '@/components/FriendQrCard';
import { useAppTheme } from '@/theme/ThemeProvider';
import { goBackOrHome } from '@/navigation/goBackOrHome';

export default function FriendQrScanScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    setActive(true);
    setNotice(null);
    return () => setActive(false);
  }, []));

  function handleScan(result: BarcodeScanningResult) {
    if (!active) return;
    const playerId = parseFriendProfileDeepLink(result.data);
    if (!playerId) {
      setNotice('Este QR não pertence à Trainer Collection.');
      setActive(false);
      return;
    }

    setActive(false);
    router.replace(`/player/${playerId}`);
  }

  if (Platform.OS === 'web') {
    return (
      <Screen title="Escanear QR" subtitle="Use a câmera do celular para adicionar outro treinador.">
        <View style={[styles.messageCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Ionicons name="phone-portrait-outline" size={34} color={colors.accent}/>
          <Text style={[styles.messageTitle,{color:colors.text}]}>Abra pelo celular</Text>
          <Text style={[styles.messageText,{color:colors.muted}]}>O scanner de QR está disponível no aplicativo Android da Trainer Collection.</Text>
        </View>
      </Screen>
    );
  }

  if (!permission) {
    return <Screen title="Escanear QR"><View style={styles.center}><Text style={{color:colors.muted}}>Carregando câmera...</Text></View></Screen>;
  }

  if (!permission.granted) {
    return (
      <Screen title="Escanear QR" subtitle="A câmera é usada somente para ler o Trainer Link de outro jogador.">
        <Pressable style={styles.back} onPress={() => goBackOrHome(router)}>
          <Ionicons name="arrow-back" size={18} color={colors.muted}/>
          <Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text>
        </Pressable>
        <View style={[styles.messageCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <View style={[styles.permissionIcon,{backgroundColor:colors.accentSoft}]}>
            <Ionicons name="camera" size={30} color={colors.accent}/>
          </View>
          <Text style={[styles.messageTitle,{color:colors.text}]}>Permissão de câmera</Text>
          <Text style={[styles.messageText,{color:colors.muted}]}>Precisamos da câmera para escanear o QR de amizade. Nenhuma foto ou vídeo é salvo.</Text>
          <Pressable style={[styles.permissionButton,{backgroundColor:colors.yellow}]} onPress={() => { void requestPermission(); }}>
            <Ionicons name="camera-outline" size={18} color="#07111F"/>
            <Text style={styles.permissionButtonText}>PERMITIR CÂMERA</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <View style={[styles.full,{backgroundColor:colors.bg}]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        active={active}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={active ? handleScan : undefined}
      />

      <View style={styles.overlay}>
        <View style={styles.top}>
          <Pressable style={styles.close} onPress={() => goBackOrHome(router)}>
            <Ionicons name="close" size={25} color="#fff"/>
          </Pressable>
          <View style={styles.topCopy}>
            <Text style={styles.kicker}>TRAINER COLLECTION</Text>
            <Text style={styles.title}>Escanear QR de amizade</Text>
            <Text style={styles.subtitle}>Centralize o Trainer Link dentro da moldura.</Text>
          </View>
        </View>

        <View style={styles.scanArea}>
          <View style={styles.frame}>
            <View style={[styles.corner,styles.tl]}/>
            <View style={[styles.corner,styles.tr]}/>
            <View style={[styles.corner,styles.bl]}/>
            <View style={[styles.corner,styles.br]}/>
            <Ionicons name="qr-code-outline" size={60} color="rgba(255,255,255,.22)"/>
          </View>
        </View>

        <View style={styles.bottom}>
          {notice ? (
            <View style={styles.notice}>
              <Ionicons name="warning" size={18} color="#FFD166"/>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : (
            <View style={styles.security}>
              <Ionicons name="shield-checkmark" size={18} color="#72E1A4"/>
              <Text style={styles.securityText}>Somente perfis válidos da Trainer Collection são aceitos.</Text>
            </View>
          )}

          {!active ? (
            <Pressable style={styles.tryAgain} onPress={() => { setNotice(null); setActive(true); }}>
              <Ionicons name="scan" size={18} color="#07111F"/>
              <Text style={styles.tryAgainText}>ESCANEAR NOVAMENTE</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles=StyleSheet.create({
  full:{flex:1},
  center:{minHeight:240,alignItems:'center',justifyContent:'center'},
  back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},
  backText:{fontSize:12,fontWeight:'800'},
  messageCard:{borderRadius:23,borderWidth:1,padding:20,alignItems:'center',gap:9},
  permissionIcon:{width:60,height:60,borderRadius:20,alignItems:'center',justifyContent:'center'},
  messageTitle:{fontSize:19,fontWeight:'900',textAlign:'center'},
  messageText:{fontSize:11,lineHeight:17,textAlign:'center',maxWidth:430},
  permissionButton:{minHeight:48,borderRadius:14,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:5},
  permissionButtonText:{color:'#07111F',fontSize:9,fontWeight:'900'},
  overlay:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(2,7,13,.36)',paddingHorizontal:18,paddingTop:48,paddingBottom:26,justifyContent:'space-between'},
  top:{flexDirection:'row',alignItems:'flex-start',gap:12},
  close:{width:44,height:44,borderRadius:15,backgroundColor:'rgba(8,15,24,.72)',borderWidth:1,borderColor:'rgba(255,255,255,.22)',alignItems:'center',justifyContent:'center'},
  topCopy:{flex:1},
  kicker:{color:'#FFD166',fontSize:8,fontWeight:'900',letterSpacing:1.3},
  title:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:2},
  subtitle:{color:'#D8E2EF',fontSize:10,marginTop:3},
  scanArea:{alignItems:'center',justifyContent:'center'},
  frame:{width:270,height:270,borderRadius:28,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(3,8,14,.16)'},
  corner:{position:'absolute',width:52,height:52,borderColor:'#FFD166'},
  tl:{left:0,top:0,borderLeftWidth:5,borderTopWidth:5,borderTopLeftRadius:25},
  tr:{right:0,top:0,borderRightWidth:5,borderTopWidth:5,borderTopRightRadius:25},
  bl:{left:0,bottom:0,borderLeftWidth:5,borderBottomWidth:5,borderBottomLeftRadius:25},
  br:{right:0,bottom:0,borderRightWidth:5,borderBottomWidth:5,borderBottomRightRadius:25},
  bottom:{gap:10},
  security:{minHeight:50,borderRadius:16,backgroundColor:'rgba(7,17,31,.82)',borderWidth:1,borderColor:'rgba(114,225,164,.35)',paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:8},
  securityText:{flex:1,color:'#DCEBE4',fontSize:9,fontWeight:'700'},
  notice:{minHeight:50,borderRadius:16,backgroundColor:'rgba(43,32,12,.9)',borderWidth:1,borderColor:'rgba(255,209,102,.45)',paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:8},
  noticeText:{flex:1,color:'#FFF1C7',fontSize:10,fontWeight:'800'},
  tryAgain:{minHeight:48,borderRadius:14,backgroundColor:'#FFD166',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  tryAgainText:{color:'#07111F',fontSize:9,fontWeight:'900'}
});
