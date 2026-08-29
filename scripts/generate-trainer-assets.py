from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets' / 'trainer-collection-poster.jpg'
ASSETS = ROOT / 'assets'
PUBLIC = ROOT / 'public'

if not SOURCE.exists():
    raise SystemExit(f'Missing Trainer Collection artwork: {SOURCE}')

source = Image.open(SOURCE).convert('RGB')

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

print('Trainer Collection assets generated:')
for path in [ASSETS / 'icon.png', ASSETS / 'adaptive-icon.png', ASSETS / 'splash.png', PUBLIC / 'icon.png']:
    print(f' - {path.relative_to(ROOT)} ({path.stat().st_size} bytes)')
