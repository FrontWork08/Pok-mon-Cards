import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROLES = ['Idle', 'Attack', 'Hit', 'Faint', 'Victory'];
const FIXTURES = [
  { id: 25, name: 'PikachuLab', size: [0.7, 0.9, 0.6], shape: 'small' },
  { id: 6, name: 'CharizardLab', size: [1.3, 2.2, 1.2], shape: 'tall' },
  { id: 130, name: 'GyaradosLab', size: [3.2, 0.7, 0.8], shape: 'long' },
];

function align4(value) {
  return (value + 3) & ~3;
}

function padBuffer(buffer, fill = 0) {
  const padded = Buffer.alloc(align4(buffer.length), fill);
  buffer.copy(padded);
  return padded;
}

function cubePositions(width, height, depth) {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  return new Float32Array([
    -x,-y,-z, x,-y,-z, x,y,-z, -x,y,-z,
    -x,-y, z, x,-y, z, x,y, z, -x,y, z,
  ]);
}

const CUBE_INDICES = new Uint16Array([
  0,1,2, 0,2,3,
  4,6,5, 4,7,6,
  0,4,5, 0,5,1,
  3,2,6, 3,6,7,
  1,5,6, 1,6,2,
  0,3,7, 0,7,4,
]);

function typedBuffer(view) {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

function buildFixtureGlb({ name, size }) {
  const [width, height, depth] = size;
  const positions = cubePositions(width, height, depth);
  const times = new Float32Array([0, 0.5, 1]);
  const translations = new Float32Array([0,0,0, 0,0.08,0, 0,0,0]);

  const chunks = [typedBuffer(positions), typedBuffer(CUBE_INDICES), typedBuffer(times), typedBuffer(translations)];
  const offsets = [];
  let cursor = 0;
  for (const chunk of chunks) {
    cursor = align4(cursor);
    offsets.push(cursor);
    cursor += chunk.length;
  }
  const bin = Buffer.alloc(align4(cursor));
  chunks.forEach((chunk, index) => chunk.copy(bin, offsets[index]));

  const min = [-width / 2, -height / 2, -depth / 2];
  const max = [width / 2, height / 2, depth / 2];
  const animations = ROLES.map((role) => ({
    name: role,
    samplers: [{ input: 2, output: 3, interpolation: 'LINEAR' }],
    channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
  }));

  const gltf = {
    asset: { version: '2.0', generator: 'TrainerCollection3DLab' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name: `${name}Mesh`, primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: chunks[0].length, target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: chunks[1].length, target: 34963 },
      { buffer: 0, byteOffset: offsets[2], byteLength: chunks[2].length },
      { buffer: 0, byteOffset: offsets[3], byteLength: chunks[3].length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5123, count: CUBE_INDICES.length, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: times.length, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: 3, componentType: 5126, count: 3, type: 'VEC3' },
    ],
    animations,
  };

  const json = padBuffer(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
  const totalLength = 12 + 8 + json.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHeader, json, binHeader, bin]);
}

function parseGlb(buffer) {
  const loader = new GLTFLoader();
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((resolve, reject) => loader.parse(arrayBuffer, '', resolve, reject));
}

function disposeScene(scene) {
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyShape(fixture, size) {
  const [x, y] = [size.x, size.y];
  if (fixture.shape === 'small') assert(y > x && y < 1.1, 'small fixture proportions changed');
  if (fixture.shape === 'tall') assert(y > x * 1.4, 'tall fixture proportions changed');
  if (fixture.shape === 'long') assert(x > y * 3.5, 'long fixture proportions changed');
}

const buffers = new Map(FIXTURES.map((fixture) => [fixture.id, buildFixtureGlb(fixture)]));
let parsed = 0;
let disposed = 0;
let failures = 0;

for (let cycle = 0; cycle < 100; cycle += 1) {
  const fixture = FIXTURES[cycle % FIXTURES.length];
  try {
    const gltf = await parseGlb(buffers.get(fixture.id));
    parsed += 1;
    assert(gltf.scene, `cycle ${cycle}: scene missing`);
    assert(gltf.animations.length === ROLES.length, `cycle ${cycle}: expected ${ROLES.length} animation clips`);
    for (const role of ROLES) assert(gltf.animations.some((clip) => clip.name === role), `cycle ${cycle}: ${role} clip missing`);

    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    assert(size.x > 0 && size.y > 0 && size.z > 0, `cycle ${cycle}: invalid geometry bounds`);
    verifyShape(fixture, size);

    const mixer = new THREE.AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) {
      const action = mixer.clipAction(clip);
      action.reset().play();
      mixer.update(0.016);
      action.stop();
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(gltf.scene);
    disposeScene(gltf.scene);
    disposed += 1;
  } catch (error) {
    failures += 1;
    console.error(`[3d-fixture-audit] cycle ${cycle + 1} failed for #${fixture.id} ${fixture.name}`, error);
    break;
  }
}

assert(parsed === 100, `only ${parsed}/100 fixtures parsed`);
assert(disposed === 100, `only ${disposed}/100 scenes disposed`);
assert(failures === 0, `${failures} failure(s) detected`);
console.log(`[3d-fixture-audit] PASS: ${parsed} GLB parses, 3 body proportions, ${ROLES.length} animation roles, ${disposed} scene disposals.`);
