import * as THREE from 'three';

function hash2D(x, y, seed = 1337) {
  let n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const x0 = ((xi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period;
  const y1 = (y0 + 1) % period;

  const aa = hash2D(x0, y0, seed);
  const ba = hash2D(x1, y0, seed);
  const ab = hash2D(x0, y1, seed);
  const bb = hash2D(x1, y1, seed);

  const nx0 = aa + u * (ba - aa);
  const nx1 = ab + u * (bb - ab);
  return nx0 + v * (nx1 - nx0);
}

function fbmTileable(u, v, baseFreq, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = baseFreq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(u * freq, v * freq, freq, seed + i * 31);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function heightToNormalCanvas(heightData, size, strength = 2.4) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const tl = heightData[ym * size + xm];
      const tc = heightData[ym * size + x];
      const tr = heightData[ym * size + xp];
      const ml = heightData[y * size + xm];
      const mr = heightData[y * size + xp];
      const bl = heightData[yp * size + xm];
      const bc = heightData[yp * size + x];
      const br = heightData[yp * size + xp];

      const dx = (tr + 2 * mr + br - (tl + 2 * ml + bl)) * strength;
      const dy = (bl + 2 * bc + br - (tl + 2 * tc + tr)) * strength;
      const dz = 1.0;
      const invLen = 1.0 / Math.hypot(dx, dy, dz);

      const idx = (y * size + x) * 4;
      d[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function configureTexture(tex, repeatX = 1, repeatY = 1, isColor = true) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

export class ProceduralTextures {
  constructor() {
    this.cache = new Map();
    this.particles = null;
  }

  getWetConcreteFloor(repeatX = 10, repeatY = 10) {
    const key = `wet_floor_${repeatX}_${repeatY}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const size = 512;
    const albedo = document.createElement('canvas');
    albedo.width = size;
    albedo.height = size;
    const aCtx = albedo.getContext('2d');
    const aImg = aCtx.createImageData(size, size);

    const rough = document.createElement('canvas');
    rough.width = size;
    rough.height = size;
    const rCtx = rough.getContext('2d');
    const rImg = rCtx.createImageData(size, size);

    const height = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const grit = fbmTileable(u, v, 8, 5, 11);
        const stain = fbmTileable(u, v, 4, 3, 97);
        const puddleNoise = fbmTileable(u, v, 3, 4, 213);

        // Expansion slab seams
        const seamX = Math.abs(((u * 2) % 1) - 0.5) > 0.492;
        const seamY = Math.abs(((v * 2) % 1) - 0.5) > 0.492;
        const isSeam = seamX || seamY;

        // Puddles create dramatic wet reflections in bodycam lighting
        const puddleMask = Math.max(0, Math.min(1, (puddleNoise - 0.56) * 8.5));

        let base = 54 + grit * 34 - stain * 16;
        if (isSeam) base *= 0.52;

        // Wet darkens porous concrete slightly
        const wetDarken = 1.0 - puddleMask * 0.44;
        const r = Math.min(255, Math.max(10, base * wetDarken));
        const g = Math.min(255, Math.max(10, (base + 1) * wetDarken));
        const b = Math.min(255, Math.max(12, (base + 3) * wetDarken));

        const idx = (y * size + x) * 4;
        aImg.data[idx] = r;
        aImg.data[idx + 1] = g;
        aImg.data[idx + 2] = b;
        aImg.data[idx + 3] = 255;

        // Dry concrete ~225 roughness, wet puddles ~16 mirror-gloss
        const rVal = Math.round((1 - puddleMask) * (195 + grit * 45) + puddleMask * 18);
        rImg.data[idx] = rVal;
        rImg.data[idx + 1] = rVal;
        rImg.data[idx + 2] = rVal;
        rImg.data[idx + 3] = 255;

        // Puddle surface is flat, dry concrete has micro relief
        height[y * size + x] = (isSeam ? -0.35 : grit * 0.65) * (1 - puddleMask * 0.9);
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    const normalCanvas = heightToNormalCanvas(height, size, 2.2);

    const mat = new THREE.MeshStandardMaterial({
      map: configureTexture(new THREE.CanvasTexture(albedo), repeatX, repeatY, true),
      roughnessMap: configureTexture(new THREE.CanvasTexture(rough), repeatX, repeatY, false),
      normalMap: configureTexture(new THREE.CanvasTexture(normalCanvas), repeatX, repeatY, false),
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.95,
      metalness: 0.08
    });

    this.cache.set(key, mat);
    return mat;
  }

  getConcreteWall(repeatX = 3, repeatY = 2, hazardStripe = false) {
    const key = `wall_${repeatX}_${repeatY}_${hazardStripe}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const size = 512;
    const albedo = document.createElement('canvas');
    albedo.width = size;
    albedo.height = size;
    const aCtx = albedo.getContext('2d');
    const aImg = aCtx.createImageData(size, size);

    const rough = document.createElement('canvas');
    rough.width = size;
    rough.height = size;
    const rCtx = rough.getContext('2d');
    const rImg = rCtx.createImageData(size, size);

    const height = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const grit = fbmTileable(u, v, 8, 5, 45);
        const streak = fbmTileable(u * 2.5, v * 0.35, 6, 3, 188);
        const panelY = Math.abs(((v * 3) % 1) - 0.5) > 0.488;
        const panelX = Math.abs(((u * 2) % 1) - 0.5) > 0.49;

        // Damp bottom water seepage
        const damp = Math.max(0, 1 - (1 - v) * 4.5);
        let val = 86 + grit * 38 - streak * 24 - damp * 26;
        if (panelY || panelX) val *= 0.65;

        let rr = val;
        let gg = val + 1;
        let bb = val + 3;

        if (hazardStripe && v > 0.78 && v < 0.92) {
          const stripe = Math.floor((u * 10 + v * 6) * 2) % 2 === 0;
          const grime = 0.72 + grit * 0.25;
          if (stripe) {
            rr = 205 * grime;
            gg = 150 * grime;
            bb = 22 * grime;
          } else {
            rr = 26 * grime;
            gg = 26 * grime;
            bb = 28 * grime;
          }
        }

        const idx = (y * size + x) * 4;
        aImg.data[idx] = Math.max(12, Math.min(255, rr));
        aImg.data[idx + 1] = Math.max(12, Math.min(255, gg));
        aImg.data[idx + 2] = Math.max(12, Math.min(255, bb));
        aImg.data[idx + 3] = 255;

        const rVal = Math.round(Math.max(95, 225 - damp * 75 + grit * 25));
        rImg.data[idx] = rVal;
        rImg.data[idx + 1] = rVal;
        rImg.data[idx + 2] = rVal;
        rImg.data[idx + 3] = 255;

        height[y * size + x] = (panelY || panelX ? -0.25 : grit * 0.8);
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);

    // Subtle form-tie bolt dots
    aCtx.fillStyle = 'rgba(20, 22, 24, 0.55)';
    for (let py = 0; py < 3; py++) {
      for (let px = 0; px < 2; px++) {
        const cx = (px + 0.15) * (size / 2);
        const cx2 = (px + 0.85) * (size / 2);
        const cy = (py + 0.5) * (size / 3);
        aCtx.beginPath();
        aCtx.arc(cx, cy, 4, 0, Math.PI * 2);
        aCtx.arc(cx2, cy, 4, 0, Math.PI * 2);
        aCtx.fill();
      }
    }

    const normalCanvas = heightToNormalCanvas(height, size, 2.5);
    const mat = new THREE.MeshStandardMaterial({
      map: configureTexture(new THREE.CanvasTexture(albedo), repeatX, repeatY, true),
      roughnessMap: configureTexture(new THREE.CanvasTexture(rough), repeatX, repeatY, false),
      normalMap: configureTexture(new THREE.CanvasTexture(normalCanvas), repeatX, repeatY, false),
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.92,
      metalness: 0.05
    });

    this.cache.set(key, mat);
    return mat;
  }

  getCorrugatedMetal(repeatX = 2, repeatY = 2, tint = [58, 70, 82]) {
    const key = `metal_${repeatX}_${repeatY}_${tint.join('_')}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const size = 512;
    const albedo = document.createElement('canvas');
    albedo.width = size;
    albedo.height = size;
    const aCtx = albedo.getContext('2d');
    const aImg = aCtx.createImageData(size, size);

    const rough = document.createElement('canvas');
    rough.width = size;
    rough.height = size;
    const rCtx = rough.getContext('2d');
    const rImg = rCtx.createImageData(size, size);

    const height = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const rib = Math.sin(u * Math.PI * 20) * 0.5 + 0.5;
        const rustNoise = fbmTileable(u, v, 3, 3, 307);
        const rust = Math.max(0, Math.min(0.65, (rustNoise - 0.62) * 3.5));
        const dirt = fbmTileable(u, v, 6, 3, 419);

        const baseShade = 0.78 + rib * 0.24 - dirt * 0.14;
        const rr = (1 - rust) * tint[0] * baseShade + rust * 92;
        const gg = (1 - rust) * tint[1] * baseShade + rust * 54;
        const bb = (1 - rust) * tint[2] * baseShade + rust * 36;

        const idx = (y * size + x) * 4;
        aImg.data[idx] = Math.min(255, rr);
        aImg.data[idx + 1] = Math.min(255, gg);
        aImg.data[idx + 2] = Math.min(255, bb);
        aImg.data[idx + 3] = 255;

        const rVal = Math.round((1 - rust) * (120 + dirt * 45) + rust * 215);
        rImg.data[idx] = rVal;
        rImg.data[idx + 1] = rVal;
        rImg.data[idx + 2] = rVal;
        rImg.data[idx + 3] = 255;

        height[y * size + x] = rib * 0.85 + dirt * 0.12;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    const normalCanvas = heightToNormalCanvas(height, size, 2.2);

    const mat = new THREE.MeshStandardMaterial({
      map: configureTexture(new THREE.CanvasTexture(albedo), repeatX, repeatY, true),
      roughnessMap: configureTexture(new THREE.CanvasTexture(rough), repeatX, repeatY, false),
      normalMap: configureTexture(new THREE.CanvasTexture(normalCanvas), repeatX, repeatY, false),
      normalScale: new THREE.Vector2(0.85, 0.85),
      metalness: 0.55,
      roughness: 0.62
    });

    this.cache.set(key, mat);
    return mat;
  }

  getWoodCrate(repeatX = 1, repeatY = 1) {
    const key = `crate_${repeatX}_${repeatY}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const size = 256;
    const albedo = document.createElement('canvas');
    albedo.width = size;
    albedo.height = size;
    const ctx = albedo.getContext('2d');
    const img = ctx.createImageData(size, size);
    const height = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const grain = fbmTileable(u * 0.4, v * 5, 6, 4, 512);
        const border = u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92;
        const plank = Math.abs(((v * 5) % 1) - 0.5) > 0.48;
        const diag = Math.abs(u - v) < 0.055;

        let shade = 0.72 + grain * 0.36;
        if (border || diag) shade *= 1.06;
        if (plank && !border && !diag) shade *= 0.5;

        const idx = (y * size + x) * 4;
        img.data[idx] = Math.min(255, 134 * shade);
        img.data[idx + 1] = Math.min(255, 98 * shade);
        img.data[idx + 2] = Math.min(255, 60 * shade);
        img.data[idx + 3] = 255;

        height[y * size + x] = (border || diag ? 0.9 : plank ? 0.1 : 0.6) + grain * 0.25;
      }
    }

    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = 'rgba(20, 18, 16, 0.55)';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('SEC-07', 68, 118);
    ctx.font = '14px monospace';
    ctx.fillText('5.56 NATO', 78, 144);

    const normalCanvas = heightToNormalCanvas(height, size, 2.4);
    const mat = new THREE.MeshStandardMaterial({
      map: configureTexture(new THREE.CanvasTexture(albedo), repeatX, repeatY, true),
      normalMap: configureTexture(new THREE.CanvasTexture(normalCanvas), repeatX, repeatY, false),
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.86,
      metalness: 0.04
    });

    this.cache.set(key, mat);
    return mat;
  }

  getGunmetal(hex = 0x22262b, roughness = 0.36, metalness = 0.85) {
    const key = `gunmetal_${hex}_${roughness}_${metalness}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const height = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const brushed = fbmTileable(x / size, (y / size) * 4, 8, 3, 709);
        const val = Math.round(180 + brushed * 65);
        const idx = (y * size + x) * 4;
        img.data[idx] = val;
        img.data[idx + 1] = val;
        img.data[idx + 2] = val;
        img.data[idx + 3] = 255;
        height[y * size + x] = brushed;
      }
    }
    ctx.putImageData(img, 0, 0);
    const normalCanvas = heightToNormalCanvas(height, size, 0.9);

    const mat = new THREE.MeshStandardMaterial({
      color: hex,
      roughnessMap: configureTexture(new THREE.CanvasTexture(canvas), 2, 2, false),
      normalMap: configureTexture(new THREE.CanvasTexture(normalCanvas), 2, 2, false),
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness,
      metalness
    });

    this.cache.set(key, mat);
    return mat;
  }

  getHoloReticleTexture() {
    if (this.cache.has('holo_reticle')) return this.cache.get('holo_reticle');

    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = '#ff3b28';
    ctx.shadowColor = '#ff1f0a';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 6.5;

    // 68 MOA outer segmented circle (4 arcs)
    const r = 68;
    const gap = 0.24;
    for (let q = 0; q < 4; q++) {
      const base = q * (Math.PI / 2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, base + gap, base + Math.PI / 2 - gap);
      ctx.stroke();

      const ang = base;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * (r - 15), cy + Math.sin(ang) * (r - 15));
      ctx.lineTo(cx + Math.cos(ang) * (r + 12), cy + Math.sin(ang) * (r + 12));
      ctx.stroke();
    }

    // 1 MOA bright center dot
    ctx.fillStyle = '#ff6b52';
    ctx.beginPath();
    ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set('holo_reticle', tex);
    return tex;
  }

  getRedDotTexture() {
    if (this.cache.has('red_dot')) return this.cache.get('red_dot');

    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 26);
    g.addColorStop(0, 'rgba(255, 220, 210, 1)');
    g.addColorStop(0.25, 'rgba(255, 45, 30, 0.95)');
    g.addColorStop(1, 'rgba(255, 20, 10, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set('red_dot', tex);
    return tex;
  }

  getParticleTextures() {
    if (this.particles) return this.particles;

    // Soft smoke/dust puff
    const smokeC = document.createElement('canvas');
    smokeC.width = 128;
    smokeC.height = 128;
    const sCtx = smokeC.getContext('2d');
    const sg = sCtx.createRadialGradient(64, 64, 4, 64, 64, 60);
    sg.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    sg.addColorStop(0.45, 'rgba(220, 224, 230, 0.4)');
    sg.addColorStop(1, 'rgba(200, 200, 200, 0)');
    sCtx.fillStyle = sg;
    sCtx.fillRect(0, 0, 128, 128);

    // Hot spark
    const sparkC = document.createElement('canvas');
    sparkC.width = 64;
    sparkC.height = 64;
    const spCtx = sparkC.getContext('2d');
    const spg = spCtx.createRadialGradient(32, 32, 1, 32, 32, 30);
    spg.addColorStop(0, 'rgba(255, 255, 240, 1)');
    spg.addColorStop(0.3, 'rgba(255, 190, 75, 0.95)');
    spg.addColorStop(1, 'rgba(255, 90, 10, 0)');
    spCtx.fillStyle = spg;
    spCtx.fillRect(0, 0, 64, 64);

    // Bullet hole decal
    const holeC = document.createElement('canvas');
    holeC.width = 128;
    holeC.height = 128;
    const hCtx = holeC.getContext('2d');
    const hg = hCtx.createRadialGradient(64, 64, 4, 64, 64, 52);
    hg.addColorStop(0, 'rgba(8, 8, 9, 0.98)');
    hg.addColorStop(0.28, 'rgba(22, 22, 24, 0.92)');
    hg.addColorStop(0.5, 'rgba(95, 92, 88, 0.48)');
    hg.addColorStop(1, 'rgba(95, 92, 88, 0)');
    hCtx.fillStyle = hg;
    hCtx.fillRect(0, 0, 128, 128);
    // Cracks radiating from impact
    hCtx.strokeStyle = 'rgba(15, 15, 16, 0.72)';
    hCtx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + 0.3;
      hCtx.beginPath();
      hCtx.moveTo(64 + Math.cos(ang) * 10, 64 + Math.sin(ang) * 10);
      hCtx.lineTo(64 + Math.cos(ang + 0.15) * 34, 64 + Math.sin(ang + 0.15) * 34);
      hCtx.stroke();
    }

    // Muzzle flash star
    const flashC = document.createElement('canvas');
    flashC.width = 128;
    flashC.height = 128;
    const fCtx = flashC.getContext('2d');
    const fg = fCtx.createRadialGradient(64, 64, 2, 64, 64, 56);
    fg.addColorStop(0, 'rgba(255, 252, 225, 1)');
    fg.addColorStop(0.25, 'rgba(255, 200, 95, 0.95)');
    fg.addColorStop(0.6, 'rgba(255, 110, 25, 0.45)');
    fg.addColorStop(1, 'rgba(255, 60, 0, 0)');
    fCtx.fillStyle = fg;
    fCtx.fillRect(0, 0, 128, 128);
    fCtx.fillStyle = 'rgba(255, 230, 160, 0.9)';
    for (let i = 0; i < 6; i++) {
      fCtx.save();
      fCtx.translate(64, 64);
      fCtx.rotate((i / 6) * Math.PI);
      fCtx.fillRect(-52, -3, 104, 6);
      fCtx.restore();
    }

    this.particles = {
      smoke: new THREE.CanvasTexture(smokeC),
      spark: new THREE.CanvasTexture(sparkC),
      bulletHole: new THREE.CanvasTexture(holeC),
      muzzleFlash: new THREE.CanvasTexture(flashC)
    };
    Object.values(this.particles).forEach((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
    });
    return this.particles;
  }
}
