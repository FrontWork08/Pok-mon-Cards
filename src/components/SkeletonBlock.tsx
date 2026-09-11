import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';

export function SkeletonBlock({height=16,width='100%',radius=10}:{height?:number;width?:number|`${number}%`;radius?:number}){
 const{colors}=useAppTheme();
 return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.block,{height,width,borderRadius:radius,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>;
}
export function HomeSkeleton(){
 return <View style={styles.wrap}>
  <SkeletonBlock height={190} radius={20}/>
  <SkeletonBlock height={105} radius={18}/>
  <View style={styles.row}><SkeletonBlock height={92} width="48%" radius={16}/><SkeletonBlock height={92} width="48%" radius={16}/></View>
  <View style={styles.row}><SkeletonBlock height={92} width="48%" radius={16}/><SkeletonBlock height={92} width="48%" radius={16}/></View>
 </View>;
}
const styles=StyleSheet.create({block:{borderWidth:1,opacity:.76},wrap:{gap:10},row:{flexDirection:'row',justifyContent:'space-between',gap:8}});