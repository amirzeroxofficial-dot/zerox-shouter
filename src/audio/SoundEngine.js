export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.dryBus = null;
    this.wetBus = null;
    this.convolver = null;
    this.suppressionFilter = null;
    this.noiseBuffer = null;
    this.volume = 0.85;
    this.initialized = false;
    this.ambientStarted = false;
    this.tinnitusGain = null;
    this.lastHeartbeat = 0;
  }

  init() {
    if (this.initialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;

    // Master compressor keeps loud overlapping gunshots punchy without clipping
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 12;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.16;

    // Suppression lowpass filter (muffles audio momentarily on damage/concussion)
    this.suppressionFilter = this.ctx.createBiquadFilter();
    this.suppressionFilter.type = 'lowpass';
    this.suppressionFilter.frequency.value = 22000;
    this.suppressionFilter.Q.value = 0.7;

    this.dryBus = this.ctx.createGain();
    this.dryBus.gain.value = 0.92;

    this.wetBus = this.ctx.createGain();
    this.wetBus.gain.value = 0.44;

    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this._createWarehouseImpulse(1.55);

    this.dryBus.connect(this.suppressionFilter);
    this.wetBus.connect(this.convolver);
    this.convolver.connect(this.suppressionFilter);

    this.suppressionFilter.connect(compressor);
    compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.noiseBuffer = this._createNoiseBuffer(2.0);
    this._setupTinnitus();
    this.initialized = true;
    this.startAmbient();
  }

  setVolume(norm) {
    this.volume = Math.max(0, Math.min(1, norm));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }
  }

  _createNoiseBuffer(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  _createWarehouseImpulse(duration) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const ir = this.ctx.createBuffer(2, length, rate);
    const left = ir.getChannelData(0);
    const right = ir.getChannelData(1);

    // Synthetic concrete early reflections + diffuse decay
    const taps = [0.011, 0.019, 0.027, 0.038, 0.052, 0.071];
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      // Exponential room decay with high-frequency concrete roll-off
      const env = Math.pow(1 - t / duration, 2.8) * Math.exp(-t * 3.1);
      const damp = Math.exp(-t * 1.4);
      left[i] = (Math.random() * 2 - 1) * env * 0.42 * damp;
      right[i] = (Math.random() * 2 - 1) * env * 0.42 * damp;
    }

    taps.forEach((tapTime, idx) => {
      const sample = Math.floor(tapTime * rate);
      if (sample < length) {
        const amp = 0.35 / (1 + idx * 0.45);
        left[sample] += (idx % 2 === 0 ? 1 : -0.7) * amp;
        right[sample] += (idx % 2 === 1 ? 1 : -0.7) * amp;
      }
    });

    return ir;
  }

  _setupTinnitus() {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 4150;
    this.tinnitusGain = this.ctx.createGain();
    this.tinnitusGain.gain.value = 0.0;
    osc.connect(this.tinnitusGain);
    this.tinnitusGain.connect(this.masterGain);
    osc.start();
  }

  updateListener(pos, forward, up) {
    if (!this.initialized || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (
      !Number.isFinite(t) ||
      !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z) ||
      !Number.isFinite(forward.x) || !Number.isFinite(forward.y) || !Number.isFinite(forward.z) ||
      !Number.isFinite(up.x) || !Number.isFinite(up.y) || !Number.isFinite(up.z)
    ) {
      if (!this._loggedNaN) {
        this._loggedNaN = true;
        console.error('Non-finite listener audio param:', { t, pos: pos.toArray(), forward: forward.toArray(), up: up.toArray() });
      }
      return;
    }
    const listener = this.ctx.listener;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(pos.x, t);
      listener.positionY.setValueAtTime(pos.y, t);
      listener.positionZ.setValueAtTime(pos.z, t);
      listener.forwardX.setValueAtTime(forward.x, t);
      listener.forwardY.setValueAtTime(forward.y, t);
      listener.forwardZ.setValueAtTime(forward.z, t);
      listener.upX.setValueAtTime(up.x, t);
      listener.upY.setValueAtTime(up.y, t);
      listener.upZ.setValueAtTime(up.z, t);
    } else if (listener.setPosition) {
      listener.setPosition(pos.x, pos.y, pos.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  _createPanner(pos, refDistance = 3.5, maxDistance = 65) {
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = 1.25;
    panner.positionX.value = pos.x;
    panner.positionY.value = pos.y;
    panner.positionZ.value = pos.z;
    return panner;
  }

  startAmbient() {
    if (this.ambientStarted || !this.ctx) return;
    this.ambientStarted = true;

    // Subtle industrial warehouse HVAC / draft rumble
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 145;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.08;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.dryBus);
    noise.start();
  }

  playGunshot(weaponType = 'rifle', isPlayer = true, pos = null) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const isRifle = weaponType === 'rifle' || weaponType === 'enemy';
    const pitchVar = 0.94 + Math.random() * 0.12;

    const outDry = this.ctx.createGain();
    const outWet = this.ctx.createGain();
    outDry.gain.value = isPlayer ? 0.95 : 0.72;
    outWet.gain.value = isPlayer ? 0.62 : 0.85;

    if (!isPlayer && pos) {
      const panner = this._createPanner(pos, 4.0, 75);
      outDry.connect(panner);
      outWet.connect(panner);
      panner.connect(this.dryBus);
      // Separate spatial wet feed
      const pannerWet = this.ctx.createGain();
      pannerWet.gain.value = 0.65;
      panner.connect(pannerWet);
      pannerWet.connect(this.wetBus);
    } else {
      outDry.connect(this.dryBus);
      outWet.connect(this.wetBus);
    }

    // 1. Sub-bass chest punch
    const thumpOsc = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thumpOsc.type = 'triangle';
    thumpOsc.frequency.setValueAtTime((isRifle ? 165 : 210) * pitchVar, t);
    thumpOsc.frequency.exponentialRampToValueAtTime(34, t + (isRifle ? 0.095 : 0.065));
    thumpGain.gain.setValueAtTime(isPlayer ? 0.95 : 0.6, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    thumpOsc.connect(thumpGain);
    thumpGain.connect(outDry);
    thumpOsc.start(t);
    thumpOsc.stop(t + 0.13);

    // 2. Supersonic crack transient
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.noiseBuffer;
    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime((isRifle ? 3200 : 2600) * pitchVar, t);
    crackFilter.Q.value = 0.9;
    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(isPlayer ? 1.1 : 0.75, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.042);
    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(outDry);
    crackGain.connect(outWet);
    crack.start(t, Math.random() * 0.4, 0.05);

    // 3. Muzzle blast body (broadband punch + warehouse boom)
    const blast = this.ctx.createBufferSource();
    blast.buffer = this.noiseBuffer;
    const blastFilter = this.ctx.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.setValueAtTime((isRifle ? 4800 : 3800) * pitchVar, t);
    blastFilter.frequency.exponentialRampToValueAtTime(280, t + (isRifle ? 0.19 : 0.12));
    const blastGain = this.ctx.createGain();
    blastGain.gain.setValueAtTime(isPlayer ? 0.85 : 0.65, t);
    blastGain.gain.exponentialRampToValueAtTime(0.001, t + (isRifle ? 0.21 : 0.14));
    blast.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(outDry);
    blastGain.connect(outWet);
    blast.start(t, Math.random() * 0.6, 0.24);

    // 4. Mechanical Bolt Carrier / Slide cycle (only audible on player weapon)
    if (isPlayer) {
      const boltTime = t + 0.022;
      const boltNoise = this.ctx.createBufferSource();
      boltNoise.buffer = this.noiseBuffer;
      const boltBP = this.ctx.createBiquadFilter();
      boltBP.type = 'bandpass';
      boltBP.frequency.value = isRifle ? 4600 : 5400;
      boltBP.Q.value = 3.2;
      const boltGain = this.ctx.createGain();
      boltGain.gain.setValueAtTime(0.24, boltTime);
      boltGain.gain.exponentialRampToValueAtTime(0.001, boltTime + 0.032);
      boltNoise.connect(boltBP);
      boltBP.connect(boltGain);
      boltGain.connect(this.dryBus);
      boltNoise.start(boltTime, Math.random() * 0.2, 0.04);

      // Buffer spring subtle metallic ping
      if (isRifle) {
        const spring = this.ctx.createOscillator();
        spring.type = 'sine';
        spring.frequency.setValueAtTime(1480 * pitchVar, boltTime);
        spring.frequency.exponentialRampToValueAtTime(920, boltTime + 0.07);
        const sGain = this.ctx.createGain();
        sGain.gain.setValueAtTime(0.045, boltTime);
        sGain.gain.exponentialRampToValueAtTime(0.0005, boltTime + 0.075);
        spring.connect(sGain);
        sGain.connect(this.dryBus);
        spring.start(boltTime);
        spring.stop(boltTime + 0.08);
      }
    }
  }

  playDryFire() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1900, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.018);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
    osc.connect(g);
    g.connect(this.dryBus);
    osc.start(t);
    osc.stop(t + 0.025);
  }

  playShellClink(pos) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const panner = this._createPanner(pos, 1.5, 16);
    panner.connect(this.dryBus);
    panner.connect(this.wetBus);

    const f1 = 3850 + Math.random() * 650;
    const f2 = 6200 + Math.random() * 900;

    [f1, f2].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(i === 0 ? 0.055 : 0.032, t);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 0.065);
      osc.connect(g);
      g.connect(panner);
      osc.start(t);
      osc.stop(t + 0.07);
    });
  }

  playBulletWhiz(pos) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const panner = this._createPanner(pos, 1.2, 22);
    panner.connect(this.dryBus);

    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(4200, t);
    bp.frequency.exponentialRampToValueAtTime(1100, t + 0.085);
    bp.Q.value = 3.5;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.01, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.095);

    n.connect(bp);
    bp.connect(g);
    g.connect(panner);
    n.start(t, Math.random() * 0.5, 0.1);
  }

  playReloadStage(stage, weaponType = 'rifle') {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;

    const noiseBurst = (freq, q, dur, amp, offset = 0, type = 'bandpass') => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filt = this.ctx.createBiquadFilter();
      filt.type = type;
      filt.frequency.value = freq;
      filt.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(amp, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(this.dryBus);
      g.connect(this.wetBus);
      src.start(t + offset, Math.random() * 0.4, dur + 0.01);
    };

    const metalClack = (fStart, fEnd, dur, amp, offset = 0) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(fStart, t + offset);
      osc.frequency.exponentialRampToValueAtTime(fEnd, t + offset + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(amp, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + dur);
      osc.connect(g);
      g.connect(this.dryBus);
      osc.start(t + offset);
      osc.stop(t + offset + dur + 0.01);
    };

    switch (stage) {
      case 'mag_release':
        metalClack(1800, 740, 0.025, 0.25);
        noiseBurst(3200, 2.5, 0.03, 0.16);
        break;
      case 'mag_out':
        noiseBurst(1100, 1.4, 0.14, 0.22);
        noiseBurst(480, 0.8, 0.12, 0.14, 0.05, 'lowpass');
        break;
      case 'mag_drop':
        // Clattering polymer mag hitting concrete floor
        noiseBurst(1600, 2.2, 0.045, 0.24, 0.0);
        metalClack(420, 190, 0.04, 0.18, 0.0);
        noiseBurst(1400, 2.4, 0.03, 0.12, 0.11);
        metalClack(380, 210, 0.025, 0.09, 0.11);
        break;
      case 'mag_in':
        noiseBurst(900, 1.8, 0.11, 0.22, 0.0);
        metalClack(640, 220, 0.045, 0.34, 0.07);
        metalClack(2100, 1100, 0.028, 0.28, 0.085);
        break;
      case 'mag_slap':
        metalClack(190, 65, 0.055, 0.42);
        noiseBurst(650, 0.9, 0.05, 0.28, 0, 'lowpass');
        break;
      case 'bolt_release':
        // Crisp metallic bolt carrier slamming shut!
        metalClack(2800, 820, 0.038, 0.36, 0);
        noiseBurst(3600, 2.8, 0.045, 0.32, 0);
        metalClack(weaponType === 'rifle' ? 1150 : 1450, 320, 0.05, 0.3, 0.014);
        break;
      case 'rack_back':
        noiseBurst(2500, 2.0, 0.09, 0.22, 0);
        metalClack(1450, 900, 0.03, 0.22, 0.06);
        break;
      case 'rack_release':
        noiseBurst(3200, 2.2, 0.05, 0.28, 0);
        metalClack(2400, 680, 0.045, 0.34, 0.01);
        break;
      default:
        break;
    }
  }

  playFootstep(isSprint = false, isWet = false, isPlayer = true, pos = null) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;

    const target = this.ctx.createGain();
    target.gain.value = isPlayer ? (isSprint ? 0.32 : 0.2) : 0.28;

    if (!isPlayer && pos) {
      const p = this._createPanner(pos, 2.5, 32);
      target.connect(p);
      p.connect(this.dryBus);
      p.connect(this.wetBus);
    } else {
      target.connect(this.dryBus);
      target.connect(this.wetBus);
    }

    // Boot thud
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isSprint ? 125 : 95, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.075);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.65, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
    osc.connect(og);
    og.connect(target);
    osc.start(t);
    osc.stop(t + 0.09);

    // Grit / wet puddle splash
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = isWet ? 'bandpass' : 'highpass';
    f.frequency.value = isWet ? 2400 : 1250;
    f.Q.value = isWet ? 1.4 : 0.7;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(isWet ? 0.38 : 0.2, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + (isWet ? 0.12 : 0.055));
    n.connect(f);
    f.connect(ng);
    ng.connect(target);
    n.start(t, Math.random() * 0.5, 0.14);
  }

  playImpact(surfaceType, pos) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const panner = this._createPanner(pos, 2.5, 45);
    panner.connect(this.dryBus);
    panner.connect(this.wetBus);

    if (surfaceType === 'headshot') {
      // Unmistakable helmet/skull crack crunch
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1600, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.045);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      osc.connect(g);
      g.connect(this.dryBus); // Direct confirm punch
      osc.start(t);
      osc.stop(t + 0.06);
      return;
    }

    if (surfaceType === 'body') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(185, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.05);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(g);
      g.connect(panner);
      osc.start(t);
      osc.stop(t + 0.065);
      return;
    }

    if (surfaceType === 'metal') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      const f = 2200 + Math.random() * 1400;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.65, t + 0.14);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g);
      g.connect(panner);
      osc.start(t);
      osc.stop(t + 0.16);
      return;
    }

    // Concrete / wood chip
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = surfaceType === 'wood' ? 1150 : 2100;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.26, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
    n.connect(f);
    f.connect(g);
    g.connect(panner);
    n.start(t, Math.random() * 0.4, 0.07);
  }

  playToggleClick(high = true) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(high ? 2400 : 1700, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.015);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
    osc.connect(g);
    g.connect(this.dryBus);
    osc.start(t);
    osc.stop(t + 0.02);
  }

  playBodycamChirp(kind = 'start') {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const freqs = kind === 'start' ? [1850, 2320] : kind === 'comms' ? [1320, 1760] : [920, 640];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      const start = t + idx * 0.065;
      g.gain.setValueAtTime(0.11, start);
      g.gain.exponentialRampToValueAtTime(0.0005, start + 0.055);
      osc.connect(g);
      g.connect(this.dryBus);
      osc.start(start);
      osc.stop(start + 0.06);
    });

    if (kind === 'comms') {
      // Subtle radio squelch hiss
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 1.6;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      n.connect(bp);
      bp.connect(g);
      g.connect(this.dryBus);
      n.start(t, Math.random() * 0.4, 0.17);
    }
  }

  playBreachCue(pos) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const panner = this._createPanner(pos, 5.0, 80);
    panner.connect(this.dryBus);
    panner.connect(this.wetBus);

    // Heavy metallic shutter bang / door breach thud in the distance
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.24);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.75, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g);
    g.connect(panner);
    osc.start(t);
    osc.stop(t + 0.3);

    const clang = this.ctx.createOscillator();
    clang.type = 'sawtooth';
    clang.frequency.setValueAtTime(340, t);
    clang.frequency.exponentialRampToValueAtTime(140, t + 0.18);
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.22, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    clang.connect(cg);
    cg.connect(panner);
    clang.start(t);
    clang.stop(t + 0.22);
  }

  triggerSuppression(severity = 0.7) {
    if (!this.initialized || !this.suppressionFilter) return;
    const t = this.ctx.currentTime;
    const cutoff = Math.max(480, 3200 - severity * 2400);
    this.suppressionFilter.frequency.cancelScheduledValues(t);
    this.suppressionFilter.frequency.setValueAtTime(cutoff, t);
    this.suppressionFilter.frequency.exponentialRampToValueAtTime(22000, t + 1.45 * severity);

    if (this.tinnitusGain && severity > 0.55) {
      this.tinnitusGain.gain.cancelScheduledValues(t);
      this.tinnitusGain.gain.setValueAtTime(0.032 * severity, t);
      this.tinnitusGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    }
  }

  updateHeartbeat(hpNorm, timeSec) {
    if (!this.initialized || hpNorm > 0.45) return;
    const interval = 0.5 + hpNorm * 0.7;
    if (timeSec - this.lastHeartbeat >= interval) {
      this.lastHeartbeat = timeSec;
      const t = this.ctx.currentTime;
      [0, 0.14].forEach((off, i) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(i === 0 ? 64 : 52, t + off);
        osc.frequency.exponentialRampToValueAtTime(28, t + off + 0.11);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime((1 - hpNorm) * (i === 0 ? 0.35 : 0.22), t + off);
        g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.12);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(t + off);
        osc.stop(t + off + 0.13);
      });
    }
  }
}
