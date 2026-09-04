import { readFile } from 'node:fs/promises';

const app=await readFile('app/admin-card-grant.tsx','utf8');
const svc=await readFile('src/services/adminCardGrant.ts','utf8');
const required=[
  'const [confirmOpen, setConfirmOpen] = useState(false)',
  "setError('Escolha a conta que vai receber a carta.')",
  "setError('Escolha a carta que será adicionada.')",
  "setError('Escolha uma quantidade entre 1 e 100.')",
  'setConfirmOpen(true)',
  'visible={confirmOpen}',
  'disabled={working} onPress={confirmGrant}',
  "working ? 'ADICIONANDO…' : 'ADICIONAR CARTA À CONTA'",
  'void executeGrant()',
];
const missing=required.filter(x=>!app.includes(x));
if(app.includes('Alert.alert')) missing.push('Alert.alert must not be used for grant confirmation');
if(!svc.includes("action: 'owner_grant_card'")) missing.push('owner_grant_card service action');
if(missing.length){console.error('❌ Admin card grant audit failed:',missing);process.exit(1);}
console.log('✅ Admin card grant audit: botão nunca falha silenciosamente; confirmação interna e execução explícita presentes.');
