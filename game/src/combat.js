// combat.js — shooting, hitboxes and grenades. All hit tests are pure math
// (ray vs sphere / box), no three.js Raycaster, no per-frame allocation:
// shared temp objects are reused by every shot.
import { raySolids } from './map.js';
import { GRENADE_FRAG } from './state.js';

const _dir = { x: 0, y: 0, z: 0 };
const _hit = { dist: 0, pointX: 0, pointY: 0, pointZ: 0, bot: null, part: null };

// Ray from origin along dir (unit). Tests bot hitboxes first (head sphere r 0.21
// at eye+1.56, body sphere r 0.42 at +1.0, legs sphere r 0.34 at +0.45), then walls.
// Bots on `skipTeam` are ignored. Returns a reused _hit record, or null.
export function rayShoot(ox, oy, oz, dx, dy, dz, maxDist, bots, skipTeam, selfBot) {
  const wall = raySolids(ox, oy, oz, dx, dy, dz, maxDist);
  const wallDist = wall ? wall.dist : maxDist;
  let best = wallDist;
  let bestBot = null, bestPart = null;
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    if (!b.alive || b.team === skipTeam || b === selfBot) continue;
    const parts = [
      ['head', b.x, b.y + 1.56, b.z, 0.23],
      ['body', b.x, b.y + 1.02, b.z, 0.44],
      ['legs', b.x, b.y + 0.45, b.z, 0.36],
    ];
    for (let j = 0; j < 3; j++) {
      const pt = parts[j];
      const t = raySphere(ox, oy, oz, dx, dy, dz, pt[1], pt[2], pt[3], pt[4]);
      if (t !== null && t < best) { best = t; bestBot = b; bestPart = pt[0]; }
    }
  }
  if (bestBot) {
    _hit.dist = best; _hit.bot = bestBot; _hit.part = bestPart;
  } else if (wall) {
    _hit.dist = wallDist; _hit.bot = null; _hit.part = 'wall';
  } else {
    return null;
  }
  _hit.pointX = ox + dx * best; _hit.pointY = oy + dy * best; _hit.pointZ = oz + dz * best;
  return _hit;
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  const t0 = tca - thc;
  return t0 >= 0 ? t0 : tca + thc;
}

// Direction from a yaw/pitch pair plus spread offsets (radians).
export function aimDir(yaw, pitch, spreadX, spreadY) {
  const p = pitch + spreadY;
  const y = yaw + spreadX;
  const cp = Math.cos(p);
  _dir.x = -Math.sin(y) * cp;
  _dir.y = Math.sin(p);
  _dir.z = -Math.cos(y) * cp;
  return _dir;
}

export function weaponDamage(def, part, dist) {
  let dmg = def.damage;
  if (dist > def.range) dmg *= Math.max(0.4, 1 - (dist - def.range) / (def.range * 2));
  if (part === 'head') dmg *= def.headMult;
  return dmg;
}

// --- Grenades (pooled, max 6 live) ---------------------------------------
export function makeGrenadePool() {
  const pool = [];
  for (let i = 0; i < 6; i++) {
    pool.push({ active: false, kind: 'frag', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, mesh: null, bounces: 0 });
  }
  return pool;
}

export function throwGrenade(pool, kind, x, y, z, dx, dy, dz) {
  for (const g of pool) {
    if (g.active) continue;
    g.active = true; g.kind = kind;
    g.x = x; g.y = y; g.z = z;
    g.vx = dx * 13; g.vy = dy * 13 + 3.2; g.vz = dz * 13;
    g.fuse = kind === 'frag' ? 2.2 : 1.4;
    g.bounces = 0;
    return g;
  }
  return null;
}

// Fixed-step grenade physics: gravity, ground bounce, wall bounce (AABB clamp).
export function stepGrenades(pool, dt, onExplode, onBounce) {
  for (const g of pool) {
    if (!g.active) continue;
    g.fuse -= dt;
    g.vy -= 14 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    if (g.y < 0.12) {
      g.y = 0.12;
      if (Math.abs(g.vy) > 1.5 && g.bounces < 3) { g.vy = -g.vy * 0.42; g.vx *= 0.7; g.vz *= 0.7; g.bounces++; if (onBounce) onBounce(g); }
      else { g.vy = 0; g.vx *= 0.85; g.vz *= 0.85; }
    }
    if (g.fuse <= 0) {
      g.active = false;
      if (onExplode) onExplode(g);
    }
  }
}

export function grenadeDamage(g, tx, ty, tz) {
  const dx = tx - g.x, dy = ty - g.y, dz = tz - g.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d > GRENADE_FRAG.radius) return 0;
  return GRENADE_FRAG.damage * (1 - d / (GRENADE_FRAG.radius * 1.25));
}
