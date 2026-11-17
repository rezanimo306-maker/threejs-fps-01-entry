// player.js — the human player: acceleration-based movement, crouch, jump,
// map collision, camera + recoil, health/armor, and the weapon inventory.
import { PLAYER_RADIUS, EYE_STAND, EYE_CROUCH, WEAPONS } from './state.js';
import { collideCircle } from './map.js';

const WALK_SPEED = 5.2;
const SPRINT_SPEED = 6.4;
const CROUCH_SPEED = 2.6;
const ACCEL = 42;
const FRICTION = 11;

export function createPlayer(spawn) {
  return {
    x: spawn.x, z: spawn.z, y: 0, vy: 0,
    vx: 0, vz: 0,
    yaw: 0, pitch: 0,           // yaw 0 faces -z (north, toward the sites)
    hp: 100, armor: 0, alive: true,
    crouched: false, onGround: true,
    weapons: { p9: { mag: 12, reserve: 60 } },
    current: 'p9',
    grenades: { frag: 0, flash: 0 },
    recoil: 0, bloom: 0,        // recoil kick (radians) and spread bloom
    fireCooldown: 0, reloadT: 0,
    scoped: false,
    stepT: 0,
    plantT: 0, defuseT: 0,
    flashT: 0,                   // blinded seconds remaining
    lastDamageFrom: null,
  };
}

export function resetPlayerForRound(p, spawn, keepWeapons) {
  p.x = spawn.x; p.z = spawn.z; p.y = 0; p.vy = 0; p.vx = 0; p.vz = 0;
  p.yaw = 0; p.pitch = 0;
  p.hp = 100; p.alive = true;
  p.armor = keepWeapons ? p.armor : 0;
  p.recoil = 0; p.bloom = 0; p.fireCooldown = 0; p.reloadT = 0;
  p.scoped = false; p.plantT = 0; p.defuseT = 0; p.flashT = 0;
  if (!keepWeapons) {
    p.weapons = { p9: { mag: 12, reserve: 60 } };
    p.current = 'p9';
    p.grenades = { frag: 0, flash: 0 };
  }
}

export function giveWeapon(p, id) {
  const def = WEAPONS[id];
  if (!def) return false;
  if (p.weapons[id]) {
    // Top up reserve ammo on re-buy.
    p.weapons[id].reserve = Math.min(def.reserve, p.weapons[id].reserve + def.mag * 2);
  } else {
    p.weapons[id] = { mag: def.mag, reserve: def.reserve };
  }
  p.current = id;
  return true;
}

// Fixed-step movement. Returns true when a footstep sound is due.
export function stepPlayer(p, input, dt) {
  if (!p.alive) return false;
  const k = input.keys;
  p.crouched = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC');
  const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
  const strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  const walking = k.has('ShiftLeft') || k.has('ShiftRight');
  let speed = p.crouched ? CROUCH_SPEED : (walking ? WALK_SPEED * 0.55 : WALK_SPEED);
  if (p.scoped) speed *= 0.45;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  // Forward is -z rotated by yaw: (sin yaw * -1? ) yaw 0 faces -z.
  let mx = -sy * fwd + cy * strafe;
  let mz = -cy * fwd - sy * strafe;
  const ml = Math.hypot(mx, mz);
  if (ml > 0.001) { mx /= ml; mz /= ml; }
  p.vx += mx * ACCEL * dt;
  p.vz += mz * ACCEL * dt;
  // Friction when no input, and a cap at current speed.
  const damp = Math.exp(-FRICTION * dt);
  if (ml < 0.001) { p.vx *= damp; p.vz *= damp; }
  const sp = Math.hypot(p.vx, p.vz);
  const cap = speed * (p.crouched ? 1 : 1.15);
  if (sp > cap) { p.vx *= cap / sp; p.vz *= cap / sp; }

  p.x += p.vx * dt;
  p.z += p.vz * dt;
  const [cx, cz] = collideCircle(p.x, p.z, PLAYER_RADIUS);
  p.x = cx; p.z = cz;

  // Jump + gravity (ground is y=0; crates are not climbable).
  if (k.has('Space') && p.onGround) { p.vy = 5.2; p.onGround = false; }
  p.vy -= 16 * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }

  // Recoil recovery and bloom decay.
  p.recoil *= Math.exp(-9 * dt);
  p.bloom = Math.max(0, p.bloom - dt * 0.055);
  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  if (p.reloadT > 0) p.reloadT -= dt;
  if (p.flashT > 0) p.flashT -= dt;

  // Footstep timing.
  const moving = Math.hypot(p.vx, p.vz);
  let stepped = false;
  if (moving > 1.2 && p.onGround) {
    p.stepT -= dt * moving;
    if (p.stepT <= 0) { p.stepT = p.crouched ? 2.6 : 2.0; stepped = true; }
  }
  return stepped;
}

export function applyDamageToPlayer(p, dmg, fromName) {
  if (!p.alive) return;
  let remaining = dmg;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, remaining * 0.5);
    p.armor -= absorbed;
    remaining -= absorbed;
  }
  p.hp -= remaining;
  p.lastDamageFrom = fromName;
  if (p.hp <= 0) { p.hp = 0; p.alive = false; }
}

// Camera position for this frame (eye height + recoil kick + bob).
export function playerEye(p, time) {
  const eyeH = p.crouched ? EYE_CROUCH : EYE_STAND;
  const bob = p.onGround && Math.hypot(p.vx, p.vz) > 1 ? Math.sin(time * 11) * 0.03 : 0;
  return [p.x, p.y + eyeH + bob, p.z, p.pitch + p.recoil, p.yaw];
}

export function currentWeaponDef(p) { return WEAPONS[p.current]; }
export function currentAmmo(p) { return p.weapons[p.current]; }
