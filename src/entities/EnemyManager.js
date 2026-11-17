import * as THREE from 'three';

export class EnemyManager {
  constructor(scene, map, textures, sound) {
    this.scene = scene;
    this.map = map;
    this.textures = textures;
    this.sound = sound;

    this.enemies = [];
    this.pendingSpawns = [];
    this.enemyTracers = [];

    this.wave = 1;
    this.waveActive = false;
    this.waveCooldown = 0;
    this.kills = 0;
    this.headshots = 0;

    this.onComms = null;
    this.onWaveCleared = null;
    this.onPlayerHit = null;

    this._buildSharedAssets();
  }

  _buildSharedAssets() {
    this.armorMat = this.textures.getGunmetal(0x282d27, 0.78, 0.14);
    this.gearMat = this.textures.getGunmetal(0x1c1e21, 0.84, 0.12);
    this.clothMat = this.textures.getGunmetal(0x3a3f38, 0.9, 0.05);
    this.helmetMat = this.textures.getGunmetal(0x232629, 0.52, 0.35);
    this.skinMat = new THREE.MeshStandardMaterial({ color: 0x6b5344, roughness: 0.85, metalness: 0.02 });
    this.visorMat = new THREE.MeshStandardMaterial({
      color: 0x1a222a,
      roughness: 0.15,
      metalness: 0.85,
      emissive: 0x220804,
      emissiveIntensity: 0.5
    });
    this.gunMat = this.textures.getGunmetal(0x181a1d, 0.38, 0.86);
    this.flashTex = this.textures.getParticleTextures().muzzleFlash;
  }

  reset() {
    for (const e of this.enemies) {
      this.scene.remove(e.root);
      if (e.coverNode && e.coverNode.occupiedBy === e) e.coverNode.occupiedBy = null;
    }
    this.enemies = [];
    this.pendingSpawns = [];
    for (const tr of this.enemyTracers) {
      this.scene.remove(tr.line);
      tr.line.geometry.dispose();
      tr.line.material.dispose();
    }
    this.enemyTracers = [];

    this.wave = 0;
    this.waveActive = false;
    this.waveCooldown = 1.5;
    this.kills = 0;
    this.headshots = 0;
  }

  startNextWave(playerPos, camera) {
    this.wave++;
    this.waveActive = true;
    const totalCount = Math.min(14, 3 + this.wave * 2);

    // Choose 1 or 2 out-of-sight breach portals
    const portals = this._pickOccludedPortals(playerPos, camera, this.wave >= 3 ? 2 : 1);

    portals.forEach((portal, pIdx) => {
      const teamCount = pIdx === 0 ? Math.ceil(totalCount / portals.length) : Math.floor(totalCount / portals.length);
      this.map.triggerBeaconAlert(portal.beaconIndex);
      this.sound.playBreachCue(portal.pos);

      for (let i = 0; i < teamCount; i++) {
        this.pendingSpawns.push({
          portal,
          delay: 0.65 + i * 0.95 + pIdx * 0.6,
          role: i % 3 === 1 ? 'flanker' : 'assault'
        });
      }
    });

    const leadPortal = portals[0];
    this.sound.playBodycamChirp('comms');
    this.onComms?.(`WAVE ${String(this.wave).padStart(2, '0')} // BREACH DETECTED: ${leadPortal.name}`, true);
  }

  _pickOccludedPortals(playerPos, camera, count) {
    const raycaster = new THREE.Raycaster();
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    if (camera) {
      camera.updateMatrixWorld();
      projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreenMatrix);
    }

    const scored = this.map.breachPortals.map((portal) => {
      const dist = portal.pos.distanceTo(playerPos);
      const eyeTarget = portal.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
      const inFrustum = camera ? frustum.containsPoint(eyeTarget) : false;

      // Raycast check from player eye to portal
      const eyeStart = playerPos.clone().add(new THREE.Vector3(0, 1.6, 0));
      const dir = eyeTarget.clone().sub(eyeStart);
      const len = dir.length();
      dir.normalize();
      raycaster.set(eyeStart, dir);
      raycaster.far = len - 0.5;
      const blocked = raycaster.intersectObjects(this.map.raycastTargets, false).length > 0;

      let score = dist;
      if (blocked) score += 45;
      if (!inFrustum) score += 35;
      if (dist < 14) score -= 60;
      score += Math.random() * 8;
      return { portal, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count).map((s) => s.portal);
  }

  _createEnemyModel(enemyRef) {
    const root = new THREE.Group();
    const bodyPivot = new THREE.Group();
    root.add(bodyPivot);

    // Legs (pivoted at hip y = 0.88)
    const legGeo = new THREE.BoxGeometry(0.18, 0.86, 0.2);
    const lLegPivot = new THREE.Group();
    lLegPivot.position.set(-0.12, 0.88, 0);
    const lLeg = new THREE.Mesh(legGeo, this.clothMat);
    lLeg.position.y = -0.43;
    lLeg.castShadow = true;
    lLegPivot.add(lLeg);
    bodyPivot.add(lLegPivot);

    const rLegPivot = new THREE.Group();
    rLegPivot.position.set(0.12, 0.88, 0);
    const rLeg = new THREE.Mesh(legGeo, this.clothMat);
    rLeg.position.y = -0.43;
    rLeg.castShadow = true;
    rLegPivot.add(rLeg);
    bodyPivot.add(rLegPivot);

    // Torso / Plate Carrier Vest
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 1.24, 0);
    bodyPivot.add(torsoGroup);

    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.26), this.armorMat);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    torsoMesh.userData = { enemyRef, hitZone: 'torso' };
    torsoGroup.add(torsoMesh);

    // Chest mag pouches
    const pouches = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.08), this.gearMat);
    pouches.position.set(0, -0.06, 0.15);
    torsoGroup.add(pouches);

    // Head + Ballistic Helmet + Tactical Goggles
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.42, 0);
    torsoGroup.add(headGroup);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.23), this.skinMat);
    headMesh.castShadow = true;
    headMesh.userData = { enemyRef, hitZone: 'head' };
    headGroup.add(headMesh);

    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.26), this.helmetMat);
    helmet.position.set(0, 0.07, -0.01);
    helmet.castShadow = true;
    helmet.userData = { enemyRef, hitZone: 'head' };
    headGroup.add(helmet);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.07, 0.05), this.visorMat);
    visor.position.set(0, 0.01, 0.115);
    visor.userData = { enemyRef, hitZone: 'head' };
    headGroup.add(visor);

    // Arms + Tactical Carbine
    const armsPivot = new THREE.Group();
    armsPivot.position.set(0, 0.16, 0.08);
    torsoGroup.add(armsPivot);

    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.46), this.clothMat);
    rArm.position.set(0.22, -0.04, 0.18);
    rArm.userData = { enemyRef, hitZone: 'limb' };
    armsPivot.add(rArm);

    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.48), this.clothMat);
    lArm.position.set(-0.14, -0.06, 0.25);
    lArm.rotation.y = 0.45;
    lArm.userData = { enemyRef, hitZone: 'limb' };
    armsPivot.add(lArm);

    // Enemy Weapon
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.66), this.gunMat);
    gun.position.set(0.12, -0.03, 0.36);
    gun.castShadow = true;
    armsPivot.add(gun);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0.12, -0.01, 0.72);
    armsPivot.add(muzzle);

    const muzzleSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.flashTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0
      })
    );
    muzzleSprite.position.copy(muzzle.position);
    muzzleSprite.scale.set(0.45, 0.45, 0.45);
    armsPivot.add(muzzleSprite);

    const muzzleLight = new THREE.PointLight(0xffaa44, 0, 11, 1.8);
    muzzleLight.position.copy(muzzle.position);
    armsPivot.add(muzzleLight);

    // Subtle Red Tactical Aim Laser (visible telegraph before enemy fires!)
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 12)
    ]);
    const laserMat = new THREE.LineBasicMaterial({
      color: 0xff2e2e,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const aimLaser = new THREE.Line(laserGeo, laserMat);
    aimLaser.position.copy(muzzle.position);
    armsPivot.add(aimLaser);

    this.scene.add(root);
    return {
      root,
      bodyPivot,
      lLegPivot,
      rLegPivot,
      torsoGroup,
      headGroup,
      armsPivot,
      muzzle,
      muzzleSprite,
      muzzleLight,
      aimLaser,
      hitboxes: [torsoMesh, headMesh, helmet, visor, rArm, lArm]
    };
  }

  _spawnOperator(portal, role) {
    const enemy = {
      id: Math.random().toString(36).slice(2),
      pos: portal.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 1.4)),
      vel: new THREE.Vector3(),
      yaw: Math.atan2(portal.entryDir.x, portal.entryDir.z),
      hp: 100 + Math.min(40, this.wave * 8),
      maxHp: 100 + Math.min(40, this.wave * 8),
      role,
      state: 'BREACH',
      stateTimer: 0.8 + Math.random() * 0.6,
      crouching: false,
      suppressedTimer: 0,
      aimTelegraph: 0,
      burstRemaining: 0,
      fireCooldown: 0,
      flashTimer: 0,
      stridePhase: Math.random() * Math.PI * 2,
      lastStepHalf: 0,
      coverNode: null,
      alive: true,
      deathTime: 0,
      deathDir: new THREE.Vector3(0, 0, -1),
      flinchPitch: 0,
      mesh: null
    };

    enemy.mesh = this._createEnemyModel(enemy);
    enemy.mesh.root.position.copy(enemy.pos);
    enemy.mesh.root.rotation.y = enemy.yaw;
    this.enemies.push(enemy);
  }

  getHitboxMeshes() {
    const list = [];
    for (const e of this.enemies) {
      if (e.alive) {
        list.push(...e.mesh.hitboxes);
      }
    }
    return list;
  }

  getAliveCount() {
    return this.enemies.filter((e) => e.alive).length + this.pendingSpawns.length;
  }

  applyDamage(enemy, dmg, zone, hitDir, hitPoint) {
    if (!enemy.alive) return false;
    enemy.hp -= dmg;
    enemy.flinchPitch = zone === 'head' ? -0.35 : -0.18;
    enemy.suppressedTimer = 0.65;

    // Suppress nearby squadmates slightly when shots hit
    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.deathTime = 0;
      enemy.deathDir.copy(hitDir).setY(0).normalize();
      enemy.mesh.aimLaser.material.opacity = 0;
      enemy.mesh.muzzleLight.intensity = 0;
      enemy.mesh.muzzleSprite.material.opacity = 0;
      if (enemy.coverNode && enemy.coverNode.occupiedBy === enemy) {
        enemy.coverNode.occupiedBy = null;
      }

      this.kills++;
      if (zone === 'head') {
        this.headshots++;
      }
      return true;
    }
    return false;
  }

  _pickBestCover(enemy, playerPos) {
    if (enemy.coverNode && enemy.coverNode.occupiedBy === enemy) {
      enemy.coverNode.occupiedBy = null;
      enemy.coverNode = null;
    }

    let best = null;
    let bestScore = -Infinity;
    for (const node of this.map.coverNodes) {
      if (node.occupiedBy && node.occupiedBy !== enemy) continue;
      const dToPlayer = node.pos.distanceTo(playerPos);
      const dToSelf = node.pos.distanceTo(enemy.pos);

      let idealRange = enemy.role === 'flanker' ? 11.5 : 16.5;
      let score = -Math.abs(dToPlayer - idealRange) * 1.4 - dToSelf * 0.55;
      // Prefer similar height or catwalk ambush
      if (Math.abs(node.pos.y - enemy.pos.y) < 1.0) score += 6;
      if (dToPlayer < 5.5) score -= 25;
      score += Math.random() * 6;

      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }

    if (best) {
      best.occupiedBy = enemy;
      enemy.coverNode = best;
    }
    return best;
  }

  _hasLineOfSight(fromPos, toPos) {
    const start = fromPos.clone().add(new THREE.Vector3(0, 1.45, 0));
    const end = toPos.clone().add(new THREE.Vector3(0, 1.35, 0));
    const dir = end.clone().sub(start);
    const dist = dir.length();
    if (dist < 0.2) return true;
    dir.normalize();

    const ray = new THREE.Raycaster(start, dir, 0.2, dist - 0.25);
    const hits = ray.intersectObjects(this.map.raycastTargets, false);
    return hits.length === 0;
  }

  _fireEnemyShot(enemy, playerPos, controller) {
    const m = enemy.mesh;
    const muzzleWorld = new THREE.Vector3();
    m.muzzle.getWorldPosition(muzzleWorld);

    m.muzzleSprite.material.opacity = 0.92;
    m.muzzleSprite.material.rotation = Math.random() * Math.PI * 2;
    m.muzzleLight.intensity = 16;
    enemy.flashTimer = 0.045;

    this.sound.playGunshot('enemy', false, muzzleWorld);

    // Calculate player target point (slightly scattered for realistic gunfight)
    const targetEye = playerPos.clone().add(new THREE.Vector3(0, controller.crouching ? 0.95 : 1.38, 0));
    const dir = targetEye.clone().sub(muzzleWorld);
    const dist = dir.length();
    dir.normalize();

    // Accuracy scales mildly with distance & player movement speed
    const playerSpeed = Math.hypot(controller.velocity.x, controller.velocity.z);
    const spread = 0.048 + playerSpeed * 0.0065 + (enemy.suppressedTimer > 0 ? 0.06 : 0);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread * 0.8;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    const ray = new THREE.Raycaster(muzzleWorld, dir, 0.2, 85);
    const wallHits = ray.intersectObjects(this.map.raycastTargets, false);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : 85;

    // Distance from ray to player torso center
    const toPlayer = targetEye.clone().sub(muzzleWorld);
    const proj = toPlayer.dot(dir);
    let endPt = wallHits.length > 0 ? wallHits[0].point : muzzleWorld.clone().addScaledVector(dir, 60);

    if (proj > 0 && proj < wallDist) {
      const closestPt = muzzleWorld.clone().addScaledVector(dir, proj);
      const missDist = closestPt.distanceTo(targetEye);
      const hitRadius = controller.crouching ? 0.28 : 0.34;
      if (missDist <= hitRadius) {
        endPt = closestPt;
        const dmg = 11 + Math.min(8, this.wave * 1.2);
        this.onPlayerHit?.(dmg, muzzleWorld);
      } else if (missDist < 2.6) {
        // Bullet whizzes past player bodycam!
        this.sound.playBulletWhiz(closestPt);
      }
    }

    // Spawn enemy tracer
    const geo = new THREE.BufferGeometry().setFromPoints([muzzleWorld, endPt]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffaa66,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.enemyTracers.push({ line, life: 0.07, maxLife: 0.07 });
  }

  update(dt, timeSec, playerPos, camera, controller) {
    // Process wave spawning queue
    for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
      const sp = this.pendingSpawns[i];
      sp.delay -= dt;
      if (sp.delay <= 0) {
        this._spawnOperator(sp.portal, sp.role);
        this.pendingSpawns.splice(i, 1);
      }
    }

    // Wave cleared transition
    if (this.waveActive && this.enemies.every((e) => !e.alive) && this.pendingSpawns.length === 0) {
      this.waveActive = false;
      this.waveCooldown = 4.2;
      this.onWaveCleared?.(this.wave);
      this.sound.playBodycamChirp('comms');
      this.onComms?.(`SECTOR CLEAR // WAVE ${String(this.wave).padStart(2, '0')} NEUTRALIZED. REARMING...`, false);
    }

    if (!this.waveActive) {
      this.waveCooldown -= dt;
      if (this.waveCooldown <= 0) {
        this.startNextWave(playerPos, camera);
      }
    }

    // Update each enemy operator
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const m = e.mesh;

      if (!e.alive) {
        e.deathTime += dt;
        // Directional body collapse onto concrete floor
        const fall = Math.min(1, e.deathTime / 0.42);
        const ease = 1 - Math.pow(1 - fall, 2);
        m.bodyPivot.rotation.x = ease * 1.48;
        m.bodyPivot.position.y = -ease * 0.14;
        if (e.deathTime > 15) {
          this.scene.remove(m.root);
          this.enemies.splice(i, 1);
        }
        continue;
      }

      // Muzzle flash decay
      if (e.flashTimer > 0) {
        e.flashTimer -= dt;
        if (e.flashTimer <= 0) {
          m.muzzleSprite.material.opacity = 0;
          m.muzzleLight.intensity = 0;
        }
      }

      e.suppressedTimer = Math.max(0, e.suppressedTimer - dt);
      e.flinchPitch = THREE.MathUtils.lerp(e.flinchPitch, 0, Math.min(1, dt * 10));
      e.fireCooldown = Math.max(0, e.fireCooldown - dt);

      const distToPlayer = e.pos.distanceTo(playerPos);
      const hasLOS = distToPlayer < 46 && this._hasLineOfSight(e.pos, playerPos);

      // AI Tactical State Machine
      e.stateTimer -= dt;
      if (e.state === 'BREACH') {
        if (!e.coverNode) this._pickBestCover(e, playerPos);
        if (e.stateTimer <= 0 || hasLOS) {
          e.state = hasLOS ? 'ENGAGE' : 'ADVANCE';
          e.stateTimer = 2.2 + Math.random() * 1.8;
        }
      } else if (e.state === 'ADVANCE') {
        if (!e.coverNode || e.stateTimer <= 0) {
          this._pickBestCover(e, playerPos);
          e.stateTimer = 3.2 + Math.random() * 2.0;
        }
        if (hasLOS && distToPlayer < 28) {
          e.state = 'ENGAGE';
          e.stateTimer = 2.5 + Math.random() * 1.8;
        }
      } else if (e.state === 'ENGAGE') {
        if (!hasLOS) {
          if (e.stateTimer <= 0) {
            e.state = 'ADVANCE';
            this._pickBestCover(e, playerPos);
            e.stateTimer = 3.5;
          }
        } else if (e.stateTimer <= 0 && e.role === 'flanker' && Math.random() < 0.45) {
          e.state = 'ADVANCE';
          this._pickBestCover(e, playerPos);
          e.stateTimer = 2.4;
        }
      }

      // Target Movement Destination
      let moveTarget = e.coverNode ? e.coverNode.pos : playerPos;
      if (e.state === 'ENGAGE' && hasLOS && e.coverNode && e.pos.distanceTo(e.coverNode.pos) < 1.3) {
        // Hold cover position while trading fire
        moveTarget = null;
        e.crouching = e.suppressedTimer > 0 || (Math.sin(timeSec * 1.2 + e.pos.x) > 0.45);
      } else {
        e.crouching = false;
      }

      let movingSpeed = 0;
      if (moveTarget) {
        const toDest = moveTarget.clone().sub(e.pos);
        toDest.y = 0;
        const d = toDest.length();
        if (d > 0.65) {
          toDest.normalize();
          const speed = e.role === 'flanker' ? 4.1 : 3.2;
          // Simple obstacle whisker feeler to slide cleanly around pillars
          const probe = e.pos.clone().addScaledVector(toDest, 0.85);
          const probeBefore = probe.clone();
          this.map.resolveHorizontalCollision(probe, 0.45, e.pos.y, 1.7);
          const push = probe.sub(probeBefore);
          if (push.lengthSq() > 0.002) {
            toDest.addScaledVector(push.normalize(), 1.15).normalize();
          }

          e.vel.x = THREE.MathUtils.lerp(e.vel.x, toDest.x * speed, Math.min(1, dt * 8));
          e.vel.z = THREE.MathUtils.lerp(e.vel.z, toDest.z * speed, Math.min(1, dt * 8));
          movingSpeed = Math.hypot(e.vel.x, e.vel.z);
        } else {
          e.vel.multiplyScalar(0.8);
        }
      } else {
        e.vel.multiplyScalar(0.75);
      }

      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;
      this.map.resolveHorizontalCollision(e.pos, 0.4, e.pos.y, 1.72);
      const targetFloor = this.map.getFloorHeight(e.pos.x, e.pos.z, e.pos.y);
      e.pos.y = THREE.MathUtils.lerp(e.pos.y, targetFloor, Math.min(1, dt * 12));

      // Rotate smoothly toward player when engaged, or toward travel vector
      const lookDir = hasLOS || distToPlayer < 16
        ? playerPos.clone().sub(e.pos)
        : (movingSpeed > 0.4 ? e.vel.clone() : playerPos.clone().sub(e.pos));
      const desiredYaw = Math.atan2(lookDir.x, lookDir.z);
      let yawDiff = desiredYaw - e.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      e.yaw += yawDiff * Math.min(1, dt * 7.5);

      // Telegraph laser & Fire Bursts when LOS acquired
      if (hasLOS && Math.abs(yawDiff) < 0.45 && e.suppressedTimer <= 0.1) {
        e.aimTelegraph += dt;
        m.aimLaser.material.opacity = Math.min(0.45, e.aimTelegraph * 1.1);
        if (e.aimTelegraph > 0.42 && e.fireCooldown <= 0) {
          if (e.burstRemaining <= 0) {
            e.burstRemaining = 2 + Math.floor(Math.random() * 3);
          }
          this._fireEnemyShot(e, playerPos, controller);
          e.burstRemaining--;
          e.fireCooldown = e.burstRemaining > 0 ? 0.14 : 0.85 + Math.random() * 0.7;
          if (e.burstRemaining <= 0) e.aimTelegraph = 0.1;
        }
      } else {
        e.aimTelegraph = Math.max(0, e.aimTelegraph - dt * 2.0);
        m.aimLaser.material.opacity = e.aimTelegraph * 0.5;
      }

      // Stride animation + spatial footsteps
      if (movingSpeed > 0.45) {
        e.stridePhase += movingSpeed * dt * 2.4;
        const legSwing = Math.sin(e.stridePhase) * 0.55;
        m.lLegPivot.rotation.x = legSwing;
        m.rLegPivot.rotation.x = -legSwing;

        const half = Math.floor(e.stridePhase / Math.PI);
        if (half !== e.lastStepHalf) {
          e.lastStepHalf = half;
          if (distToPlayer < 26) {
            this.sound.playFootstep(false, this.map.isWetSpot(e.pos.x, e.pos.z), false, e.pos);
          }
        }
      } else {
        m.lLegPivot.rotation.x = THREE.MathUtils.lerp(m.lLegPivot.rotation.x, 0, Math.min(1, dt * 10));
        m.rLegPivot.rotation.x = THREE.MathUtils.lerp(m.rLegPivot.rotation.x, 0, Math.min(1, dt * 10));
      }

      // Crouch & flinch posture
      const targetBodyY = e.crouching ? -0.32 : 0;
      m.bodyPivot.position.y = THREE.MathUtils.lerp(m.bodyPivot.position.y, targetBodyY, Math.min(1, dt * 10));
      m.torsoGroup.rotation.x = e.flinchPitch + (e.crouching ? 0.14 : 0);

      // Aim arms slightly vertically toward player height
      const dy = playerPos.y - e.pos.y;
      const horizD = Math.max(1, Math.hypot(playerPos.x - e.pos.x, playerPos.z - e.pos.z));
      m.armsPivot.rotation.x = hasLOS ? THREE.MathUtils.clamp(-Math.atan2(dy, horizD), -0.5, 0.5) : 0.15;

      m.root.position.copy(e.pos);
      m.root.rotation.y = e.yaw;
    }

    // Update enemy tracers
    for (let i = this.enemyTracers.length - 1; i >= 0; i--) {
      const tr = this.enemyTracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        this.enemyTracers.splice(i, 1);
      } else {
        tr.line.material.opacity = (tr.life / tr.maxLife) * 0.65;
      }
    }
  }
}
