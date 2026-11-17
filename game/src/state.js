// state.js — the one state store: every mutable game value lives here.
// Constants, weapon tables and the fresh-state factory. No rendering here.
export const SIM_DT = 1 / 60;
export const ROUND_TIME = 100;      // seconds of live play per round
export const FREEZE_TIME = 8;       // buy / setup seconds before a round goes live
export const PLANT_TIME = 3;        // seconds holding E to plant
export const DEFUSE_TIME = 5;       // seconds holding E to defuse
export const FUSE_TIME = 35;        // seconds from plant to detonation
export const WIN_ROUNDS = 5;        // first team to this many rounds wins the match
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500;
export const PLANT_REWARD = 300;
export const PLAYER_RADIUS = 0.38;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.08;

// Weapon table. damage = body damage at close range; falloff starts past range m.
// spread = base radians; moveSpread added while moving; recoil adds bloom per shot.
export const WEAPONS = {
  p9:      { name: 'P9 SIDEARM', price: 0,    damage: 34, headMult: 2.0, rpm: 380, auto: false, mag: 12, reserve: 60,  reload: 1.5, spread: 0.011, moveSpread: 0.030, recoil: 0.011, range: 28,  zoom: 1.0, pellets: 1, tracer: 0xffd27a },
  vk47:    { name: 'VK-47 RIFLE', price: 2700, damage: 36, headMult: 2.0, rpm: 600, auto: true,  mag: 30, reserve: 90,  reload: 2.4, spread: 0.009, moveSpread: 0.034, recoil: 0.013, range: 45,  zoom: 1.0, pellets: 1, tracer: 0xffb347 },
  hornet:  { name: 'HORNET SMG', price: 1500, damage: 26, headMult: 2.0, rpm: 900, auto: true,  mag: 25, reserve: 100, reload: 2.0, spread: 0.014, moveSpread: 0.040, recoil: 0.009, range: 24,  zoom: 1.0, pellets: 1, tracer: 0x9fd8ff },
  longbow: { name: 'LONGBOW DMR', price: 4750, damage: 110, headMult: 2.0, rpm: 55,  auto: false, mag: 5,  reserve: 20,  reload: 3.1, spread: 0.002, moveSpread: 0.060, recoil: 0.045, range: 90,  zoom: 3.2, pellets: 1, tracer: 0xffffff },
  breacher:{ name: 'BREACHER 12G', price: 1200, damage: 13, headMult: 1.8, rpm: 70,  auto: false, mag: 6,  reserve: 24,  reload: 2.8, spread: 0.045, moveSpread: 0.050, recoil: 0.030, range: 14,  zoom: 1.0, pellets: 8, tracer: 0xff9a5c },
};
export const WEAPON_ORDER = ['p9', 'vk47', 'hornet', 'longbow', 'breacher'];
export const GRENADE_FRAG = { name: 'FRAG GRENADE', price: 300, radius: 7, damage: 120 };
export const GRENADE_FLASH = { name: 'FLASH GRENADE', price: 200, radius: 12 };
export const ARMOR_PRICE = 650;

export const TEAM = { ATTACK: 'ember', DEFEND: 'warden' };
export const TEAM_NAME = { ember: 'EMBER', warden: 'WARDEN' };

// Bot names — original callsigns, no commercial-game references.
export const BOT_NAMES = {
  ember: ['Ash', 'Cinder', 'Flint', 'Soot', 'Ember-2'],
  warden: ['Gravel', 'Rust', 'Piston', 'Valve', 'Anchor'],
};

export function freshState() {
  return {
    phase: 'menu',           // menu | freeze | live | roundEnd | matchEnd
    phaseT: 0,               // seconds in current phase
    round: 1,
    score: { ember: 0, warden: 0 },
    roundTimer: ROUND_TIME,
    money: START_MONEY,
    lossStreak: 0,
    bomb: { state: 'carried', site: null, x: 0, z: 0, plantT: 0, fuseT: 0, defuseT: 0, carrier: 'player' },
    player: null,            // filled by player.js
    bots: [],                // filled by bots.js
    entities: [],            // grenades, tracers, impacts (pooled, see combat.js)
    noise: [],               // recent gunfire noise events bots hear
    killfeed: [],
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    muted: false,
    time: 0,                 // total sim seconds
    stats: { shots: 0, hits: 0, kills: 0, headshots: 0, damage: 0 },
  };
}
