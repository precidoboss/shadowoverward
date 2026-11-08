import * as THREE from 'three';

const BLOOD = new THREE.Color(0xff3322);

// Generates the mood of the building at run time: the level slowly breathes in brightness,
// lights stutter, dip out and swell at random, and the lamps warm toward red as danger rises.
// It only changes intensities and colours, never light counts, so shaders are not recompiled.
export class SpookyLighting {
  constructor(world) {
    this.world = world;
    this.t = 0;
    this.mood = 1;
    this.nextEvent = 3 + Math.random() * 3;
    this.swell = 0;
    this.swellTimer = 0;
    this.warm = 0;
  }

  reset() {
    this.mood = 1;
    this.nextEvent = 3 + Math.random() * 3;
    this.swell = 0;
    this.swellTimer = 0;
    this.warm = 0;
    this.world.lightMood = 1;
  }

  update(delta, tension) {
    this.t += delta;
    const breathe = 0.9 + 0.1 * Math.sin(this.t * 0.7) * Math.sin(this.t * 0.23 + 1.3);
    const swell = this.swellTimer > 0 ? 1 + this.swell * (this.swellTimer / 0.6) : 1;
    if (this.swellTimer > 0) this.swellTimer -= delta;
    const target = breathe * swell * (1 - 0.25 * tension);
    this.mood += (target - this.mood) * Math.min(1, delta * 3);
    this.world.lightMood = this.mood;

    // Random events, more frequent when something is hunting nearby
    this.nextEvent -= delta;
    if (this.nextEvent <= 0) {
      this.fireEvent(tension);
      this.nextEvent = (3 + Math.random() * 6) * (1 - 0.5 * tension);
    }

    // Lamps drift toward red as tension rises (colour only)
    this.warm += (tension - this.warm) * Math.min(1, delta * 2);
    for (const light of this.world.flickerLights) {
      const d = light.userData;
      if (!d.baseColor) d.baseColor = light.color.clone();
      light.color.lerpColors(d.baseColor, BLOOD, this.warm * 0.45);
    }
  }

  fireEvent(tension) {
    const lights = this.world.flickerLights;
    if (!lights.length) return;
    const roll = Math.random();
    if (roll < 0.45) {
      // A few lights stutter out together
      for (const light of lights) {
        if (Math.random() < 0.4) light.userData.dip = 0.2 + Math.random() * 0.35;
      }
    } else if (roll < 0.7) {
      // Brief blackout across the building
      for (const light of lights) light.userData.dip = 0.3 + Math.random() * 0.2;
    } else {
      // A swell: the building brightens for a moment, then sinks back
      this.swell = 0.5 + Math.random() * 0.4 + tension * 0.3;
      this.swellTimer = 0.6;
    }
  }
}
