from pathlib import Path

path = Path('app/_layout.tsx')
text = path.read_text()

replacements = [
    (
        "  const [matchmaking, setMatchmaking] = useState<MatchmakingState | null>(null);\n",
        "  const [matchmaking, setMatchmaking] = useState<MatchmakingState | null>(null);\n  const [bottomNavHeight, setBottomNavHeight] = useState(0);\n",
    ),
    (
        "  const showChrome = Boolean(userId) && !accountRestriction && !maintenanceBlocked && !pathname.startsWith('/battle/') && pathname !== '/reset-password';\n  return (\n",
        "  const showChrome = Boolean(userId) && !accountRestriction && !maintenanceBlocked && !pathname.startsWith('/battle/') && pathname !== '/reset-password';\n  const matchmakingBottom = showChrome\n    ? Math.max(bottomNavHeight + 10, Math.max(insets.bottom, 5) + 77)\n    : Math.max(insets.bottom + 12, 18);\n  return (\n",
    ),
    (
        "      {showChrome ? <GlobalBottomNavigation /> : null}\n",
        "      {showChrome ? (\n        <View\n          collapsable={false}\n          onLayout={(event) => {\n            const height = Math.ceil(event.nativeEvent.layout.height);\n            if (height > 0) setBottomNavHeight((current) => current === height ? current : height);\n          }}\n        >\n          <GlobalBottomNavigation />\n        </View>\n      ) : null}\n",
    ),
    (
        "        <View pointerEvents=\"box-none\" style={[styles.matchmakingHost, { bottom: Math.max(insets.bottom + 12, 18) }]}>\n",
        "        <View pointerEvents=\"box-none\" style={[styles.matchmakingHost, { bottom: matchmakingBottom }]}>\n",
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Anchor not found: {old[:160]!r}')
    text = text.replace(old, new, 1)

path.write_text(text)

# Guard the exact regression: the search banner must use the measured persistent
# navigation height, with a safe fallback for the first layout frame.
checks = [
    'bottomNavHeight',
    'onLayout={(event) =>',
    'Math.max(bottomNavHeight + 10',
    'bottom: matchmakingBottom',
    '<GlobalBottomNavigation />',
]
final = path.read_text()
missing = [item for item in checks if item not in final]
if missing:
    raise SystemExit(f'Matchmaking layout regression guard failed: {missing}')
print('Matchmaking banner offset patch applied and guarded.')
