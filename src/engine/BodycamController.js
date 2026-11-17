import * as THREE from 'three';

export class BodycamController {
  constructor(camera, domElement, map, sound) {
    this.camera = camera;
    this.domElement = domElement;
    this.map = map;
    this.sound = sound;

    // Player physical state
    this.position = new THREE.Vector3(0, 0, 20.5); // Feet position
    this.velocity = new THREE.Vector3();
    this.yaw = 0; // Facing North (-Z)
    this.pitch = 0.02;

    this.standEyeHeight = 1.64; // Chest/shoulder-head bodycam perspective
    this.crouchEyeHeight = 1.06;
    this.currentEyeHeight = this.standEyeHeight;

    this.radius = 0.38;
    this.grounded = true;
    this.crouching = false;
    this.sprinting = false;
    this.leanTarget = 0; // -1 left, +1 right
    this.leanCurrent = 0;

    // Movement & bodycam dynamics
    this.sensitivity = 1.0;
    this.bodycamProfile = 'realistic';
    this.stridePhase = 0;
    this.lastStepHalf = 0;
    this.footImpactDip = 0;
    this.footImpactVel = 0;

    this.turnRoll = 0;
    this.strafeRoll = 0;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.rawDeltaX = 0;
    this.rawDeltaY = 0;

    // Recoil & camera shock
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilRoll = 0;
    this.damageShake = 0;
    this.trauma = 0;

    // Input state
    this.keys = new Set();
    this.isLocked = false;
    this.pointerLockBlocked = false;
    this.disablePointerLock = false;
    this.draggingLook = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.enabled = false;

    // Mobile Touch State
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchSprint = false;
    this.touchCrouchToggle = false;
    this.touchLeanToggle = 0;
    this.touchJumpQueued = false;
    this.touchLookDX = 0;
    this.touchLookDY = 0;

    this.forwardVec = new THREE.Vector3();
    this.rightVec = new THREE.Vector3();
    this.upVec = new THREE.Vector3(0, 1, 0);

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
        this.touchCrouchToggle = false;
      }
      if (e.code === 'KeyQ' || e.code === 'KeyE') {
        this.touchLeanToggle = 0;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('pointerlockerror', () => {
      this.pointerLockBlocked = true;
      this.isLocked = false;
    });

    this.hasMousePos = false;
    this.cursorNormX = 0.5;

    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (e.sourceCapabilities?.firesTouchEvents) return;
      this.hasMousePos = true;
      this.cursorNormX = e.clientX / Math.max(1, window.innerWidth);
      if (this.isLocked) {
        this.rawDeltaX += e.movementX || 0;
        this.rawDeltaY += e.movementY || 0;
      } else if (this.draggingLook || this.pointerLockBlocked) {
        if (!this.lastMouseValid) {
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
          this.lastMouseValid = true;
          return;
        }
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.rawDeltaX += dx * 1.25;
        this.rawDeltaY += dy * 1.25;
      }
    });

    this.domElement.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.sourceCapabilities?.firesTouchEvents) return;
      if (!this.isLocked) {
        this.draggingLook = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.lastMouseValid = true;
        this.requestLock();
      }
    });

    window.addEventListener('mouseup', () => {
      this.draggingLook = false;
    });
  }

  requestLock() {
    if (this.pointerLockBlocked || this.disablePointerLock) return;
    try {
      const res = this.domElement.requestPointerLock?.();
      if (res && typeof res.catch === 'function') {
        res.catch(() => {
          this.pointerLockBlocked = true;
        });
      }
    } catch {
      this.pointerLockBlocked = true;
    }
  }

  setTouchMove(x, y, autoSprint = false) {
    this.touchMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.touchMoveY = THREE.MathUtils.clamp(y, -1, 1);
    this.touchSprint = Boolean(autoSprint);
    this.hasMousePos = false;
  }

  addTouchLook(dx, dy) {
    this.touchLookDX += dx;
    this.touchLookDY += dy;
    this.hasMousePos = false;
  }

  toggleCrouch() {
    this.touchCrouchToggle = !this.touchCrouchToggle;
  }

  toggleLean(dir) {
    this.touchLeanToggle = this.touchLeanToggle === dir ? 0 : dir;
  }

  triggerJump() {
    this.touchJumpQueued = true;
  }

  reset() {
    this.position.set(0, 0, 20.5);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0.02;
    this.crouching = false;
    this.sprinting = false;
    this.currentEyeHeight = this.standEyeHeight;
    this.leanCurrent = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilRoll = 0;
    this.damageShake = 0;
    this.trauma = 0;
    this.keys.clear();
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchSprint = false;
    this.touchCrouchToggle = false;
    this.touchLeanToggle = 0;
    this.touchJumpQueued = false;
    this.touchLookDX = 0;
    this.touchLookDY = 0;
  }

  setProfile(profile) {
    this.bodycamProfile = profile;
  }

  addRecoil(pitchRad, yawRad, rollRad = 0) {
    this.recoilPitch += pitchRad;
    this.recoilYaw += yawRad;
    this.recoilRoll += rollRad;
  }

  addImpulse(traumaAmt, shakeAmt = 0.4) {
    this.trauma = Math.min(1.0, this.trauma + traumaAmt);
    this.damageShake = Math.min(1.0, this.damageShake + shakeAmt);
  }

  getStanceLabel() {
    if (Math.abs(this.leanCurrent) > 0.35) {
      return this.leanCurrent < 0 ? 'LEAN L' : 'LEAN R';
    }
    if (this.crouching) return 'CROUCH';
    if (this.sprinting) return 'SPRINT';
    return 'STAND';
  }

  update(dt, timeSec, isAds = false) {
    // Process accumulated mouse + touch look
    const sensScale = 0.0021 * this.sensitivity * (isAds ? 0.56 : 1.0);
    const totalDX = this.rawDeltaX + this.touchLookDX * 1.55;
    const totalDY = this.rawDeltaY + this.touchLookDY * 1.55;
    const dYaw = -totalDX * sensScale;
    const dPitch = -totalDY * sensScale;
    this.lookDeltaX = totalDX * sensScale;
    this.lookDeltaY = totalDY * sensScale;
    this.rawDeltaX = 0;
    this.rawDeltaY = 0;
    this.touchLookDX = 0;
    this.touchLookDY = 0;

    if (this.enabled) {
      let keyYaw = ((this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0)) * 2.0 * dt;
      const keyPitch = ((this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0)) * 1.4 * dt;
      if (!this.isLocked && this.hasMousePos && this.cursorNormX !== undefined) {
        if (this.cursorNormX < 0.08) keyYaw += (0.08 - this.cursorNormX) * 16 * dt;
        else if (this.cursorNormX > 0.92) keyYaw -= (this.cursorNormX - 0.92) * 16 * dt;
      }
      this.yaw += dYaw + keyYaw;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch + keyPitch, -1.42, 1.42);
    }

    // Crouch / Sprint / Lean state
    const keyCrouch = this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    const wantCrouch = keyCrouch || this.touchCrouchToggle;
    if (wantCrouch) {
      this.crouching = true;
    } else if (this.crouching) {
      if (this.map.hasHeadClearance(this.position.x, this.position.z, this.position.y, 1.72)) {
        this.crouching = false;
      }
    }

    const keyFwd = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const keyRight = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const moveFwd = THREE.MathUtils.clamp(keyFwd + this.touchMoveY, -1, 1);
    const moveRight = THREE.MathUtils.clamp(keyRight + this.touchMoveX, -1, 1);
    const moveMag = Math.min(1, Math.hypot(moveFwd, moveRight));
    const moving = moveMag > 0.05;

    this.sprinting =
      !this.crouching &&
      !isAds &&
      this.grounded &&
      ((moveFwd > 0 && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'))) ||
        (this.touchSprint && this.touchMoveY > 0.72));

    const keyLean = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
    this.leanTarget = keyLean !== 0 ? keyLean : this.touchLeanToggle;
    this.leanCurrent = THREE.MathUtils.lerp(this.leanCurrent, this.leanTarget, Math.min(1, dt * 11));

    // Smooth eye height interpolation
    const targetEye = (this.crouching ? this.crouchEyeHeight : this.standEyeHeight) - Math.abs(this.leanCurrent) * 0.06;
    this.currentEyeHeight = THREE.MathUtils.lerp(this.currentEyeHeight, targetEye, Math.min(1, dt * 12));

    // Horizontal movement
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const wishDir = new THREE.Vector3(
      -sinY * moveFwd + cosY * moveRight,
      0,
      -cosY * moveFwd - sinY * moveRight
    );
    if (wishDir.lengthSq() > 0.001) wishDir.normalize();

    let speed = 4.4;
    if (this.crouching) speed = 2.55;
    else if (this.sprinting) speed = 6.75;
    else if (isAds) speed = 2.85;
    speed *= moving ? Math.max(0.28, moveMag) : 1.0;

    const accel = this.grounded ? 14.0 : 4.0;
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, wishDir.x * speed, Math.min(1, dt * accel));
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, wishDir.z * speed, Math.min(1, dt * accel));

    // Jump
    if (this.enabled && this.grounded && (this.keys.has('Space') || this.touchJumpQueued)) {
      this.velocity.y = 5.4;
      this.grounded = false;
      this.footImpactVel -= 0.16;
    }
    this.touchJumpQueued = false;

    // Gravity
    this.velocity.y -= 17.5 * dt;

    // Integrate & resolve collisions
    const nextPos = this.position.clone();
    nextPos.x += this.velocity.x * dt;
    nextPos.z += this.velocity.z * dt;

    const capsuleHeight = this.crouching ? 1.15 : 1.72;
    this.map.resolveHorizontalCollision(nextPos, this.radius, nextPos.y, capsuleHeight);

    nextPos.y += this.velocity.y * dt;
    const floorH = this.map.getFloorHeight(nextPos.x, nextPos.z, this.position.y);

    if (nextPos.y <= floorH) {
      if (!this.grounded && this.velocity.y < -2.2) {
        // Landing impact thud
        const impact = Math.min(1.0, Math.abs(this.velocity.y) / 9);
        this.footImpactVel -= 0.28 * impact;
        this.sound.playFootstep(true, this.map.isWetSpot(nextPos.x, nextPos.z), true);
      }
      nextPos.y = floorH;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (nextPos.y > floorH + 0.06) {
      this.grounded = false;
    }

    this.position.copy(nextPos);

    // Bodycam locomotion stride & footstep sync
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && horizSpeed > 0.45 && moving) {
      const freq = this.sprinting ? 3.15 : this.crouching ? 1.85 : 2.35;
      this.stridePhase += horizSpeed * dt * freq * 0.65;
      const stepHalf = Math.floor(this.stridePhase / Math.PI);
      if (stepHalf !== this.lastStepHalf) {
        this.lastStepHalf = stepHalf;
        this.footImpactVel -= this.sprinting ? 0.13 : this.crouching ? 0.04 : 0.08;
        this.sound.playFootstep(this.sprinting, this.map.isWetSpot(this.position.x, this.position.z), true);
      }
    }

    // Foot impact spring-damper
    const springK = 140;
    const springD = 16;
    const force = -springK * this.footImpactDip - springD * this.footImpactVel;
    this.footImpactVel += force * dt;
    this.footImpactDip += this.footImpactVel * dt;

    // Recoil recovery
    const recDecay = Math.min(1, dt * 11.5);
    this.recoilPitch = THREE.MathUtils.lerp(this.recoilPitch, 0, recDecay);
    this.recoilYaw = THREE.MathUtils.lerp(this.recoilYaw, 0, recDecay);
    this.recoilRoll = THREE.MathUtils.lerp(this.recoilRoll, 0, recDecay);
    this.damageShake = Math.max(0, this.damageShake - dt * 2.8);
    this.trauma = Math.max(0, this.trauma - dt * 1.9);

    // Profile intensity scaling
    const swayMult = this.bodycamProfile === 'extreme' ? 1.45 : this.bodycamProfile === 'tactical' ? 0.55 : 1.0;

    // Bodycam rotational inertia from turning & strafing
    const targetStrafeRoll = -moveRight * (isAds ? 0.012 : 0.036) * swayMult;
    this.strafeRoll = THREE.MathUtils.lerp(this.strafeRoll, targetStrafeRoll, Math.min(1, dt * 8));

    const targetTurnRoll = THREE.MathUtils.clamp(-this.lookDeltaX * 1.65 * swayMult, -0.09, 0.09);
    this.turnRoll = THREE.MathUtils.lerp(this.turnRoll, targetTurnRoll, Math.min(1, dt * 10));

    // Organic breathing + stride sway
    const walkAmt = Math.min(1, horizSpeed / 4.8) * (this.grounded ? 1 : 0.15);
    const breathY = Math.sin(timeSec * 1.55) * 0.009 * swayMult;
    const breathRoll = Math.cos(timeSec * 0.85) * 0.005 * swayMult;

    const bobY = Math.abs(Math.sin(this.stridePhase)) * -0.048 * walkAmt * swayMult + this.footImpactDip * 0.45;
    const bobX = Math.cos(this.stridePhase) * 0.028 * walkAmt * swayMult;
    const bobRoll = Math.sin(this.stridePhase) * (this.sprinting ? 0.026 : 0.011) * walkAmt * swayMult;
    const bobPitch = Math.sin(this.stridePhase * 2) * 0.006 * walkAmt * swayMult;

    // Apply lean lateral offset with wall safety check
    let leanWorldOffset = this.leanCurrent * 0.36;
    if (Math.abs(leanWorldOffset) > 0.02) {
      const testPos = this.position.clone();
      testPos.x += cosY * leanWorldOffset;
      testPos.z += -sinY * leanWorldOffset;
      this.map.resolveHorizontalCollision(testPos, 0.22, this.position.y, 1.5);
      const actualDx = testPos.x - this.position.x;
      const actualDz = testPos.z - this.position.z;
      leanWorldOffset = actualDx * cosY - actualDz * sinY;
    }

    const shakeP = (Math.random() - 0.5) * this.damageShake * 0.06;
    const shakeY = (Math.random() - 0.5) * this.damageShake * 0.06;
    const shakeR = (Math.random() - 0.5) * (this.damageShake * 0.09 + this.trauma * 0.03);

    // Position camera cleanly in world space
    this.camera.position.set(
      this.position.x + cosY * (leanWorldOffset + bobX),
      this.position.y + this.currentEyeHeight + breathY + bobY,
      this.position.z - sinY * (leanWorldOffset + bobX)
    );

    const leanRoll = -this.leanCurrent * 0.235;
    const finalPitch = this.pitch + this.recoilPitch + bobPitch + shakeP + this.footImpactDip * 0.22;
    const finalYaw = this.yaw + this.recoilYaw + shakeY;
    const finalRoll = leanRoll + this.strafeRoll + this.turnRoll + breathRoll + bobRoll + this.recoilRoll + shakeR;

    const euler = new THREE.Euler(finalPitch, finalYaw, finalRoll, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // Sync spatial audio listener vectors
    this.camera.getWorldDirection(this.forwardVec);
    this.upVec.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();
    this.sound.updateListener(this.camera.position, this.forwardVec, this.upVec);
  }
}
