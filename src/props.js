import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { modelFactory } from './models.js';

// Each GLB is fetched and parsed once. Every use clones the scene, so restarting a run never downloads again.
const loader = new GLTFLoader();
const cache = {};

export function loadGLB(url) {
  if (!cache[url]) {
    cache[url] = new Promise((resolve, reject) => {
      loader.load(url, gltf => resolve(gltf), undefined, reject);
    });
  }
  return cache[url];
}

// Makes a loaded model safe to show: opaque where it is opaque (the models mark everything as blended,
// which hides walls behind each other), and optionally two-sided for thin panels such as paintings.
export function tidy(root, { doubleSide = false } = {}) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.opacity >= 0.99) m.transparent = false;
      m.alphaTest = 0;
      m.depthWrite = true;
      if (doubleSide) m.side = THREE.DoubleSide;
      m.needsUpdate = true;
    }
  });
  return root;
}

// Scales an object uniformly so that its height (world Y extent) is `height` metres.
// Call it before the object is placed in the scene, so its own transform is the only one applied.
export function sizeHeight(obj, height) {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(obj);
  const h = box.getSize(new THREE.Vector3()).y;
  if (h > 0) obj.scale.multiplyScalar(height / h);
  obj.updateWorldMatrix(true, true);
}

// Moves `holder` so the bottom of `measure` sits at y and its horizontal centre is at (x, z).
export function standOn(holder, x, y, z, measure = holder) {
  holder.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(measure);
  const c = box.getCenter(new THREE.Vector3());
  holder.position.x += x - c.x;
  holder.position.z += z - c.z;
  holder.position.y += y - box.min.y;
  holder.updateWorldMatrix(true, true);
}

// Moves `holder` so the centre of `measure` sits exactly at (x, y, z). Used for wall-hung panels.
export function centreAt(holder, x, y, z, measure = holder) {
  holder.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(measure);
  const c = box.getCenter(new THREE.Vector3());
  holder.position.x += x - c.x;
  holder.position.y += y - c.y;
  holder.position.z += z - c.z;
  holder.updateWorldMatrix(true, true);
}

export function makeHolder() {
  return new THREE.Group();
}

// A high-voltage cartridge fuse: ceramic body, brass end caps, red rating band and a faint blue glow.
// It lies along the local X axis.
export function buildHighVoltageFuse() {
  const g = new THREE.Group();
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.9 });
  const band = new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.11, 16), ceramic);
  body.rotation.z = Math.PI / 2;
  g.add(body);

  for (const sx of [-0.06, 0.06]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.018, 16), brass);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = sx;
    g.add(cap);
  }

  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0205, 0.0205, 0.02, 16), band);
  ring.rotation.z = Math.PI / 2;
  g.add(ring);

  const glow = modelFactory.makeGlow(0x55ddff, 0.25);
  g.add(glow);
  return g;
}
