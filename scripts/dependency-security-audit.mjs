import { readFileSync } from 'node:fs';

const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const packages=lock.packages??{};
const failures=[];

function version(path){
  return packages[path]?.version??null;
}
function assertVersion(path,expected,label){
  const actual=version(path);
  if(actual!==expected) failures.push(`${label}: esperado ${expected}, encontrado ${actual??'ausente'}.`);
}

assertVersion('node_modules/js-yaml','4.3.2','js-yaml v4 seguro');
assertVersion('node_modules/@istanbuljs/load-nyc-config/node_modules/js-yaml','3.15.2','js-yaml v3 seguro (istanbul)');
assertVersion('node_modules/cosmiconfig/node_modules/js-yaml','3.15.2','js-yaml v3 seguro (cosmiconfig)');
assertVersion('node_modules/postcss','8.5.23','PostCSS com correções de source-map');

const imageSize=version('node_modules/image-size');
const rn=version('node_modules/react-native');
const expo=version('node_modules/expo');
if(failures.length){
  console.error('❌ Baseline de dependências seguras regrediu:');
  failures.forEach(x=>console.error(' - '+x));
  process.exit(1);
}
console.log('✅ Patches transitivos compatíveis preservados: js-yaml 3.15.2/4.3.2 e postcss 8.5.23.');
console.log(`ℹ️  Dívida nativa monitorada: Expo ${expo}, React Native ${rn}, image-size ${imageSize}. Não forçar major upgrade via npm audit fix.`);
