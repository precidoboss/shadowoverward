import * as THREE from 'three';

// The quick run's walkthrough: the camera flies to each place, with a caption over the picture, then hands control back.
// Space, Enter or Escape skips it.
export const QUICK_TOUR = [
  { pos: [-5.2, 1.65, -6.0], look: [-3.6, 0.95, -6.6], time: 6,
    text: 'THE ENTRANCE. The rifle lies on the autopsy table. Press E to take it, or fight with your fists.' },
  { pos: [-3.2, 1.7, -4.6], look: [-3.9, 0.95, -6.5], time: 5,
    text: 'VHS TAPE 04 is on the same table. Side quest: find both tapes.' },
  { pos: [-2.9, 1.6, -6.9], look: [-3.95, 1.05, -6.62], time: 6,
    text: 'THE SKELEVISION shows the safe code: 0 - 4 - 0 - 7. Watch it play.' },
  { pos: [-5.9, 1.6, -2.2], look: [-8.0, 1.0, -2.1], time: 6,
    text: 'THE WEST HALLS. Two infected staff. Shoot them (left-click) or punch them. Clear both to continue.' },
  { pos: [-6.1, 1.7, -2.7], look: [-7.6, 1.2, -3.3], time: 5,
    text: 'CCTV CONSOLE. Press E to switch between the two cameras. Side quest.' },
  { pos: [-7.2, 1.55, -1.5], look: [-9.0, 1.0, -1.5], time: 5,
    text: 'OLD TV. Once you have a VHS tape, press E to play Shadow 47 footage. Side quest.' },
  { pos: [-12.4, 1.5, 4.6], look: [-15.0, 1.2, 4.6], time: 6,
    text: 'THE BEDROOM SAFE. Roll the code 0 - 4 - 0 - 7 on the dial, then take the high-voltage fuse.' },
  { pos: [-4.4, 1.6, 6.3], look: [-5.85, 1.0, 7.5], time: 5,
    text: 'THE GENERATOR, south room. Put the fuse in and press E to restore power.' },
  { pos: [-4.0, 1.6, 3.0], look: [-4.0, 1.2, 0.0], time: 5,
    text: 'SHADOW 47 wakes when the power returns. Shoot it down.' },
  { pos: [-3.9, 1.6, 6.8], look: [-3.9, 1.3, 8.3], time: 6,
    text: 'When Shadow 47 is down, the airlock opens into a portal. Walk into it to escape.' }
];

function smooth(t) { return t * t * (3 - 2 * t); }

export class CameraTour {
  constructor() {
    this.active = false;
    this.stops = [];
    this.i = 0;
    this.t = 0;
    this.from = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.to = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.look = new THREE.Vector3();
    this.box = document.getElementById('tour-caption');
    this.text = document.getElementById('tour-text');
    this.bars = document.getElementById('tour-bars');
    window.addEventListener('keydown', e => {
      if (this.active && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) {
        e.preventDefault();
        this.end();
      }
    });
  }

  // Starts the walkthrough from the given eye position
  start(stops, eye) {
    this.stops = stops;
    this.i = 0;
    this.t = 0;
    this.from.pos.set(eye.x, eye.y, eye.z);
    this.from.look.set(stops[0].look[0], stops[0].look[1], stops[0].look[2]);
    this.active = true;
    this.bars.classList.remove('hidden');
    this.box.classList.remove('hidden');
    this.beginStop();
  }

  beginStop() {
    const s = this.stops[this.i];
    this.to.pos.set(s.pos[0], s.pos[1], s.pos[2]);
    this.to.look.set(s.look[0], s.look[1], s.look[2]);
    this.text.textContent = s.text;
  }

  update(delta, camera) {
    if (!this.active) return;
    const s = this.stops[this.i];
    this.t += delta;
    const k = smooth(Math.min(this.t / s.time, 1));
    camera.position.lerpVectors(this.from.pos, this.to.pos, k);
    this.look.lerpVectors(this.from.look, this.to.look, k);
    camera.lookAt(this.look);
    if (this.t >= s.time) {
      this.from.pos.copy(this.to.pos);
      this.from.look.copy(this.to.look);
      this.i++;
      this.t = 0;
      if (this.i >= this.stops.length) this.end();
      else this.beginStop();
    }
  }

  end() {
    if (!this.active) return;
    this.active = false;
    this.box.classList.add('hidden');
    this.bars.classList.add('hidden');
  }
}
