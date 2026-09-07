import json
import math
import struct
from pathlib import Path

import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix, translation_matrix

OUT = Path('lab-assets/3d')
OUT.mkdir(parents=True, exist_ok=True)


def colored(mesh, rgba):
    mesh.visual.face_colors = np.tile(np.array(rgba, dtype=np.uint8), (len(mesh.faces), 1))
    return mesh


def add(scene, mesh, name, pos=(0, 0, 0), scale=(1, 1, 1), rot=None):
    s = np.eye(4)
    s[0, 0], s[1, 1], s[2, 2] = scale
    transform = translation_matrix(pos) @ s
    if rot is not None:
        angle, axis = rot
        transform = transform @ rotation_matrix(angle, axis)
    scene.add_geometry(mesh, node_name=name, geom_name=name, transform=transform)


def sphere(radius, color, subdivisions=2):
    return colored(trimesh.creation.icosphere(subdivisions=subdivisions, radius=radius), color)


def box(extents, color):
    return colored(trimesh.creation.box(extents=extents), color)


def cylinder(radius, height, color, sections=12):
    return colored(trimesh.creation.cylinder(radius=radius, height=height, sections=sections), color)


def cone(radius, height, color, sections=12):
    return colored(trimesh.creation.cone(radius=radius, height=height, sections=sections), color)


def pikachu():
    scene = trimesh.Scene()
    yellow = (246, 202, 35, 255); black = (35, 31, 32, 255); red = (224, 55, 50, 255); brown = (120, 74, 32, 255)
    add(scene, sphere(.58, yellow), 'body', (0, .75, 0), (.72, 1, .62))
    add(scene, sphere(.50, yellow), 'head', (0, 1.65, 0), (.92, .85, .82))
    add(scene, cone(.16, .95, yellow), 'earL', (-.30, 2.38, 0), rot=(math.radians(-8), (0, 0, 1)))
    add(scene, cone(.16, .95, yellow), 'earR', (.30, 2.38, 0), rot=(math.radians(8), (0, 0, 1)))
    add(scene, cone(.105, .34, black), 'earTipL', (-.36, 2.78, 0), rot=(math.radians(-8), (0, 0, 1)))
    add(scene, cone(.105, .34, black), 'earTipR', (.36, 2.78, 0), rot=(math.radians(8), (0, 0, 1)))
    for x, side in [(-.18, 'L'), (.18, 'R')]: add(scene, sphere(.07, black, 1), f'eye{side}', (x, 1.78, .42))
    for x, side in [(-.37, 'L'), (.37, 'R')]: add(scene, sphere(.105, red, 1), f'cheek{side}', (x, 1.52, .39))
    add(scene, sphere(.045, black, 1), 'nose', (0, 1.58, .47))
    add(scene, cylinder(.08, .55, yellow), 'armL', (-.48, .88, .05), rot=(math.radians(25), (0, 0, 1)))
    add(scene, cylinder(.08, .55, yellow), 'armR', (.48, .88, .05), rot=(math.radians(-25), (0, 0, 1)))
    add(scene, sphere(.18, yellow, 1), 'footL', (-.22, .14, .14), (.9, .5, 1.2))
    add(scene, sphere(.18, yellow, 1), 'footR', (.22, .14, .14), (.9, .5, 1.2))
    add(scene, box((.18, .24, .13), brown), 'tailBase', (.44, .57, -.16), rot=(math.radians(-28), (0, 0, 1)))
    add(scene, box((.16, .56, .12), yellow), 'tail1', (.60, .82, -.18), rot=(math.radians(-38), (0, 0, 1)))
    add(scene, box((.16, .62, .12), yellow), 'tail2', (.78, 1.18, -.18), rot=(math.radians(38), (0, 0, 1)))
    add(scene, box((.20, .70, .14), yellow), 'tail3', (.98, 1.55, -.18), rot=(math.radians(-30), (0, 0, 1)))
    return scene


def charizard():
    scene = trimesh.Scene()
    orange = (230, 111, 45, 255); cream = (247, 215, 154, 255); blue = (68, 150, 190, 255); white = (244, 238, 220, 255); dark = (35, 35, 35, 255); yellow = (255, 200, 40, 255); red = (235, 68, 45, 255)
    add(scene, sphere(.72, orange), 'body', (0, 1, 0), (.72, 1.25, .68))
    add(scene, sphere(.45, cream), 'belly', (0, .95, .57), (.70, 1.15, .18))
    add(scene, cylinder(.23, .72, orange), 'neck', (0, 1.85, 0))
    add(scene, sphere(.48, orange), 'head', (0, 2.35, .04), (.95, .8, .85))
    add(scene, box((.55, .22, .58), orange), 'snout', (0, 2.22, .45))
    add(scene, cone(.10, .52, white), 'hornL', (-.24, 2.82, -.03), rot=(math.radians(-8), (0, 0, 1)))
    add(scene, cone(.10, .52, white), 'hornR', (.24, 2.82, -.03), rot=(math.radians(8), (0, 0, 1)))
    for x, side in [(-.17, 'L'), (.17, 'R')]: add(scene, sphere(.06, dark, 1), f'eye{side}', (x, 2.47, .42))
    add(scene, cylinder(.11, .82, orange), 'armL', (-.72, 1.35, 0), rot=(math.radians(45), (0, 0, 1)))
    add(scene, cylinder(.11, .82, orange), 'armR', (.72, 1.35, 0), rot=(math.radians(-45), (0, 0, 1)))
    add(scene, sphere(.34, orange, 1), 'legL', (-.35, .27, .05), (1, .9, 1.2))
    add(scene, sphere(.34, orange, 1), 'legR', (.35, .27, .05), (1, .9, 1.2))
    add(scene, sphere(.30, orange, 1), 'footL', (-.35, .03, .34), (1, .55, 1.35))
    add(scene, sphere(.30, orange, 1), 'footR', (.35, .03, .34), (1, .55, 1.35))
    add(scene, cone(.70, 1.65, orange, 3), 'wingL', (-.95, 1.58, -.18), (.7, 1, .22), rot=(math.radians(63), (0, 0, 1)))
    add(scene, cone(.70, 1.65, orange, 3), 'wingR', (.95, 1.58, -.18), (.7, 1, .22), rot=(math.radians(-63), (0, 0, 1)))
    add(scene, cone(.52, 1.34, blue, 3), 'wingMemL', (-.92, 1.58, -.02), (.62, .9, .12), rot=(math.radians(63), (0, 0, 1)))
    add(scene, cone(.52, 1.34, blue, 3), 'wingMemR', (.92, 1.58, -.02), (.62, .9, .12), rot=(math.radians(-63), (0, 0, 1)))
    for index, point in enumerate([(0, 0, -.55), (.18, .34, -.92), (.35, .72, -1.20), (.48, 1.03, -1.42)]): add(scene, sphere(.20 - index * .025, orange, 1), f'tail{index}', point)
    add(scene, sphere(.30, red, 1), 'flameOuter', (.50, 1.22, -1.52), (1, 1.35, 1))
    add(scene, sphere(.18, yellow, 1), 'flameInner', (.50, 1.30, -1.48), (1, 1.45, 1))
    return scene


def gyarados():
    scene = trimesh.Scene()
    blue = (52, 133, 196, 255); dark_blue = (30, 84, 145, 255); cream = (242, 218, 166, 255); white = (244, 245, 240, 255); red = (205, 45, 55, 255); dark = (35, 35, 35, 255)
    centers = [(0, 2.35, 0), (-.25, 1.92, -.15), (-.38, 1.45, -.33), (-.20, .98, -.55), (.18, .62, -.72), (.52, .38, -.83), (.78, .22, -.92)]
    radii = [.50, .43, .39, .35, .31, .27, .22]
    for index, (point, radius) in enumerate(zip(centers, radii)):
        add(scene, sphere(radius, blue), f'seg{index}', point)
        if index < 5: add(scene, sphere(radius * .58, cream, 1), f'belly{index}', (point[0], point[1] - .05, point[2] + radius * .78), (.95, .9, .32))
    add(scene, sphere(.62, blue), 'head', (0, 2.78, .12), (1.10, .78, .95))
    add(scene, box((.72, .28, .56), white), 'upperMuzzle', (0, 2.62, .58))
    add(scene, box((.68, .20, .50), red), 'mouth', (0, 2.42, .58))
    for x, side in [(-.24, 'L'), (.24, 'R')]:
        add(scene, sphere(.075, red, 1), f'eye{side}', (x, 2.90, .56))
        add(scene, sphere(.038, dark, 1), f'pupil{side}', (x, 2.90, .625))
    add(scene, cone(.10, .72, white), 'hornL', (-.30, 3.34, .03), rot=(math.radians(-12), (0, 0, 1)))
    add(scene, cone(.10, .72, white), 'hornR', (.30, 3.34, .03), rot=(math.radians(12), (0, 0, 1)))
    add(scene, cone(.18, .54, dark_blue, 5), 'crest', (0, 3.38, -.25), (.8, 1, .35))
    for index, point in enumerate(centers[1:5], start=1):
        add(scene, cone(.26, .58, white, 3), f'finL{index}', (point[0] - .34, point[1], point[2]), (.7, 1, .2), rot=(math.radians(70), (0, 0, 1)))
        add(scene, cone(.26, .58, white, 3), f'finR{index}', (point[0] + .34, point[1], point[2]), (.7, 1, .2), rot=(math.radians(-70), (0, 0, 1)))
    add(scene, cylinder(.025, 1.25, white), 'whiskerL', (-.56, 2.55, .55), rot=(math.radians(72), (0, 0, 1)))
    add(scene, cylinder(.025, 1.25, white), 'whiskerR', (.56, 2.55, .55), rot=(math.radians(-72), (0, 0, 1)))
    add(scene, cone(.40, .90, white, 3), 'tailFin', (.98, .12, -.98), (.8, 1, .22), rot=(math.radians(-70), (0, 0, 1)))
    return scene


def chunks(data):
    magic, version, total = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67 and version == 2 and total == len(data)
    offset = 12; result = []
    while offset < len(data):
        length, kind = struct.unpack_from('<II', data, offset); offset += 8
        result.append((kind, data[offset:offset + length])); offset += length
    return result


def pack_glb(doc, binary):
    encoded = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * ((4 - len(encoded) % 4) % 4)
    binary += b'\0' * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    return struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + struct.pack('<II', len(binary), 0x004E4942) + binary


def add_animations(glb):
    parts = chunks(glb)
    document = json.loads(next(data for kind, data in parts if kind == 0x4E4F534A).decode('utf-8').rstrip(' \t\r\n\0'))
    binary = bytearray(next((data for kind, data in parts if kind == 0x004E4942), b''))
    scene_index = document.get('scene', 0)
    old_nodes = list(document['scenes'][scene_index].get('nodes', []))
    root = len(document.setdefault('nodes', []))
    document['nodes'].append({'name': 'BattleRoot', 'children': old_nodes})
    document['scenes'][scene_index]['nodes'] = [root]
    document.setdefault('buffers', [{'byteLength': len(binary)}]); document.setdefault('bufferViews', []); document.setdefault('accessors', []); document['animations'] = []

    def align():
        while len(binary) % 4: binary.append(0)

    def accessor(values, value_type, count, minimum=None, maximum=None):
        align(); offset = len(binary); raw = np.array(values, dtype=np.float32).tobytes(); binary.extend(raw)
        view = len(document['bufferViews']); document['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(raw)})
        item = {'bufferView': view, 'componentType': 5126, 'count': count, 'type': value_type}
        if minimum is not None: item['min'] = minimum
        if maximum is not None: item['max'] = maximum
        index = len(document['accessors']); document['accessors'].append(item); return index

    time_accessor = accessor([0, .35, .7], 'SCALAR', 3, [0], [.7])
    clips = {
        'Idle': [0, 0, 0, 0, .08, 0, 0, 0, 0],
        'Attack': [0, 0, 0, 0, 0, .30, 0, 0, 0],
        'Hit': [0, 0, 0, -.12, 0, 0, .12, 0, 0],
        'Faint': [0, 0, 0, 0, -.35, 0, 0, -.75, 0],
        'Victory': [0, 0, 0, 0, .16, 0, 0, .04, 0],
    }
    for name, values in clips.items():
        output = accessor(values, 'VEC3', 3)
        document['animations'].append({'name': name, 'samplers': [{'input': time_accessor, 'output': output, 'interpolation': 'LINEAR'}], 'channels': [{'sampler': 0, 'target': {'node': root, 'path': 'translation'}}]})
    document['buffers'][0]['byteLength'] = len(binary)
    return pack_glb(document, bytes(binary))


for pokemon_id, slug, builder in [(25, 'pikachu', pikachu), (6, 'charizard', charizard), (130, 'gyarados', gyarados)]:
    output = add_animations(builder().export(file_type='glb'))
    target = OUT / f'{pokemon_id}-{slug}-lab-v1.glb'
    target.write_bytes(output)
    loaded = trimesh.load(target, force='scene')
    if not loaded.geometry or target.stat().st_size > 25 * 1024 * 1024:
        raise RuntimeError(f'invalid generated GLB: {target}')
    print(f'{target}: {target.stat().st_size} bytes, {len(loaded.geometry)} meshes')
