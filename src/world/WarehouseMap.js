import * as THREE from 'three';

export class WarehouseMap {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = textures;

    this.worldGroup = new THREE.Group();
    this.worldGroup.name = 'WarehouseWorld';
    this.scene.add(this.worldGroup);

    this.colliders = []; // AABB boxes { minX, maxX, minY, maxY, minZ, maxZ, surfaceType }
    this.ramps = []; // Walkable slopes { minX, maxX, minZ, maxZ, yMin, yMax, axis, dir }
    this.raycastTargets = [];
    this.coverNodes = [];
    this.breachPortals = [];
    this.flickerLights = [];
    this.beacons = [];
    this.dustPoints = null;

    this.buildEnvironment();
  }

  _addBox({
    x, y, z, w, h, d,
    material,
    surfaceType = 'concrete',
    castShadow = true,
    receiveShadow = true,
    collide = true
  }) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.userData.surfaceType = surfaceType;
    this.worldGroup.add(mesh);
    this.raycastTargets.push(mesh);

    if (collide) {
      this.colliders.push({
        minX: x - w * 0.5,
        maxX: x + w * 0.5,
        minY: y - h * 0.5,
        maxY: y + h * 0.5,
        minZ: z - d * 0.5,
        maxZ: z + d * 0.5,
        surfaceType
      });
    }
    return mesh;
  }

  buildEnvironment() {
    const floorMat = this.textures.getWetConcreteFloor(14, 12);
    const wallMat = this.textures.getConcreteWall(6, 2, false);
    const wallHazardMat = this.textures.getConcreteWall(4, 2, true);
    const pillarMat = this.textures.getConcreteWall(1, 2, true);
    const steelBlue = this.textures.getCorrugatedMetal(3, 2, [58, 74, 88]);
    const steelRed = this.textures.getCorrugatedMetal(3, 2, [96, 52, 46]);
    const steelDark = this.textures.getCorrugatedMetal(2, 2, [48, 52, 58]);
    const crateMat = this.textures.getWoodCrate(1, 1);
    const darkMetal = this.textures.getGunmetal(0x272c33, 0.55, 0.72);

    // 1. Main Wet Concrete Floor & Ceiling Slab
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 52), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData.surfaceType = 'concrete';
    this.worldGroup.add(floor);
    this.raycastTargets.push(floor);

    // Ceiling with skylight cutouts via modular roof beams
    const ceilingMat = this.textures.getConcreteWall(8, 8, false);
    this._addBox({ x: 0, y: 10.6, z: -16, w: 60, h: 0.4, d: 20, material: ceilingMat, collide: false, castShadow: false });
    this._addBox({ x: 0, y: 10.6, z: 16, w: 60, h: 0.4, d: 20, material: ceilingMat, collide: false, castShadow: false });
    this._addBox({ x: -18, y: 10.6, z: 0, w: 24, h: 0.4, d: 12, material: ceilingMat, collide: false, castShadow: false });
    this._addBox({ x: 18, y: 10.6, z: 0, w: 24, h: 0.4, d: 12, material: ceilingMat, collide: false, castShadow: false });
    // Center roof divider between two skylights
    this._addBox({ x: 0, y: 10.6, z: 0, w: 2.4, h: 0.5, d: 12, material: darkMetal, surfaceType: 'metal', collide: false });

    // Overhead steel roof trusses
    for (let z = -20; z <= 20; z += 10) {
      this._addBox({ x: 0, y: 9.9, z, w: 59.5, h: 0.55, d: 0.45, material: darkMetal, surfaceType: 'metal', collide: false });
    }

    // 2. Perimeter Outer Walls (60 x 52)
    this._addBox({ x: 0, y: 5.25, z: -26.2, w: 61, h: 10.5, d: 0.6, material: wallHazardMat });
    this._addBox({ x: 0, y: 5.25, z: 26.2, w: 61, h: 10.5, d: 0.6, material: wallHazardMat });
    this._addBox({ x: -30.2, y: 5.25, z: 0, w: 0.6, h: 10.5, d: 53, material: wallHazardMat });
    this._addBox({ x: 30.2, y: 5.25, z: 0, w: 0.6, h: 10.5, d: 53, material: wallHazardMat });

    // 3. Wing Partition Walls with Wide Flanking Archways
    // West Wing Partition (x = -14)
    this._addBox({ x: -14, y: 5.25, z: -20, w: 0.7, h: 10.5, d: 12, material: wallMat });
    this._addBox({ x: -14, y: 5.25, z: -5.5, w: 0.7, h: 10.5, d: 6.5, material: wallMat });
    this._addBox({ x: -14, y: 5.25, z: 5.5, w: 0.7, h: 10.5, d: 6.5, material: wallMat });
    this._addBox({ x: -14, y: 5.25, z: 20, w: 0.7, h: 10.5, d: 12, material: wallMat });
    // Arch headers above West openings
    this._addBox({ x: -14, y: 7.4, z: -11.4, w: 0.75, h: 6.2, d: 5.5, material: wallMat });
    this._addBox({ x: -14, y: 7.4, z: 0, w: 0.75, h: 6.2, d: 4.8, material: wallMat });
    this._addBox({ x: -14, y: 7.4, z: 11.4, w: 0.75, h: 6.2, d: 5.5, material: wallMat });

    // East Wing Partition (x = 14)
    this._addBox({ x: 14, y: 5.25, z: -20, w: 0.7, h: 10.5, d: 12, material: wallMat });
    this._addBox({ x: 14, y: 5.25, z: -4.5, w: 0.7, h: 10.5, d: 7.5, material: wallMat });
    this._addBox({ x: 14, y: 5.25, z: 6.8, w: 0.7, h: 10.5, d: 6.5, material: wallMat });
    this._addBox({ x: 14, y: 5.25, z: 20, w: 0.7, h: 10.5, d: 12, material: wallMat });
    // Arch headers above East openings
    this._addBox({ x: 14, y: 7.4, z: -11.2, w: 0.75, h: 6.2, d: 6.2, material: wallMat });
    this._addBox({ x: 14, y: 7.4, z: 1.5, w: 0.75, h: 6.2, d: 4.8, material: wallMat });
    this._addBox({ x: 14, y: 7.4, z: 12.2, w: 0.75, h: 6.2, d: 4.8, material: wallMat });

    // 4. Structural Concrete Pillars in Main Loading Bay
    [
      [-8.5, -8], [8.5, -8],
      [-8.5, 2], [8.5, 2],
      [-8.5, 12], [8.5, 12]
    ].forEach(([px, pz]) => {
      this._addBox({ x: px, y: 5.2, z: pz, w: 1.4, h: 10.4, d: 1.4, material: pillarMat });
    });

    // 5. Central Tactical Cover: Shipping Containers, Crates, Jersey Barriers, Oil Drums
    // Blue Shipping Container (angled slightly visually? keep AABB aligned for razor-sharp cover)
    this._addBox({ x: -2.6, y: 1.5, z: -1.5, w: 3.1, h: 3.0, d: 7.4, material: steelBlue, surfaceType: 'metal' });
    // Stacked upper red crate on container
    this._addBox({ x: -2.6, y: 3.8, z: -2.2, w: 2.2, h: 1.6, d: 2.2, material: crateMat, surfaceType: 'wood' });

    // East-Center Red Shipping Container
    this._addBox({ x: 4.8, y: 1.5, z: -9.5, w: 6.8, h: 3.0, d: 2.8, material: steelRed, surfaceType: 'metal' });

    // Concrete Jersey Barriers near player dock & mid-bay
    this._addBox({ x: -3.2, y: 0.6, z: 14.5, w: 3.6, h: 1.2, d: 0.75, material: wallMat });
    this._addBox({ x: 3.2, y: 0.6, z: 14.5, w: 3.6, h: 1.2, d: 0.75, material: wallMat });
    this._addBox({ x: 3.8, y: 0.6, z: 6.2, w: 3.4, h: 1.2, d: 0.75, material: wallMat });
    this._addBox({ x: -5.2, y: 0.6, z: 7.5, w: 0.75, h: 1.2, d: 3.2, material: wallMat });

    // Crate Clusters in Main Bay
    this._addBox({ x: 4.5, y: 0.75, z: 1.2, w: 1.5, h: 1.5, d: 1.5, material: crateMat, surfaceType: 'wood' });
    this._addBox({ x: 6.05, y: 0.75, z: 1.8, w: 1.4, h: 1.5, d: 1.4, material: crateMat, surfaceType: 'wood' });
    this._addBox({ x: 4.8, y: 2.1, z: 1.5, w: 1.2, h: 1.2, d: 1.2, material: crateMat, surfaceType: 'wood' });

    this._addBox({ x: -4.2, y: 0.75, z: -10.5, w: 1.6, h: 1.5, d: 1.6, material: crateMat, surfaceType: 'wood' });
    this._addBox({ x: -2.4, y: 0.65, z: -11.2, w: 1.3, h: 1.3, d: 1.3, material: crateMat, surfaceType: 'wood' });

    // Cylindrical steel drums
    this._addDrum(-0.8, 4.8, 0x3b4856);
    this._addDrum(0.2, 5.4, 0x7d3629);
    this._addDrum(7.2, -5.5, 0x3b4856);
    this._addDrum(-19.5, 5.2, 0x7d3629);

    // 6. West Dark Storage Wing (Industrial Racks + Crates)
    const rackPositions = [
      [-21.5, -9], [-21.5, 0], [-21.5, 9],
      [-26.5, -4], [-26.5, 7]
    ];
    rackPositions.forEach(([rx, rz]) => {
      this._addBox({ x: rx, y: 1.4, z: rz, w: 1.8, h: 2.8, d: 4.6, material: steelDark, surfaceType: 'metal' });
      this._addBox({ x: rx, y: 3.3, z: rz - 1.1, w: 1.4, h: 1.1, d: 1.4, material: crateMat, surfaceType: 'wood' });
    });

    // 7. East Shipping Wing (Pallets, Containers, Breach Bay)
    this._addBox({ x: 22.0, y: 1.5, z: 8.5, w: 3.0, h: 3.0, d: 6.5, material: steelBlue, surfaceType: 'metal' });
    this._addBox({ x: 20.5, y: 0.75, z: -10.0, w: 1.6, h: 1.5, d: 1.6, material: crateMat, surfaceType: 'wood' });
    this._addBox({ x: 22.2, y: 0.75, z: -9.5, w: 1.6, h: 1.5, d: 1.6, material: crateMat, surfaceType: 'wood' });
    this._addBox({ x: 21.3, y: 2.1, z: -9.7, w: 1.3, h: 1.2, d: 1.3, material: crateMat, surfaceType: 'wood' });
    this._addBox({ x: 18.5, y: 0.6, z: 1.5, w: 0.8, h: 1.2, d: 3.4, material: wallMat });

    // Partially Open East Roll-Up Garage Shutter (Breach Portal 1)
    this._addBox({ x: 29.6, y: 4.8, z: -3.5, w: 0.35, h: 4.6, d: 5.5, material: steelDark, surfaceType: 'metal' });

    // 8. North Mezzanine Catwalk (y = 3.2m) & Two Walkable Ramps
    // Catwalk deck: X [-22, 22], Z [-25.6, -19.2]
    this._addBox({ x: 0, y: 3.0, z: -22.4, w: 44, h: 0.4, d: 6.4, material: darkMetal, surfaceType: 'metal' });
    // Safety railings along catwalk front (leaving openings at ramp tops X = -19..-15 and X = 15..19)
    this._addBox({ x: 0, y: 3.85, z: -19.3, w: 29.6, h: 0.9, d: 0.14, material: darkMetal, surfaceType: 'metal' });
    // Waist-high cover boxes on catwalk
    this._addBox({ x: -7, y: 3.8, z: -22.0, w: 2.2, h: 1.2, d: 1.3, material: crateMat, surfaceType: 'wood' });
    this._addBox({ x: 6.5, y: 3.8, z: -22.0, w: 2.2, h: 1.2, d: 1.3, material: crateMat, surfaceType: 'wood' });

    // West Walkable Ramp: X [-22, -16], Z [-19.2, -11.2] rising from y=0 (at Z=-11.2) to y=3.2 (at Z=-19.2)
    this._buildRamp(-19.0, -19.2, -11.2, 5.4, 3.2, darkMetal);
    // East Walkable Ramp: X [16, 22], Z [-19.2, -11.2] rising from y=0 (at Z=-11.2) to y=3.2 (at Z=-19.2)
    this._buildRamp(19.0, -19.2, -11.2, 5.4, 3.2, darkMetal);

    // 9. Dramatic Photorealistic Lighting + Volumetric Skylight Beams + Dust
    this._setupLighting();
    this._setupBreachPortals();
    this._setupCoverNodes();
  }

  _addDrum(x, z, colorHex) {
    const geo = new THREE.CylinderGeometry(0.42, 0.42, 1.15, 16);
    const mat = this.textures.getGunmetal(colorHex, 0.55, 0.55);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.575, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.surfaceType = 'metal';
    this.worldGroup.add(mesh);
    this.raycastTargets.push(mesh);
    this.colliders.push({
      minX: x - 0.45,
      maxX: x + 0.45,
      minY: 0,
      maxY: 1.15,
      minZ: z - 0.45,
      maxZ: z + 0.45,
      surfaceType: 'metal'
    });
  }

  _buildRamp(centerX, zTop, zBottom, width, height, material) {
    const length = Math.abs(zBottom - zTop);
    const hypot = Math.hypot(length, height);
    const angle = Math.atan2(height, length);
    const geo = new THREE.BoxGeometry(width, 0.3, hypot);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(centerX, height * 0.5 - 0.1, (zTop + zBottom) * 0.5);
    mesh.rotation.x = angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.surfaceType = 'metal';
    this.worldGroup.add(mesh);
    this.raycastTargets.push(mesh);

    this.ramps.push({
      minX: centerX - width * 0.5,
      maxX: centerX + width * 0.5,
      minZ: Math.min(zTop, zBottom),
      maxZ: Math.max(zTop, zBottom),
      zTop,
      zBottom,
      height
    });
  }

  _setupLighting() {
    // Low atmospheric ambient bounce
    const hemi = new THREE.HemisphereLight(0x88a4c4, 0x24262b, 0.42);
    this.worldGroup.add(hemi);

    // Primary cool overcast Skylight Shaft 1 (North-West central bay)
    const skySpot1 = new THREE.SpotLight(0xcbe2ff, 185, 38, Math.PI * 0.27, 0.55, 1.35);
    skySpot1.position.set(-4.5, 12.2, -3.5);
    skySpot1.target.position.set(-1.5, 0, -2.5);
    skySpot1.castShadow = true;
    skySpot1.shadow.mapSize.set(1024, 1024);
    skySpot1.shadow.bias = -0.0005;
    this.worldGroup.add(skySpot1);
    this.worldGroup.add(skySpot1.target);

    // Skylight Shaft 2 (South-East central bay)
    const skySpot2 = new THREE.SpotLight(0xd5e8ff, 155, 36, Math.PI * 0.25, 0.55, 1.35);
    skySpot2.position.set(5.5, 12.2, 2.5);
    skySpot2.target.position.set(3.0, 0, 4.5);
    skySpot2.castShadow = true;
    skySpot2.shadow.mapSize.set(1024, 1024);
    skySpot2.shadow.bias = -0.0005;
    this.worldGroup.add(skySpot2);
    this.worldGroup.add(skySpot2.target);

    // Custom Fresnel + Vertical Gradient Volumetric Skylight Shafts
    const beamMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x9bc7ff) },
        uOpacity: { value: 0.14 }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mvPos.xyz;
          vNormalView = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        void main() {
          vec3 viewDir = normalize(vViewPos);
          float fresnel = pow(abs(dot(normalize(vNormalView), viewDir)), 2.1);
          float vertFade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
          float alpha = fresnel * vertFade * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    const shaftGeo = new THREE.CylinderGeometry(2.4, 5.6, 11.4, 32, 1, true);
    const shaft1 = new THREE.Mesh(shaftGeo, beamMat);
    shaft1.position.set(-4.2, 5.2, -3.2);
    shaft1.rotation.z = -0.11;
    this.worldGroup.add(shaft1);

    const shaft2 = new THREE.Mesh(shaftGeo, beamMat);
    shaft2.position.set(5.2, 5.2, 3.0);
    shaft2.rotation.z = 0.09;
    this.worldGroup.add(shaft2);

    // Warm industrial sodium pendant lamps (South Spawn Dock & North Mezzanine)
    const warmLightPositions = [
      [0, 8.8, 17.5, 42],
      [0, 8.8, -19.5, 48],
      [21, 8.2, 4.0, 34]
    ];
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffc670 });
    warmLightPositions.forEach(([lx, ly, lz, intensity]) => {
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.35), bulbMat);
      fixture.position.set(lx, ly + 0.15, lz);
      this.worldGroup.add(fixture);

      const pt = new THREE.PointLight(0xffb55a, intensity, 22, 1.5);
      pt.position.set(lx, ly - 0.15, lz);
      this.worldGroup.add(pt);
    });

    // Flickering damaged fluorescent lamp in West Dark Wing
    const flickerBulb = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.08, 1.8),
      new THREE.MeshBasicMaterial({ color: 0xd0e8ff })
    );
    flickerBulb.position.set(-22, 8.6, 2.0);
    this.worldGroup.add(flickerBulb);

    const flickerLight = new THREE.PointLight(0xa5d8ff, 26, 17, 1.6);
    flickerLight.position.set(-22, 8.3, 2.0);
    this.worldGroup.add(flickerLight);
    this.flickerLights.push({ light: flickerLight, mesh: flickerBulb, baseIntensity: 26, timer: 0 });

    // Emergency crimson rotating/pulsing beacons at breach portals
    [
      [28.8, 5.8, -3.5],
      [-28.5, 5.6, -21.0]
    ].forEach(([bx, by, bz], idx) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xff2218 })
      );
      mesh.position.set(bx, by, bz);
      this.worldGroup.add(mesh);

      const light = new THREE.PointLight(0xff1e14, 18, 15, 1.5);
      light.position.set(bx - (idx === 0 ? 0.5 : -0.5), by - 0.2, bz);
      this.worldGroup.add(light);
      this.beacons.push({ light, mesh, phase: idx * 1.9, boost: 0 });
    });

    // Floating atmospheric dust motes inside warehouse beams
    const dustCount = 450;
    const positions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 52;
      positions[i * 3 + 1] = 0.4 + Math.random() * 8.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 0.065,
      map: this.textures.getParticleTextures().smoke,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      color: 0xdbeafe
    });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.worldGroup.add(this.dustPoints);
  }

  _setupBreachPortals() {
    this.breachPortals = [
      {
        name: 'SECTOR EAST // GARAGE BAY',
        pos: new THREE.Vector3(27.5, 0, -3.5),
        entryDir: new THREE.Vector3(-1, 0, 0),
        beaconIndex: 0
      },
      {
        name: 'SECTOR NW // BLAST CORRIDOR',
        pos: new THREE.Vector3(-26.5, 0, -21.5),
        entryDir: new THREE.Vector3(1, 0, 0.3),
        beaconIndex: 1
      },
      {
        name: 'CATWALK NORTH // UPPER DOOR',
        pos: new THREE.Vector3(19.5, 3.2, -23.0),
        entryDir: new THREE.Vector3(-1, 0, 0.4),
        beaconIndex: 0
      },
      {
        name: 'SECTOR WEST // STORAGE WING',
        pos: new THREE.Vector3(-26.5, 0, 16.5),
        entryDir: new THREE.Vector3(1, 0, -0.3),
        beaconIndex: 1
      }
    ];
  }

  _setupCoverNodes() {
    const raw = [
      // Central Loading Bay cover points
      [-5.2, 0, 3.0], [-5.2, 0, -4.5], [1.2, 0, -5.5],
      [2.8, 0, 1.5], [7.2, 0, 2.2], [-6.8, 0, 10.5],
      [6.8, 0, 10.5], [3.5, 0, -12.5], [-4.5, 0, -13.0],
      [1.8, 0, 6.2], [-7.0, 0, -8.0], [7.0, 0, -8.0],
      // East Wing cover points
      [17.5, 0, 2.0], [19.0, 0, -7.5], [18.5, 0, 9.5],
      [24.5, 0, -1.0],
      // West Dark Storage Wing cover points
      [-18.0, 0, -9.0], [-18.0, 0, 0.0], [-18.0, 0, 9.5],
      [-23.8, 0, -5.0], [-23.8, 0, 6.0],
      // North Mezzanine Catwalk cover points
      [-8.5, 3.2, -21.2], [0.0, 3.2, -20.8], [8.5, 3.2, -21.2],
      [-18.5, 3.2, -21.2], [17.5, 3.2, -21.2]
    ];
    this.coverNodes = raw.map(([x, y, z], id) => ({
      id,
      pos: new THREE.Vector3(x, y, z),
      occupiedBy: null
    }));
  }

  triggerBeaconAlert(portalIdx) {
    const beacon = this.beacons[portalIdx];
    if (beacon) {
      beacon.boost = 1.0;
    }
  }

  getFloorHeight(x, z, currentFootY = 0) {
    let floorY = 0;

    // Mezzanine deck X [-22, 22], Z [-25.6, -19.2]
    if (x >= -22.2 && x <= 22.2 && z >= -25.8 && z <= -19.0 && currentFootY >= 2.2) {
      floorY = 3.2;
    }

    // Check ramps
    for (const r of this.ramps) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
        const t = THREE.MathUtils.clamp((r.zBottom - z) / (r.zBottom - r.zTop), 0, 1);
        const rampY = t * r.height;
        if (Math.abs(rampY - currentFootY) < 1.35 || currentFootY >= rampY - 0.35) {
          floorY = Math.max(floorY, rampY);
        }
      }
    }

    return floorY;
  }

  resolveHorizontalCollision(pos, radius, footY, height = 1.7) {
    const minPlayerY = footY + 0.35;
    const maxPlayerY = footY + height;

    for (const c of this.colliders) {
      if (maxPlayerY <= c.minY || minPlayerY >= c.maxY) continue;

      const closestX = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const closestZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));

      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const push = radius - dist;
          pos.x += (dx / dist) * push;
          pos.z += (dz / dist) * push;
        } else {
          // Inside box: push out along nearest edge
          const penLeft = Math.abs(pos.x - c.minX);
          const penRight = Math.abs(c.maxX - pos.x);
          const penFront = Math.abs(pos.z - c.minZ);
          const penBack = Math.abs(c.maxZ - pos.z);
          const m = Math.min(penLeft, penRight, penFront, penBack);
          if (m === penLeft) pos.x = c.minX - radius;
          else if (m === penRight) pos.x = c.maxX + radius;
          else if (m === penFront) pos.z = c.minZ - radius;
          else pos.z = c.maxZ + radius;
        }
      }
    }
  }

  hasHeadClearance(x, z, footY, targetHeight) {
    const testTop = footY + targetHeight;
    for (const c of this.colliders) {
      if (x > c.minX - 0.25 && x < c.maxX + 0.25 && z > c.minZ - 0.25 && z < c.maxZ + 0.25) {
        if (c.minY > footY + 0.5 && c.minY < testTop) {
          return false;
        }
      }
    }
    return true;
  }

  isWetSpot(x, z) {
    const v = Math.sin(x * 0.42) * Math.cos(z * 0.37) + Math.sin((x + z) * 0.19);
    return v > 0.65;
  }

  getZoneBrightness(pos) {
    // Dark storage wing is darker -> auto-exposure gently lifts ISO sensitivity
    if (pos.x < -14) return 1.18;
    if (pos.x > 14) return 1.06;
    return 0.96;
  }

  update(dt, timeSec) {
    // Flickering fluorescent light in dark wing
    for (const fl of this.flickerLights) {
      fl.timer -= dt;
      if (fl.timer <= 0) {
        const roll = Math.random();
        if (roll < 0.16) {
          fl.light.intensity = 2.0;
          fl.mesh.material.color.setHex(0x202832);
          fl.timer = 0.04 + Math.random() * 0.09;
        } else if (roll < 0.28) {
          fl.light.intensity = fl.baseIntensity * 0.45;
          fl.mesh.material.color.setHex(0x6b8299);
          fl.timer = 0.05 + Math.random() * 0.12;
        } else {
          fl.light.intensity = fl.baseIntensity;
          fl.mesh.material.color.setHex(0xd0e8ff);
          fl.timer = 0.25 + Math.random() * 1.4;
        }
      }
    }

    // Emergency crimson beacons pulse (intensified when breach occurs)
    for (const b of this.beacons) {
      b.boost = Math.max(0, b.boost - dt * 0.28);
      const pulse = 0.45 + 0.55 * Math.sin(timeSec * (4.2 + b.boost * 5.0) + b.phase);
      b.light.intensity = (8 + b.boost * 24) * pulse;
      b.mesh.material.color.setRGB(1.0, 0.08 + pulse * 0.12, 0.05);
    }

    // Slowly drifting warehouse dust motes
    if (this.dustPoints) {
      this.dustPoints.rotation.y = Math.sin(timeSec * 0.05) * 0.025;
      this.dustPoints.position.y = Math.sin(timeSec * 0.3) * 0.12;
    }
  }
}
