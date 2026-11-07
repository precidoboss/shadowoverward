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

  // 2. Rich, Atmospheric Creepy Sanatorium Drone (audible on laptop speakers)
  startAmbience() {
    if (!this.ctx || this.ambienceStarted) return;
    this.ambienceStarted = true;

    // Atmospheric Drone: Eerie minor chord (A2 110Hz, C3 130.8Hz, E3 164.8Hz)
    const freqs = [110, 130.8, 164.8, 220];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f + (Math.random() - 0.5) * 1.5, this.ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320 + idx * 80, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);

      // Subtle slow volume swell
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.15 + idx * 0.05, this.ctx.currentTime);
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
    });

    // Cold wind howling through windows (audible bandpass at 400-800Hz)
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(520, this.ctx.currentTime);
    windFilter.Q.setValueAtTime(2.8, this.ctx.currentTime);

    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0.24, this.ctx.currentTime);

    const windLfo = this.ctx.createOscillator();
    windLfo.frequency.setValueAtTime(0.18, this.ctx.currentTime);
    const windLfoGain = this.ctx.createGain();
    windLfoGain.gain.setValueAtTime(260, this.ctx.currentTime);
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windFilter.frequency);
    windLfo.start();

    whiteNoise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.masterGain);
    whiteNoise.start();

    // Occasional creepy environmental metal clanks & pipe groans
    this.scheduleEerieEvents();
  }

  scheduleEerieEvents() {
    const trigger = () => {
      if (this.ctx && !this.isMuted) {
        const rand = Math.random();
        if (rand < 0.4) {
          this.playPipeGroan();
        } else if (rand < 0.7) {
          this.playDistantThud();
        } else {
          this.playWhisperVoice();
        }
      }
      const nextTime = 5000 + Math.random() * 8000;
      setTimeout(trigger, nextTime);
    };
    setTimeout(trigger, 4000);
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
}

export const soundEngine = new SoundEngine();
