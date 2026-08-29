import { readFileSync, existsSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const readText = (path) => readFileSync(path, 'utf8');

const app = readJson('app.json');
const pkg = readJson('package.json');
const baseline = readJson('scripts/native-runtime-baseline.json');
const apkWorkflow = readText('.github/workflows/android-apk.yml');
const otaWorkflow = readText('.github/workflows/eas-update.yml');
const envExample = readText('.env.example');

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const pluginName = (plugin) => Array.isArray(plugin) ? String(plugin[0]) : String(plugin);
const plugins = [...(app.expo?.plugins ?? [])].map(pluginName).sort();
const baselinePlugins = [...(baseline.plugins ?? [])].map(pluginName).sort();

assert(app.expo?.version === baseline.appVersion, 'app.json version mudou: isso exige novo runtime/APK ou atualização intencional do baseline.');
assert(app.expo?.runtimeVersion?.policy === baseline.runtimeVersionPolicy, 'runtimeVersion deixou de usar a política appVersion.');
assert(app.expo?.android?.package === baseline.androidPackage, 'Android package mudou e exige novo APK.');
assert(app.expo?.scheme === baseline.scheme, 'Deep-link scheme mudou e exige revisão nativa.');
assert(app.expo?.updates?.url === baseline.updatesUrl, 'URL de Expo Updates mudou.');
assert(app.expo?.extra?.eas?.projectId === baseline.easProjectId, 'EAS projectId mudou.');
assert(app.expo?.android?.googleServicesFile === baseline.googleServicesFile, 'googleServicesFile mudou.');
assert(JSON.stringify(plugins) === JSON.stringify(baselinePlugins), 'Lista de plugins nativos do Expo mudou.');
assert(pkg.dependencies?.expo === baseline.expoSdk, 'Versão do Expo SDK mudou.');
assert(pkg.dependencies?.['react-native'] === baseline.reactNative, 'Versão do React Native mudou.');

assert(apkWorkflow.includes('workflow_dispatch:'), 'Workflow do APK perdeu o gatilho manual.');
assert(apkWorkflow.includes('- apk-release'), 'Workflow do APK perdeu a branch dedicada apk-release.');
assert(!/branches:\s*\n\s*-\s*main\b/m.test(apkWorkflow), 'Workflow do APK não pode gerar APK em pushes normais do main.');
assert(otaWorkflow.includes('- app/**'), 'OTA não observa alterações em app/**.');
assert(otaWorkflow.includes('- src/**'), 'OTA não observa alterações em src/**.');
assert(otaWorkflow.includes('- assets/**'), 'OTA não observa alterações em assets/**.');

assert(envExample.includes('EXPO_PUBLIC_SUPABASE_URL='), '.env.example não documenta EXPO_PUBLIC_SUPABASE_URL.');
assert(envExample.includes('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY='), '.env.example não documenta EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
assert(!/SERVICE_ROLE|SECRET_KEY/i.test(envExample), '.env.example expõe ou sugere segredo privilegiado no cliente.');

for (const file of [
  'google-services.json',
  'src/lib/supabase.ts',
  'src/services/notifications.ts',
  'src/services/matchmaking.ts',
  'src/components/UpdatePrompt.tsx',
]) {
  assert(existsSync(file), `Arquivo crítico ausente: ${file}`);
}

if (failures.length) {
  console.error('\n❌ Auditoria do projeto falhou:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('✅ Auditoria OTA/native passou.');
console.log('   APK só é liberado por workflow_dispatch ou pela branch dedicada apk-release; app/src/assets continuam via Expo Updates.');
