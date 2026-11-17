// rounds.js — round lifecycle, economy and the buy menu.
// freeze (buy) -> live -> roundEnd -> freeze ... ; first to WIN_ROUNDS wins.
// Win by elimination, by spike detonation, by defusal, or by timer (defenders
// win a timeout when the spike is not planted).
import {
  ROUND_TIME, FREEZE_TIME, FUSE_TIME, PLANT_TIME, DEFUSE_TIME, WIN_ROUNDS,
  START_MONEY, WIN_REWARD, LOSS_REWARD, LOSS_STREAK_BONUS,
  PLANT_REWARD, WEAPONS, WEAPON_ORDER, GRENADE_FRAG, GRENADE_FLASH, ARMOR_PRICE,
} from './state.js';
import { MAP, siteAt } from './map.js';
import { resetPlayerForRound, giveWeapon } from './player.js';
import { resetBotsForRound, aliveCount } from './bots.js';
import { sfx } from './audio.js';

export const BUY_ITEMS = [
  ...WEAPON_ORDER.map((id) => ({ kind: 'weapon', id, name: WEAPONS[id].name, price: WEAPONS[id].price,
    desc: `DMG ${WEAPONS[id].damage} · ${WEAPONS[id].mag} rounds · ${WEAPONS[id].rpm} RPM` })),
  { kind: 'frag', id: 'frag', name: GRENADE_FRAG.name, price: GRENADE_FRAG.price, desc: 'Thrown explosive, 120 max damage in 7 m' },
  { kind: 'flash', id: 'flash', name: GRENADE_FLASH.name, price: GRENADE_FLASH.price, desc: 'Blinds bots looking at it for ~2.5 s' },
  { kind: 'armor', id: 'armor', name: 'KEVLAR VEST', price: ARMOR_PRICE, desc: 'Absorbs half of incoming damage' },
];

export function startMatch(state) {
  state.score = { ember: 0, warden: 0 };
  state.round = 1;
  state.money = START_MONEY;
  state.lossStreak = 0;
  state.stats = { shots: 0, hits: 0, kills: 0, headshots: 0, damage: 0 };
  startRound(state, false);
}

export function startRound(state, keepWeapons) {
  state.phase = 'freeze';
  state.phaseT = 0;
  state.roundTimer = ROUND_TIME;
  state.bomb = { state: 'carried', site: null, x: 0, z: 0, plantT: 0, fuseT: 0, defuseT: 0, carrier: 'player' };
  state.noise.length = 0;
  state.killfeed.length = 0;
  state.roundWinner = null;
  state.roundReason = '';
  const spawn = MAP.spawns.ember[(state.round - 1) % MAP.spawns.ember.length];
  resetPlayerForRound(state.player, spawn, keepWeapons);
  resetBotsForRound(state);
}

export function endRound(state, winner, reason) {
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
  state.phase = 'roundEnd';
  state.phaseT = 0;
  state.roundWinner = winner;
  state.roundReason = reason;
  state.score[winner] += 1;
  const playerWon = winner === 'ember';
  if (playerWon) {
    state.money += WIN_REWARD;
    state.lossStreak = 0;
    sfx.roundWin();
  } else {
    state.money += LOSS_REWARD + (state.lossStreak >= 1 ? LOSS_STREAK_BONUS : 0);
    state.lossStreak += 1;
    sfx.roundLose();
  }
  if (state.score[winner] >= WIN_ROUNDS) {
    state.phase = 'matchEnd';
    state.matchWinner = winner;
  }
}

// Fixed-step round logic. ctx: { hooks: { buyOpen } } — main.js wires the UI.
export function stepRounds(state, dt) {
  state.phaseT += dt;
  const p = state.player;
  if (state.phase === 'freeze') {
    if (state.phaseT >= FREEZE_TIME) {
      state.phase = 'live';
      state.phaseT = 0;
    }
    return;
  }
  if (state.phase === 'roundEnd') {
    if (state.phaseT >= 4.5) {
      if (state.phase === 'matchEnd') return;
      state.round += 1;
      startRound(state, true);
    }
    return;
  }
  if (state.phase !== 'live') return;

  // Timer: live countdown, or the fuse once planted.
  if (state.bomb.state === 'planted') {
    state.bomb.fuseT -= dt;
    state.roundTimer = Math.max(0, state.bomb.fuseT);
    if (state.bomb.fuseT <= 0) {
      endRound(state, 'ember', 'SPIKE DETONATED — SITE DESTROYED');
      return;
    }
  } else {
    state.roundTimer -= dt;
    if (state.roundTimer <= 0) {
      endRound(state, 'warden', 'TIME EXPIRED — SPIKE NOT PLANTED');
      return;
    }
  }
  if (state.bomb.state === 'defused') {
    endRound(state, 'warden', 'SPIKE DEFUSED');
    return;
  }

  // Elimination wins.
  const emberAlive = aliveCount(state.bots, 'ember') + (p.alive ? 1 : 0);
  const wardenAlive = aliveCount(state.bots, 'warden');
  if (wardenAlive === 0) { endRound(state, 'ember', 'ENEMY TEAM ELIMINATED'); return; }
  if (emberAlive === 0) { endRound(state, 'warden', 'YOUR TEAM ELIMINATED'); return; }

  // Player spike handling: pick up a dropped spike, plant, or defuse.
  if (p.alive) {
    if (state.bomb.state === 'dropped') {
      const d = Math.hypot(state.bomb.x - p.x, state.bomb.z - p.z);
      if (d < 1.4) {
        state.bomb.state = 'carried';
        state.bomb.carrier = 'player';
      }
    }
    const site = siteAt(p.x, p.z);
    const planting = state.bomb.state === 'carried' && state.bomb.carrier === 'player' && site && p.wantPlant;
    const defusing = state.bomb.state === 'planted' && site === state.bomb.site && p.wantPlant;
    if (planting) {
      p.plantT += dt;
      if (p.plantT >= PLANT_TIME) {
        state.bomb.state = 'planted';
        state.bomb.site = site;
        state.bomb.x = p.x; state.bomb.z = p.z;
        state.bomb.fuseT = FUSE_TIME;
        state.money += PLANT_REWARD;
        sfx.plantBeep();
        p.plantT = 0;
      }
    } else p.plantT = 0;
    if (defusing) {
      p.defuseT += dt;
      if (p.defuseT >= DEFUSE_TIME) {
        state.bomb.state = 'defused';
        p.defuseT = 0;
      }
    } else p.defuseT = 0;
  }
}

// Buy-menu purchase. Returns true on success.
export function buyItem(state, item) {
  const p = state.player;
  if (state.phase !== 'freeze' || !p.alive) return false;
  if (state.money < item.price) { sfx.denied(); return false; }
  if (item.kind === 'weapon') {
    if (p.weapons[item.id] && item.id !== 'p9') {
      // Already owned: top up ammo for a third of the price.
      if (state.money < Math.floor(item.price / 3)) { sfx.denied(); return false; }
      state.money -= Math.floor(item.price / 3);
      giveWeapon(p, item.id);
    } else {
      state.money -= item.price;
      giveWeapon(p, item.id);
    }
  } else if (item.kind === 'frag') {
    if (p.grenades.frag >= 2) { sfx.denied(); return false; }
    state.money -= item.price; p.grenades.frag += 1;
  } else if (item.kind === 'flash') {
    if (p.grenades.flash >= 2) { sfx.denied(); return false; }
    state.money -= item.price; p.grenades.flash += 1;
  } else if (item.kind === 'armor') {
    if (p.armor >= 100) { sfx.denied(); return false; }
    state.money -= item.price; p.armor = 100;
  }
  sfx.buy();
  return true;
}
