import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ProceduralTextures } from './engine/ProceduralTextures.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { WarehouseMap } from './world/WarehouseMap.js';
import { BodycamPostFX } from './post/BodycamPostFX.js';
import { BodycamController } from './engine/BodycamController.js';
import { WeaponSystem } from './weapons/WeaponSystem.js';
import { EnemyManager } from './entities/EnemyManager.js';

class ZeroxBodycamGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ui = this._collectUI();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0f14);
    this.scene.fog = new THREE.FogExp2(0x0d1218, 0.024);

    this.camera = new THREE.PerspectiveCamera(96, window.innerWidth / window.innerHeight, 0.05, 160);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    // Realistic PBR metallic reflections via PMREM environment map
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    pmrem.dispose();

    // Core Subsystems
    this.textures = new ProceduralTextures();
    this.sound = new SoundEngine();
    this.map = new WarehouseMap(this.scene, this.textures);
    this.postFX = new BodycamPostFX(this.renderer, this.scene, this.camera);
    this.controller = new BodycamController(this.camera, this.canvas, this.map, this.sound);
    this.weapons = new WeaponSystem(this.scene, this.camera, this.textures, this.sound, this.map, this.postFX);
    this.enemies = new EnemyManager(this.scene, this.map, this.textures, this.sound);

    // Game State
    this.state = 'MENU'; // 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'
    this.hp = 100;
    this.armor = 100;
    this.bpm = 74;
    this.damageFlash = 0;
    this.hitMarkerTimer = 0;
    this.recoilVisualPulse = 0;

    this.lastFrameMs = performance.now();
    this.startFrameMs = this.lastFrameMs;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.currentFps = 60;
    this.commsTimeout = null;

    this._bindCallbacks();
    this._bindUI();
    this._buildMagBars();
    this._startLoop();
  }

  _collectUI() {
    return {
      hud: document.getElementById('hud-osd'),
      menu: document.getElementById('menu-overlay'),
      aar: document.getElementById('aar-overlay'),
      btnDeploy: document.getElementById('btn-deploy'),
      btnRedeploy: document.getElementById('btn-redeploy'),
      optSens: document.getElementById('opt-sens'),
      valSens: document.getElementById('val-sens'),
      optVol: document.getElementById('opt-vol'),
      valVol: document.getElementById('val-vol'),
      optBodycam: document.getElementById('opt-bodycam'),
      optQuality: document.getElementById('opt-quality'),
      optReticle: document.getElementById('opt-reticle'),
      hipDot: document.getElementById('hip-dot'),
      hitMarker: document.getElementById('hit-marker'),
      damageFlash: document.getElementById('damage-flash'),
      reloadPrompt: document.getElementById('reload-prompt'),
      timestamp: document.getElementById('osd-timestamp'),
      fps: document.getElementById('osd-fps'),
      modeBadge: document.getElementById('osd-mode-badge'),
      wave: document.getElementById('hud-wave'),
      enemies: document.getElementById('hud-enemies'),
      kills: document.getElementById('hud-kills'),
      comms: document.getElementById('comms-feed'),
      bpm: document.getElementById('hud-bpm'),
      stance: document.getElementById('hud-stance'),
      hpFill: document.getElementById('hud-hp-fill'),
      armor: document.getElementById('hud-armor'),
      hp: document.getElementById('hud-hp'),
      weaponName: document.getElementById('hud-weapon-name'),
      fireMode: document.getElementById('hud-firemode'),
      ammoMag: document.getElementById('hud-ammo-mag'),
      chamberPlus: document.getElementById('hud-chamber-plus'),
      ammoReserve: document.getElementById('hud-ammo-reserve'),
      magBars: document.getElementById('hud-mag-bars'),
      lightInd: document.getElementById('hud-light-ind'),
      laserInd: document.getElementById('hud-laser-ind'),
      aarWave: document.getElementById('aar-wave'),
      aarKills: document.getElementById('aar-kills'),
      aarHeadshots: document.getElementById('aar-headshots'),
      aarAccuracy: document.getElementById('aar-accuracy')
    };
  }

  _bindCallbacks() {
    this.weapons.onHitConfirm = (killed, isHeadshot) => {
      this.ui.hitMarker.classList.add('active');
      this.ui.hitMarker.classList.toggle('kill', killed || isHeadshot);
      this.hitMarkerTimer = 0.14;
      if (killed) {
        this._pushComms(isHeadshot ? 'HEADSHOT // HOSTILE NEUTRALIZED' : 'CONTACT DOWN // THREAT ELIMINATED', false);
      }
    };

    this.enemies.onComms = (text, alert) => {
      this._pushComms(text, alert);
    };

    this.enemies.onWaveCleared = (clearedWave) => {
      // Tactical resupply ammo & slight armor patch between waves
      const rifle = this.weapons.slots.rifle;
      const pistol = this.weapons.slots.pistol;
      rifle.reserve = Math.min(rifle.reserveMax, rifle.reserve + 60);
      pistol.reserve = Math.min(pistol.reserveMax, pistol.reserve + 30);
      this.hp = Math.min(100, this.hp + 25);
      this.armor = Math.min(100, this.armor + 35);
      if (clearedWave > 0) {
        this._pushComms('RESUPPLY DROPPED // +60 5.56 NATO & +35% ARMOR PLATE', false);
      }
    };

    this.enemies.onPlayerHit = (dmg, shooterPos) => {
      if (this.state !== 'PLAYING') return;

      // Armor absorbs 55% until depleted
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, dmg * 0.58);
        this.armor = Math.max(0, this.armor - absorbed);
        this.hp -= dmg - absorbed * 0.82;
      } else {
        this.hp -= dmg;
      }

      this.damageFlash = 0.92;
      this.bpm = Math.min(168, this.bpm + 16);
      this.controller.addImpulse(0.75, 0.55);
      this.postFX.triggerShock(0.78);
      this.sound.triggerSuppression(0.72);
      this.sound.playImpact('body', this.camera.position);

      if (this.hp <= 0) {
        this.hp = 0;
        this._triggerGameOver();
      }
    };
  }

  _bindUI() {
    this.ui.btnDeploy.addEventListener('click', () => this._startOrResume());
    this.ui.btnRedeploy.addEventListener('click', () => this._resetAndDeploy());

    this.ui.optSens.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.controller.sensitivity = v;
      this.ui.valSens.textContent = `${v.toFixed(1)}x`;
    });

    this.ui.optVol.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.sound.setVolume(v / 100);
      this.ui.valVol.textContent = `${v}%`;
    });

    this.ui.optBodycam.addEventListener('change', (e) => {
      const profile = e.target.value;
      this.controller.setProfile(profile);
      this.postFX.setProfile(profile);
    });

    this.ui.optQuality.addEventListener('change', (e) => {
      const q = e.target.value;
      this.postFX.setQuality(q);
      const pr = q === 'ultra' ? Math.min(window.devicePixelRatio, 1.75) : q === 'high' ? 1.25 : 1.0;
      this.renderer.setPixelRatio(pr);
      this.renderer.shadowMap.enabled = q !== 'perf';
    });

    this.ui.optReticle.addEventListener('change', (e) => {
      this.ui.hipDot.style.display = e.target.checked ? 'block' : 'none';
    });

    // Combat Controls
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' || (e.code === 'Escape' && this.state === 'PLAYING' && !this.controller.isLocked)) {
        if (this.state === 'PLAYING') this._pauseGame();
        else if (this.state === 'PAUSED') this._startOrResume();
        return;
      }

      if (this.state !== 'PLAYING') return;

      if (e.code === 'KeyR') this.weapons.startReload();
      else if (e.code === 'KeyF') this.weapons.toggleFlashlight();
      else if (e.code === 'KeyX') {
        if (this.weapons.isAds) this.weapons.toggleCant();
        else this.weapons.toggleLaser();
      } else if (e.code === 'KeyB') this.weapons.toggleFireMode();
      else if (e.code === 'KeyG') this.weapons.startInspect();
      else if (e.code === 'Digit1') this.weapons.switchWeapon('rifle');
      else if (e.code === 'Digit2') this.weapons.switchWeapon('pistol');
      else if (e.code === 'KeyV') this.weapons.isAds = !this.weapons.isAds;
    });

    window.addEventListener('mousedown', (e) => {
      if (this.state !== 'PLAYING') return;
      this.sound.init();
      if (e.button === 0) {
        this.weapons.setTrigger(true);
      } else if (e.button === 2) {
        this.weapons.isAds = true;
      } else if (e.button === 1) {
        e.preventDefault();
        this.weapons.toggleCant();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.weapons.setTrigger(false);
      else if (e.button === 2) this.weapons.isAds = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('wheel', (e) => {
      if (this.state !== 'PLAYING') return;
      const next = this.weapons.activeId === 'rifle' ? 'pistol' : 'rifle';
      this.weapons.switchWeapon(next);
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked && this.state === 'PLAYING' && !this.controller.pointerLockBlocked) {
        // Allow seamless pause when player hits ESC out of pointer lock
        this._pauseGame();
      }
    });

    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.postFX.resize(w, h);
    });
  }

  _startOrResume() {
    this.sound.init();
    this.sound.playBodycamChirp('start');

    if (this.state === 'MENU') {
      this._resetWorldState();
      this.enemies.startNextWave(this.controller.position, this.camera);
    }

    this.state = 'PLAYING';
    this.controller.enabled = true;
    this.controller.requestLock();

    this.ui.menu.classList.add('hidden');
    this.ui.aar.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
  }

  _pauseGame() {
    this.state = 'PAUSED';
    this.controller.enabled = false;
    this.weapons.setTrigger(false);
    this.weapons.isAds = false;
    this.ui.btnDeploy.textContent = 'RESUME OPERATION';
    this.ui.menu.classList.remove('hidden');
  }

  _resetWorldState() {
    this.hp = 100;
    this.armor = 100;
    this.bpm = 74;
    this.damageFlash = 0;
    this.controller.reset();
    this.weapons.reset();
    this.enemies.reset();
    this.ui.comms.innerHTML = '';
    this._pushComms('AXON BODY 4 ONLINE // CLEAR SECTOR 07 HOSTILES', false);
  }

  _resetAndDeploy() {
    this.sound.init();
    this.sound.playBodycamChirp('start');
    this._resetWorldState();
    this.enemies.startNextWave(this.controller.position, this.camera);
    this.state = 'PLAYING';
    this.controller.enabled = true;
    this.controller.requestLock();
    this.ui.aar.classList.add('hidden');
    this.ui.menu.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
  }

  _triggerGameOver() {
    this.state = 'GAMEOVER';
    this.controller.enabled = false;
    this.weapons.setTrigger(false);
    this.weapons.isAds = false;
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }

    this.ui.hud.classList.add('hidden');
    this.ui.aar.classList.remove('hidden');

    const acc = this.weapons.shotsFired > 0
      ? Math.round((this.weapons.shotsHit / this.weapons.shotsFired) * 100)
      : 0;
    this.ui.aarWave.textContent = String(Math.max(0, this.enemies.wave - 1));
    this.ui.aarKills.textContent = String(this.enemies.kills);
    this.ui.aarHeadshots.textContent = String(this.enemies.headshots);
    this.ui.aarAccuracy.textContent = `${acc}%`;
  }

  _pushComms(msg, alert = false) {
    const el = document.createElement('div');
    el.className = `comms-msg${alert ? ' alert' : ''}`;
    el.textContent = `[COMMS] ${msg}`;
    this.ui.comms.prepend(el);
    while (this.ui.comms.children.length > 3) {
      this.ui.comms.lastElementChild.remove();
    }
    setTimeout(() => {
      el.remove();
    }, 5200);
  }

  _buildMagBars() {
    this.ui.magBars.innerHTML = '';
    for (let i = 0; i < 30; i++) {
      const pip = document.createElement('span');
      pip.className = 'mag-pip';
      this.ui.magBars.appendChild(pip);
    }
  }

  _updateHUD(dt, timeSec, realDt = dt) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    this.ui.timestamp.textContent = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} -0800`;

    this.fpsAccum += realDt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.currentFps = Math.max(1, Math.round(this.fpsFrames / this.fpsAccum));
      this.ui.fps.textContent = `${this.currentFps} FPS`;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.ui.modeBadge.textContent = this.controller.isLocked ? 'MOUSE LOCK' : 'DRAG AIM';
    this.ui.wave.textContent = String(Math.max(1, this.enemies.wave)).padStart(2, '0');
    this.ui.enemies.textContent = String(this.enemies.getAliveCount()).padStart(2, '0');
    this.ui.kills.textContent = String(this.enemies.kills).padStart(2, '0');

    // Heartbeat slowly settles down when not sprinting or wounded
    const baseBpm = 72 + (100 - this.hp) * 0.72 + (this.controller.sprinting ? 28 : 0);
    this.bpm = THREE.MathUtils.lerp(this.bpm, baseBpm, Math.min(1, dt * 1.5));
    this.ui.bpm.textContent = `${Math.round(this.bpm)} BPM`;
    this.ui.bpm.style.color = this.hp < 35 ? '#f87171' : this.hp < 65 ? '#fbbf24' : '#4ade80';

    this.ui.stance.textContent = this.controller.getStanceLabel();
    this.ui.hp.textContent = `${Math.ceil(this.hp)}%`;
    this.ui.armor.textContent = `${Math.ceil(this.armor)}%`;
    this.ui.hpFill.style.width = `${Math.max(0, this.hp)}%`;

    const w = this.weapons.current;
    this.ui.weaponName.textContent = w.name;
    this.ui.fireMode.textContent = w.fireMode;
    this.ui.ammoMag.textContent = String(w.mag).padStart(2, '0');
    this.ui.chamberPlus.style.display = w.chambered ? 'inline' : 'none';
    this.ui.ammoReserve.textContent = String(w.reserve);

    // Update segmented magazine bar
    const pips = this.ui.magBars.children;
    for (let i = 0; i < pips.length; i++) {
      if (i >= w.magSize) {
        pips[i].style.display = 'none';
      } else {
        pips[i].style.display = 'block';
        pips[i].classList.toggle('spent', i >= w.mag);
      }
    }

    const totalLoaded = this.weapons.totalInWeapon;
    this.ui.reloadPrompt.classList.toggle('hidden', totalLoaded > 5 || this.weapons.reloading || w.reserve <= 0);

    this.ui.lightInd.classList.toggle('active', this.weapons.flashlightOn);
    this.ui.lightInd.textContent = this.weapons.flashlightOn ? '[F] LIGHT ON' : '[F] LIGHT OFF';
    this.ui.laserInd.classList.toggle('active', this.weapons.laserOn);
    this.ui.laserInd.textContent = this.weapons.isCanted ? '[X] CANTED' : '[X] PEQ-15';

    // Hide hip dot during ADS
    this.ui.hipDot.style.opacity = this.weapons.adsLerp > 0.35 || !this.ui.optReticle.checked ? '0' : '0.6';

    // Hit marker & damage flash fade
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= dt;
      if (this.hitMarkerTimer <= 0) {
        this.ui.hitMarker.classList.remove('active', 'kill');
      }
    }

    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);
    const lowHpPulse = this.hp < 35 ? (0.18 + Math.sin(timeSec * 5.2) * 0.12) : 0;
    this.ui.damageFlash.style.opacity = String(Math.min(1, this.damageFlash + lowHpPulse));
  }

  _startLoop() {
    const tick = (nowMs = performance.now()) => {
      requestAnimationFrame(tick);
      const realDt = Math.max(0.001, (nowMs - this.lastFrameMs) / 1000);
      const dt = Math.min(0.05, realDt);
      this.lastFrameMs = nowMs;
      const timeSec = Math.max(0, (nowMs - this.startFrameMs) / 1000);

      this.map.update(dt, timeSec);

      if (this.state === 'PLAYING') {
        this.controller.update(dt, timeSec, this.weapons.isAds);
        this.weapons.update(dt, timeSec, this.controller, this.enemies);
        this.enemies.update(dt, timeSec, this.controller.position, this.camera, this.controller);
        this.sound.updateHeartbeat(this.hp / 100, timeSec);
        this._updateHUD(dt, timeSec, realDt);

        const exp = this.map.getZoneBrightness(this.controller.position);
        this.postFX.update(dt, timeSec, this.weapons.recoilZ * 4.2, exp);
      } else if (this.state === 'MENU') {
        // Atmospheric live bodycam preview sweep over Sector 07 Warehouse!
        const angle = timeSec * 0.14;
        this.camera.position.set(
          Math.sin(angle) * 10.5,
          2.8 + Math.sin(timeSec * 0.45) * 0.25,
          Math.cos(angle) * 11.5
        );
        this.camera.lookAt(0, 1.5, -2.5);
        this.postFX.update(dt, timeSec, 0, 1.0);
      } else {
        this.postFX.update(dt, timeSec, 0, 0.85);
      }

      this.weapons.rigRoot.visible = this.state !== 'MENU';
      this.postFX.render();
    };
    tick();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ZeroxBodycamGame();
});
