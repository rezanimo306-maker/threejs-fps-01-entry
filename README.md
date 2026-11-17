# EMBERLINE — Tactical FPS

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/rezanimo306-maker/threejs-fps-01-entry/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard)
[![reward](https://make.fun/badge/threejs-fps-01/rezanimo306-maker/threejs-fps-01-entry/reward.svg)](https://make.fun/bounty/threejs-fps-01)

A round-based tactical first-person shooter in the Counter-Strike style,
built on three.js 0.187.0. Five EMBER attackers versus five WARDEN defenders
on the original dusk-lit **Foundry Yard** map: plant the spike at Reactor (A)
or Crane Dock (B), or eliminate the defending team. Win rounds, earn money,
buy better guns.

## How to run

Serve `game/` with any static HTTP server and open `game/index.html` in
desktop Chrome, for example:

```sh
npx serve game
# or: python3 -m http.server -d game 8080
```

Click **DEPLOY** to play. No build step, no network requests — everything
runs from the static files.

## Controls

- **W A S D** move · **Mouse** aim · **Click** fire · **R** reload
- **Shift** walk quietly · **Ctrl / C** crouch · **Space** jump
- **1–5** switch weapon · **G** frag grenade · **F** flash grenade
- **E** plant / defuse the spike (hold) · **B** buy menu (freeze time)
- **Right-click** scope (Longbow DMR)

## What is in the game

- First-person view, mouse look, acceleration movement, crouch, collision
- Five weapons (P9, VK-47, Hornet SMG, Longbow DMR, Breacher shotgun) plus
  frag and flash grenades; hitboxes with double headshot damage; recoil and
  spread that punish firing on the move
- Bots that run routes, hold sites, react to gunfire, plant and defuse
- Round economy: kill/round money spent in a buy menu between rounds
- HUD: health, armor, ammo, round timer, score, money, killfeed, crosshair
- Original map, palette, lighting and procedural WebAudio sounds

## License

MIT — see `LICENSE`. three.js 0.187.0 is vendored under `game/` per its own
license.
