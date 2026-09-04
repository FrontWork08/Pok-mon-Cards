from pathlib import Path
import re

roots = [Path('app'), Path('src')]
changed = []
pattern = re.compile(r'<FlatList(?=\s|>)')
import_line = "import { VIRTUAL_LIST_PERF_PROPS } from '@/performance/scrollPerformance';\n"

for root in roots:
    if not root.exists():
        continue
    for path in root.rglob('*.tsx'):
        text = path.read_text()
        matches = list(pattern.finditer(text))
        if not matches:
            continue

        replacements = []
        for match in matches:
            lookahead = text[match.start():match.start() + 500]
            if 'VIRTUAL_LIST_PERF_PROPS' in lookahead:
                continue
            replacements.append(match.start())

        if not replacements:
            continue

        for position in reversed(replacements):
            end = position + len('<FlatList')
            text = text[:end] + "\n        {...VIRTUAL_LIST_PERF_PROPS}" + text[end:]

        if import_line.strip() not in text:
            text = import_line + text

        path.write_text(text)
        changed.append(str(path))

print(f'Global list performance applied to {len(changed)} file(s).')
for path in changed:
    print(' -', path)
