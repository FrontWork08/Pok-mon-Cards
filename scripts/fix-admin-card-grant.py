from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if text.count(old) < count:
        raise SystemExit(f"{path}: anchor not found: {old[:180]!r}")
    p.write_text(text.replace(old, new, count))


p = "app/admin-card-grant.tsx"
replace(
    p,
    "import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';",
    "import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';",
)
replace(
    p,
    "  const [cardPicker, setCardPicker] = useState(false);\n  const [loading, setLoading] = useState(true);",
    "  const [cardPicker, setCardPicker] = useState(false);\n  const [confirmOpen, setConfirmOpen] = useState(false);\n  const [loading, setLoading] = useState(true);",
)
replace(
    p,
    "  async function executeGrant() {\n    if (!target || !card || working || qty < 1 || qty > 100) return;",
    "  async function executeGrant() {\n    if (working) return;\n    if (!target) { setError('Escolha a conta que vai receber a carta.'); return; }\n    if (!card) { setError('Escolha a carta que será adicionada.'); return; }\n    if (qty < 1 || qty > 100) { setError('Escolha uma quantidade entre 1 e 100.'); return; }",
)
old_confirm = """  function confirmGrant() {
    if (!target || !card) return;
    if (qty < 1 || qty > 100) {
      setError('Escolha uma quantidade entre 1 e 100.');
      return;
    }
    Alert.alert(
      'Adicionar carta à conta?',
      `Adicionar ${qty}x ${card.name} (${card.setName ?? card.setId} #${card.number ?? '—'}) para @${target.username}?\\n\\nEsta ação é exclusiva do Criador e ficará registrada na auditoria.`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'ADICIONAR', onPress: () => { void executeGrant(); } }],
    );
  }
"""
new_confirm = """  function confirmGrant() {
    setError(null);
    setNotice(null);
    if (!target) {
      setError('Escolha a conta que vai receber a carta.');
      return;
    }
    if (!card) {
      setError('Escolha a carta que será adicionada.');
      return;
    }
    if (qty < 1 || qty > 100) {
      setError('Escolha uma quantidade entre 1 e 100.');
      return;
    }
    setConfirmOpen(true);
  }
"""
replace(p, old_confirm, new_confirm)
replace(
    p,
    "        <Pressable disabled={!target || !card || qty < 1 || qty > 100 || working} onPress={confirmGrant} style={[styles.primary, { backgroundColor: colors.yellow }, (!target || !card || qty < 1 || qty > 100 || working) && styles.disabled]}>\n          {working ? <ActivityIndicator color=\"#07111F\" /> : <Ionicons name=\"gift\" size={20} color=\"#07111F\" />}\n          <Text style={styles.primaryText}>ADICIONAR CARTA À CONTA</Text>\n        </Pressable>",
    "        <Pressable disabled={working} onPress={confirmGrant} style={[styles.primary, { backgroundColor: colors.yellow }, working && styles.disabled]}>\n          {working ? <ActivityIndicator color=\"#07111F\" /> : <Ionicons name=\"gift\" size={20} color=\"#07111F\" />}\n          <Text style={styles.primaryText}>{working ? 'ADICIONANDO…' : 'ADICIONAR CARTA À CONTA'}</Text>\n        </Pressable>",
)
marker = "      <Modal visible={playerPicker} transparent animationType=\"fade\" onRequestClose={() => setPlayerPicker(false)}>\n"
confirm_modal = """      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => { if (!working) setConfirmOpen(false); }}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} disabled={working} onPress={() => setConfirmOpen(false)} />
          <View style={[styles.confirmCard, { backgroundColor: colors.bg, borderColor: colors.yellow }]}>
            <View style={[styles.confirmIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="gift" size={28} color={colors.yellow} /></View>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>Adicionar carta à conta?</Text>
            <Text style={[styles.confirmBody, { color: colors.muted }]}>{card && target ? `Adicionar ${qty}x ${card.name} (${card.setName ?? card.setId} #${card.number ?? '—'}) para @${target.username}?` : ''}</Text>
            <Text style={[styles.confirmAudit, { color: colors.muted }]}>A ação é exclusiva do Criador e ficará registrada na auditoria.</Text>
            <View style={styles.confirmActions}>
              <Pressable disabled={working} onPress={() => setConfirmOpen(false)} style={[styles.confirmSecondary, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.confirmSecondaryText, { color: colors.text }]}>CANCELAR</Text></Pressable>
              <Pressable disabled={working} onPress={() => { setConfirmOpen(false); void executeGrant(); }} style={[styles.confirmPrimary, { backgroundColor: colors.yellow }, working && styles.disabled]}>{working ? <ActivityIndicator color="#07111F" /> : <Ionicons name="add-circle" size={18} color="#07111F" />}<Text style={styles.confirmPrimaryText}>{working ? 'ADICIONANDO…' : 'ADICIONAR'}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

"""
replace(p, marker, confirm_modal + marker)
replace(
    p,
    "price:{fontSize:9,fontWeight:'900'}\n});",
    "price:{fontSize:9,fontWeight:'900'},confirmCard:{width:'100%',maxWidth:470,alignSelf:'center',borderWidth:1,borderRadius:20,padding:18,alignItems:'center',gap:9},confirmIcon:{width:56,height:56,borderRadius:18,alignItems:'center',justifyContent:'center'},confirmTitle:{fontSize:18,fontWeight:'900',textAlign:'center'},confirmBody:{fontSize:10,lineHeight:15,textAlign:'center'},confirmAudit:{fontSize:7.5,lineHeight:11,textAlign:'center'},confirmActions:{width:'100%',flexDirection:'row',gap:8,marginTop:4},confirmSecondary:{flex:1,minHeight:46,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},confirmSecondaryText:{fontSize:8,fontWeight:'900'},confirmPrimary:{flex:1,minHeight:46,borderRadius:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},confirmPrimaryText:{fontSize:8,fontWeight:'900',color:'#07111F'}\n});",
)

Path("scripts/admin-card-grant-audit.mjs").write_text("""import { readFile } from 'node:fs/promises';

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
""")

pkg = Path("package.json")
text = pkg.read_text()
old = 'node scripts/battle-lab-filter-audit.mjs"'
new = 'node scripts/battle-lab-filter-audit.mjs && node scripts/admin-card-grant-audit.mjs"'
if old not in text:
    raise SystemExit("package.json verify anchor missing")
pkg.write_text(text.replace(old, new, 1))
