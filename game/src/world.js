// world.js — builds the three.js scene from map.js data and owns all meshes.
// One shared geometry/material per shape kind; bot bodies are simple stylised
// humanoids (capsule body, sphere head, gun box) in team colours.
import * as THREE from 'three';
import { MAP, SOLIDS } from './map.js';

export function createWorld(container) {
  const scene = new THREE.Scene();
  const pal = MAP.palette;
  scene.background = new THREE.Color(pal.sky);
  scene.fog = new THREE.Fog(pal.fog, 28, 78);

  const camera = new THREE.PerspectiveCamera(78, 1, 0.08, 220);
  camera.rotation.order = 'YXZ';
  scene.add(camera); // the camera must be in the scene for its children (viewmodel) to render

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  // Lighting: low dusk sun + cool sky fill + warm site lamps.
  const sun = new THREE.DirectionalLight(pal.sun, 3.4);
  sun.position.set(-28, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 110;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(pal.hemi, 0x2c241c, 1.25));
  const lampA = new THREE.PointLight(0xffb347, 60, 26, 1.8);
  lampA.position.set(MAP.sites.A.x, 5.5, MAP.sites.A.z);
  scene.add(lampA);
  const lampB = new THREE.PointLight(0x7fd4ff, 60, 26, 1.8);
  lampB.position.set(MAP.sites.B.x, 5.5, MAP.sites.B.z);
  scene.add(lampB);

  // Ground: big slab with a subtle grid texture drawn on a canvas (no network).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 50),
    new THREE.MeshStandardMaterial({ color: pal.ground, roughness: 0.95, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(64, 32, pal.groundLine, pal.groundLine);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);

  // Lane tint strips on the floor (A amber, mid neutral, B cyan) for readability.
  const stripMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.10 });
  const stripA = new THREE.Mesh(new THREE.PlaneGeometry(10, 40), stripMat(pal.siteA));
  stripA.rotation.x = -Math.PI / 2; stripA.position.set(-22, 0.03, -2); scene.add(stripA);
  const stripB = new THREE.Mesh(new THREE.PlaneGeometry(10, 40), stripMat(pal.siteB));
  stripB.rotation.x = -Math.PI / 2; stripB.position.set(22, 0.03, -2); scene.add(stripB);

  // Walls and crates from map data.
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const wallMat = new THREE.MeshStandardMaterial({ color: pal.wall, roughness: 0.85, metalness: 0.15 });
  const wallTopMat = new THREE.MeshStandardMaterial({ color: pal.wallTop, roughness: 0.7, metalness: 0.2 });
  const crateMat = new THREE.MeshStandardMaterial({ color: pal.crate, roughness: 0.9, metalness: 0.1 });
  const crateDarkMat = new THREE.MeshStandardMaterial({ color: pal.crateDark, roughness: 0.9, metalness: 0.1 });
  const rustMat = new THREE.MeshStandardMaterial({ color: pal.rust, roughness: 0.8, metalness: 0.35 });
  for (const b of SOLIDS) {
    const isWall = b.h > 2;
    const w = b.x2 - b.x1, d = b.z2 - b.z1;
    const mesh = new THREE.Mesh(wallGeo, isWall ? wallMat : (w > 2 ? crateMat : crateDarkMat));
    mesh.scale.set(w, b.h, d);
    mesh.position.set((b.x1 + b.x2) / 2, b.h / 2, (b.z1 + b.z2) / 2);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    if (isWall) {
      const cap = new THREE.Mesh(wallGeo, wallTopMat);
      cap.scale.set(w + 0.15, 0.18, d + 0.15);
      cap.position.set(mesh.position.x, b.h + 0.09, mesh.position.z);
      cap.castShadow = true;
      scene.add(cap);
    } else if (b.h >= 1.4) {
      // hazard stripe on tall crates
      const stripe = new THREE.Mesh(wallGeo, rustMat);
      stripe.scale.set(w + 0.06, 0.12, d + 0.06);
      stripe.position.set(mesh.position.x, b.h - 0.06, mesh.position.z);
      scene.add(stripe);
    }
  }

  // Site markers: glowing ring + floating letter beacon at each site.
  function siteMarker(site, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.05, site.z);
    scene.add(ring);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 7, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28 })
    );
    beacon.position.set(site.x, 3.5, site.z);
    scene.add(beacon);
    return { ring, beacon };
  }
  const markerA = siteMarker(MAP.sites.A, pal.siteA);
  const markerB = siteMarker(MAP.sites.B, pal.siteB);

  // Distant skyline silhouettes + a big crane over site B for the dusk look.
  const skylineMat = new THREE.MeshBasicMaterial({ color: 0x1d2233 });
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  for (let i = 0; i < 14; i++) {
    const h = 6 + ((i * 37) % 13);
    const s = new THREE.Mesh(wallGeo, skylineMat);
    const side = i % 2 === 0 ? -1 : 1;
    s.scale.set(5 + ((i * 13) % 7), h, 4);
    s.position.set(side * (38 + ((i * 7) % 10)), h / 2, -34 + i * 5.2);
    scene.add(s);
    // A few lit windows on the skyline, facing the yard.
    if (i % 3 === 0) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), windowMat);
      win.position.set(s.position.x, h * 0.62, s.position.z + 2.05);
      scene.add(win);
    }
  }
  // Low dusk sun disc on the north-west horizon.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(5, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, fog: false })
  );
  sunDisc.position.set(-46, 9, -70);
  sunDisc.lookAt(0, 9, 0);
  scene.add(sunDisc);
  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(9, 32),
    new THREE.MeshBasicMaterial({ color: 0xff8c2e, transparent: true, opacity: 0.25, fog: false })
  );
  sunGlow.position.set(-46, 9, -70.5);
  sunGlow.lookAt(0, 9, 0);
  scene.add(sunGlow);
  const craneMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.7, metalness: 0.5 });
  const cranePost = new THREE.Mesh(wallGeo, craneMat);
  cranePost.scale.set(1.2, 16, 1.2); cranePost.position.set(28, 8, -20); scene.add(cranePost);
  const craneArm = new THREE.Mesh(wallGeo, craneMat);
  craneArm.scale.set(14, 1, 1); craneArm.position.set(22, 15.5, -20); scene.add(craneArm);
  const craneCable = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ color: 0x222222 }));
  craneCable.scale.set(0.08, 6, 0.08); craneCable.position.set(16, 12.5, -20); scene.add(craneCable);

  // Pooled tracer lines and impact sparks (no per-frame allocation).
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 });
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.visible = false; tracer.frustumCulled = false;
  scene.add(tracer);

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(3 * 24);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xffd27a, size: 0.14, transparent: true, opacity: 0.95 });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.visible = false; sparks.frustumCulled = false;
  scene.add(sparks);

  // Bomb prop (visible when planted).
  const bombMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.3, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.4, metalness: 0.7, emissive: 0xff2a00, emissiveIntensity: 0.4 })
  );
  bombMesh.visible = false;
  bombMesh.castShadow = true;
  scene.add(bombMesh);

  // Muzzle flash light attached to the camera.
  const flashLight = new THREE.PointLight(0xffc46b, 0, 9, 1.6);
  scene.add(flashLight);

  return {
    scene, camera, renderer, markerA, markerB, tracer, tracerPos, tracerMat,
    sparks, sparkPos, bombMesh, flashLight, sun,
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
  };
}

// Build one bot's stylised humanoid. Returns {group, head, body, gun}.
export function createBotMesh(teamColor) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.75, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.8, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.62, 4, 10), bodyMat);
  body.position.y = 1.02; body.castShadow = true;
  group.add(body);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.3), darkMat);
  vest.position.set(0, 1.12, 0); vest.castShadow = true;
  group.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), new THREE.MeshStandardMaterial({ color: 0xcaa27a, roughness: 0.7 }));
  head.position.y = 1.56; head.castShadow = true;
  group.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat);
  helmet.position.y = 1.6;
  group.add(helmet);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.72), darkMat);
  gun.position.set(0.28, 1.18, 0.3); gun.castShadow = true;
  group.add(gun);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.18), darkMat);
  legL.position.set(-0.13, 0.25, 0); group.add(legL);
  const legR = legL.clone(); legR.position.x = 0.13; group.add(legR);
  return { group, head, body, gun, legL, legR };
}

// First-person viewmodel: a simple rifle made of boxes, parented to the camera.
export function createViewmodel(camera) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.45, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), dark);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), dark);
  barrel.position.set(0, 0.02, -0.46); g.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), accent);
  grip.position.set(0, -0.12, 0.12); grip.rotation.x = 0.35; g.add(grip);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.1), dark);
  mag.position.set(0, -0.13, -0.05); mag.rotation.x = 0.15; g.add(mag);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), accent);
  sight.position.set(0, 0.09, -0.1); g.add(sight);
  g.position.set(0.26, -0.24, -0.6);
  g.rotation.y = 0.06;
  g.scale.setScalar(0.7);
  camera.add(g);
  return g;
}
