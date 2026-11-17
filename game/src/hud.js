// hud.js — DOM HUD: health/ammo/timer/score/money/killfeed/crosshair, the buy
// menu, and round banners. Reads state only; writes DOM only.
import { WEAPONS, TEAM_NAME } from './state.js';
import { BUY_ITEMS } from './rounds.js';
import { aliveCount } from './bots.js';

const $ = (id) => document.getElementById(id);

export function createHud(state, onBuy) {
  const els = {
    hud: $('hud'), healthNum: $('healthNum'), armorNum: $('armorNum'),
    healthFill: $('healthFill'), ammoNum: $('ammoNum'), weaponName: $('weaponName'),
    roundTimer: $('roundTimer'), scoreLine: $('scoreLine'), bombStatus: $('bombStatus'),
    teamBox: $('teamBox'), moneyNum: $('moneyNum'), grenadeLine: $('grenadeLine'),
    killfeed: $('killfeed'), hint: $('hint'), banner: $('banner'),
    bannerTitle: $('bannerTitle'), bannerSub: $('bannerSub'),
    centerMsg: $('centerMsg'), crosshair: $('crosshair'), hitmark: $('hitmark'),
    buyMenu: $('buyMenu'), buyGrid: $('buyGrid'), buyMoney: $('buyMoney'),
    flash: $('flash'), dmgVin: $('dmgVin'),
    chT: $('chT'), chB: $('chB'), chL: $('chL'), chR: $('chR'),
  };
  // Build the buy menu once.
  for (let i = 0; i < BUY_ITEMS.length; i++) {
    const item = BUY_ITEMS[i];
    const div = document.createElement('div');
    div.className = 'buyItem';
    div.dataset.idx = i;
    div.innerHTML = `<div class="nm">${item.name}</div><div class="ds">${item.desc}</div><div class="pr">$${item.price}</div>`;
    div.addEventListener('click', () => onBuy(item));
    els.buyGrid.appendChild(div);
  }
  $('closeBuyBtn').addEventListener('click', () => { els.buyMenu.classList.add('hidden'); });

  let lastHitT = 0;
  return {
    els,
    showHud(v) { els.hud.classList.toggle('hidden', !v); },
    showBuy(v) {
      els.buyMenu.classList.toggle('hidden', !v);
      if (v) this.refreshBuy();
    },
    refreshBuy() {
      els.buyMoney.textContent = `$${state.money}`;
      const p = state.player;
      const items = els.buyGrid.children;
      for (let i = 0; i < BUY_ITEMS.length; i++) {
        const item = BUY_ITEMS[i];
        const el = items[i];
        const owned = item.kind === 'weapon' && !!p.weapons[item.id];
        const afford = state.money >= item.price;
        el.classList.toggle('owned', owned);
        el.classList.toggle('cant', !afford && !owned);
      }
    },
    flashBang() {
      els.flash.style.transition = 'none';
      els.flash.style.opacity = '1';
      requestAnimationFrame(() => {
        els.flash.style.transition = 'opacity 1.6s';
        els.flash.style.opacity = '0';
      });
    },
    damageFlash() {
      els.dmgVin.style.transition = 'none';
      els.dmgVin.style.opacity = '1';
      requestAnimationFrame(() => {
        els.dmgVin.style.transition = 'opacity 0.6s';
        els.dmgVin.style.opacity = '0';
      });
    },
    showHitmark() {
      els.hitmark.classList.add('on');
      lastHitT = performance.now();
    },
    banner(title, sub, color) {
      els.bannerTitle.textContent = title;
      els.bannerTitle.style.color = color || '#ffb347';
      els.bannerSub.textContent = sub || '';
      els.banner.classList.remove('hidden');
    },
    hideBanner() { els.banner.classList.add('hidden'); },

    update(dt) {
      const p = state.player;
      const t = performance.now();
      if (t - lastHitT > 140) els.hitmark.classList.remove('on');
      // Health / ammo
      els.healthNum.textContent = Math.ceil(p.hp);
      els.healthNum.style.color = p.hp > 50 ? '#e8ecf1' : p.hp > 25 ? '#ffb347' : '#ff5a3c';
      els.healthFill.style.width = `${p.hp}%`;
      els.healthFill.style.background = p.hp > 50 ? '#ffb347' : p.hp > 25 ? '#ff8c2e' : '#ff5a3c';
      els.armorNum.textContent = p.armor > 0 ? `ARMOR ${Math.ceil(p.armor)}` : '';
      const def = WEAPONS[p.current];
      const ammo = p.weapons[p.current];
      els.ammoNum.innerHTML = p.reloadT > 0
        ? '<span>RELOADING…</span>'
        : `${ammo.mag} <span>/ ${ammo.reserve}</span>`;
      els.weaponName.textContent = `${def.name}${p.scoped ? ' · SCOPED' : ''}`;
      // Timer + score
      const secs = Math.max(0, Math.ceil(state.roundTimer));
      els.roundTimer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      els.roundTimer.classList.toggle('planted', state.bomb.state === 'planted');
      els.scoreLine.innerHTML = `<b>${TEAM_NAME.ember} ${state.score.ember}</b> — ${state.score.warden} ${TEAM_NAME.warden} · ROUND ${state.round}`;
      const bomb = state.bomb;
      els.bombStatus.textContent =
        bomb.state === 'planted' ? `⚠ SPIKE PLANTED @ ${bomb.site} — ${Math.ceil(bomb.fuseT)}s`
        : bomb.state === 'carried' && bomb.carrier === 'player' ? 'YOU CARRY THE SPIKE — PLANT AT A OR B [E]'
        : bomb.state === 'dropped' ? 'SPIKE DROPPED — PICK IT UP'
        : bomb.state === 'carried' ? 'ALLY CARRIES THE SPIKE'
        : '';
      // Teams alive
      const eAlive = aliveCount(state.bots, 'ember') + (p.alive ? 1 : 0);
      const wAlive = aliveCount(state.bots, 'warden');
      els.teamBox.innerHTML =
        `<span class="atk">▲ EMBER ${'●'.repeat(eAlive)}${'○'.repeat(5 - eAlive)}</span><br>` +
        `<span class="def">▲ WARDEN ${'●'.repeat(wAlive)}${'○'.repeat(5 - wAlive)}</span>`;
      els.moneyNum.textContent = `$${state.money}`;
      els.grenadeLine.textContent = `FRAG ×${p.grenades.frag} · FLASH ×${p.grenades.flash}`;
      // Killfeed
      els.killfeed.innerHTML = state.killfeed.map((k) =>
        `${k.killer} <span class="k">${k.headshot ? '◎' : '✕'}</span> ${k.victim}`).join('<br>');
      // Context hint
      let hint = '';
      if (!p.alive) hint = 'You are down — your team fights on. Next round you redeploy.';
      else if (state.phase === 'freeze') hint = 'FREEZE TIME — press B to buy, then the round goes live.';
      else if (state.phase === 'live' && bomb.state === 'carried' && bomb.carrier === 'player') hint = 'Carry the spike to site A (Reactor) or B (Crane Dock) and hold E to plant.';
      else if (state.phase === 'live' && bomb.state === 'planted') hint = bomb.site ? `Spike planted at ${bomb.site}! Defend it — or defuse if you are Warden.` : '';
      else if (state.phase === 'live') hint = 'W A S D move · Click fire · R reload · G grenade · Ctrl crouch';
      els.hint.textContent = hint;
      // Plant / defuse progress
      let msg = '';
      if (p.plantT > 0) msg = `PLANTING SPIKE… ${Math.ceil((p.plantT / 3) * 100)}%`;
      else if (p.defuseT > 0) msg = `DEFUSING SPIKE… ${Math.ceil((p.defuseT / 5) * 100)}%`;
      else if (p.flashT > 0) msg = 'FLASHED!';
      els.centerMsg.textContent = msg;
      // Crosshair gap follows spread: bloom + movement.
      const spread = def.spread + p.bloom * 3 + Math.min(0.02, Math.hypot(p.vx, p.vz) * 0.0012);
      const gap = 3 + spread * 900;
      const len = 7;
      const setBar = (el, x, y, w, h) => {
        el.style.left = `${x}px`; el.style.top = `${y}px`;
        el.style.width = `${w}px`; el.style.height = `${h}px`;
      };
      setBar(els.chT, -1, -gap - len, 2, len);
      setBar(els.chB, -1, gap, 2, len);
      setBar(els.chL, -gap - len, -1, len, 2);
      setBar(els.chR, gap, -1, len, 2);
      els.crosshair.style.opacity = p.scoped ? '0' : '1';
    },
  };
}
