import { existsSync, readFileSync, statSync } from 'node:fs';
const fail = [];
const assert = (ok, msg) => { if (!ok) fail.push(msg); };
const app = JSON.parse(readFileSync('app.json','utf8'));
const pkg = JSON.parse(readFileSync('package.json','utf8'));
const expo = app.expo ?? {};
assert(expo.version === '1.2.1', 'app version must be 1.2.1');
assert(pkg.dependencies?.['expo-local-authentication'], 'expo-local-authentication missing');
assert(pkg.dependencies?.['expo-quick-actions'], 'expo-quick-actions missing');
assert(pkg.dependencies?.['expo-gl'], 'expo-gl missing from 1.2 native runtime');
const plugin = (name) => (expo.plugins ?? []).find((p) => (Array.isArray(p) ? p[0] : p) === name);
assert(Boolean(plugin('expo-local-authentication')), 'local authentication config plugin missing');
assert(Boolean(plugin('expo-quick-actions')), 'quick actions config plugin missing');
const notifications = plugin('expo-notifications');
const notificationConfig = Array.isArray(notifications) ? notifications[1] : null;
for (const sound of ['tc_default.wav','tc_battle.wav','tc_social.wav','tc_trade.wav']) {
  const path = `assets/sounds/${sound}`;
  assert(existsSync(path) && statSync(path).size > 1000, `native notification sound missing: ${sound}`);
  assert(notificationConfig?.sounds?.some((item) => String(item).endsWith(sound)), `notification plugin does not bundle ${sound}`);
}
// Existing v11 channel ids stay stable across 1.2 so Android users do not get duplicate channels.
assert(notificationConfig?.defaultChannel === 'default_v11', 'stable default notification channel missing');
const filters = expo.android?.intentFilters ?? [];
const verified = filters.find((f) => f.autoVerify === true && (f.data ?? []).some((d) => d.host === 'pokemon-cards-frontwork.expo.app' && d.pathPrefix === '/auth/callback'));
assert(Boolean(verified), 'verified Android App Link for auth callback missing');
const assetlinks = JSON.parse(readFileSync('public/.well-known/assetlinks.json','utf8'));
const target = assetlinks?.[0]?.target;
assert(target?.package_name === 'com.frontwork.pokemoncards', 'assetlinks package mismatch');
assert(target?.sha256_cert_fingerprints?.includes('7B:4E:00:52:F1:BD:F0:7E:0C:33:AB:C4:17:6D:E9:6F:9C:F7:A6:4A:8F:32:5A:E7:C5:DC:BB:20:83:CC:28:43'), 'assetlinks signer fingerprint mismatch');
const auth = readFileSync('src/services/auth.ts','utf8');
assert(auth.includes('APP_LINK_AUTH_CALLBACK') && auth.includes('https://pokemon-cards-frontwork.expo.app'), 'auth does not use verified HTTPS callback');
const n = readFileSync('src/services/notifications.ts','utf8');
for (const id of ['default_v11','battles_v11','social_v11','trades_v11','tc_battle','tc_social','tc_trade']) assert(n.includes(id), `notification native contract missing ${id}`);
const layout = readFileSync('app/_layout.tsx','utf8');
assert(layout.includes('DeviceSecurityGate') && layout.includes('NativeQuickActionsBootstrap'), 'root native bootstraps missing');
assert(layout.includes("pathname === '/auth/callback'"), 'verified auth callback must remain public before a session exists');
assert(layout.includes("!pathname.startsWith('/auth/')"), 'auth callback must not render private app chrome');
const callback = readFileSync('app/auth/callback.tsx','utf8');
assert(callback.includes("if (Platform.OS !== 'web') return;"), 'native callback route must not exchange the same PKCE code as the root Linking handler');
assert(!callback.includes('Linking.getInitialURL'), 'native callback screen reintroduced duplicate Linking ownership');
assert(existsSync('app/security.tsx') && existsSync('src/services/deviceSecurity.ts'), 'device security UI/service missing');
const gate = readFileSync('src/components/DeviceSecurityGate.tsx','utf8');
assert(gate.includes('unlockingRef') && gate.includes('lockAndPrompt'), 'device security gate lost single-flight prompt protection');
assert(!gate.includes('if (locked && enabled && !unlocking)'), 'device security gate reintroduced automatic retry prompt loop');
assert(existsSync('src/components/NativeQuickActionsBootstrap.tsx'), 'quick actions bootstrap missing');
if (fail.length) { console.error(fail.map((x) => `- ${x}`).join('\n')); process.exit(1); }
console.log('Trainer Collection 1.2.1 native contracts: OK');
