// bots.js — bot AI. Attackers run routes to a site and plant the spike;
// defenders hold sites, rotate on noise, and defuse after a plant.
// Bots see (line of sight + range + field of view), hear gunfire, strafe while
// engaging, and shoot with distance- and movement-based accuracy.
//
// Wardens (defenders) are the teeth of this game, and they fight like it:
// they snap onto close targets fast, push a lost target's last known spot
// instead of standing around, send one flanker around the other lane, close
// in on a player who camps one spot, and converge on a planted spike with a
// covered defuser instead of trickling in one by one. Round 2+ makes them a
// little quicker and a little tighter. They are still fallible at long range —
// a moving target at 30 m is hard for them to hit — so the game stays winnable.
import { WEAPONS, BOT_NAMES, PLANT_TIME, DEFUSE_TIME } from './state.js';
import { MAP, findPath, nearestWaypoint, segmentBlocked, collideCircle } from './map.js';
import { createBotMesh } from './world.js';
import { sfx } from './audio.js';

const BOT_SPEED = 3.6;       // ember attackers
const WARDEN_SPEED = 3.9;    // defenders are quicker on their own ground
const SEE_RANGE = 34;
const WARDEN_SEE_RANGE = 36;
const HEAR_RANGE = 30;
const WARDEN_HEAR_RANGE = 36;
const HUNT_TIME = 6;         // seconds a defender hunts a lost target's last spot
const CAMP_TIME = 6;         // seconds the player can sit still before defenders close in
const FLANK_COOLDOWN = 12;   // seconds between flank plays

// Anti-camp tracker (module state, reset every round): where the player last
// was, and how long they have sat within arm's reach of it.
let campX = 0, campZ = 0, campT = 0, flankCd = 0;

export const botEvents = {
  onBotDeath: null,   // (bot, killerName, headshot) => void
  onPlayerDeath: null,
};

let botId = 0;

export function createBots(state, scene) {
  const bots = [];
  const mk = (team, i, weaponId) => {
    const mesh = createBotMesh(team === 'ember' ? 0xff8c2e : 0x37b6c9);
    scene.add(mesh.group);
    const b = {
      id: botId++, name: BOT_NAMES[team][i], team,
      weapon: weaponId,
      x: 0, z: 0, y: 0, yaw: 0, hp: 100, armor: 0, alive: true,
      speed: (team === 'warden' ? WARDEN_SPEED : BOT_SPEED) * (0.9 + Math.random() * 0.25),
      seeRange: team === 'warden' ? WARDEN_SEE_RANGE : SEE_RANGE,
      flanker: false,
      state: 'route', path: [], pathI: 0, holdNode: -1, holdT: 0,
      target: null, targetIsPlayer: false, reactionT: 0,
      burstLeft: 0, fireCooldown: 0, reloadT: 0, mag: WEAPONS[weaponId].mag,
      strafeDir: 1, strafeT: 0, flashT: 0,
      plantT: 0, defuseT: 0, hasBomb: false,
      site: null, roamT: 0, walkPhase: Math.random() * 6,
      lastX: 0, lastZ: 0, huntT: 0, flanking: false, guardNode: -1, scanT: 0,
      mesh,
    };
    bots.push(b);
    return b;
  };
  // 4 allied attackers (player is the 5th ember) + 5 defenders.
  mk('ember', 0, 'vk47'); mk('ember', 1, 'hornet'); mk('ember', 2, 'vk47'); mk('ember', 3, 'breacher');
  mk('warden', 0, 'vk47'); mk('warden', 1, 'vk47'); mk('warden', 2, 'hornet'); mk('warden', 3, 'longbow'); mk('warden', 4, 'breacher');
  bots[8].flanker = true; // 'Anchor' takes the wide route around the other lane.
  state.bots = bots;
  return bots;
}

export function resetBotsForRound(state) {
  const attackers = state.bots.filter((b) => b.team === 'ember');
  const defenders = state.bots.filter((b) => b.team === 'warden');
  attackers.forEach((b, i) => {
    const s = MAP.spawns.ember[i + 1] || MAP.spawns.ember[0];
    respawnBot(b, s.x, s.z, 0);
    // Two push A, one mid, one B (rotated by round so routes vary).
    const lane = (i + state.round) % 3;
    b.site = lane === 0 ? 'A' : lane === 1 ? 'B' : null;
    const dest = b.site ? MAP.sites[b.site] : { x: 0, z: -3 };
    b.path = findPath(b.x, b.z, dest.x, dest.z);
    b.pathI = 0;
    b.state = 'route';
    b.hasBomb = false;
  });
  // Bomb starts with the player; an attacker picks it up if the player dies.
  state.bomb.carrier = 'player';
  campX = 0; campZ = 0; campT = 0; flankCd = 0;
  const holds = [11, 12, 13, 14, 15]; // A site, B site, mid, A hold, B hold
  defenders.forEach((b, i) => {
    const s = MAP.spawns.warden[i];
    respawnBot(b, s.x, s.z, Math.PI);
    // Round ramp: defenders get a little quicker every round (cap +18%).
    b.speed = WARDEN_SPEED * (0.9 + Math.random() * 0.2) * Math.min(1.18, 1 + 0.06 * (state.round - 1));
    b.holdNode = holds[i];
    const w = MAP.waypoints[b.holdNode];
    b.path = findPath(b.x, b.z, w.x, w.z);
    b.pathI = 0;
    b.state = 'route';
  });
}

function respawnBot(b, x, z, yaw) {
  b.x = x; b.z = z; b.y = 0; b.yaw = yaw;
  b.hp = 100; b.armor = 0; b.alive = true;
  b.target = null; b.reactionT = 0; b.burstLeft = 0; b.fireCooldown = 0; b.reloadT = 0;
  b.mag = WEAPONS[b.weapon].mag;
  b.flashT = 0; b.plantT = 0; b.defuseT = 0; b.holdT = 0;
  b.lastX = x; b.lastZ = z; b.huntT = 0; b.flanking = false; b.guardNode = -1; b.scanT = 0;
  b.mesh.group.visible = true;
}

export function aliveCount(bots, team) {
  let n = 0;
  for (const b of bots) if (b.team === team && b.alive) n++;
  return n;
}

// Line of sight + range + rough field of view from a bot to a point.
export function botCanSee(b, tx, ty, tz) {
  const dx = tx - b.x, dz = tz - b.z;
  const dist = Math.hypot(dx, dz);
  if (dist > (b.seeRange || SEE_RANGE)) return false;
  const ang = Math.atan2(-dx, -dz);
  let diff = ang - b.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > 1.9 && dist > 6) return false; // outside ~110° view cone
  return !segmentBlocked(b.x, 1.5, b.z, tx, ty, tz);
}

function nearestEnemy(state, b) {
  let best = null, bestD = 1e9;
  const p = state.player;
  if (p.alive && b.team !== 'ember') {
    const d = Math.hypot(p.x - b.x, p.z - b.z);
    if (d < bestD) { bestD = d; best = { isPlayer: true, ref: p, d }; }
  }
  for (const o of state.bots) {
    if (!o.alive || o.team === b.team) continue;
    const d = Math.hypot(o.x - b.x, o.z - b.z);
    if (d < bestD) { bestD = d; best = { isPlayer: false, ref: o, d }; }
  }
  return best;
}

export function damageBot(state, bot, dmg, part, attackerName) {
  if (!bot.alive) return;
  let remaining = dmg;
  if (bot.armor > 0) {
    const absorbed = Math.min(bot.armor, remaining * 0.5);
    bot.armor -= absorbed; remaining -= absorbed;
  }
  bot.hp -= remaining;
  if (bot.hp <= 0) {
    bot.hp = 0; bot.alive = false;
    bot.mesh.group.visible = false;
    if (bot.hasBomb) {
      bot.hasBomb = false;
      state.bomb.state = 'dropped';
      state.bomb.x = bot.x; state.bomb.z = bot.z;
      state.bomb.carrier = null;
    }
    state.killfeed.unshift({ killer: attackerName, victim: bot.name, headshot: part === 'head' });
    if (state.killfeed.length > 5) state.killfeed.pop();
    if (attackerName === 'You') {
      state.money += 300;
      state.stats.kills += 1;
      if (part === 'head') state.stats.headshots += 1;
      sfx.kill();
    }
    if (botEvents.onBotDeath) botEvents.onBotDeath(bot, attackerName, part === 'head');
  }
}

// Flank play: send the designated flanker at the player's position by the
// opposite lane, so the pressure comes from two directions at once.
function triggerFlank(state, p) {
  const f = state.bots.find((b) => b.flanker && b.alive);
  if (!f || f.target || f.flanking) return;
  flankCd = FLANK_COOLDOWN;
  const flankNode = p.x <= 0 ? 10 : 9; // B approach for a west player, A for east
  const fw = MAP.waypoints[flankNode];
  f.path = findPath(f.x, f.z, fw.x, fw.z).concat(findPath(fw.x, fw.z, p.x, p.z).slice(1));
  f.pathI = 0; f.huntT = 0; f.flanking = true; f.state = 'hunt';
  f.lastX = p.x; f.lastZ = p.z;
}

// One fixed step for all bots. ctx: { player, hooks } where hooks has
// tracer(fx,fy,fz,tx,ty,tz,color), noise(x,z,range), damagePlayer(dmg,from).
export function stepBots(state, dt, ctx) {
  const bots = state.bots;
  if (flankCd > 0) flankCd -= dt;

  // Nearest living defender to a planted spike is the defuser; the rest guard.
  let defuser = null;
  if (state.bomb.state === 'planted') {
    let bd = 1e9;
    for (const w of bots) {
      if (w.team !== 'warden' || !w.alive) continue;
      const d = Math.hypot(state.bomb.x - w.x, state.bomb.z - w.z);
      if (d < bd) { bd = d; defuser = w; }
    }
  }

  // Anti-camp: a live player who sits in one spot gets hunted down.
  const p = state.player;
  if (state.phase === 'live' && p.alive) {
    if (Math.hypot(p.x - campX, p.z - campZ) > 1.5) {
      campX = p.x; campZ = p.z; campT = 0;
    } else {
      campT += dt;
      if (campT >= CAMP_TIME) {
        campT = 0; campX = p.x; campZ = p.z;
        for (const w of bots) {
          if (w.team !== 'warden' || !w.alive || w.target) continue;
          w.lastX = p.x; w.lastZ = p.z; w.huntT = 0; w.flanking = false;
          w.path = findPath(w.x, w.z, p.x, p.z); w.pathI = 0; w.state = 'hunt';
        }
      }
    }
  }

  for (const b of bots) {
    if (!b.alive) continue;
    if (b.flashT > 0) b.flashT -= dt;
    if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) b.mag = WEAPONS[b.weapon].mag; }
    if (b.fireCooldown > 0) b.fireCooldown -= dt;

    // Perception: nearest visible enemy.
    const seen = nearestEnemy(state, b);
    let sees = false;
    if (seen && b.flashT <= 0) {
      const t = seen.ref;
      const ty = seen.isPlayer ? (t.crouched ? 1.2 : 1.5) : 1.4;
      sees = botCanSee(b, t.x, ty, t.z);
    }
    if (sees) {
      if (b.target !== seen.ref) {
        b.target = seen.ref; b.targetIsPlayer = seen.isPlayer;
        // Defenders snap onto a target faster the closer it is; round 2+
        // shaves a little more off. A far target still gets a human beat to
        // react — nobody should die the instant a round goes live.
        // Attackers keep the slower reactions.
        const d0 = seen.d;
        const base = b.team === 'warden' ? (d0 < 10 ? 0.12 : d0 < 20 ? 0.2 : 0.55) : 0.35;
        const spread = b.team === 'warden' ? (d0 < 20 ? 0.15 : 0.3) : 0.35;
        b.reactionT = base + Math.random() * spread;
        if (b.team === 'warden') b.reactionT *= Math.max(0.7, 1 - 0.06 * (state.round - 1));
        b.state = 'engage';
        // Flank play: the first defender to spot the player sends the flanker
        // around the other lane instead of everyone funnelling one way.
        if (b.team === 'warden' && seen.isPlayer && flankCd <= 0) triggerFlank(state, seen.ref);
      }
    } else if (b.target) {
      // Lost sight: defenders hunt the last known spot; attackers fall back.
      if (b.team === 'warden') {
        b.lastX = b.target.x; b.lastZ = b.target.z; b.huntT = 0; b.flanking = false;
        b.path = findPath(b.x, b.z, b.lastX, b.lastZ); b.pathI = 0;
        b.state = 'hunt';
      } else {
        b.state = 'route';
      }
      b.target = null;
      b.reactionT = 0;
    }

    // Hearing: recent gunfire from the other team pulls bots toward it.
    // A bot mid-hunt stays committed to the hunt.
    if (!b.target && state.noise.length && b.state !== 'hunt') {
      const n = state.noise[state.noise.length - 1];
      if (n.team !== b.team) {
        const d = Math.hypot(n.x - b.x, n.z - b.z);
        const hear = b.team === 'warden' ? WARDEN_HEAR_RANGE : HEAR_RANGE;
        if (d < hear && b.state !== 'engage') {
          const goal = nearestWaypoint(n.x, n.z);
          b.path = findPath(b.x, b.z, MAP.waypoints[goal].x, MAP.waypoints[goal].z);
          b.pathI = 0;
          b.state = 'route';
          b.holdT = 0;
        }
      }
    }

    if (b.state === 'engage' && b.target) stepEngage(state, b, dt, ctx);
    else stepMove(state, b, dt);

    // Bomb behaviours.
    if (b.team === 'ember') {
      if (state.bomb.state === 'dropped' && !b.hasBomb && !b.target) {
        const d = Math.hypot(state.bomb.x - b.x, state.bomb.z - b.z);
        if (d < 1.4) {
          b.hasBomb = true; state.bomb.state = 'carried'; state.bomb.carrier = b;
        } else if (b.state !== 'route') {
          b.path = findPath(b.x, b.z, state.bomb.x, state.bomb.z);
          b.pathI = 0; b.state = 'route';
        }
      }
      if (b.hasBomb && !b.target && state.bomb.state === 'carried') {
        const site = MAP.sites[b.site || 'A'];
        const d = Math.hypot(site.x - b.x, site.z - b.z);
        if (d < site.r * 0.7) {
          b.plantT += dt;
          if (b.plantT >= PLANT_TIME) {
            state.bomb.state = 'planted';
            state.bomb.site = b.site || 'A';
            state.bomb.x = b.x; state.bomb.z = b.z;
            state.bomb.fuseT = 35;
            b.hasBomb = false;
            sfx.plantBeep();
          }
        } else if (b.state !== 'route') {
          b.path = findPath(b.x, b.z, site.x, site.z);
          b.pathI = 0; b.state = 'route';
        }
      }
    } else if (state.bomb.state === 'planted' && !b.target) {
      if (b === defuser) {
        // The defuser goes straight for the spike.
        const d = Math.hypot(state.bomb.x - b.x, state.bomb.z - b.z);
        if (d < 1.6) {
          b.defuseT += dt;
          if (b.defuseT >= DEFUSE_TIME) {
            state.bomb.state = 'defused';
            state.bomb.defuseT = 0;
          }
        } else if (b.state !== 'route') {
          b.path = findPath(b.x, b.z, state.bomb.x, state.bomb.z);
          b.pathI = 0; b.state = 'route';
        }
      } else {
        // Guards take covered positions near the planted site and hold them,
        // so the defuser is covered instead of the team trickling in one by one.
        const site = state.bomb.site || 'A';
        const guards = site === 'A' ? [9, 14, 16] : [10, 15, 17];
        const node = guards[state.bots.indexOf(b) % guards.length];
        if (b.guardNode !== node || b.state !== 'route') {
          b.guardNode = node;
          const w = MAP.waypoints[node];
          b.path = findPath(b.x, b.z, w.x, w.z); b.pathI = 0; b.state = 'route';
        }
      }
    }

    // Separation so bots do not stack.
    for (const o of bots) {
      if (o === b || !o.alive) continue;
      const dx = b.x - o.x, dz = b.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.64 && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (0.8 - d) * 0.5 / d;
        b.x += dx * push; b.z += dz * push;
      }
    }
    const [cx, cz] = collideCircle(b.x, b.z, 0.38);
    b.x = cx; b.z = cz;
  }
  // Noise events age out.
  if (state.noise.length > 8) state.noise.splice(0, state.noise.length - 8);
}

function stepMove(state, b, dt) {
  // Defenders push 15% faster once the spike is planted.
  const push = state.bomb.state === 'planted' && b.team === 'warden' ? 1.15 : 1;
  if (b.state === 'hunt') {
    // Hunting a last known spot: run the path, sweep the area on arrival,
    // then fall back to the hold node if nothing turns up.
    b.huntT += dt;
    if (b.pathI < b.path.length) {
      const w = MAP.waypoints[b.path[b.pathI]];
      const dx = w.x - b.x, dz = w.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) { b.pathI++; return; }
      const sp = b.speed * push * (b.flashT > 0 ? 0.4 : 1);
      b.x += (dx / d) * sp * dt;
      b.z += (dz / d) * sp * dt;
      b.yaw = turnToward(b.yaw, Math.atan2(-dx, -dz), dt * 6);
      b.walkPhase += dt * sp * 2.4;
      return;
    }
    b.scanT += dt;
    b.yaw += dt * 1.2;
    b.walkPhase += dt * 0.4;
    if (b.scanT > 2 || b.huntT > HUNT_TIME) {
      b.scanT = 0; b.flanking = false;
      const w = MAP.waypoints[b.holdNode >= 0 ? b.holdNode : 13];
      b.path = findPath(b.x, b.z, w.x, w.z); b.pathI = 0; b.state = 'route';
    }
    return;
  }
  // Follow the waypoint path; defenders hold at their node when they arrive.
  if (b.pathI < b.path.length) {
    const w = MAP.waypoints[b.path[b.pathI]];
    const dx = w.x - b.x, dz = w.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) { b.pathI++; return; }
    const sp = b.speed * push * (b.flashT > 0 ? 0.4 : 1);
    b.x += (dx / d) * sp * dt;
    b.z += (dz / d) * sp * dt;
    b.yaw = turnToward(b.yaw, Math.atan2(-dx, -dz), dt * 6);
    b.walkPhase += dt * sp * 2.4;
  } else if (b.team === 'warden') {
    // Hold position, slowly scan.
    b.holdT += dt;
    b.yaw += Math.sin(b.holdT * 0.5) * dt * 0.35;
    b.walkPhase += dt * 0.4;
  } else {
    // Attacker with no path: drift toward the site.
    const site = MAP.sites[b.site || 'A'];
    const dx = site.x - b.x, dz = site.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d > 1) {
      b.x += (dx / d) * b.speed * dt;
      b.z += (dz / d) * b.speed * dt;
      b.yaw = turnToward(b.yaw, Math.atan2(-dx, -dz), dt * 6);
    }
  }
}

function stepEngage(state, b, dt, ctx) {
  const t = b.target;
  if (!t || (t !== state.player && !t.alive) || (t === state.player && !t.alive)) {
    b.target = null; b.state = 'route'; return;
  }
  const dx = t.x - b.x, dz = t.z - b.z;
  const dist = Math.hypot(dx, dz);
  const wantYaw = Math.atan2(-dx, -dz);
  b.yaw = turnToward(b.yaw, wantYaw, dt * 9);
  // Strafe sideways while fighting; defenders strafe quicker, keep closing
  // to mid range instead of standing still, and back off only point blank.
  const isWarden = b.team === 'warden';
  b.strafeT -= dt;
  if (b.strafeT <= 0) { b.strafeDir = Math.random() < 0.5 ? -1 : 1; b.strafeT = 0.7 + Math.random() * 0.9; }
  const strafe = b.strafeDir * b.speed * (isWarden ? 0.55 : 0.45);
  const approach = dist > 14 ? b.speed * 0.5 : dist < 3 ? -b.speed * 0.3 : (isWarden ? b.speed * 0.15 : 0);
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  const rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
  b.x += (fx * approach + rx * strafe) * dt;
  b.z += (fz * approach + rz * strafe) * dt;
  b.walkPhase += dt * 3;

  if (b.reactionT > 0) { b.reactionT -= dt; return; }
  if (b.reloadT > 0 || b.fireCooldown > 0) return;
  const def = WEAPONS[b.weapon];
  if (b.mag <= 0) { b.reloadT = def.reload; return; }
  if (b.burstLeft <= 0) {
    if (Math.random() < (isWarden ? 0.25 : 0.35)) return; // burst pause
    b.burstLeft = def.auto ? (isWarden ? 4 : 3) + ((Math.random() * 3) | 0) : 1;
  }
  b.burstLeft -= 1;
  b.mag -= 1;
  b.fireCooldown = 60 / def.rpm;
  fireBotShot(state, b, t, dist, ctx);
}

function fireBotShot(state, b, t, dist, ctx) {
  const def = WEAPONS[b.weapon];
  const mx = b.x + Math.sin(b.yaw) * 0.3, my = 1.35, mz = b.z + Math.cos(b.yaw) * 0.3;
  const targetMoving = t === state.player
    ? Math.hypot(t.vx, t.vz) > 2
    : true;
  // Hit probability: close + still = dangerous; far + moving = spray.
  // Defenders hit harder up close and on a still target, and tighten a touch
  // each round — but fall off steeply past 20 m, so a long lane is suppressive
  // fire, not an execution. It is never an aimbot.
  let pHit;
  if (b.team === 'warden') {
    pHit = 0.38 - dist * 0.006 - (targetMoving ? 0.08 : -0.06) - (t.crouched ? 0.05 : 0);
    if (dist < 8) pHit += 0.10;
    if (b.weapon === 'longbow') pHit = 0.5 - dist * 0.004;
    if (b.weapon === 'breacher' && dist > 10) pHit = 0.08;
    pHit += Math.min(0.06, 0.02 * (state.round - 1));
    pHit = Math.max(0.04, Math.min(0.62, pHit));
  } else {
    pHit = 0.37 - dist * 0.004 - (targetMoving ? 0.08 : 0) - (t.crouched ? 0.05 : 0);
    if (b.weapon === 'longbow') pHit = 0.5 - dist * 0.003;
    if (b.weapon === 'breacher' && dist > 10) pHit = 0.08;
    pHit = Math.max(0.03, Math.min(0.62, pHit));
  }
  const hit = Math.random() < pHit;
  const tx = t.x + (hit ? 0 : (Math.random() * 2 - 1) * 1.6);
  const ty = t === state.player ? (t.crouched ? 1.0 : 1.45) : 1.3;
  const tz = t.z + (hit ? 0 : (Math.random() * 2 - 1) * 1.6);
  ctx.hooks.tracer(mx, my, mz, tx, ty, tz, def.tracer);
  const isPlayer = t === state.player;
  const dToPlayer = Math.hypot(state.player.x - b.x, state.player.z - b.z);
  if (dToPlayer < 40) sfx.enemyShot(dToPlayer);
  ctx.hooks.noise(b.x, b.z, 26);
  if (!hit) return;
  let dmg = def.damage;
  if (dist > def.range) dmg *= 0.6;
  const headshot = Math.random() < (b.team === 'warden' && dist < 10 ? 0.13 : 0.09);
  if (headshot) dmg *= def.headMult;
  if (isPlayer) {
    ctx.hooks.damagePlayer(dmg, b.name);
  } else {
    damageBot(state, t, dmg, headshot ? 'head' : 'body', b.name);
  }
}

export function turnToward(yaw, want, maxStep) {
  let d = want - yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) d = maxStep;
  if (d < -maxStep) d = -maxStep;
  return yaw + d;
}
