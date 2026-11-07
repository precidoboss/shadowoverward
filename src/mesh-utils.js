import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Merges the direct mesh children of a group into one mesh per material and shadow setting.
// Only use this on groups whose children are never animated or looked up on their own;
// the group itself can still be animated as a whole.
export function mergeChildMeshes(group) {
  const buckets = new Map();
  for (const child of group.children) {
    if (!child.isMesh) continue;
    const key = child.material.uuid + (child.castShadow ? ':c' : ':n');
    if (!buckets.has(key)) buckets.set(key, { material: child.material, cast: child.castShadow, meshes: [] });
    buckets.get(key).meshes.push(child);
  }

  buckets.forEach(bucket => {
    const geos = bucket.meshes.map(m => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) return; // incompatible attributes: keep the original meshes

    bucket.meshes.forEach(m => { group.remove(m); m.geometry.dispose(); });
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
}
