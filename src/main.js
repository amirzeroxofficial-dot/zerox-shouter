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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;

    // Realistic PBR metallic reflections via PMREM environment map
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.44;
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
    this.touchPreference = 'auto';
    this.rotateBannerDismissed = false;
    this.wakeLock = null;
    this._resetTouchTracking = null;

    this.lastFrameMs = performance.now();
    this.startFrameMs = this.lastFrameMs;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.currentFps = 60;
    this.commsTimeout = null;

    this._bindCallbacks();
    this._bindUI();
    this._bindTouchControls();
    this._applyTouchVisibility();
    this._syncFullscreenButtons();
    this._buildMagBars();
    this._startLoop();
  }

  _collectUI() {
    return {
      hud: document.getElementById('hud-osd'),
      menu: document.getElementById('menu-overlay'),
      aar: document.getElementById('aar-overlay'),
      mobileControls: document.getElementById('mobile-controls'),
      rotateBanner: document.getElementById('rotate-banner'),
      btnRotateFull: document.getElementById('btn-rotate-full'),
      btnRotateDismiss: document.getElementById('btn-rotate-dismiss'),
      btnDeploy: document.getElementById('btn-deploy'),
      btnDeployFull: document.getElementById('btn-deploy-full'),
      btnRedeploy: document.getElementById('btn-redeploy'),
      btnMenuFullscreen: document.getElementById('btn-menu-fullscreen'),
      hudBtnFullscreen: document.getElementById('hud-btn-fullscreen'),
      hudBtnPause: document.getElementById('hud-btn-pause'),
      optSens: document.getElementById('opt-sens'),
      valSens: document.getElementById('val-sens'),
      optVol: document.getElementById('opt-vol'),
      valVol: document.getElementById('val-vol'),
      optBodycam: document.getElementById('opt-bodycam'),
      optQuality: document.getElementById('opt-quality'),
      optTouch: document.getElementById('opt-touch'),
      optAutoFull: document.getElementById('opt-autofull'),
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
      aarAccuracy: document.getElementById('aar-accuracy'),
      // Mobile Touch Widgets
      touchMoveZone: document.getElementById('touch-move-zone'),
      touchLookZone: document.getElementById('touch-look-zone'),
      stickBase: document.getElementById('touch-stick-base'),
      stickKnob: document.getElementById('touch-stick-knob'),
      tbtnFire: document.getElementById('tbtn-fire'),
      tbtnFireLeft: document.getElementById('tbtn-fire-left'),
      tbtnAds: document.getElementById('tbtn-ads'),
      tbtnCant: document.getElementById('tbtn-cant'),
      tbtnReload: document.getElementById('tbtn-reload'),
      tbtnCrouch: document.getElementById('tbtn-crouch'),
      tbtnJump: document.getElementById('tbtn-jump'),
      tbtnLeanL: document.getElementById('tbtn-lean-l'),
      tbtnLeanR: document.getElementById('tbtn-lean-r'),
      tbtnSwap: document.getElementById('tbtn-swap'),
      tbtnFireMode: document.getElementById('tbtn-firemode'),
      tbtnLight: document.getElementById('tbtn-light'),
      tbtnInspect: document.getElementById('tbtn-inspect')
    };
  }

  _isTouchEnabled() {
    if (this.touchPreference === 'on') return true;
    if (this.touchPreference === 'off') return false;
    return (
      window.matchMedia?.('(pointer: coarse)')?.matches ||
      navigator.maxTouchPoints > 0 ||
      'ontouchstart' in window
    );
  }

  _vibrate(pattern) {
    if (!this._isTouchEnabled()) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Ignore blocked vibration on iOS / restricted webviews
    }
  }

  _isFullscreen() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  }

  _enterFullscreen() {
    try {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        const res = req.call(el, { navigationUI: 'hide' });
        if (res && typeof res.then === 'function') {
          res.then(() => {
            screen.orientation?.lock?.('landscape').catch(() => {});
          }).catch(() => {});
        }
      }
      screen.orientation?.lock?.('landscape').catch(() => {});
    } catch {
      // Ignore if fullscreen restricted in embedded frame
    }
  }

  _exitFullscreen() {
    try {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit && this._isFullscreen()) {
        exit.call(document)?.catch?.(() => {});
      }
    } catch {
      // Ignore exit errors
    }
  }

  _toggleFullscreen() {
    if (this._isFullscreen()) this._exitFullscreen();
    else this._enterFullscreen();
  }

  _syncFullscreenButtons() {
    const fs = this._isFullscreen();
    const hudLabel = this.ui.hudBtnFullscreen.querySelector('.fs-label');
    if (hudLabel) hudLabel.textContent = fs ? 'EXIT' : 'FULL';
    this.ui.hudBtnFullscreen.classList.toggle('active', fs);
    const menuLabel = this.ui.btnMenuFullscreen.querySelector('.fs-label');
    if (menuLabel) menuLabel.textContent = fs ? 'EXIT FULL' : 'FULLSCREEN';
    this.ui.btnMenuFullscreen.classList.toggle('active', fs);
  }

  _applyTouchVisibility() {
    const touchActive = this._isTouchEnabled();
    document.body.classList.toggle('touch-active', touchActive);
    this.controller.disablePointerLock = touchActive;

    const showControls = touchActive && this.state === 'PLAYING';
    this.ui.mobileControls.classList.toggle('hidden', !showControls);

    const isPortrait = window.innerHeight > window.innerWidth;
    const showRotate = showControls && isPortrait && !this.rotateBannerDismissed;
    this.ui.rotateBanner.classList.toggle('hidden', !showRotate);
  }

  _handleResize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.postFX.resize(w, h);
    this._applyTouchVisibility();
  }

  async _requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock?.addEventListener('release', () => {
          this.wakeLock = null;
        });
      }
    } catch {
      // Optional API on mobile browsers
    }
  }

  _releaseWakeLock() {
    try {
      this.wakeLock?.release?.();
    } catch {
      // Ignore
    }
    this.wakeLock = null;
  }

  _bindCallbacks() {
    this.weapons.onShotFired = () => {
      this._vibrate(10);
    };

    this.weapons.onHitConfirm = (killed, isHeadshot) => {
      this.ui.hitMarker.classList.add('active');
      this.ui.hitMarker.classList.toggle('kill', killed || isHeadshot);
      this.hitMarkerTimer = 0.14;
      this._vibrate(killed ? 24 : 12);
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

      // Armor absorbs 58% until depleted
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
      this._vibrate([25, 20, 35]);

      if (this.hp <= 0) {
        this.hp = 0;
        this._triggerGameOver();
      }
    };
  }

  _bindUI() {
    this.ui.btnDeploy.addEventListener('click', () => {
      const autoFull = this._isTouchEnabled() && this.ui.optAutoFull.checked;
      this._startOrResume(autoFull);
    });
    this.ui.btnDeployFull.addEventListener('click', () => this._startOrResume(true));
    this.ui.btnRedeploy.addEventListener('click', () => {
      const autoFull = this._isTouchEnabled() && this.ui.optAutoFull.checked;
      this._resetAndDeploy(autoFull);
    });

    this.ui.btnMenuFullscreen.addEventListener('click', () => this._toggleFullscreen());
    this.ui.hudBtnFullscreen.addEventListener('click', () => {
      this._toggleFullscreen();
      if (this.state === 'PLAYING' && !this._isTouchEnabled()) {
        this.controller.requestLock();
      }
    });
    this.ui.hudBtnPause.addEventListener('click', () => {
      if (this.state === 'PLAYING') this._pauseGame();
      else if (this.state === 'PAUSED') this._startOrResume(false);
    });

    this.ui.btnRotateFull.addEventListener('click', () => {
      this._enterFullscreen();
    });
    this.ui.btnRotateDismiss.addEventListener('click', () => {
      this.rotateBannerDismissed = true;
      this._applyTouchVisibility();
    });

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
      const pr = q === 'ultra' ? Math.min(window.devicePixelRatio || 1, 2.0) : q === 'high' ? Math.min(window.devicePixelRatio || 1, 1.35) : 1.0;
      this.renderer.setPixelRatio(pr);
      this.renderer.shadowMap.enabled = q !== 'perf';
      this._handleResize();
    });

    this.ui.optTouch.addEventListener('change', (e) => {
      this.touchPreference = e.target.value;
      this._applyTouchVisibility();
    });

    this.ui.optReticle.addEventListener('change', (e) => {
      this.ui.hipDot.style.display = e.target.checked ? 'block' : 'none';
    });

    // Unlock WebAudio cleanly on first mobile touch gesture
    window.addEventListener('touchstart', () => {
      this.sound.init();
    }, { passive: true });

    // Combat Controls (Keyboard & Mouse)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' || (e.code === 'Escape' && this.state === 'PLAYING' && !this.controller.isLocked)) {
        if (this.state === 'PLAYING') this._pauseGame();
        else if (this.state === 'PAUSED') this._startOrResume(false);
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
      if (e.sourceCapabilities?.firesTouchEvents) return;
      if (e.target.closest('button, input, select')) return;
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
      if (e.sourceCapabilities?.firesTouchEvents) return;
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
      if (!locked && this.state === 'PLAYING' && !this.controller.pointerLockBlocked && !this._isTouchEnabled()) {
        this._pauseGame();
      }
    });

    const onFullscreenChange = () => {
      this._syncFullscreenButtons();
      this._handleResize();
      requestAnimationFrame(() => this._handleResize());
      setTimeout(() => this._handleResize(), 120);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    window.addEventListener('resize', () => this._handleResize());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this._handleResize(), 120);
    });
  }

  _bindTouchControls() {
    let stickTouchId = null;
    let stickCenterX = 0;
    let stickCenterY = 0;
    const maxRadius = 46;

    let lookTouchId = null;
    let lookLastX = 0;
    let lookLastY = 0;

    const activeFireIds = new Set();
    let primaryFireTouchId = null;
    let fireLastX = 0;
    let fireLastY = 0;

    const resetStick = () => {
      stickTouchId = null;
      this.ui.stickBase.classList.remove('active', 'sprinting');
      this.ui.stickBase.style.left = '';
      this.ui.stickBase.style.top = '';
      this.ui.stickBase.style.bottom = '';
      this.ui.stickKnob.style.transform = 'translate3d(0px, 0px, 0)';
      this.controller.setTouchMove(0, 0, false);
    };

    this._resetTouchTracking = () => {
      resetStick();
      lookTouchId = null;
      activeFireIds.clear();
      primaryFireTouchId = null;
      this.weapons.setTrigger(false);
    };

    const updateStickFromPoint = (clientX, clientY) => {
      let dx = clientX - stickCenterX;
      let dy = clientY - stickCenterY;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        const s = maxRadius / dist;
        dx *= s;
        dy *= s;
      }
      this.ui.stickKnob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
      const nx = dx / maxRadius;
      const ny = -dy / maxRadius;
      const sprint = ny > 0.78 && Math.hypot(nx, ny) > 0.74;
      this.ui.stickBase.classList.toggle('sprinting', sprint);
      this.controller.setTouchMove(nx, ny, sprint);
    };

    // Left Virtual Analog Joystick
    this.ui.touchMoveZone.addEventListener('touchstart', (e) => {
      if (this.state !== 'PLAYING') return;
      e.preventDefault();
      this.sound.init();
      if (stickTouchId !== null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      stickTouchId = t.identifier;
      const zoneRect = this.ui.touchMoveZone.getBoundingClientRect();
      const halfStick = 56;
      const minX = zoneRect.left + halfStick + 6;
      const maxX = zoneRect.right - halfStick;
      const minY = zoneRect.top + halfStick + 6;
      const maxY = zoneRect.bottom - halfStick - 6;
      stickCenterX = THREE.MathUtils.clamp(t.clientX, minX, Math.max(minX, maxX));
      stickCenterY = THREE.MathUtils.clamp(t.clientY, minY, Math.max(minY, maxY));

      this.ui.stickBase.style.left = `${stickCenterX - zoneRect.left - halfStick}px`;
      this.ui.stickBase.style.top = `${stickCenterY - zoneRect.top - halfStick}px`;
      this.ui.stickBase.style.bottom = 'auto';
      this.ui.stickBase.classList.add('active');
      updateStickFromPoint(t.clientX, t.clientY);
    }, { passive: false });

    this.ui.touchMoveZone.addEventListener('touchmove', (e) => {
      if (stickTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === stickTouchId) {
          e.preventDefault();
          updateStickFromPoint(t.clientX, t.clientY);
          break;
        }
      }
    }, { passive: false });

    const endStickTouch = (e) => {
      if (stickTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === stickTouchId) {
          e.preventDefault();
          resetStick();
          break;
        }
      }
    };
    this.ui.touchMoveZone.addEventListener('touchend', endStickTouch, { passive: false });
    this.ui.touchMoveZone.addEventListener('touchcancel', endStickTouch, { passive: false });

    // Right Camera Look Pad
    this.ui.touchLookZone.addEventListener('touchstart', (e) => {
      if (this.state !== 'PLAYING') return;
      e.preventDefault();
      this.sound.init();
      if (lookTouchId !== null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      lookTouchId = t.identifier;
      lookLastX = t.clientX;
      lookLastY = t.clientY;
    }, { passive: false });

    this.ui.touchLookZone.addEventListener('touchmove', (e) => {
      if (lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === lookTouchId) {
          e.preventDefault();
          const dx = t.clientX - lookLastX;
          const dy = t.clientY - lookLastY;
          lookLastX = t.clientX;
          lookLastY = t.clientY;
          this.controller.addTouchLook(dx, dy);
          break;
        }
      }
    }, { passive: false });

    const endLookTouch = (e) => {
      if (lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchId) {
          e.preventDefault();
          lookTouchId = null;
          break;
        }
      }
    };
    this.ui.touchLookZone.addEventListener('touchend', endLookTouch, { passive: false });
    this.ui.touchLookZone.addEventListener('touchcancel', endLookTouch, { passive: false });

    // Right Fire Button (supports Aim-While-Firing thumb drag!)
    const bindFireButton = (btn, allowAimDrag) => {
      btn.addEventListener('touchstart', (e) => {
        if (this.state !== 'PLAYING') return;
        e.preventDefault();
        e.stopPropagation();
        this.sound.init();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          activeFireIds.add(t.identifier);
          if (allowAimDrag && primaryFireTouchId === null) {
            primaryFireTouchId = t.identifier;
            fireLastX = t.clientX;
            fireLastY = t.clientY;
          }
        }
        this.weapons.setTrigger(true);
      }, { passive: false });

      if (allowAimDrag) {
        btn.addEventListener('touchmove', (e) => {
          if (primaryFireTouchId === null || lookTouchId !== null) return;
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === primaryFireTouchId) {
              e.preventDefault();
              e.stopPropagation();
              const dx = t.clientX - fireLastX;
              const dy = t.clientY - fireLastY;
              fireLastX = t.clientX;
              fireLastY = t.clientY;
              this.controller.addTouchLook(dx, dy);
              break;
            }
          }
        }, { passive: false });
      }

      const endFire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const id = e.changedTouches[i].identifier;
          activeFireIds.delete(id);
          if (id === primaryFireTouchId) primaryFireTouchId = null;
        }
        if (activeFireIds.size === 0) {
          this.weapons.setTrigger(false);
        }
      };
      btn.addEventListener('touchend', endFire, { passive: false });
      btn.addEventListener('touchcancel', endFire, { passive: false });

      // Pointer/mouse fallback if touch HUD is enabled on desktop
      btn.addEventListener('mousedown', (e) => {
        if (this.state !== 'PLAYING' || e.sourceCapabilities?.firesTouchEvents) return;
        e.stopPropagation();
        this.weapons.setTrigger(true);
      });
      btn.addEventListener('mouseup', (e) => {
        if (e.sourceCapabilities?.firesTouchEvents) return;
        e.stopPropagation();
        this.weapons.setTrigger(false);
      });
    };

    bindFireButton(this.ui.tbtnFire, true);
    bindFireButton(this.ui.tbtnFireLeft, false);

    // Helper for clean tap buttons (no duplicate click after touchstart)
    const bindTap = (el, handler) => {
      let lastTouchMs = 0;
      el.addEventListener('touchstart', (e) => {
        if (this.state !== 'PLAYING') return;
        e.preventDefault();
        e.stopPropagation();
        lastTouchMs = performance.now();
        this.sound.init();
        handler();
        this._vibrate(8);
      }, { passive: false });

      el.addEventListener('click', (e) => {
        if (this.state !== 'PLAYING') return;
        e.stopPropagation();
        if (performance.now() - lastTouchMs < 450) return;
        this.sound.init();
        handler();
      });
    };

    bindTap(this.ui.tbtnAds, () => {
      if (this.weapons.isAds && this.weapons.isCanted) {
        this.weapons.isCanted = false;
        this.sound.playToggleClick(false);
      } else {
        this.weapons.isAds = !this.weapons.isAds;
        if (!this.weapons.isAds) this.weapons.isCanted = false;
      }
    });
    bindTap(this.ui.tbtnCant, () => {
      if (!this.weapons.isAds || !this.weapons.isCanted) {
        this.weapons.isAds = true;
        this.weapons.isCanted = true;
        this.sound.playToggleClick(true);
      } else {
        this.weapons.isCanted = false;
        this.weapons.isAds = false;
        this.sound.playToggleClick(false);
      }
    });
    bindTap(this.ui.tbtnReload, () => this.weapons.startReload());
    bindTap(this.ui.tbtnCrouch, () => this.controller.toggleCrouch());
    bindTap(this.ui.tbtnJump, () => this.controller.triggerJump());
    bindTap(this.ui.tbtnLeanL, () => this.controller.toggleLean(-1));
    bindTap(this.ui.tbtnLeanR, () => this.controller.toggleLean(1));
    bindTap(this.ui.tbtnSwap, () => {
      const next = this.weapons.activeId === 'rifle' ? 'pistol' : 'rifle';
      this.weapons.switchWeapon(next);
    });
    bindTap(this.ui.tbtnFireMode, () => this.weapons.toggleFireMode());
    bindTap(this.ui.tbtnLight, () => this.weapons.toggleFlashlight());
    bindTap(this.ui.tbtnInspect, () => this.weapons.startInspect());
  }

  _startOrResume(enterFullscreen = false) {
    this.sound.init();
    this.sound.playBodycamChirp('start');

    if (enterFullscreen) {
      this._enterFullscreen();
    }

    if (this.state === 'MENU') {
      this._resetWorldState();
      this.enemies.startNextWave(this.controller.position, this.camera);
    }

    this.state = 'PLAYING';
    this.controller.enabled = true;
    this._applyTouchVisibility();
    if (!this._isTouchEnabled()) {
      this.controller.requestLock();
    }
    this._requestWakeLock();

    this.ui.menu.classList.add('hidden');
    this.ui.aar.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
  }

  _pauseGame() {
    this.state = 'PAUSED';
    this.controller.enabled = false;
    this.weapons.setTrigger(false);
    this.weapons.isAds = false;
    this._resetTouchTracking?.();
    this._releaseWakeLock();
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this._applyTouchVisibility();
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

  _resetAndDeploy(enterFullscreen = false) {
    this.sound.init();
    this.sound.playBodycamChirp('start');
    if (enterFullscreen) {
      this._enterFullscreen();
    }
    this._resetWorldState();
    this.enemies.startNextWave(this.controller.position, this.camera);
    this.state = 'PLAYING';
    this.controller.enabled = true;
    this._applyTouchVisibility();
    if (!this._isTouchEnabled()) {
      this.controller.requestLock();
    }
    this._requestWakeLock();
    this.ui.aar.classList.add('hidden');
    this.ui.menu.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
  }

  _triggerGameOver() {
    this.state = 'GAMEOVER';
    this.controller.enabled = false;
    this.weapons.setTrigger(false);
    this.weapons.isAds = false;
    this._resetTouchTracking?.();
    this._releaseWakeLock();
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this._applyTouchVisibility();

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

    const touchMode = this._isTouchEnabled();
    this.ui.modeBadge.textContent = touchMode
      ? (this._isFullscreen() ? 'TOUCH // FULL' : 'TOUCH')
      : (this.controller.isLocked ? 'MOUSE LOCK' : 'DRAG AIM');
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
    const lowAmmo = totalLoaded <= 5 && !this.weapons.reloading && w.reserve > 0;
    this.ui.reloadPrompt.classList.toggle('hidden', !lowAmmo);

    this.ui.lightInd.classList.toggle('active', this.weapons.flashlightOn);
    this.ui.lightInd.textContent = this.weapons.flashlightOn ? '[F] LIGHT ON' : '[F] LIGHT OFF';
    this.ui.laserInd.classList.toggle('active', this.weapons.laserOn);
    this.ui.laserInd.textContent = this.weapons.isCanted ? '[X] CANTED' : '[X] PEQ-15';

    // Sync touch HUD button states
    if (touchMode) {
      this.ui.tbtnAds.classList.toggle('active', this.weapons.isAds && !this.weapons.isCanted);
      this.ui.tbtnCant.classList.toggle('active', this.weapons.isCanted);
      this.ui.tbtnReload.classList.toggle('low-ammo', lowAmmo);
      this.ui.tbtnCrouch.classList.toggle('active', this.controller.crouching);
      this.ui.tbtnLeanL.classList.toggle('active', this.controller.leanTarget < -0.5);
      this.ui.tbtnLeanR.classList.toggle('active', this.controller.leanTarget > 0.5);
      this.ui.tbtnLight.classList.toggle('active', this.weapons.flashlightOn);
      this.ui.tbtnFireMode.textContent = w.fireMode;
      this.ui.tbtnSwap.textContent = this.weapons.activeId === 'rifle' ? 'SWAP G19' : 'SWAP MK18';
    }

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
