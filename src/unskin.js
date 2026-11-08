import * as THREE from 'three';

// Turns a skinned mesh into ordinary meshes attached to the bones that drive them.
// Each triangle goes to the bone with the largest weight at its first vertex. The pieces keep their rest pose,
// and animation clips still move the bones by name, so the parts move with them.
// Used for rigs whose skin does not match their bone hierarchy (they draw as broken or invisible geometry).
export function unskinMeshes(root) {
  const skinned = [];
  root.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
  root.updateWorldMatrix(true, true);   // bones at their rest pose

  for (const sm of skinned) {
    const bones = sm.skeleton.bones;
    const geo = sm.geometry;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const sw = geo.attributes.skinWeight;
    const si = geo.attributes.skinIndex;
    const dom = new Uint16Array(pos.count);
    for (let v = 0; v < pos.count; v++) {
      let best = 0, bestW = -1;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(v, k);
        if (w > bestW) { bestW = w; best = si.getComponent(v, k); }
      }
      dom[v] = best;
    }
    const index = geo.index ? Array.from(geo.index.array) : Array.from({ length: pos.count }, (_, i) => i);
    const byBone = new Map();
    for (let t = 0; t < index.length; t += 3) {
      const j = dom[index[t]];
      if (!byBone.has(j)) byBone.set(j, []);
      byBone.get(j).push(index[t], index[t + 1], index[t + 2]);
    }

    sm.updateWorldMatrix(true, false);
    for (const [j, tris] of byBone) {
      const bone = bones[j];
      const remap = new Map();
      const verts = [];
      const idx = [];
      for (const vi of tris) {
        if (!remap.has(vi)) { remap.set(vi, verts.length); verts.push(vi); }
        idx.push(remap.get(vi));
      }
      const g = new THREE.BufferGeometry();
      const P = new Float32Array(verts.length * 3);
      const N = nrm ? new Float32Array(verts.length * 3) : null;
      const U = uv ? new Float32Array(verts.length * 2) : null;
      verts.forEach((vi, i) => {
        P[3 * i] = pos.getX(vi); P[3 * i + 1] = pos.getY(vi); P[3 * i + 2] = pos.getZ(vi);
        if (N) { N[3 * i] = nrm.getX(vi); N[3 * i + 1] = nrm.getY(vi); N[3 * i + 2] = nrm.getZ(vi); }
        if (U) { U[2 * i] = uv.getX(vi); U[2 * i + 1] = uv.getY(vi); }
      });
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      if (N) g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      if (U) g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      g.setIndex(idx);
      // Into the bone's space: rest position = bone * (inverse bone * mesh rest), so the part sits right at rest
      const toBone = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(sm.matrixWorld);
      g.applyMatrix4(toBone);
      const part = new THREE.Mesh(g, sm.material);
      part.name = `${sm.name || 'part'}_${bone.name}`;
      part.castShadow = sm.castShadow;
      part.receiveShadow = sm.receiveShadow;
      bone.add(part);
    }
    sm.parent.remove(sm);
  }
  return root;
}
