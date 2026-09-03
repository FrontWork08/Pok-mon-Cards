import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

type BattleSoundKind='confirm'|'round'|'victory'|'defeat';

const CLICK_WAV_BASE64='UklGRvQCAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YdACAAAAADAApAATASoBsACq/17+Q/3a/HX9FP9VAY4D+gT9BGIDegAP/Sz6zfiO+Wj8pgAUBVAIPglkBx0Dkf1e+Cf1DPVJ+Bb+0gR8CkcNMAxVBwAASviI8pLwMPPN+ZcC/QpvECYRugxJBDj6fvHN7LbtJ/Rk/noJHBKZFbkSIQo5/nbyt+o/6Xzu4vhgBUoQZxbpFfYOmgMv913tCel56/fzAAAJDIcU9xajEtEIZvwK8Rfqmem276D6HgeEEcEWSRWKDc4Bi/Vc7PboXOyL9c4Big1JFcEWhBEeB6D6tu+Z6RfqCvFm/NEIoxL3FocUCQwAAPfzeesJ6V3tL/eaA/YO6RVnFkoQYAXi+HzuP+m36nbyMv51CqQTChekE3UKMv528rfqP+l87uL4YAVKEGcW6RX2DpoDL/dd7Qnpeev38wAACQyHFPcWoxLRCGb8CvEX6pnptu+g+h4HhBHBFkkVig3OAYv1XOz26Fzsi/XOAYoNSRXBFoQRHgeg+rbvmekX6grxZvzRCKMS9xaHFAkMAAD383nrCeld7S/3mgP2DukVZxZKEGAF4vh87j/pt+p28jL+dQqkEwoXpBN1CjL+dvK36j/pfO7i+GAFShBnFukV9g6aAy/3Xe0J6Xnr9/MAAAkMhxT3FqMS0Qhm/ArxF+qZ6bbvoPoeB4QRwRZJFYoNzgGL9Vzs9uhc7Iv1zgGKDRAVSBb4ENIG5/q78Dzr6+tx8sb8zgdPENsTiBEoCgAAGPZT75TtP/Ed+ccCYAtvEJEQ4QvdA/X6xvNc8Jfx+fbR/sEGewxmDhIMUQbu/hr4z/M081T2JfzbAnwIbwv0ClMHugHe+3b3t/UF99z6AADjBCAI2gj9BjYDuv7c+rP4xfjp+mH+EwLtBCkGiwViA24Am/20+zT7HfwK/lEAQQJTA1EDXwLjAGP/Tv7n/S3+6f7H/3UAxgC3AG0AIAA=';

let cachedUri:string|null=null;
let initPromise:Promise<string>|null=null;

async function ensureUri(){
  if(cachedUri)return cachedUri;
  if(initPromise)return initPromise;
  initPromise=(async()=>{
    if(Platform.OS==='web'){
      cachedUri=`data:audio/wav;base64,${CLICK_WAV_BASE64}`;
      return cachedUri;
    }
    const base=FileSystem.cacheDirectory;
    if(!base)throw new Error('CACHE_UNAVAILABLE');
    const uri=base+'trainer-battle-click.wav';
    const info=await FileSystem.getInfoAsync(uri);
    if(!info.exists)await FileSystem.writeAsStringAsync(uri,CLICK_WAV_BASE64,{encoding:FileSystem.EncodingType.Base64});
    cachedUri=uri;
    return uri;
  })();
  try{return await initPromise;}finally{initPromise=null;}
}

const PROFILE:Record<BattleSoundKind,{rate:number;volume:number}> = {
  confirm:{rate:1.05,volume:.32},
  round:{rate:.86,volume:.28},
  victory:{rate:1.45,volume:.36},
  defeat:{rate:.68,volume:.26},
};

export async function playBattleSound(kind:BattleSoundKind){
  try{
    const uri=await ensureUri();
    const profile=PROFILE[kind];
    const{sound}=await Audio.Sound.createAsync(
      {uri},
      {shouldPlay:false,volume:profile.volume,rate:profile.rate,shouldCorrectPitch:false},
    );
    sound.setOnPlaybackStatusUpdate((status)=>{
      if(status.isLoaded&&status.didJustFinish)void sound.unloadAsync().catch(()=>undefined);
    });
    await sound.playAsync();
  }catch{
    // Sound is optional and must never interrupt battle actions.
  }
}
