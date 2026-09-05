from pathlib import Path

path = Path('scripts/regression-audit.mjs')
text = path.read_text()
old = "  assert(auth.includes('return GOOGLE_OAUTH_REDIRECT'), 'Regressão: recuperação nativa deixou de abrir o callback do APK.');"
new = "  assert(auth.includes('APP_LINK_AUTH_CALLBACK') && auth.includes('return APP_LINK_AUTH_CALLBACK') && auth.includes(\"GOOGLE_OAUTH_REDIRECT = 'pokemoncards://auth/callback'\"), 'Regressão: recuperação nativa perdeu o App Link HTTPS verificado ou o fallback do callback legado.');"
if old not in text:
    raise SystemExit('Legacy native recovery regression assertion was not found.')
path.write_text(text.replace(old, new, 1))
print('Recovery regression audit now requires verified HTTPS callback plus legacy scheme fallback.')
