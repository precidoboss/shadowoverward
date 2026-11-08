// Robust, High-Fidelity Web Audio Engine for Shadow Over Ward B
// Designed for clear audibility across all Mac/PC speakers and headphones

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isMuted = false;
    this.initialized = false;
    this.heartbeatTimeout = null;
    this.heartbeatRate = 1200;
    this.isHeartbeatPlaying = false;
    this.volume = 0.85;

    // Auto-unlock on first user interaction
    this.setupAutoUnlock();
  }

  setupAutoUnlock() {
    const unlock = () => {
      this.ensureContext();
    };
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  init() {
    if (this.initialized && this.ctx) {
      this.ensureContext();
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;

      // Start the creepy Sanatorium soundscape
      this.startAmbience();

      // Play camcorder startup double-beep so player instantly hears audio is working
      this.playStartupBeep();
    } catch (e) {
      console.warn("AudioContext failed to initialize:", e);
    }
  }

  ensureContext() {
    if (this.musicWanted && this.music && this.music.paused) this.music.play().catch(() => {});
    if (!this.initialized || !this.ctx) {
      this.init();
      return;
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        // If ambience was never started, start now
        if (!this.ambienceStarted) {
          this.startAmbience();
        }
      });
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    this.applyMusicVolume();
  }

  // 1. Audible Camcorder Startup Electronic Beep
  playStartupBeep() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const beep = (freq, startTime, duration) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    };

    beep(1760, now + 0.05, 0.08); // A6
    beep(2349, now + 0.16, 0.12); // D7
  }

  // 2. No constant drone or wind bed (it read as a buzz). Spooky one-shots play roughly every 30 seconds instead.
  startAmbience() {
    if (!this.ctx || this.ambienceStarted) return;
    this.ambienceStarted = true;
    this.scheduleEerieEvents();
  }

  scheduleEerieEvents() {
    const events = ['pipe', 'thud', 'whisper', 'musicbox', 'wail', 'scratch', 'doorslam', 'knock', 'breath'];
    let last = '';
    const trigger = () => {
      // Only while a run is in progress (music is on), never in menus or on the pause screen
      if (this.ctx && !this.isMuted && this.musicWanted) {
        let pick;
        do { pick = events[(Math.random() * events.length) | 0]; } while (pick === last);
        last = pick;
        this.playSpooky(pick);
      }
      setTimeout(trigger, 25000 + Math.random() * 10000);   // about every 30 s
    };
    setTimeout(trigger, 14000 + Math.random() * 6000);
  }

  playSpooky(kind) {
    switch (kind) {
      case 'pipe': return this.playPipeGroan();
      case 'thud': return this.playDistantThud();
      case 'whisper': return this.playWhisperVoice();
      case 'musicbox': return this.playMusicBox();
      case 'wail': return this.playDistantWail();
      case 'scratch': return this.playScratching();
      case 'doorslam': return this.playDistantDoorSlam();
      case 'knock': return this.playKnocking();
      case 'breath': return this.playBreath();
      default: return undefined;
    }
  }

  // A slow, slightly out-of-tune music box phrase from somewhere far away
  playMusicBox() {
    if (!this.ctx) return;
    this.ensureContext();
    const t0 = this.ctx.currentTime;
    const notes = [659, 587, 523, 587, 659, 659, 622, 0, 587, 587, 554];
    notes.forEach((f, i) => {
      if (!f) return;
      const t = t0 + i * 0.42;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * (1 + (Math.random() - 0.5) * 0.02), t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(t); osc.stop(t + 1.2);
    });
  }

  // A thin, distant wail that rises and falls
  playDistantWail() {
    if (!this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const vib = this.ctx.createOscillator();
    const vg = this.ctx.createGain();
    const bp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.linearRampToValueAtTime(520, t + 1.6);
    osc.frequency.linearRampToValueAtTime(260, t + 3.4);
    vib.frequency.value = 5.5;
    vg.gain.value = 14;
    vib.connect(vg); vg.connect(osc.frequency);
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    osc.connect(bp); bp.connect(g); g.connect(this.masterGain);
    osc.start(t); vib.start(t); osc.stop(t + 3.7); vib.stop(t + 3.7);
  }

  // Something scratching at the other side of a wall
  playScratching() {
    if (!this.ctx) return;
    this.ensureContext();
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const t = t0 + i * 0.13 + Math.random() * 0.05;
      const n = this._noise(0.1);
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2500;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      n.connect(hp); hp.connect(g); g.connect(this.masterGain);
      n.start(t);
    }
  }

  // A heavy door slamming a few rooms away
  playDistantDoorSlam() {
    if (!this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.3);
    og.gain.setValueAtTime(0.7, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(og); og.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.55);
    const n = this._noise(0.4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    n.connect(lp); lp.connect(ng); ng.connect(this.masterGain);
    n.start(t);
  }

  // Three slow knocks
  playKnocking() {
    if (!this.ctx) return;
    this.ensureContext();
    const t0 = this.ctx.currentTime;
    [0, 0.7, 1.4].forEach(dt => {
      const t = t0 + dt;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.12);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(t); osc.stop(t + 0.2);
    });
  }

  // A slow breath close behind you
  playBreath() {
    if (!this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const n = this._noise(2.2);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    n.connect(bp); bp.connect(g); g.connect(this.masterGain);
    n.start(t);
  }

  // 3. Crisp, Punchy Footsteps
  playFootstep(surface = 'concrete', sprint = false) {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    // Scuff noise
    const noise = this.ctx.createBufferSource();
    const noiseBuf = this.ctx.createBuffer(1, 1024, this.ctx.sampleRate);
    const nData = noiseBuf.getChannelData(0);
    for (let i = 0; i < 1024; i++) nData[i] = Math.random() * 2 - 1;
    noise.buffer = noiseBuf;

    const nFilter = this.ctx.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.setValueAtTime(surface === 'wood' ? 650 : 1200, now);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(sprint ? 0.45 : 0.28, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now);

    // Tonal thud (heel impact)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    const startFreq = surface === 'wood' ? 140 : 190;
    osc.frequency.setValueAtTime(startFreq + (Math.random() - 0.5) * 30, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

    oscGain.gain.setValueAtTime(sprint ? 0.5 : 0.32, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // 4. Punchy Flashlight Click
  playFlashlightClick(turnOn = true) {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    // Transient click
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(turnOn ? 2400 : 1600, now);
    osc.frequency.exponentialRampToValueAtTime(turnOn ? 3800 : 800, now + 0.035);

    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);

    // Capacitor charge sound
    if (turnOn) {
      const hum = this.ctx.createOscillator();
      const humGain = this.ctx.createGain();
      hum.type = 'sine';
      hum.frequency.setValueAtTime(420, now + 0.02);
      hum.frequency.exponentialRampToValueAtTime(1400, now + 0.14);
      humGain.gain.setValueAtTime(0.18, now + 0.02);
      humGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      hum.connect(humGain);
      humGain.connect(this.masterGain);
      hum.start(now + 0.02);
      hum.stop(now + 0.17);
    }
  }

  // 5. Night Vision Toggle Sound
  playNightVisionToggle(enabled = true) {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(enabled ? 1400 : 900, now);
    osc.frequency.linearRampToValueAtTime(enabled ? 2800 : 500, now + 0.14);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  // 6. Camcorder Zoom Motor
  playZoomSound() {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.linearRampToValueAtTime(980, now + 0.22);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  // 7. Spooky Whispers
  playWhisperVoice() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    const baseFreq = 95 + Math.random() * 40;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.85, now + 1.2);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800 + Math.random() * 300, now);
    filter.Q.setValueAtTime(6.0, now);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 1.35);
  }

  // 8. Distant Pipe Groans & Clangs
  playPipeGroan() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const startFreq = 120 + Math.random() * 60;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 1.6, now + 1.0);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.7, now + 2.2);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.3);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 2.4);
  }

  playDistantThud() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.4);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  // 9. Audible Double-Thump Heartbeat
  startHeartbeat() {
    if (this.isHeartbeatPlaying) return;
    this.isHeartbeatPlaying = true;

    const beat = () => {
      if (!this.isHeartbeatPlaying || !this.ctx) return;
      const now = this.ctx.currentTime;

      // 1st thump
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(110, now);
      osc1.frequency.exponentialRampToValueAtTime(45, now + 0.12);
      gain1.gain.setValueAtTime(0.55, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(this.masterGain);
      osc1.start(now);
      osc1.stop(now + 0.16);

      // 2nd thump
      const t2 = now + 0.18;
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(95, t2);
      osc2.frequency.exponentialRampToValueAtTime(40, t2 + 0.14);
      gain2.gain.setValueAtTime(0.42, t2);
      gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.16);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(t2);
      osc2.stop(t2 + 0.17);

      this.heartbeatTimeout = setTimeout(beat, this.heartbeatRate);
    };
    beat();
  }

  updateHeartbeatRate(dangerLevel) {
    if (dangerLevel > 0.08) {
      if (!this.isHeartbeatPlaying) this.startHeartbeat();
      this.heartbeatRate = 1200 - dangerLevel * 820;
    } else {
      this.stopHeartbeat();
    }
  }

  stopHeartbeat() {
    this.isHeartbeatPlaying = false;
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  // 10. Horror Stinger
  playJumpStinger() {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const freqs = [220, 277, 330, 440, 880];
    freqs.forEach((f) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.linearRampToValueAtTime(f * 1.4, now + 0.45);

      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.95);
    });

    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(180, now);
    sub.frequency.exponentialRampToValueAtTime(40, now + 0.7);

    subGain.gain.setValueAtTime(0.7, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.85);
  }

  // 11. Item & Keypad Sounds
  playItemPickup() {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, now); // C5
    osc.frequency.exponentialRampToValueAtTime(1046, now + 0.1); // C6

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playDoorCreak(open = true) {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(6, now);

    if (open) {
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.linearRampToValueAtTime(320, now + 0.45);
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.linearRampToValueAtTime(900, now + 0.45);
    } else {
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.38);
      filter.frequency.setValueAtTime(750, now);
      filter.frequency.linearRampToValueAtTime(300, now + 0.38);
    }

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  playLockedDoor() {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, t);
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.09);
    }
  }

  playVcrInsert() {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.25);
    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);

    const spool = this.ctx.createOscillator();
    const spoolGain = this.ctx.createGain();
    spool.type = 'triangle';
    spool.frequency.setValueAtTime(220, now + 0.2);
    spool.frequency.linearRampToValueAtTime(540, now + 0.7);
    spoolGain.gain.setValueAtTime(0.01, now);
    spoolGain.gain.linearRampToValueAtTime(0.3, now + 0.35);
    spoolGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    spool.connect(spoolGain);
    spoolGain.connect(this.masterGain);
    spool.start(now + 0.2);
    spool.stop(now + 0.82);
  }

  playStaticBurst(duration = 0.5) {
    if (!this.ctx) return;
    this.ensureContext();
    const bufferSize = this.ctx.sampleRate * duration;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.6;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  playKeypadBeep(success = false, error = false) {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (success) {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (error) {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.setValueAtTime(140, now + 0.12);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.38);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(750 + Math.random() * 100, now);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.09);
    }
  }

  // 12. Procedural Tape Audio Logs
  playTapeDialogue(speechSequence) {
    if (!this.ctx) return;
    this.ensureContext();

    speechSequence.forEach((item) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const dur = item.duration || 1.8;

        const osc = this.ctx.createOscillator();
        osc.type = item.voiceType || 'sawtooth';
        osc.frequency.setValueAtTime(item.pitch || 130, now);
        osc.frequency.linearRampToValueAtTime((item.pitch || 130) * (item.pitchSlide || 0.95), now + dur);

        const formant = this.ctx.createBiquadFilter();
        formant.type = 'bandpass';
        formant.frequency.setValueAtTime(item.formant || 750, now);
        formant.Q.setValueAtTime(4.0, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.42, now + 0.1);
        gain.gain.setValueAtTime(0.42, now + dur - 0.2);
        gain.gain.linearRampToValueAtTime(0.001, now + dur);

        osc.connect(formant);
        formant.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + dur + 0.05);

        this.playStaticBurst(dur * 0.35);
      }, item.delay);
    });
  }

  // ---------- Music ----------
  // "Behind The Closed Door" loops under the whole run. It plays through an <audio> element so the 4 MB
  // file streams instead of being decoded up front. Relative URL, so it also works from an itch.io iframe.
  startMusic() {
    if (!this.music) {
      this.music = new Audio('audio/behind-the-closed-door.mp3');
      this.music.loop = true;
      this.music.preload = 'auto';
    }
    this.musicWanted = true;
    this.applyMusicVolume();
    const p = this.music.play();
    if (p && p.catch) p.catch(() => { /* blocked until the next click; ensureContext retries */ });
  }

  pauseMusic() {
    this.musicWanted = false;
    if (this.music) this.music.pause();
  }

  stopMusic() {
    this.musicWanted = false;
    if (this.music) {
      this.music.pause();
      this.music.currentTime = 0;
    }
  }

  // Music sits under the effects so gunshots and footsteps stay clear
  applyMusicVolume() {
    if (this.music) this.music.volume = this.isMuted ? 0 : Math.min(1, this.volume * 0.5);
  }

  // ---------- Combat sounds ----------
  _noise(dur) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  // Rifle shot in four layers: sharp crack, noise body, low thump, and a short echo tail
  playGunshot() {
    if (!this.ctx || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.value = 1.0;
    out.connect(this.masterGain);

    // Echo tail
    const delay = this.ctx.createDelay(0.5);
    delay.delayTime.value = 0.13;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.32;
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1400;
    out.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(this.masterGain);

    // 1. Crack: short, bright noise
    const crack = this._noise(0.08);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2200;
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(1.0, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    crack.connect(hp); hp.connect(cg); cg.connect(out);
    crack.start(t);

    // 2. Body: noise through a falling low-pass
    const body = this._noise(0.35);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.3);
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.9, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    body.connect(lp); lp.connect(bg); bg.connect(out);
    body.start(t);

    // 3. Thump: a sine that drops fast
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    og.gain.setValueAtTime(1.1, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(og); og.connect(out);
    osc.start(t); osc.stop(t + 0.25);
  }

  // Empty chamber: a dry metal click
  playGunDry() {
    if (!this.ctx || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1900, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.04);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.08);
  }

  // Fist through the air
  playPunchSwing() {
    if (!this.ctx || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const n = this._noise(0.25);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.16);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    n.connect(bp); bp.connect(g); g.connect(this.masterGain);
    n.start(t);
  }

  // Fist on flesh: low thud plus a wet slap
  playPunchImpact() {
    if (!this.ctx || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    og.gain.setValueAtTime(1.0, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(og); og.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.2);
    this.playBloodSplat(0.5);
  }

  // Wet, short burst used for every hit that draws blood
  playBloodSplat(level = 1) {
    if (!this.ctx || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const n = this._noise(0.18);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5 * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    n.connect(bp); bp.connect(g); g.connect(this.masterGain);
    n.start(t);
  }

  // Small tick that confirms a hit landed
  playHitConfirm(kill = false) {
    if (!this.ctx || this.isMuted) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(kill ? 520 : 880, t);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (kill ? 0.22 : 0.07));
    osc.connect(g); g.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.25);
  }
}

export const soundEngine = new SoundEngine();
