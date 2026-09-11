import { readFileSync } from 'node:fs';

const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const packages=lock.packages??{};
const failures=[];

function version(path){ return packages[path]?.version??null; }
function assertVersion(path,expected,label){
  const actual=version(path);
  if(actual!==expected) failures.push(`${label}: esperado ${expected}, encontrado ${actual??'ausente'}.`);
}
function assertAbsent(path,label){
  if(packages[path]) failures.push(`${label}: dependência antiga ainda presente (${packages[path].version}).`);
}

assertVersion('node_modules/expo','57.0.22','Expo SDK 57 fixado');
assertVersion('node_modules/react-native','0.86.3','React Native compatível com SDK 57');
assertVersion('node_modules/expo-router','57.0.21','Expo Router SDK 57');
assertVersion('node_modules/expo-audio','57.0.5','Expo Audio SDK 57');
assertVersion('node_modules/react-native-worklets','0.10.1','Worklets compatível com expo-modules-core 57');
assertVersion('node_modules/js-yaml','4.3.2','js-yaml corrigido');
assertVersion('node_modules/postcss','8.5.23','PostCSS corrigido');
assertAbsent('node_modules/expo-av','expo-av obsoleto');
assertAbsent('node_modules/image-size','image-size vulnerável do grafo RN antigo');

if(failures.length){
  console.error('❌ Baseline de dependências seguras regrediu:');
  failures.forEach(x=>console.error(' - '+x));
  process.exit(1);
}
console.log('✅ Baseline nativo SDK 57 protegido: Expo 57.0.22 + RN 0.86.3 + Router 57.0.21.');
console.log('✅ expo-av/image-size antigos ausentes; js-yaml e PostCSS permanecem em versões corrigidas.');
console.log('ℹ️  O CI também executa npm audit --audit-level=high para bloquear vulnerabilidades altas/críticas novas.');
