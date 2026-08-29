from pathlib import Path
from io import BytesIO
import base64
import hashlib

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PARTS = ROOT / 'assets' / 'trainer-poster-base64'
ASSETS = ROOT / 'assets'
PUBLIC = ROOT / 'public'
EXPECTED_SHA256 = '11dcca38815f6e93f264ad7828d711afd65929bb5b9ec5f4b4e1d63b0017dbdd'

parts = sorted(SOURCE_PARTS.glob('part-*.txt'))
if not parts:
    raise SystemExit(f'Missing Trainer Collection artwork source parts: {SOURCE_PARTS}')

encoded = ''.join(path.read_text('utf8').strip() for path in parts)
try:
    raw = base64.b64decode(encoded, validate=True)
except Exception as exc:
    raise SystemExit(f'Invalid Trainer Collection artwork base64: {exc}') from exc

actual_sha = hashlib.sha256(raw).hexdigest()
if actual_sha != EXPECTED_SHA256:
    raise SystemExit(
        f'Trainer Collection artwork integrity check failed: {actual_sha} != {EXPECTED_SHA256}'
    )

source = Image.open(BytesIO(raw)).convert('RGB')

# Native splash: full 9:16 poster composition.
splash = ImageOps.fit(source, (1080, 1920), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
splash.save(ASSETS / 'splash.png', optimize=True)

# App icon: focus on the dragon and energy ring, avoiding the title area.
w, h = source.size
square = min(w, int(h * 0.60))
left = max(0, (w - square) // 2)
top = max(0, int(h * 0.035))
if top + square > h:
    top = h - square
icon = source.crop((left, top, left + square, top + square)).resize((1024, 1024), Image.Resampling.LANCZOS)
icon.save(ASSETS / 'icon.png', optimize=True)
icon.save(PUBLIC / 'icon.png', optimize=True)

# Android adaptive foreground: keep the dragon inside the safe zone with transparent margins.
foreground = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
content = icon.convert('RGBA').resize((760, 760), Image.Resampling.LANCZOS)
mask = Image.new('L', (760, 760), 0)
draw = ImageDraw.Draw(mask)
draw.ellipse((8, 8, 752, 752), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(4))
content.putalpha(mask)
foreground.alpha_composite(content, ((1024 - 760) // 2, (1024 - 760) // 2))
foreground.save(ASSETS / 'adaptive-icon.png', optimize=True)

# Android notification icon: monochrome white glyph with transparent background.
# Android tints this white mask using the color configured in expo-notifications.
notification = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
ndraw = ImageDraw.Draw(notification)
ndraw.ellipse((12, 12, 84, 84), outline=(255, 255, 255, 255), width=8)
ndraw.ellipse((36, 36, 60, 60), fill=(255, 255, 255, 255))
ndraw.line((18, 48, 78, 48), fill=(255, 255, 255, 255), width=8)
notification.save(ASSETS / 'notification-icon.png', optimize=True)

print(f'Trainer Collection artwork verified: {source.width}x{source.height} sha256={actual_sha}')
print('Trainer Collection assets generated:')
for path in [ASSETS / 'icon.png', ASSETS / 'adaptive-icon.png', ASSETS / 'notification-icon.png', ASSETS / 'splash.png', PUBLIC / 'icon.png']:
    print(f' - {path.relative_to(ROOT)} ({path.stat().st_size} bytes)')
