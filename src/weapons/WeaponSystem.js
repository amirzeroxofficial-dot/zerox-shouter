import * as THREE from 'three';

const WEAPON_SPECS = {
  rifle: {
    id: 'rifle',
    name: 'MK18 MOD 1 // 5.56',
    magSize: 30,
    reserveMax: 150,
    rpm: 740,
    damage: 36,
    headMult: 3.1,
    hasAuto: true,
    recoilPitch: 0.022,
    recoilYaw: 0.011,
    kickZ: 0.055,
    adsFov: 68,
    hipFov: 96,
    tacticalReloadDur: 1.75,
    dryReloadDur: 2.28
  },
  pistol: {
    id: 'pistol',
    name: 'G19 TACTICAL // 9x19',
    magSize: 15,
    reserveMax: 75,
    rpm: 460,
    damage: 28,
    headMult: 2.8,
    hasAuto: false,
    recoilPitch: 0.028,
    recoilYaw: 0.009,
    kickZ: 0.048,
    adsFov: 74,
    hipFov: 96,
    tacticalReloadDur: 1.38,
    dryReloadDur: 1.78
  }
};

export class WeaponSystem {
  constructor(scene, camera, textures, sound, map, postFX) {
    this.scene = scene;
    this.camera = camera;
    this.textures = textures;
    this.sound = sound;
    this.map = map;
    this.postFX = postFX;

    // Weapon root attached to camera with inertial free-aim lag
    this.rigRoot = new THREE.Group();
    this.camera.add(this.rigRoot);

    this.weaponPivot = new THREE.Group();
    this.rigRoot.add(this.weaponPivot);

    // State per weapon slot
    this.slots = {
      rifle: {
        ...WEAPON_SPECS.rifle,
        mag: 30,
        chambered: true,
        reserve: 150,
        fireMode: 'AUTO'
      },
      pistol: {
        ...WEAPON_SPECS.pistol,
        mag: 15,
        chambered: true,
        reserve: 75,
        fireMode: 'SEMI'
      }
    };
    this.activeId = 'rifle';

    // Interactive tactical states
    this.isAds = false;
    this.isCanted = false;
    this.flashlightOn = true;
    this.laserOn = true;
    this.triggerDown = false;
    this.pendingTapShot = false;
    this.semiShotConsumed = false;

    this.fireTimer = 0;
    this.recoilZ = 0;
    this.recoilRotX = 0;
    this.recoilRandZ = 0;
    this.boltOffset = 0;
    this.boltLockedBack = false;
    this.chargingOffset = 0;

    // Free-aim lag / inertial sway
    this.lagX = 0;
    this.lagY = 0;
    this.lagRotY = 0;
    this.lagRotX = 0;
    this.adsLerp = 0;
    this.cantLerp = 0;
    this.sprintLerp = 0;

    // Reload / Inspect animation state
    this.reloading = false;
    this.reloadDry = false;
    this.reloadTime = 0;
    this.reloadDuration = 1.75;
    this.reloadStageTriggered = new Set();

    this.inspecting = false;
    this.inspectTime = 0;
    this.inspectDuration = 2.9;

    this.switching = false;
    this.switchTime = 0;

    // Pooled dynamic FX
    this.shells = [];
    this.droppedMags = [];
    this.particles = [];
    this.tracers = [];
    this.decals = [];
    this.decalCursor = 0;

    // Stats
    this.shotsFired = 0;
    this.shotsHit = 0;

    this.muzzleFlashTimer = 0;
    this._buildWeapons();
    this._buildTacticalLightsAndLaser();
    this._buildFXPools();
    this._selectVisual('rifle');
  }

  get current() {
    return this.slots[this.activeId];
  }

  get totalInWeapon() {
    const w = this.current;
    return w.mag + (w.chambered ? 1 : 0);
  }

  reset() {
    this.slots.rifle.mag = 30;
    this.slots.rifle.chambered = true;
    this.slots.rifle.reserve = 150;
    this.slots.rifle.fireMode = 'AUTO';

    this.slots.pistol.mag = 15;
    this.slots.pistol.chambered = true;
    this.slots.pistol.reserve = 75;
    this.slots.pistol.fireMode = 'SEMI';

    this.activeId = 'rifle';
    this.triggerDown = false;
    this.pendingTapShot = false;
    this.switching = false;
    this.reloading = false;
    this.inspecting = false;
    this.isAds = false;
    this.isCanted = false;
    this.boltLockedBack = false;
    this.boltOffset = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this._selectVisual('rifle');
  }

  _buildWeapons() {
    const gunmetal = this.textures.getGunmetal(0x22262c, 0.34, 0.88);
    const darkSteel = this.textures.getGunmetal(0x16191d, 0.42, 0.82);
    const fdeCerakote = this.textures.getGunmetal(0x6b5c47, 0.56, 0.35);
    const polymer = this.textures.getGunmetal(0x1b1d20, 0.78, 0.12);
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9a84e, roughness: 0.25, metalness: 0.92 });
    const sleeveMat = this.textures.getGunmetal(0x2d332c, 0.88, 0.04);
    const gloveMat = this.textures.getGunmetal(0x1e2022, 0.82, 0.08);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x16242b,
      transparent: true,
      opacity: 0.34,
      roughness: 0.08,
      metalness: 0.15
    });

    // === MK18 MOD 1 CARBINE ===
    this.rifleGroup = new THREE.Group();
    this.weaponPivot.add(this.rifleGroup);

    // Upper + Lower Receiver
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.068, 0.21), gunmetal);
    lower.position.set(0, -0.02, 0.04);
    this.rifleGroup.add(lower);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.052, 0.23), darkSteel);
    upper.position.set(0, 0.025, 0.03);
    this.rifleGroup.add(upper);

    // Top Picatinny Rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.44), darkSteel);
    rail.position.set(0, 0.055, -0.075);
    this.rifleGroup.add(rail);

    // Handguard (FDE Quad-Rail) + Angled Foregrip
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.054, 0.25), fdeCerakote);
    handguard.position.set(0, 0.022, -0.21);
    this.rifleGroup.add(handguard);

    const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.058, 0.036), polymer);
    foregrip.position.set(0, -0.026, -0.21);
    foregrip.rotation.x = -0.2;
    this.rifleGroup.add(foregrip);

    // Barrel + SOCOM Suppressor with ribbed collar
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.28, 12), darkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.024, -0.24);
    this.rifleGroup.add(barrel);

    const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.17, 16), fdeCerakote);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.024, -0.44);
    this.rifleGroup.add(suppressor);

    const supCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.026, 16), darkSteel);
    supCollar.rotation.x = Math.PI / 2;
    supCollar.position.set(0, 0.024, -0.365);
    this.rifleGroup.add(supCollar);

    // Buttstock + Buffer Tube
    const buffer = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.18, 12), gunmetal);
    buffer.rotation.x = Math.PI / 2;
    buffer.position.set(0, 0.018, 0.22);
    this.rifleGroup.add(buffer);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.11, 0.16), polymer);
    stock.position.set(0, -0.01, 0.27);
    this.rifleGroup.add(stock);

    // Pistol Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.105, 0.044), polymer);
    grip.position.set(0, -0.085, 0.11);
    grip.rotation.x = 0.28;
    this.rifleGroup.add(grip);

    // Animated Bolt Carrier Group (visible through right ejection port!)
    this.rifleBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.085, 10), new THREE.MeshStandardMaterial({
      color: 0x8e96a0,
      roughness: 0.24,
      metalness: 0.94
    }));
    this.rifleBolt.rotation.x = Math.PI / 2;
    this.rifleBolt.position.set(0.013, 0.026, 0.01);
    this.rifleGroup.add(this.rifleBolt);

    // Animated Charging Handle at rear of upper
    this.rifleChargingHandle = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.014, 0.026), darkSteel);
    this.rifleChargingHandle.position.set(0, 0.045, 0.148);
    this.rifleGroup.add(this.rifleChargingHandle);

    // Detachable 30-rd PMAG with visible brass top cartridges
    this.rifleMagGroup = new THREE.Group();
    this.rifleMagGroup.position.set(0, -0.055, -0.015);
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.155, 0.062), polymer);
    magBody.position.set(0, -0.06, 0);
    magBody.rotation.x = -0.14;
    this.rifleMagGroup.add(magBody);

    // Visible 5.56 brass cartridges at top feed lips
    for (let r = 0; r < 2; r++) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.046, 8), brassMat);
      round.rotation.x = Math.PI / 2;
      round.position.set(r === 0 ? -0.005 : 0.005, 0.016, 0);
      this.rifleMagGroup.add(round);
    }
    this.rifleGroup.add(this.rifleMagGroup);

    // EOTech EXPS3 Holographic Sight
    const holoBase = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.016, 0.082), fdeCerakote);
    holoBase.position.set(0, 0.065, -0.01);
    this.rifleGroup.add(holoBase);

    const holoHoodL = new THREE.Mesh(new THREE.BoxGeometry(0.0055, 0.046, 0.072), fdeCerakote);
    holoHoodL.position.set(-0.021, 0.095, -0.01);
    this.rifleGroup.add(holoHoodL);

    const holoHoodR = holoHoodL.clone();
    holoHoodR.position.x = 0.021;
    this.rifleGroup.add(holoHoodR);

    const holoHoodTop = new THREE.Mesh(new THREE.BoxGeometry(0.047, 0.0055, 0.072), fdeCerakote);
    holoHoodTop.position.set(0, 0.118, -0.01);
    this.rifleGroup.add(holoHoodTop);

    const holoGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.037, 0.042), glassMat);
    holoGlass.position.set(0, 0.095, -0.018);
    this.rifleGroup.add(holoGlass);

    // Floating HDR glowing holographic reticle plane inside optic window
    const retMat = new THREE.MeshBasicMaterial({
      map: this.textures.getHoloReticleTexture(),
      color: new THREE.Color(3.6, 0.38, 0.25),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });
    this.rifleReticle = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.034), retMat);
    this.rifleReticle.position.set(0, 0.095, -0.006);
    this.rifleReticle.renderOrder = 25;
    this.rifleGroup.add(this.rifleReticle);

    // PEQ-15 Laser Module on right/top front rail
    const peq = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.024, 0.088), fdeCerakote);
    peq.position.set(0.016, 0.066, -0.255);
    this.rifleGroup.add(peq);

    // Tactical Flashlight on left rail
    const tacLightBody = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.11, 12), darkSteel);
    tacLightBody.rotation.x = Math.PI / 2;
    tacLightBody.position.set(-0.036, 0.024, -0.27);
    this.rifleGroup.add(tacLightBody);

    // Rifle Muzzle anchor
    this.rifleMuzzle = new THREE.Object3D();
    this.rifleMuzzle.position.set(0, 0.024, -0.53);
    this.rifleGroup.add(this.rifleMuzzle);

    this.rifleEjectPort = new THREE.Object3D();
    this.rifleEjectPort.position.set(0.026, 0.028, 0.01);
    this.rifleGroup.add(this.rifleEjectPort);

    // === G19 TACTICAL SIDEARM ===
    this.pistolGroup = new THREE.Group();
    this.weaponPivot.add(this.pistolGroup);

    const pFrame = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.034, 0.18), polymer);
    pFrame.position.set(0, 0.0, -0.02);
    this.pistolGroup.add(pFrame);

    // Under-rail X300 tactical weapon light
    const pLightUnit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.078), darkSteel);
    pLightUnit.position.set(0, -0.024, -0.085);
    this.pistolGroup.add(pLightUnit);

    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.105, 0.046), polymer);
    pGrip.position.set(0, -0.062, 0.045);
    pGrip.rotation.x = 0.3;
    this.pistolGroup.add(pGrip);

    // Reciprocating Slide + RMR Optic
    this.pistolSlide = new THREE.Group();
    this.pistolSlide.position.set(0, 0.032, -0.025);
    const slideMesh = new THREE.Mesh(new THREE.BoxGeometry(0.033, 0.034, 0.19), darkSteel);
    this.pistolSlide.add(slideMesh);
    // Tritium front sight post
    const frontSight = new THREE.Mesh(
      new THREE.BoxGeometry(0.004, 0.007, 0.008),
      new THREE.MeshBasicMaterial({ color: 0x4ade80 })
    );
    frontSight.position.set(0, 0.02, -0.085);
    this.pistolSlide.add(frontSight);
    // RMR Mini Red-Dot Housing
    const rmrHood = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.024, 0.036), gunmetal);
    rmrHood.position.set(0, 0.025, 0.04);
    this.pistolSlide.add(rmrHood);
    const rmrMat = new THREE.MeshBasicMaterial({
      map: this.textures.getRedDotTexture(),
      color: new THREE.Color(3.2, 0.35, 0.25),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });
    const rmrReticle = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.022), rmrMat);
    rmrReticle.position.set(0, 0.027, 0.042);
    rmrReticle.renderOrder = 25;
    this.pistolSlide.add(rmrReticle);
    this.pistolGroup.add(this.pistolSlide);

    // Inner barrel visible when slide locks back
    const pBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.19, 10), new THREE.MeshStandardMaterial({
      color: 0xa2abb5,
      roughness: 0.2,
      metalness: 0.95
    }));
    pBarrel.rotation.x = Math.PI / 2;
    pBarrel.position.set(0, 0.03, -0.04);
    this.pistolGroup.add(pBarrel);

    // Pistol Detachable Mag
    this.pistolMagGroup = new THREE.Group();
    this.pistolMagGroup.position.set(0, -0.075, 0.048);
    const pMagMesh = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.105, 0.038), darkSteel);
    pMagMesh.rotation.x = 0.3;
    this.pistolMagGroup.add(pMagMesh);
    this.pistolGroup.add(this.pistolMagGroup);

    this.pistolMuzzle = new THREE.Object3D();
    this.pistolMuzzle.position.set(0, 0.032, -0.145);
    this.pistolGroup.add(this.pistolMuzzle);

    this.pistolEjectPort = new THREE.Object3D();
    this.pistolEjectPort.position.set(0.02, 0.038, 0.0);
    this.pistolGroup.add(this.pistolEjectPort);

    // === TACTICAL GLOVED HANDS & ARMS (Shared animated rig!) ===
    this.leftArmGroup = new THREE.Group();
    const lSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.044, 0.36, 12), sleeveMat);
    lSleeve.rotation.x = Math.PI / 2 + 0.16;
    lSleeve.rotation.z = -0.32;
    lSleeve.position.set(-0.074, -0.068, 0.175);
    this.leftArmGroup.add(lSleeve);

    // Digital wristwatch nestled cleanly on wrist
    const watch = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.011, 0.038), darkSteel);
    watch.position.set(-0.024, 0.011, 0.058);
    watch.rotation.z = 0.26;
    this.leftArmGroup.add(watch);
    const watchGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.018, 0.014),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    watchGlow.rotation.x = -Math.PI / 2;
    watchGlow.position.set(-0.023, 0.018, 0.058);
    watchGlow.rotation.z = 0.26;
    this.leftArmGroup.add(watchGlow);

    const lGlove = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.04, 0.082), gloveMat);
    lGlove.position.set(0, 0, 0);
    this.leftArmGroup.add(lGlove);
    this.weaponPivot.add(this.leftArmGroup);

    this.rightArmGroup = new THREE.Group();
    const rSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.054, 0.36, 12), sleeveMat);
    rSleeve.rotation.x = Math.PI / 2;
    rSleeve.position.set(0.085, -0.08, 0.24);
    rSleeve.rotation.z = 0.28;
    this.rightArmGroup.add(rSleeve);

    const rGlove = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.054, 0.088), gloveMat);
    rGlove.position.set(0, -0.065, 0.1);
    this.rightArmGroup.add(rGlove);
    this.weaponPivot.add(this.rightArmGroup);

    // Muzzle flash sprite + dynamic muzzle illumination
    const flashTex = this.textures.getParticleTextures().muzzleFlash;
    this.muzzleSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flashTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0
      })
    );
    this.muzzleSprite.scale.set(0.32, 0.32, 0.32);
    this.weaponPivot.add(this.muzzleSprite);

    this.muzzleLight = new THREE.PointLight(0xffaa44, 0, 14, 1.8);
    this.weaponPivot.add(this.muzzleLight);
  }

  _buildTacticalLightsAndLaser() {
    // Weapon Tactical Flashlight positioned ahead of suppressor so barrel never self-glares
    this.flashlight = new THREE.SpotLight(0xfff4e2, 46, 44, Math.PI * 0.22, 0.65, 1.35);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.0006;
    this.flashlight.position.set(-0.036, 0.024, -0.54);
    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(-0.036, 0.024, -22);
    this.weaponPivot.add(this.flashlight);
    this.weaponPivot.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // PEQ-15 Visible Tactical Green/IR Laser Line + Surface Dot
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -30)
    ]);
    const laserMat = new THREE.LineBasicMaterial({
      color: 0x22ff66,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.laserLine = new THREE.Line(laserGeo, laserMat);
    this.scene.add(this.laserLine);

    this.laserDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x55ff88 })
    );
    this.scene.add(this.laserDot);
  }

  _buildFXPools() {
    // Pre-allocate shell geometry & materials
    this.shellGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.026, 6);
    this.shellGeo.rotateX(Math.PI / 2);
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0xdcb14d, roughness: 0.22, metalness: 0.92 });
    this.droppedMagGeo = new THREE.BoxGeometry(0.028, 0.15, 0.062);
    this.droppedMagMat = this.textures.getGunmetal(0x1b1d20, 0.78, 0.12);

    this.decalGeo = new THREE.PlaneGeometry(0.14, 0.14);
    this.decalMat = new THREE.MeshBasicMaterial({
      map: this.textures.getParticleTextures().bulletHole,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
  }

  _selectVisual(id) {
    this.activeId = id;
    const isRifle = id === 'rifle';
    this.rifleGroup.visible = isRifle;
    this.pistolGroup.visible = !isRifle;
    this.rightArmGroup.position.set(0, 0, isRifle ? 0 : -0.055);

    // Reset bolt state based on current chamber/mag
    const w = this.current;
    this.boltLockedBack = w.mag === 0 && !w.chambered;
    this.boltOffset = this.boltLockedBack ? 0.055 : 0;
    this.semiShotConsumed = false;
  }

  switchWeapon(id) {
    const targetId = this.switching && this.pendingSwitchId ? this.pendingSwitchId : this.activeId;
    if (targetId === id || this.reloading) return;
    this.pendingTapShot = false;
    this.inspecting = false;
    this.isAds = false;
    this.switching = true;
    this.switchTime = 0;
    this.pendingSwitchId = id;
    this.sound.playToggleClick(false);
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 48 : 0;
    this.sound.playToggleClick(this.flashlightOn);
    return this.flashlightOn;
  }

  toggleLaser() {
    this.laserOn = !this.laserOn;
    this.laserLine.visible = this.laserOn;
    this.laserDot.visible = this.laserOn;
    this.sound.playToggleClick(this.laserOn);
    return this.laserOn;
  }

  toggleCant() {
    this.isCanted = !this.isCanted;
    this.sound.playToggleClick(this.isCanted);
    return this.isCanted;
  }

  toggleFireMode() {
    const w = this.current;
    if (!w.hasAuto) return w.fireMode;
    w.fireMode = w.fireMode === 'AUTO' ? 'SEMI' : 'AUTO';
    this.sound.playToggleClick(w.fireMode === 'AUTO');
    return w.fireMode;
  }

  startInspect() {
    if (this.reloading || this.switching) return;
    this.inspecting = true;
    this.inspectTime = 0;
    this.isAds = false;
    this.sound.playReloadStage('mag_release', this.activeId);
  }

  startReload() {
    const w = this.current;
    if (this.reloading || this.switching) return false;
    if (w.reserve <= 0) return false;
    if (w.mag >= w.magSize && w.chambered) return false;

    this.pendingTapShot = false;
    this.inspecting = false;
    this.isAds = false;
    this.reloading = true;
    this.reloadDry = w.mag === 0 && !w.chambered;
    this.reloadTime = 0;
    this.reloadDuration = this.reloadDry ? w.dryReloadDur : w.tacticalReloadDur;
    this.reloadStageTriggered.clear();
    return true;
  }

  setTrigger(down) {
    if (down && !this.triggerDown) {
      this.pendingTapShot = true;
    }
    this.triggerDown = down;
    if (!down) {
      this.semiShotConsumed = false;
    }
  }

  _triggerStageOnce(key, fn) {
    if (!this.reloadStageTriggered.has(key)) {
      this.reloadStageTriggered.add(key);
      fn();
    }
  }

  _spawnShell() {
    const port = this.activeId === 'rifle' ? this.rifleEjectPort : this.pistolEjectPort;
    const worldPos = new THREE.Vector3();
    port.getWorldPosition(worldPos);

    const mesh = new THREE.Mesh(this.shellGeo, this.shellMat);
    mesh.position.copy(worldPos);
    this.scene.add(mesh);

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);

    const vel = right
      .multiplyScalar(2.4 + Math.random() * 1.1)
      .addScaledVector(up, 1.5 + Math.random() * 0.7)
      .addScaledVector(fwd, -0.4 + Math.random() * 0.6);

    this.shells.push({
      mesh,
      vel,
      rotVel: new THREE.Vector3(14 + Math.random() * 12, 18 + Math.random() * 14, 10),
      bounces: 0,
      life: 4.5
    });
  }

  _spawnDroppedMag() {
    const magWorld = new THREE.Vector3();
    const magObj = this.activeId === 'rifle' ? this.rifleMagGroup : this.pistolMagGroup;
    magObj.getWorldPosition(magWorld);

    const mesh = new THREE.Mesh(this.droppedMagGeo, this.droppedMagMat);
    mesh.position.copy(magWorld);
    mesh.quaternion.copy(this.camera.quaternion);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.camera.quaternion);
    this.droppedMags.push({
      mesh,
      vel: down.multiplyScalar(1.8),
      rotVel: new THREE.Vector3(4, 2.5, -5),
      bounced: false,
      life: 9.0
    });
  }

  _spawnImpactFX(point, normal, surfaceType) {
    const tex = this.textures.getParticleTextures();
    const isMetal = surfaceType === 'metal';
    const isBody = surfaceType === 'body' || surfaceType === 'headshot';

    // Bullet hole decal on environment surfaces
    if (!isBody) {
      let decal = this.decals[this.decalCursor];
      if (!decal) {
        decal = new THREE.Mesh(this.decalGeo, this.decalMat);
        this.scene.add(decal);
        this.decals.push(decal);
      }
      this.decalCursor = (this.decalCursor + 1) % 64;
      decal.position.copy(point).addScaledVector(normal, 0.008);
      const target = point.clone().add(normal);
      decal.lookAt(target);
      decal.rotateZ(Math.random() * Math.PI * 2);
      const sc = surfaceType === 'wood' ? 0.85 : 1.05;
      decal.scale.set(sc, sc, sc);
    }

    const count = isMetal ? 9 : isBody ? 7 : 6;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: isMetal ? tex.spark : tex.smoke,
        color: isMetal ? 0xffcc66 : isBody ? 0x8b1515 : 0xc8c5be,
        transparent: true,
        opacity: isMetal ? 0.95 : 0.65,
        blending: isMetal ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(point).addScaledVector(normal, 0.04);
      const s = isMetal ? 0.08 + Math.random() * 0.07 : 0.16 + Math.random() * 0.18;
      sprite.scale.set(s, s, s);
      this.scene.add(sprite);

      const vel = normal
        .clone()
        .multiplyScalar(isMetal ? 3.5 + Math.random() * 4 : 1.1 + Math.random() * 1.8)
        .add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.3) * 2.2, (Math.random() - 0.5) * 2.5));

      this.particles.push({
        sprite,
        vel,
        gravity: isMetal ? 12 : 1.2,
        life: isMetal ? 0.24 : 0.52,
        maxLife: isMetal ? 0.24 : 0.52,
        grow: isMetal ? 0 : 1.8
      });
    }
  }

  _spawnTracer(start, end) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.055, maxLife: 0.055 });
  }

  _fireShot(controller, enemies) {
    const w = this.current;
    // Consume chambered round then feed from mag
    if (w.chambered) {
      w.chambered = false;
      if (w.mag > 0) {
        w.mag -= 1;
        w.chambered = true;
      }
    } else if (w.mag > 0) {
      w.mag -= 1;
    }

    this.shotsFired++;
    this.fireTimer = 60 / w.rpm;
    this.onShotFired?.(this.activeId);

    // Empty bolt lock check!
    if (w.mag === 0 && !w.chambered) {
      this.boltLockedBack = true;
      this.boltOffset = 0.055;
    } else {
      this.boltOffset = 0.058;
    }

    // Audio & Visual Recoil
    this.sound.playGunshot(this.activeId, true);
    this.recoilZ = Math.min(0.11, this.recoilZ + w.kickZ);
    this.recoilRotX += 0.065;
    this.recoilRandZ += (Math.random() - 0.5) * 0.045;

    const adsFactor = this.isAds ? 0.62 : 1.0;
    const crouchFactor = controller.crouching ? 0.74 : 1.0;
    const pitchKick = w.recoilPitch * adsFactor * crouchFactor * (0.85 + Math.random() * 0.3);
    const yawKick = (Math.random() - 0.5) * 2 * w.recoilYaw * adsFactor * crouchFactor;
    const rollKick = (Math.random() - 0.5) * 0.025;
    controller.addRecoil(pitchKick, yawKick, rollKick);

    this.postFX.triggerShock(0.18);

    // Muzzle flash & smoke
    const muzzleObj = this.activeId === 'rifle' ? this.rifleMuzzle : this.pistolMuzzle;
    const muzzleWorld = new THREE.Vector3();
    muzzleObj.getWorldPosition(muzzleWorld);

    this.muzzleSprite.position.copy(muzzleObj.position);
    this.muzzleSprite.position.y += this.activeId === 'rifle' ? 0 : 0.032;
    this.muzzleSprite.material.opacity = 0.95;
    this.muzzleSprite.material.rotation = Math.random() * Math.PI * 2;
    const mScale = 0.28 + Math.random() * 0.14;
    this.muzzleSprite.scale.set(mScale, mScale, mScale);
    this.muzzleLight.position.copy(muzzleObj.position);
    this.muzzleLight.intensity = 22;
    this.muzzleFlashTimer = 0.045;

    this._spawnShell();

    // Gunsmoke puff from barrel
    const smokeTex = this.textures.getParticleTextures().smoke;
    const smoke = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: smokeTex, color: 0xcbd5e1, transparent: true, opacity: 0.22, depthWrite: false })
    );
    smoke.position.copy(muzzleWorld);
    smoke.scale.set(0.12, 0.12, 0.12);
    this.scene.add(smoke);
    this.particles.push({
      sprite: smoke,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.55, (Math.random() - 0.5) * 0.4),
      gravity: -0.2,
      life: 0.75,
      maxLife: 0.75,
      grow: 1.4
    });

    // Raycast Ballistics
    const rayOrigin = new THREE.Vector3();
    const rayDir = new THREE.Vector3();
    this.camera.getWorldPosition(rayOrigin);
    this.camera.getWorldDirection(rayDir);

    // Apply subtle free-aim lag / hipfire spread
    const baseSpread = this.isAds ? 0.0012 : this.isCanted ? 0.0045 : 0.016;
    const moveSpread = Math.hypot(controller.velocity.x, controller.velocity.z) * (this.isAds ? 0.0008 : 0.0028);
    const totalSpread = (baseSpread + moveSpread) * (controller.crouching ? 0.75 : 1.0);

    rayDir.x += (Math.random() - 0.5) * totalSpread;
    rayDir.y += (Math.random() - 0.5) * totalSpread;
    rayDir.z += (Math.random() - 0.5) * totalSpread;
    rayDir.normalize();

    const raycaster = new THREE.Raycaster(rayOrigin, rayDir, 0.1, 140);
    const targets = [...this.map.raycastTargets, ...enemies.getHitboxMeshes()];
    const hits = raycaster.intersectObjects(targets, false);

    let endPoint = rayOrigin.clone().addScaledVector(rayDir, 90);
    if (hits.length > 0) {
      const hit = hits[0];
      endPoint = hit.point;
      const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);

      if (hit.object.userData.enemyRef) {
        this.shotsHit++;
        const enemy = hit.object.userData.enemyRef;
        const zone = hit.object.userData.hitZone || 'torso';
        const dmg = zone === 'head' ? w.damage * w.headMult : zone === 'limb' ? w.damage * 0.75 : w.damage;
        const killed = enemies.applyDamage(enemy, dmg, zone, rayDir, hit.point);
        this.sound.playImpact(zone === 'head' ? 'headshot' : 'body', hit.point);
        this._spawnImpactFX(hit.point, normal, zone === 'head' ? 'headshot' : 'body');
        this.onHitConfirm?.(killed, zone === 'head');
      } else {
        const surf = hit.object.userData.surfaceType || 'concrete';
        this.sound.playImpact(surf, hit.point);
        this._spawnImpactFX(hit.point, normal, surf);
      }
    }

    this._spawnTracer(muzzleWorld, endPoint);
  }

  update(dt, timeSec, controller, enemies) {
    this.fireTimer = Math.max(0, this.fireTimer - dt);

    // Muzzle flash fade
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleSprite.material.opacity = 0;
        this.muzzleLight.intensity = 0;
      }
    }

    // Weapon Switch Animation
    let switchDropY = 0;
    if (this.switching) {
      this.switchTime += dt;
      if (this.switchTime >= 0.22 && this.pendingSwitchId) {
        this._selectVisual(this.pendingSwitchId);
        this.pendingSwitchId = null;
        this.sound.playReloadStage('mag_release', this.activeId);
      }
      if (this.switchTime >= 0.45) {
        this.switching = false;
      }
      const p = this.switchTime / 0.45;
      switchDropY = -Math.sin(p * Math.PI) * 0.26;
    }

    // Firing check
    const w = this.current;
    if (!controller.enabled || this.reloading || this.switching) {
      this.pendingTapShot = false;
    }
    const canFire =
      controller.enabled &&
      !this.reloading &&
      !this.switching &&
      !controller.sprinting &&
      this.fireTimer <= 0;

    const wantFire = this.triggerDown || this.pendingTapShot;
    if (canFire && wantFire) {
      this.pendingTapShot = false;
      if (w.fireMode === 'SEMI' && this.semiShotConsumed) {
        // Wait for trigger release
      } else if (w.mag > 0 || w.chambered) {
        this._fireShot(controller, enemies);
        if (w.fireMode === 'SEMI') this.semiShotConsumed = true;
        this.inspecting = false;
      } else {
        // Dry fire click!
        this.sound.playDryFire();
        this.semiShotConsumed = true;
        this.fireTimer = 0.22;
      }
    }

    // ADS & Cant & Sprint transitions
    const adsTarget = !this.reloading && !controller.sprinting && !this.inspecting && this.isAds ? 1 : 0;
    const cantTarget = adsTarget > 0.1 && this.isCanted ? 1 : 0;
    this.adsLerp = THREE.MathUtils.lerp(this.adsLerp, adsTarget, Math.min(1, dt * 13));
    this.cantLerp = THREE.MathUtils.lerp(this.cantLerp, cantTarget, Math.min(1, dt * 13));
    this.sprintLerp = THREE.MathUtils.lerp(this.sprintLerp, controller.sprinting ? 1 : 0, Math.min(1, dt * 9));

    // Smooth bodycam FOV shift during ADS (plus gentle vertical compensation on portrait phones)
    const isPortrait = this.camera.aspect < 1.0;
    const portraitFovBoost = isPortrait ? Math.min(18, (1.0 - this.camera.aspect) * 32) : 0;
    const targetFov =
      THREE.MathUtils.lerp(w.hipFov, w.adsFov, this.adsLerp * (1 - this.cantLerp * 0.45)) + portraitFovBoost;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 12));
      this.camera.updateProjectionMatrix();
    }

    // Weapon Free-Aim Inertial Lag
    const lagGain = this.isAds ? 0.012 : 0.036;
    this.lagX = THREE.MathUtils.lerp(this.lagX, THREE.MathUtils.clamp(-controller.lookDeltaX * 1.4, -0.04, 0.04), Math.min(1, dt * 14));
    this.lagY = THREE.MathUtils.lerp(this.lagY, THREE.MathUtils.clamp(controller.lookDeltaY * 1.4, -0.04, 0.04), Math.min(1, dt * 14));
    this.lagRotY = THREE.MathUtils.lerp(this.lagRotY, THREE.MathUtils.clamp(-controller.lookDeltaX * 2.2, -0.14, 0.14), Math.min(1, dt * 12));
    this.lagRotX = THREE.MathUtils.lerp(this.lagRotX, THREE.MathUtils.clamp(-controller.lookDeltaY * 2.2, -0.12, 0.12), Math.min(1, dt * 12));

    // Recoil spring return
    this.recoilZ = THREE.MathUtils.lerp(this.recoilZ, 0, Math.min(1, dt * 16));
    this.recoilRotX = THREE.MathUtils.lerp(this.recoilRotX, 0, Math.min(1, dt * 14));
    this.recoilRandZ = THREE.MathUtils.lerp(this.recoilRandZ, 0, Math.min(1, dt * 14));

    if (!this.boltLockedBack) {
      this.boltOffset = THREE.MathUtils.lerp(this.boltOffset, 0, Math.min(1, dt * 38));
    }
    this.rifleBolt.position.z = 0.01 + this.boltOffset;
    this.pistolSlide.position.z = -0.025 + this.boltOffset * 0.85;

    // Locomotion figure-8 weapon bob
    const hSpeed = Math.hypot(controller.velocity.x, controller.velocity.z);
    const moveFactor = Math.min(1, hSpeed / 4.5) * (1 - this.adsLerp * 0.78);
    const swayX = Math.cos(controller.stridePhase) * 0.014 * moveFactor + Math.sin(timeSec * 1.4) * 0.002;
    const swayY = Math.abs(Math.sin(controller.stridePhase)) * -0.014 * moveFactor + Math.cos(timeSec * 1.9) * 0.0018;

    // Base Pose (Hip vs Holographic ADS vs Canted Laser vs Low-Ready Sprint)
    const isRifle = this.activeId === 'rifle';
    const hipPos = isRifle
      ? new THREE.Vector3(isPortrait ? 0.112 : 0.145, -0.155, -0.26)
      : new THREE.Vector3(isPortrait ? 0.092 : 0.115, -0.115, -0.22);
    const adsPos = isRifle ? new THREE.Vector3(0.0, -0.095, -0.185) : new THREE.Vector3(0.0, -0.059, -0.22);
    const cantPos = isRifle ? new THREE.Vector3(0.045, -0.105, -0.22) : new THREE.Vector3(0.032, -0.062, -0.20);

    const targetAdsPos = adsPos.clone().lerp(cantPos, this.cantLerp);
    const basePos = hipPos.clone().lerp(targetAdsPos, this.adsLerp);

    // Sprint low-ready pose
    basePos.x = THREE.MathUtils.lerp(basePos.x, 0.06, this.sprintLerp);
    basePos.y = THREE.MathUtils.lerp(basePos.y, -0.24, this.sprintLerp);
    basePos.z = THREE.MathUtils.lerp(basePos.z, -0.22, this.sprintLerp);

    let rotX = 0;
    let rotY = 0;
    let rotZ = 0;

    // Sprint diagonal across chest
    rotX = THREE.MathUtils.lerp(rotX, -0.26, this.sprintLerp);
    rotY = THREE.MathUtils.lerp(rotY, 0.68, this.sprintLerp);
    rotZ = THREE.MathUtils.lerp(rotZ, 0.22, this.sprintLerp);

    // Cant roll when aiming with PEQ-15 laser
    rotZ += this.cantLerp * 0.68 * this.adsLerp;

    // Default Hand positions
    const lHandPos = isRifle ? new THREE.Vector3(-0.008, -0.024, -0.21) : new THREE.Vector3(-0.014, -0.068, 0.045);
    const magLocalPos = isRifle ? new THREE.Vector3(0, -0.055, -0.015) : new THREE.Vector3(0, -0.075, 0.048);
    let chargePull = 0;

    // === MULTI-STAGE VISUAL RELOAD CHOREOGRAPHY ===
    if (this.reloading) {
      this.reloadTime += dt;
      const p = Math.min(1, this.reloadTime / this.reloadDuration);

      if (this.reloadDry) {
        // DRY RELOAD: Tilt steeply inboard -> drop empty mag -> seat fresh mag -> slap bolt release!
        const tilt = Math.sin(Math.min(1, p * 1.15) * Math.PI);
        basePos.lerp(new THREE.Vector3(0.05, -0.145, -0.25), tilt * 0.72);
        rotZ += tilt * 0.72;
        rotY += tilt * 0.36;
        rotX += tilt * 0.18;

        if (p > 0.06) this._triggerStageOnce('rel', () => this.sound.playReloadStage('mag_release', this.activeId));
        if (p > 0.18) {
          this._triggerStageOnce('drop', () => {
            this.sound.playReloadStage('mag_drop', this.activeId);
            this._spawnDroppedMag();
          });
        }
        if (p >= 0.18 && p < 0.45) {
          // Mag dropped out of sight
          magLocalPos.y -= 0.45;
        } else if (p >= 0.45 && p < 0.65) {
          // Fresh loaded magazine rises into magwell!
          const k = (p - 0.45) / 0.2;
          const ease = 1 - Math.pow(1 - k, 3);
          magLocalPos.y -= (1 - ease) * 0.32;
          lHandPos.set(-0.02, magLocalPos.y - 0.06, magLocalPos.z);
        }
        if (p > 0.62) {
          this._triggerStageOnce('in', () => {
            this.sound.playReloadStage('mag_in', this.activeId);
            controller.addRecoil(-0.012, 0.004, -0.015);
          });
        }
        if (p >= 0.65 && p < 0.85) {
          // Left hand reaches up to bolt catch / charging handle & slaps!
          const k = Math.sin(((p - 0.65) / 0.2) * Math.PI);
          lHandPos.lerp(new THREE.Vector3(-0.04, 0.04, 0.04), k);
          if (p > 0.74 && p < 0.8) chargePull = (p - 0.74) * 0.4;
        }
        if (p > 0.78) {
          this._triggerStageOnce('bolt', () => {
            this.sound.playReloadStage('bolt_release', this.activeId);
            this.boltLockedBack = false;
            this.boltOffset = 0;
            controller.addRecoil(0.016, -0.006, 0.022);
          });
        }
      } else {
        // TACTICAL RELOAD: Keep 1 in chamber, swap partial mag + baseplate slap!
        const tilt = Math.sin(p * Math.PI);
        basePos.lerp(new THREE.Vector3(0.06, -0.145, -0.24), tilt * 0.65);
        rotZ += tilt * 0.58;
        rotY += tilt * 0.28;

        if (p > 0.08) this._triggerStageOnce('rel', () => this.sound.playReloadStage('mag_release', this.activeId));
        if (p > 0.22) this._triggerStageOnce('out', () => this.sound.playReloadStage('mag_out', this.activeId));

        if (p >= 0.2 && p < 0.46) {
          const k = (p - 0.2) / 0.26;
          magLocalPos.y -= k * 0.34;
          lHandPos.set(-0.015, magLocalPos.y - 0.05, magLocalPos.z);
        } else if (p >= 0.46 && p < 0.74) {
          const k = (p - 0.46) / 0.28;
          const ease = 1 - Math.pow(1 - k, 3);
          magLocalPos.y -= (1 - ease) * 0.34;
          lHandPos.set(-0.015, magLocalPos.y - 0.05, magLocalPos.z);
        }
        if (p > 0.72) {
          this._triggerStageOnce('in', () => {
            this.sound.playReloadStage('mag_in', this.activeId);
            controller.addRecoil(-0.01, 0.003, -0.012);
          });
        }
        if (p > 0.84) {
          this._triggerStageOnce('slap', () => {
            this.sound.playReloadStage('mag_slap', this.activeId);
            controller.addRecoil(-0.014, 0.004, -0.01);
          });
        }
      }

      if (p >= 1.0) {
        this._completeReload();
      }
    }

    // === WEAPON INSPECTION ===
    if (this.inspecting) {
      this.inspectTime += dt;
      const p = Math.min(1, this.inspectTime / this.inspectDuration);
      const env = Math.sin(p * Math.PI);
      basePos.lerp(new THREE.Vector3(0.02, -0.1, -0.22), env * 0.8);
      rotY += Math.sin(p * Math.PI * 2) * 0.65 * env;
      rotZ += 0.52 * env;
      rotX += 0.14 * env;
      if (p >= 1.0) this.inspecting = false;
    }

    // Apply transforms to WeaponPivot & subparts
    this.rifleMagGroup.position.copy(magLocalPos);
    this.pistolMagGroup.position.copy(magLocalPos);
    this.rifleChargingHandle.position.z = 0.148 + chargePull;
    this.leftArmGroup.position.lerp(lHandPos, Math.min(1, dt * 18));

    this.weaponPivot.position.set(
      basePos.x + swayX + this.lagX * (1 - this.adsLerp * 0.75),
      basePos.y + swayY + this.lagY * (1 - this.adsLerp * 0.75) + switchDropY,
      basePos.z + this.recoilZ
    );

    this.weaponPivot.rotation.set(
      rotX + this.recoilRotX + this.lagRotX * (1 - this.adsLerp * 0.72),
      rotY + this.lagRotY * (1 - this.adsLerp * 0.72),
      rotZ + this.recoilRandZ,
      'YXZ'
    );

    // Update PEQ-15 Tactical Laser Raycast to hit walls/enemies accurately
    if (this.laserOn) {
      const origin = new THREE.Vector3();
      const fwd = new THREE.Vector3(0, 0, -1);
      if (isRifle) {
        this.rifleMuzzle.getWorldPosition(origin);
        this.rifleGroup.getWorldDirection(fwd);
        fwd.negate(); // Three.js Object3D +Z is back, gun points -Z
      } else {
        this.pistolMuzzle.getWorldPosition(origin);
        this.pistolGroup.getWorldDirection(fwd);
        fwd.negate();
      }
      // Actually compute exact forward vector of weaponPivot in world space
      const worldQ = new THREE.Quaternion();
      this.weaponPivot.getWorldQuaternion(worldQ);
      fwd.set(0, 0, -1).applyQuaternion(worldQ).normalize();

      const laserRay = new THREE.Raycaster(origin, fwd, 0.05, 55);
      const targets = [...this.map.raycastTargets, ...enemies.getHitboxMeshes()];
      const hits = laserRay.intersectObjects(targets, false);
      const hitPt = hits.length > 0 ? hits[0].point : origin.clone().addScaledVector(fwd, 45);

      const posAttr = this.laserLine.geometry.attributes.position;
      posAttr.setXYZ(0, origin.x, origin.y, origin.z);
      posAttr.setXYZ(1, hitPt.x, hitPt.y, hitPt.z);
      posAttr.needsUpdate = true;

      this.laserDot.position.copy(hitPt).addScaledVector(fwd, -0.02);
    }

    this._updatePools(dt);
  }

  _completeReload() {
    this.reloading = false;
    const w = this.current;
    if (!w.chambered && w.reserve > 0) {
      w.chambered = true;
      w.reserve--;
    }
    const needed = w.magSize - w.mag;
    const load = Math.min(needed, w.reserve);
    w.mag += load;
    w.reserve -= load;
    this.boltLockedBack = false;
    this.boltOffset = 0;
  }

  _updatePools(dt) {
    // Brass Shells
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
        continue;
      }
      s.vel.y -= 14.5 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.rotVel.x * dt;
      s.mesh.rotation.y += s.rotVel.y * dt;
      s.mesh.rotation.z += s.rotVel.z * dt;

      const floorY = this.map.getFloorHeight(s.mesh.position.x, s.mesh.position.z, s.mesh.position.y) + 0.008;
      if (s.mesh.position.y <= floorY) {
        s.mesh.position.y = floorY;
        if (Math.abs(s.vel.y) > 0.65 && s.bounces < 2) {
          this.sound.playShellClink(s.mesh.position);
          s.bounces++;
        }
        s.vel.y = Math.abs(s.vel.y) * 0.42;
        s.vel.x *= 0.65;
        s.vel.z *= 0.65;
        s.rotVel.multiplyScalar(0.5);
      }
    }

    // Dropped Empty Mags
    for (let i = this.droppedMags.length - 1; i >= 0; i--) {
      const m = this.droppedMags[i];
      m.life -= dt;
      if (m.life <= 0) {
        this.scene.remove(m.mesh);
        this.droppedMags.splice(i, 1);
        continue;
      }
      m.vel.y -= 15.0 * dt;
      m.mesh.position.addScaledVector(m.vel, dt);
      if (!m.bounced) {
        m.mesh.rotation.x += m.rotVel.x * dt;
        m.mesh.rotation.z += m.rotVel.z * dt;
      }
      const floorY = this.map.getFloorHeight(m.mesh.position.x, m.mesh.position.z, m.mesh.position.y) + 0.03;
      if (m.mesh.position.y <= floorY) {
        m.mesh.position.y = floorY;
        m.vel.y = Math.abs(m.vel.y) * 0.25;
        m.vel.x *= 0.5;
        m.vel.z *= 0.5;
        m.bounced = true;
      }
    }

    // Impact Particles & Gunsmoke
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const frac = p.life / p.maxLife;
      p.sprite.material.opacity = frac * 0.75;
      if (p.grow > 0) {
        p.sprite.scale.addScalar(p.grow * dt);
      }
    }

    // Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        tr.line.material.opacity = (tr.life / tr.maxLife) * 0.72;
      }
    }
  }
}
