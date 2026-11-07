// Optimized VHS & Night Vision Post-Processing Shader Overlay
export class VhsShaderEffect {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'vhs-overlay-canvas';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '10';
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.trackingBarY = 0;
    this.trackingSpeed = 60;
    this.nightVision = false;

    // Pre-rendered offscreen scanline pattern for 60fps zero-overhead rendering
    this.scanlinePattern = null;
    this.createScanlinePattern();

    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
      this.createScanlinePattern();
    });
  }

  createScanlinePattern() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 4;
    pCanvas.height = 4;
    const pCtx = pCanvas.getContext('2d');
    pCtx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    pCtx.fillRect(0, 2, 4, 2);
    this.scanlinePattern = this.ctx.createPattern(pCanvas, 'repeat');
  }

  resize() {
    this.canvas.width = Math.floor(window.innerWidth * 0.75); // Render overlay at 0.75x resolution for huge perf boost
    this.canvas.height = Math.floor(window.innerHeight * 0.75);
  }

  setNightVision(enabled) {
    this.nightVision = enabled;
  }

  render(time, dangerLevel = 0, isPlayingTape = false) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    this.ctx.clearRect(0, 0, w, h);

    // 1. Night Vision Color Grade & Phosphor Green Wash
    if (this.nightVision) {
      this.ctx.fillStyle = 'rgba(10, 60, 25, 0.45)';
      this.ctx.fillRect(0, 0, w, h);

      // Night vision grain
      for (let i = 0; i < 20; i++) {
        const gx = Math.random() * w;
        const gy = Math.random() * h;
        this.ctx.fillStyle = 'rgba(80, 255, 120, 0.25)';
        this.ctx.fillRect(gx, gy, 2 + Math.random() * 4, 2);
      }
    }

    // 2. High-speed cached Scanlines
    if (this.scanlinePattern) {
      this.ctx.fillStyle = this.scanlinePattern;
      this.ctx.fillRect(0, 0, w, h);
    }

    // 3. VHS Tracking Glitch Bar
    this.trackingBarY += this.trackingSpeed * 0.016;
    if (this.trackingBarY > h + 40) this.trackingBarY = -40;

    if (Math.random() < 0.6 || dangerLevel > 0.15 || isPlayingTape) {
      const barH = 15 + dangerLevel * 45;
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.07 + dangerLevel * 0.22})`;
      this.ctx.fillRect(0, this.trackingBarY, w, barH);

      // Horizontal tracking glitch lines
      for (let i = 0; i < 4; i++) {
        const segW = Math.random() * (w * 0.35);
        const segX = Math.random() * w;
        this.ctx.fillStyle = `rgba(180, 220, 255, ${0.18 + dangerLevel * 0.3})`;
        this.ctx.fillRect(segX, this.trackingBarY + Math.random() * barH, segW, 2);
      }
    }

    // 4. Heavy Static Noise Sparks during High Proximity or Jumpscares
    if (dangerLevel > 0.35 || isPlayingTape) {
      const sparks = Math.floor(dangerLevel * 25);
      for (let i = 0; i < sparks; i++) {
        const sx = Math.random() * w;
        const sy = Math.random() * h;
        const sw = 10 + Math.random() * 60;
        this.ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(10, 10, 10, 0.4)';
        this.ctx.fillRect(sx, sy, sw, 2);
      }
    }

    // 5. Vignette Edge Shading
    // Gradient is rebuilt only when the overlay size changes, not every frame
    if (!this._vignette || this._vigW !== w || this._vigH !== h) {
      const grad = this.ctx.createRadialGradient(w / 2, h / 2, h * 0.38, w / 2, h / 2, h * 0.85);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.25)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
      this._vignette = grad;
      this._vigW = w;
      this._vigH = h;
    }
    this.ctx.fillStyle = this._vignette;
    this.ctx.fillRect(0, 0, w, h);
  }
}
