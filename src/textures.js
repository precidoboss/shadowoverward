import * as THREE from 'three';

// Procedural texture generator using HTML5 Canvas
export class TextureGenerator {
  constructor() {
    this.cache = new Map();
  }

  // Helper to create and memoize a canvas texture
  createCanvasTexture(name, width, height, drawFn) {
    if (this.cache.has(name)) {
      return this.cache.get(name);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, width, height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.cache.set(name, texture);
    return texture;
  }

  // Grungy abandoned wallpaper with peeling edges, mold and water stains
  getWallpaper() {
    return this.createCanvasTexture('wallpaper', 512, 512, (ctx, w, h) => {
      // Base sickly vintage greenish-beige
      ctx.fillStyle = '#2a3328';
      ctx.fillRect(0, 0, w, h);

      // Peeling pattern stripes
      for (let x = 0; x < w; x += 32) {
        ctx.fillStyle = (x / 32) % 2 === 0 ? '#232b22' : '#2d382b';
        ctx.fillRect(x, 0, 32, h);
        
        // Vintage damask-like diamond accent
        ctx.fillStyle = '#1c221b';
        for (let y = 16; y < h; y += 48) {
          ctx.beginPath();
          ctx.moveTo(x + 16, y - 8);
          ctx.lineTo(x + 24, y);
          ctx.lineTo(x + 16, y + 8);
          ctx.lineTo(x + 8, y);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Mold and water damage patches
      for (let i = 0; i < 24; i++) {
        const cx = Math.random() * w;
        const cy = Math.random() * h;
        const radius = 20 + Math.random() * 80;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, 'rgba(15, 20, 14, 0.85)');
        grad.addColorStop(0.5, 'rgba(35, 45, 25, 0.5)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Grime drip trails
      ctx.fillStyle = 'rgba(10, 15, 10, 0.4)';
      for (let i = 0; i < 30; i++) {
        const dx = Math.random() * w;
        const dy = Math.random() * (h * 0.7);
        const len = 30 + Math.random() * 120;
        ctx.fillRect(dx, dy, 2 + Math.random() * 4, len);
      }

      // Noise speckles
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 35;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);
    });
  }

  // Weathered wooden floorboards
  getWoodFloor() {
    return this.createCanvasTexture('woodFloor', 512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#241a12';
      ctx.fillRect(0, 0, w, h);

      const plankHeight = 64;
      for (let y = 0; y < h; y += plankHeight) {
        // Plank base variation
        const plankTone = 20 + Math.floor(Math.random() * 18);
        ctx.fillStyle = `rgb(${plankTone + 15}, ${plankTone + 8}, ${plankTone})`;
        ctx.fillRect(0, y, w, plankHeight - 2);

        // Wood grain lines
        ctx.strokeStyle = `rgba(15, 10, 6, 0.4)`;
        ctx.lineWidth = 1;
        for (let j = 0; j < 12; j++) {
          ctx.beginPath();
          const ly = y + Math.random() * (plankHeight - 4);
          ctx.moveTo(0, ly);
          ctx.bezierCurveTo(w * 0.3, ly + Math.random() * 6 - 3, w * 0.7, ly + Math.random() * 6 - 3, w, ly);
          ctx.stroke();
        }

        // Dark seam between planks
        ctx.fillStyle = '#0a0704';
        ctx.fillRect(0, y + plankHeight - 2, w, 2);

        // Nails
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(20, y + plankHeight / 2, 2.5, 0, Math.PI * 2);
        ctx.arc(w - 20, y + plankHeight / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Add stains and dust
      for (let i = 0; i < 15; i++) {
        const sx = Math.random() * w;
        const sy = Math.random() * h;
        const sr = 15 + Math.random() * 50;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        grad.addColorStop(0, 'rgba(8, 5, 3, 0.7)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // Cracked hospital ceramic tiles
  getTiles() {
    return this.createCanvasTexture('tiles', 512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#3a3e3c';
      ctx.fillRect(0, 0, w, h);

      const tileSize = 64;
      for (let y = 0; y < h; y += tileSize) {
        for (let x = 0; x < w; x += tileSize) {
          // Subtle grime and tile shade differences
          const shade = 75 + Math.floor(Math.random() * 25);
          ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 2})`;
          ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

          // Tile grout
          ctx.strokeStyle = '#222524';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, tileSize, tileSize);

          // Cracks on some tiles
          if (Math.random() < 0.25) {
            ctx.strokeStyle = '#181b19';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + Math.random() * tileSize, y + Math.random() * tileSize);
            ctx.lineTo(x + Math.random() * tileSize, y + Math.random() * tileSize);
            ctx.stroke();
          }
        }
      }

      // Grime patches
      for (let i = 0; i < 18; i++) {
        const cx = Math.random() * w;
        const cy = Math.random() * h;
        const r = 25 + Math.random() * 60;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, 'rgba(25, 20, 18, 0.6)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // Rusted corrugated metal and iron
  getMetal() {
    return this.createCanvasTexture('metal', 512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#404344';
      ctx.fillRect(0, 0, w, h);

      // Noise and scratches
      for (let i = 0; i < 80; i++) {
        ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(30, 30, 30, 0.5)' : 'rgba(90, 95, 95, 0.3)';
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        const y = Math.random() * h;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + Math.random() * 10 - 5);
        ctx.stroke();
      }

      // Heavy rust patches
      for (let i = 0; i < 20; i++) {
        const rx = Math.random() * w;
        const ry = Math.random() * h;
        const rr = 15 + Math.random() * 50;
        const grad = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr);
        grad.addColorStop(0, '#5a2d12');
        grad.addColorStop(0.5, '#7a3e1b');
        grad.addColorStop(0.8, '#3d1d0c');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(rx, ry, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // Stained concrete / plaster for ceilings and basement
  getConcrete() {
    return this.createCanvasTexture('concrete', 512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#323432';
      ctx.fillRect(0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 45;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);

      // Water leak spots
      for (let i = 0; i < 15; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = 20 + Math.random() * 60;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(15, 18, 16, 0.7)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // VHS cassette face texture
  getVhsLabel(tapeId, title, date) {
    const key = `vhs_${tapeId}`;
    return this.createCanvasTexture(key, 512, 256, (ctx, w, h) => {
      // Black plastic cassette base
      ctx.fillStyle = '#181818';
      ctx.fillRect(0, 0, w, h);

      // Side grip grooves
      ctx.fillStyle = '#101010';
      for (let y = 10; y < h - 10; y += 8) {
        ctx.fillRect(10, y, 30, 4);
        ctx.fillRect(w - 40, y, 30, 4);
      }

      // Middle paper label
      ctx.fillStyle = '#e5decf';
      ctx.fillRect(60, 20, w - 120, h - 40);

      // Retro label border and color band (classic red & blue stripes)
      ctx.fillStyle = '#a62424';
      ctx.fillRect(60, 20, w - 120, 10);
      ctx.fillStyle = '#224488';
      ctx.fillRect(60, 30, w - 120, 6);

      // Handwritten marker text on label
      ctx.fillStyle = '#1a1816';
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.fillText(title.toUpperCase(), 80, 80);

      ctx.font = '16px "Courier New", monospace';
      ctx.fillStyle = '#444';
      ctx.fillText(`REC DATE: ${date}`, 80, 115);
      ctx.fillText(`INDEX: ARCHIVE-ST.JUDE #00${tapeId}`, 80, 140);
      ctx.fillText(`MODE: SP [STANDARD PLAY] - 120 MIN`, 80, 165);

      // Warning stamp in red
      ctx.strokeStyle = '#c42020';
      ctx.lineWidth = 2;
      ctx.strokeRect(w - 220, 95, 140, 40);
      ctx.fillStyle = '#c42020';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('RESTRICTED', w - 210, 120);

      // Grime / finger smudges
      ctx.fillStyle = 'rgba(50, 40, 30, 0.25)';
      ctx.beginPath();
      ctx.arc(120, 100, 40, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Blood decal texture
  getBloodDecal() {
    return this.createCanvasTexture('bloodDecal', 256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#540808';

      // Splatter core
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 35, 0, Math.PI * 2);
      ctx.fill();

      // Drips and droplets
      for (let i = 0; i < 28; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 80;
        const rad = 2 + Math.random() * 9;
        ctx.beginPath();
        ctx.arc(w / 2 + Math.cos(ang) * dist, h / 2 + Math.sin(ang) * dist, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Streak
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#480606';
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      ctx.lineTo(w / 2 + 15, h / 2 + 70);
      ctx.stroke();
    });
  }

  // Hospital door sign texture
  getDoorSign(title, subtitle) {
    return this.createCanvasTexture(`sign_${title}`, 256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#dcd8cb';
      ctx.fillRect(8, 8, w - 16, h - 16);

      // Header stripe
      ctx.fillStyle = '#9e1b1b';
      ctx.fillRect(8, 8, w - 16, 26);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ST. JUDE PSYCHIATRIC FACILITY', w / 2, 26);

      ctx.fillStyle = '#111';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(title, w / 2, 68);

      ctx.fillStyle = '#666';
      ctx.font = '12px monospace';
      ctx.fillText(subtitle, w / 2, 92);
    });
  }

  // Soft radial falloff used for additive glow sprites (replaces per-prop PointLights)
  getGlowTexture() {
    return this.createCanvasTexture('glow', 64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  // Blurred dot used for dust motes and entity mist
  getSoftParticle() {
    return this.createCanvasTexture('softParticle', 64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  // Vertical blood drips and streaks for corridor walls
  getBloodStreak() {
    return this.createCanvasTexture('bloodStreak', 256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      let seed = 7;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = 0; i < 9; i++) {
        const x = 20 + rnd() * (w - 40);
        const top = rnd() * h * 0.35;
        const len = h * (0.25 + rnd() * 0.5);
        const grd = ctx.createLinearGradient(0, top, 0, top + len);
        grd.addColorStop(0, 'rgba(84,8,8,0.9)');
        grd.addColorStop(1, 'rgba(60,4,4,0.0)');
        ctx.fillStyle = grd;
        ctx.fillRect(x, top, 3 + rnd() * 5, len);
        ctx.beginPath();
        ctx.fillStyle = 'rgba(84,8,8,0.95)';
        ctx.arc(x + 2, top + len, 4 + rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // Press credential shown on the investigator's lanyard
  getPressBadge() {
    return this.createCanvasTexture('pressBadge', 128, 96, (ctx, w, h) => {
      ctx.fillStyle = '#e9e4d4';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1d3b5e';
      ctx.fillRect(0, 0, w, 22);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PRESS', w / 2, 16);
      ctx.fillStyle = '#222';
      ctx.fillRect(14, 32, 30, 36);
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('M. CALLOWAY', 52, 44);
      ctx.fillText('Tri-County Ledger', 52, 58);
      ctx.fillText('ID 0417', 52, 72);
    });
  }
}

export const textureGen = new TextureGenerator();
