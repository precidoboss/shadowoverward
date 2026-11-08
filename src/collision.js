import * as THREE from 'three';

const probe = new THREE.Box3();

// True if a body (0.6m wide, 1.8m tall) at (x, z) overlaps any solid in the world
export function blockedAt(world, x, z, r = 0.3, h = 1.8) {
  if (!world) return false;
  probe.min.set(x - r, 0, z - r);
  probe.max.set(x + r, h, z + r);
  const cols = world.colliders;
  for (let i = 0; i < cols.length; i++) {
    if (probe.intersectsBox(cols[i])) return true;
  }
  return false;
}

// Moves a point one step, sliding along walls when the full step is blocked
export function moveWithWalls(world, pos, dir, step, r = 0.3) {
  const nx = pos.x + dir.x * step;
  const nz = pos.z + dir.z * step;
  if (!blockedAt(world, nx, nz, r)) { pos.x = nx; pos.z = nz; }
  else if (!blockedAt(world, nx, pos.z, r)) pos.x = nx;
  else if (!blockedAt(world, pos.x, nz, r)) pos.z = nz;
}

// Nearest open spot to (x, z), searched in rings out to 6m
export function findFreeSpot(world, x, z, r = 0.35) {
  if (!blockedAt(world, x, z, r)) return new THREE.Vector3(x, 0, z);
  for (let d = 0.5; d <= 6; d += 0.5) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const px = x + Math.cos(ang) * d;
      const pz = z + Math.sin(ang) * d;
      if (!blockedAt(world, px, pz, r)) return new THREE.Vector3(px, 0, pz);
    }
  }
  return new THREE.Vector3(x, 0, z);
}
