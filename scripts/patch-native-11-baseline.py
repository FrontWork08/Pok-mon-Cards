from pathlib import Path
import json

path = Path('scripts/native-runtime-baseline.json')
baseline = json.loads(path.read_text())
baseline['appVersion'] = '1.1.0'
baseline['plugins'] = [
    'expo-camera',
    'expo-image-picker',
    'expo-local-authentication',
    'expo-notifications',
    'expo-quick-actions',
    'expo-router',
    'expo-secure-store',
]
path.write_text(json.dumps(baseline, indent=2) + '\n')
print('Native runtime baseline intentionally advanced to Trainer Collection 1.1.0.')
