import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const loader = new FBXLoader();
// Each mesh is parsed once; every character gets its own skinned copy
const fbxCache = new Map();

// Loads a Mixamo-rigged character. The mesh is an FBX; each clip is a small in-place JSON file
// (converted once from Mixamo FBX). Throws if a clip does not drive bones that exist in the mesh,
// so callers can keep a fallback model.
// Returns speeds[name] = metres per second the clip travels, used to match foot speed to movement.
export async function loadRiggedCharacter({ mesh, clips, height, rotationY = 0, slimX = 1 }) {
  if (!fbxCache.has(mesh)) fbxCache.set(mesh, loader.loadAsync(mesh));
  const model = cloneSkeleton(await fbxCache.get(mesh));

  // Fit to the requested height, face the game's forward direction, stand on the floor
  model.scale.setScalar(1);
  model.rotation.y = rotationY;
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const s = height / (box.max.y - box.min.y);
  model.scale.set(s * slimX, s, s);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const bones = new Set();
  model.traverse(o => bones.add(o.name));

  const entries = Object.entries(clips);
  const payloads = await Promise.all(entries.map(([, url]) =>
    fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); })));

  const clipMap = {};
  const speeds = {};
  entries.forEach(([name, url], i) => {
    const { clip: json, rootSpeed } = payloads[i];
    const clip = THREE.AnimationClip.parse(json);
    const names = clip.tracks.map(t => t.name.split('.')[0]);
    const matched = names.filter(n => bones.has(n)).length;
    if (matched < names.length * 0.9) throw new Error(`Bones in ${url} do not match ${mesh}`);
    clip.name = name;
    clipMap[name] = clip;
    speeds[name] = rootSpeed * s;
  });

  return { root: model, clips: clipMap, speeds };
}

// Plays named clips on one rigged character, cross-fading between them.
export class RigPlayer {
  constructor(root, clips, speeds = {}) {
    this.root = root;
    this.speeds = speeds;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [name, clip] of Object.entries(clips)) this.actions[name] = this.mixer.clipAction(clip);
    this.current = null;
    this.next = null;
    // A one-shot clip that finishes hands over to the clip queued after it
    this.mixer.addEventListener('finished', e => {
      if (e.action !== this.actions[this.current] || !this.next) return;
      const n = this.next;
      this.next = null;
      this.play(n.name);
    });
  }

  // once: play one time, hold the last pose, then play `then`
  play(name, { fade = 0.25, timeScale = 1, once = false, then = null } = {}) {
    const action = this.actions[name];
    if (!action) return;
    if (name === this.current) {
      action.timeScale = timeScale;
      return;
    }
    const prev = this.actions[this.current];
    action.reset();
    action.timeScale = timeScale;
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.enabled = true;
    action.play();
    if (prev) action.crossFadeFrom(prev, fade, false);
    this.current = name;
    this.next = then ? { name: then } : null;
  }

  update(delta) {
    this.mixer.update(delta);
  }
}
