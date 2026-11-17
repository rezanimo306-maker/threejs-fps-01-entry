// weapons.js — player weapon handling: fire rate, recoil and spread, reload,
// weapon switching and grenade throws. Spread punishes moving fire and rewards
// standing still and crouching; recoil kicks the view and blooms the crosshair.
import { rayShoot, aimDir, weaponDamage, throwGrenade } from './combat.js';
import { currentWeaponDef, currentAmmo } from './player.js';
import { sfx } from './audio.js';

export function weaponSpread(p, def) {
  const moving = Math.hypot(p.vx, p.vz);
  const moveFactor = Math.min(1, moving / 5.2);
  let spread = def.spread;
  spread += def.moveSpread * moveFactor;
  if (!p.onGround) spread += 0.03;
  if (p.crouched) spread *= 0.62;
  if (p.scoped) spread *= 0.25;
  spread += p.bloom;
  return spread;
}

// Fire one trigger pull (all pellets). hooks: { tracer, impact, noise, onShot }.
// Returns 'fired' | 'empty' | 'reloading' | 'cooldown' | 'dead'.
export function firePlayer(state, p, hooks) {
  if (!p.alive) return 'dead';
  if (p.reloadT > 0) return 'reloading';
  if (p.fireCooldown > 0) return 'cooldown';
  const def = currentWeaponDef(p);
  const ammo = currentAmmo(p);
  if (ammo.mag <= 0) { sfx.dryFire(); startReload(p); return 'empty'; }
  ammo.mag -= 1;
  p.fireCooldown = 60 / def.rpm;
  const spread = weaponSpread(p, def);
  const eyeH = p.crouched ? 1.08 : 1.62;
  const ox = p.x, oy = p.y + eyeH, oz = p.z;
  let anyHit = false;
  for (let pellet = 0; pellet < def.pellets; pellet++) {
    const sx = (Math.random() * 2 - 1) * spread;
    const sy = (Math.random() * 2 - 1) * spread;
    const dir = aimDir(p.yaw, p.pitch + p.recoil * 0.4, sx, sy);
    const hit = rayShoot(ox, oy, oz, dir.x, dir.y, dir.z, 120, state.bots, 'ember', null);
    state.stats.shots += 1;
    if (hit) {
      hooks.tracer(ox, oy, oz, hit.pointX, hit.pointY, hit.pointZ, def.tracer);
      if (hit.bot) {
        const dmg = weaponDamage(def, hit.part, hit.dist);
        hooks.damageBot(hit.bot, dmg, hit.part, 'You');
        anyHit = true;
      } else {
        hooks.impact(hit.pointX, hit.pointY, hit.pointZ);
      }
    } else {
      const ex = ox + dir.x * 60, ey = oy + dir.y * 60, ez = oz + dir.z * 60;
      hooks.tracer(ox, oy, oz, ex, ey, ez, def.tracer);
    }
  }
  // Recoil: view kick + bloom. Standing still keeps the gun tight.
  p.recoil = Math.min(0.09, p.recoil + def.recoil);
  p.bloom = Math.min(0.05, p.bloom + def.recoil * 0.9);
  sfx.shot(p.current);
  hooks.noise(p.x, p.z, 26);
  hooks.muzzle();
  if (hooks.onShot) hooks.onShot(anyHit);
  return 'fired';
}

export function startReload(p) {
  if (p.reloadT > 0 || !p.alive) return false;
  const def = currentWeaponDef(p);
  const ammo = currentAmmo(p);
  if (ammo.mag >= def.mag || ammo.reserve <= 0) return false;
  p.reloadT = def.reload;
  sfx.reload();
  return true;
}

// Called when reloadT reaches 0 (checked by main.js each step).
export function finishReload(p) {
  const def = currentWeaponDef(p);
  const ammo = currentAmmo(p);
  const need = def.mag - ammo.mag;
  const take = Math.min(need, ammo.reserve);
  ammo.mag += take;
  ammo.reserve -= take;
}

export function switchWeapon(p, id) {
  if (!p.weapons[id] || p.current === id || !p.alive) return false;
  p.current = id;
  p.reloadT = 0;
  p.scoped = false;
  p.fireCooldown = Math.max(p.fireCooldown, 0.25);
  return true;
}

export function throwPlayerGrenade(state, p, pool, kind, hooks) {
  if (!p.alive || p.grenades[kind] <= 0) return false;
  p.grenades[kind] -= 1;
  const eyeH = p.crouched ? 1.08 : 1.62;
  const dir = aimDir(p.yaw, p.pitch, 0, 0);
  const g = throwGrenade(pool, kind, p.x, p.y + eyeH, p.z, dir.x, dir.y, dir.z);
  if (g) {
    sfx.grenadeThrow();
    if (hooks) hooks.grenadeThrown(g);
    return true;
  }
  return false;
}
