// main.js — bootstrap and the game loop. Fixed-step simulation (60 Hz) kept
// apart from rendering; one state store (state.js); all visuals funnel through
// the pooled FX helpers below (no per-frame allocations in the hot loop).
import * as THREE from 'three';
import { SIM_DT, freshState, WEAPON_ORDER } from './state.js';
import { MAP, segmentBlocked } from './map.js';
import { createWorld, createViewmodel } from './world.js';
import { createInput } from './input.js';
import { createPlayer, stepPlayer, applyDamageToPlayer, playerEye, currentWeaponDef } from './player.js';
import { createBots, stepBots, damageBot, botEvents } from './bots.js';
import { firePlayer, startReload, finishReload, switchWeapon, throwPlayerGrenade } from './weapons.js';
import { makeGrenadePool, stepGrenades, grenadeDamage } from './combat.js';
import { startMatch, stepRounds, buyItem, BUY_ITEMS } from './rounds.js';
import { createHud } from './hud.js';
import { initAudio, sfx } from './audio.js';

const state = freshState();
const world = createWorld(document.getElementById('app'));
const input = createInput(world.renderer.domElement);
const viewmodel = createViewmodel(world.camera);
const hud = createHud(state, (item) => { if (buyItem(state, item)) hud.refreshBuy(); });
const grenades = makeGrenadePool();

// Grenade meshes (pooled): small dark spheres.
for (const g of grenades) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.4, metalness: 0.7 })
  );
  m.visible = false;
  world.scene.add(m);
  g.mesh = m;
}

// Tracer pool: 10 reusable lines.
const tracers = [];
for (let i = 0; i < 10; i++) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(6);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0 });
  const line = new THREE.Line(geo, mat);
  line.visible = false; line.frustumCulled = false;
  world.scene.add(line);
  tracers.push({ line, pos, mat, life: 0 });
}
let tracerI = 0;
let sparkLife = 0;
let shakeT = 0;

function showTracer(x1, y1, z1, x2, y2, z2, color) {
  const t = tracers[tracerI];
  tracerI = (tracerI + 1) % tracers.length;
  t.pos[0] = x1; t.pos[1] = y1; t.pos[2] = z1;
  t.pos[3] = x2; t.pos[4] = y2; t.pos[5] = z2;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.mat.color.setHex(color);
  t.mat.opacity = 0.9;
  t.line.visible = true;
  t.life = 0.12;
}

function showImpact(x, y, z) {
  const pos = world.sparkPos;
  for (let i = 0; i < 24; i++) {
    pos[i * 3] = x + (Math.random() - 0.5) * 0.3;
    pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.3;
    pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
  }
  world.sparks.geometry.attributes.position.needsUpdate = true;
  world.sparks.visible = true;
  sparkLife = 0.3;
}

const hooks = {
  tracer: showTracer,
  impact: showImpact,
  muzzle() {
    world.flashLight.position.set(
      world.camera.position.x, world.camera.position.y, world.camera.position.z);
    world.flashLight.intensity = 14;
  },
  noise(x, z, range) {
    state.noise.push({ x, z, team: 'ember', range });
  },
  damageBot(bot, dmg, part, who) {
    state.stats.hits += 1;
    state.stats.damage += dmg;
    damageBot(state, bot, dmg, part, who);
    hud.showHitmark();
    sfx.hit();
  },
  damagePlayer(dmg, from) {
    applyDamageToPlayer(state.player, dmg, from);
    hud.damageFlash();
    sfx.hurt();
    if (!state.player.alive) {
      state.killfeed.unshift({ killer: from, victim: 'You', headshot: false });
      if (state.killfeed.length > 5) state.killfeed.pop();
      state.player.plantT = 0;
      state.player.defuseT = 0;
      // The spike drops where the carrier fell.
      if (state.bomb.state === 'carried' && state.bomb.carrier === 'player') {
        state.bomb.state = 'dropped';
        state.bomb.x = state.player.x;
        state.bomb.z = state.player.z;
        state.bomb.carrier = null;
      }
      if (botEvents.onPlayerDeath) botEvents.onPlayerDeath();
    }
  },
  onShot() { /* stats counted in weapons.js */ },
  grenadeThrown() { /* mesh sync handles visuals */ },
};

// Bot hook: bots fire through the same hooks object.
const botHooks = {
  tracer: showTracer,
  noise(x, z) { state.noise.push({ x, z, team: 'warden' }); },
  damagePlayer(dmg, from) { hooks.damagePlayer(dmg, from); },
};

function explodeGrenade(g) {
  if (g.kind === 'frag') {
    sfx.explosion();
    showImpact(g.x, g.y + 0.3, g.z);
    shakeT = 0.25;
    // Damage bots and the player, blocked by walls.
    for (const b of state.bots) {
      if (!b.alive) continue;
      if (segmentBlocked(g.x, g.y, g.z, b.x, 1.2, b.z)) continue;
      const dmg = grenadeDamage(g, b.x, 1.2, b.z);
      if (dmg > 5) damageBot(state, b, dmg, 'body', 'You');
    }
    const p = state.player;
    if (p.alive && !segmentBlocked(g.x, g.y, g.z, p.x, p.y + 1.2, p.z)) {
      const dmg = grenadeDamage(g, p.x, p.y + 1.2, p.z);
      if (dmg > 5) hooks.damagePlayer(dmg, 'Frag grenade');
    }
  } else {
    // Flash: blind bots (and the player) facing the burst with line of sight.
    sfx.flash();
    for (const b of state.bots) {
      if (!b.alive) continue;
      const dx = g.x - b.x, dz = g.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d > 14) continue;
      if (segmentBlocked(g.x, g.y, g.z, b.x, 1.5, b.z)) continue;
      const facing = (-Math.sin(b.yaw) * dx + -Math.cos(b.yaw) * dz) / (d || 1);
      if (facing > -0.2) b.flashT = 2.5;
    }
    const p = state.player;
    if (p.alive) {
      const dx = g.x - p.x, dz = g.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 26 && !segmentBlocked(g.x, g.y, g.z, p.x, p.y + 1.5, p.z)) {
        const facing = (-Math.sin(p.yaw) * dx + -Math.cos(p.yaw) * dz) / (d || 1);
        if (facing > 0.1) { p.flashT = 1.6; hud.flashBang(); }
      }
    }
  }
}

// --- Setup ---------------------------------------------------------------
state.player = createPlayer(MAP.spawns.ember[0]);
createBots(state, world.scene);
botEvents.onBotDeath = () => { /* killfeed + money handled in damageBot */ };

let firing = false;
let prevReloadT = 0;
let buyOpen = false;

function openBuy() {
  if (state.phase !== 'freeze') return;
  buyOpen = true;
  hud.showBuy(true);
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeBuy() {
  buyOpen = false;
  hud.showBuy(false);
}

input.onKey = (code, down) => {
  if (!down) return;
  if (state.phase === 'menu') return;
  if (code === 'KeyR') startReload(state.player);
  if (code === 'KeyB') { if (buyOpen) closeBuy(); else openBuy(); }
  if (code === 'KeyG') throwPlayerGrenade(state, state.player, grenades, 'frag', hooks);
  if (code === 'KeyF') throwPlayerGrenade(state, state.player, grenades, 'flash', hooks);
  if (buyOpen && code.startsWith('Digit')) {
    const i = parseInt(code.slice(5), 10) - 1;
    if (BUY_ITEMS[i]) { if (buyItem(state, BUY_ITEMS[i])) hud.refreshBuy(); }
    return;
  }
  if (code.startsWith('Digit')) {
    const i = parseInt(code.slice(5), 10) - 1;
    if (WEAPON_ORDER[i]) switchWeapon(state.player, WEAPON_ORDER[i]);
  }
};
input.onMouseDown = (btn) => {
  if (state.phase === 'menu' || state.phase === 'matchEnd') return;
  if (state.phase !== 'live') { input.requestLock(); return; }
  if (btn === 0) {
    firing = true;
    const def = currentWeaponDef(state.player);
    if (!def.auto) firePlayer(state, state.player, hooks);
  }
  if (btn === 2 && state.player.current === 'longbow') {
    state.player.scoped = !state.player.scoped;
  }
};
input.onMouseUp = (btn) => { if (btn === 0) firing = false; };

document.getElementById('deployBtn').addEventListener('click', () => {
  initAudio();
  document.getElementById('startScreen').classList.add('hidden');
  hud.showHud(true);
  input.requestLock();
  startMatch(state);
  openBuy();
});
document.getElementById('againBtn').addEventListener('click', () => {
  document.getElementById('matchEnd').classList.add('hidden');
  hud.showHud(true);
  input.requestLock();
  startMatch(state);
  openBuy();
});
window.addEventListener('resize', () => world.resize(window.innerWidth, window.innerHeight));
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state.phase === 'live' && !buyOpen) {
    // Clicking back into the game re-locks.
    world.renderer.domElement.addEventListener('click', input.requestLock, { once: true });
  }
});

// --- Fixed-step simulation ------------------------------------------------
function step(dt) {
  const p = state.player;
  // Look.
  const [dyaw, dpitch] = input.consumeLook();
  if (p.alive) {
    p.yaw += dyaw;
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch + dpitch));
  }
  p.wantPlant = input.keys.has('KeyE');
  if (state.phase === 'live' && p.alive) {
    const stepped = stepPlayer(p, input, dt);
    if (stepped) { sfx.step(false); hooks.noise(p.x, p.z, 6); }
    if (firing) {
      const def = currentWeaponDef(p);
      if (def.auto) firePlayer(state, p, hooks);
    }
    if (prevReloadT > 0 && p.reloadT <= 0) finishReload(p);
    prevReloadT = p.reloadT;
    stepBots(state, dt, { player: p, hooks: botHooks });
    stepGrenades(grenades, dt,
      (g) => explodeGrenade(g),
      () => sfx.bounce());
  } else if (state.phase === 'freeze') {
    // Bots idle in place during freeze; grenades settle.
    stepGrenades(grenades, dt, (g) => explodeGrenade(g), () => sfx.bounce());
  }
  stepRounds(state, dt);
  if (state.phase === 'live' && state.bomb.state === 'planted') {
    // Planted spike beeps faster as the fuse runs down.
    if (Math.floor(state.bomb.fuseT * 2) !== Math.floor((state.bomb.fuseT + dt) * 2)) sfx.plantBeep();
  }
  // Buy menu follows the phase.
  if (state.phase === 'freeze' && !buyOpen && state.phaseT < 0.1) openBuy();
  if (state.phase !== 'freeze' && buyOpen) closeBuy();
  // Bomb pickup by the player is handled in stepRounds.
  if (state.bomb.state === 'planted' || state.bomb.state === 'dropped') {
    world.bombMesh.visible = true;
    world.bombMesh.position.set(state.bomb.x, 0.18, state.bomb.z);
    world.bombMesh.rotation.y += dt * 2;
  } else {
    world.bombMesh.visible = false;
  }
  // Match end overlay.
  if (state.phase === 'matchEnd' && document.getElementById('matchEnd').classList.contains('hidden')) {
    const won = state.matchWinner === 'ember';
    document.getElementById('matchTitle').textContent = won ? 'VICTORY' : 'DEFEAT';
    document.getElementById('matchTitle').style.color = won ? '#7dff8a' : '#ff5a3c';
    document.getElementById('matchSub').textContent =
      `Final score — EMBER ${state.score.ember} : ${state.score.warden} WARDEN. ` +
      `Your stats: ${state.stats.kills} kills, ${state.stats.headshots} headshots, ` +
      `${Math.round((state.stats.hits / Math.max(1, state.stats.shots)) * 100)}% accuracy.`;
    document.getElementById('matchEnd').classList.remove('hidden');
    hud.showHud(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

// --- Render ----------------------------------------------------------------
function render(dt) {
  const p = state.player;
  // Camera: eye position, recoil kick, scope zoom, death fall.
  const [ex, ey, ez, pitch, yaw] = playerEye(p, state.time);
  const camY = p.alive ? ey : 0.55;
  world.camera.position.set(ex, camY, ez);
  world.camera.rotation.y = yaw;
  world.camera.rotation.x = p.alive ? pitch : 0.15;
  const wantFov = p.scoped && p.alive ? 78 / 3.2 : 78;
  if (Math.abs(world.camera.fov - wantFov) > 0.1) {
    world.camera.fov += (wantFov - world.camera.fov) * 0.35;
    world.camera.updateProjectionMatrix();
  }
  if (shakeT > 0) {
    shakeT -= dt;
    world.camera.position.x += (Math.random() - 0.5) * 0.12;
    world.camera.position.y += (Math.random() - 0.5) * 0.12;
  }
  // Viewmodel: recoil kick + walk bob; hidden while scoped or dead.
  viewmodel.visible = p.alive && !p.scoped;
  if (viewmodel.visible) {
    const bob = Math.hypot(p.vx, p.vz) > 1 ? Math.sin(state.time * 11) * 0.012 : 0;
    viewmodel.position.set(0.26, -0.24 + bob + p.recoil * 0.35, -0.6 + p.recoil * 1.4);
    viewmodel.rotation.x = p.recoil * 2.2;
  }
  // Muzzle flash decay.
  world.flashLight.intensity = Math.max(0, world.flashLight.intensity - dt * 120);
  // Tracers fade.
  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.mat.opacity = Math.max(0, t.life / 0.12) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
  }
  if (sparkLife > 0) {
    sparkLife -= dt;
    if (sparkLife <= 0) world.sparks.visible = false;
  }
  // Bot meshes follow their sim bodies; legs swing with the walk cycle.
  for (const b of state.bots) {
    const m = b.mesh;
    if (!b.alive) continue;
    m.group.position.set(b.x, b.y, b.z);
    m.group.rotation.y = b.yaw;
    const swing = Math.sin(b.walkPhase) * 0.45;
    m.legL.rotation.x = swing;
    m.legR.rotation.x = -swing;
    // Aim the gun: pitch the gun box slightly when engaging.
    m.gun.rotation.x = b.target ? -0.12 : 0;
  }
  // Grenade meshes.
  for (const g of grenades) {
    g.mesh.visible = g.active;
    if (g.active) g.mesh.position.set(g.x, g.y, g.z);
  }
  // Site beacons pulse.
  const pulse = 0.35 + Math.sin(state.time * 3) * 0.2;
  world.markerA.beacon.material.opacity = pulse;
  world.markerB.beacon.material.opacity = pulse;
  world.renderer.render(world.scene, world.camera);
}

// --- Main loop -------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  if (state.phase !== 'menu' && state.phase !== 'matchEnd') {
    acc += dt;
    let n = 0;
    while (acc >= SIM_DT && n < 5) {
      state.time += SIM_DT;
      step(SIM_DT);
      acc -= SIM_DT;
      n++;
    }
    if (n === 5) acc = 0;
    hud.update(dt);
  }
  render(dt);
  // Round banners.
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') {
    const won = state.roundWinner === 'ember';
    hud.banner(
      won ? 'ROUND WON' : 'ROUND LOST',
      `${state.roundReason} — EMBER ${state.score.ember} : ${state.score.warden} WARDEN`,
      won ? '#7dff8a' : '#ff5a3c');
  } else if (state.phase === 'freeze') {
    hud.banner(`ROUND ${state.round}`, 'Buy up — the round goes live soon', '#e8ecf1');
  } else if (state.phase === 'live') {
    hud.hideBanner();
  }
}
requestAnimationFrame(frame);

// Smoke-test handle (used by the local Playwright checks, not by the game).
window.__game = { state, version: 'emberline-1.0' };
