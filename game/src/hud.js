// DOM HUD: health, money, reputation, wanted stars, speed, mission panel,
// banners, hints, the busted meter, a damage vignette, and a 2D-canvas
// minimap (roads and blocks, player arrow, traffic dots, flashing police,
// the mission beacon). The markup lives in index.html; this module only
// updates it, and only touches the DOM when a value actually changes.
import { ROAD_X, ROAD_Z, BEACH_Z, REP_TITLES } from './config.js';

const MAP_WORLD = 300; // metres shown across the minimap
const MAP_PX = 184;

function worldToMap(x, z) {
  return [
    ((x + MAP_WORLD / 2) / MAP_WORLD) * MAP_PX,
    ((z + MAP_WORLD / 2) / MAP_WORLD) * MAP_PX,
  ];
}

export function createHud() {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const healthBar = el('healthBar');
  const moneyEl = el('money');
  const repEl = el('repLine');
  const starsEl = el('stars');
  const missionTitle = el('missionTitle');
  const missionObj = el('missionObj');
  const missionDist = el('missionDist');
  const banner = el('banner');
  const bannerMain = el('bannerMain');
  const bannerSub = el('bannerSub');
  const speedBox = el('speedBox');
  const speedVal = el('speedVal');
  const bustedWrap = el('bustedWrap');
  const bustedBar = el('bustedBar');
  const hint = el('hint');
  const vignette = el('vignette');
  const mapCtx = el('minimap').getContext('2d');

  let bannerTimer = null;
  const cache = { money: null, rep: null, stars: null, health: null, title: null, obj: null, dist: null, speed: null, hint: null };

  function showBanner(main, sub = '', ms = 2600) {
    bannerMain.textContent = main;
    bannerSub.textContent = sub;
    banner.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove('show'), ms);
  }

  function drawMinimap(s) {
    const g = mapCtx;
    g.clearRect(0, 0, MAP_PX, MAP_PX);
    // Blocks and sea.
    g.fillStyle = '#232742';
    g.fillRect(0, 0, MAP_PX, MAP_PX);
    g.fillStyle = '#3d6f8e';
    const [, beachY] = worldToMap(0, BEACH_Z);
    g.fillRect(0, beachY, MAP_PX, MAP_PX - beachY);
    g.fillStyle = '#c9a86a';
    g.fillRect(0, beachY, MAP_PX, 5);
    // Roads.
    g.strokeStyle = '#4a4f66';
    g.lineWidth = 5;
    for (const x of ROAD_X) {
      const [mx] = worldToMap(x, 0);
      g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, MAP_PX); g.stroke();
    }
    for (const z of ROAD_Z) {
      const [, mz] = worldToMap(0, z);
      g.beginPath(); g.moveTo(0, mz); g.lineTo(MAP_PX, mz); g.stroke();
    }
    // Mission beacon.
    if (s.beacon) {
      const [bx, by] = worldToMap(s.beacon.x, s.beacon.z);
      g.fillStyle = '#ffd76a';
      g.beginPath(); g.arc(bx, by, 5 + Math.sin(s.time * 5) * 1.4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,215,106,0.6)';
      g.beginPath(); g.arc(bx, by, 8.5, 0, Math.PI * 2); g.stroke();
    }
    // Traffic dots.
    g.fillStyle = '#e8e8f0';
    for (const c of s.traffic || []) {
      const [cx, cy] = worldToMap(c.x, c.z);
      g.fillRect(cx - 1.6, cy - 1.6, 3.2, 3.2);
    }
    // Police flash red/blue.
    const redPhase = Math.sin(s.time * 9) > 0;
    for (const p of s.police || []) {
      const [px, py] = worldToMap(p.x, p.z);
      g.fillStyle = redPhase ? '#ff4040' : '#4d7dff';
      g.beginPath(); g.arc(px, py, 3.4, 0, Math.PI * 2); g.fill();
    }
    // Player arrow.
    const [px, py] = worldToMap(s.player.x, s.player.z);
    g.save();
    g.translate(px, py);
    // The map's +y is +z (south) and the arrow is drawn pointing up (north);
    // rotating by PI - heading maps it onto the player's world direction.
    g.rotate(Math.PI - s.player.heading);
    g.fillStyle = '#7dff9a';
    g.beginPath();
    g.moveTo(0, -6.5);
    g.lineTo(4.4, 5);
    g.lineTo(0, 2.4);
    g.lineTo(-4.4, 5);
    g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.strokeRect(0.5, 0.5, MAP_PX - 1, MAP_PX - 1);
  }

  return {
    showBanner,
    setVisible(on) { hud.classList.toggle('on', !!on); },
    setHint(text) {
      if (cache.hint === text) return;
      cache.hint = text;
      hint.textContent = text || '';
      hint.classList.toggle('on', !!text);
    },
    flashDamage() {
      vignette.style.opacity = '1';
      setTimeout(() => { vignette.style.opacity = '0'; }, 130);
    },
    update(s) {
      // s: { health, money, rep, stars, objective{title,text,dist}, speedKmh|null,
      //      busted (0..1), minimap fields }
      const healthPct = Math.max(0, Math.round(s.health));
      if (cache.health !== healthPct) { cache.health = healthPct; healthBar.style.width = `${healthPct}%`; }
      if (cache.money !== s.money) { cache.money = s.money; moneyEl.textContent = `$${s.money}`; }
      if (cache.rep !== s.rep) {
        cache.rep = s.rep;
        repEl.textContent = `REP ★ Level ${s.rep} — ${REP_TITLES[s.rep - 1] || ''} · Payout ×${(1 + 0.1 * (s.rep - 1)).toFixed(1)}`;
      }
      if (cache.stars !== s.stars) {
        cache.stars = s.stars;
        starsEl.innerHTML = '★'.repeat(s.stars) + `<span class="off">${'★'.repeat(5 - s.stars)}</span>`;
      }
      const obj = s.objective;
      if (obj) {
        if (cache.title !== obj.title) { cache.title = obj.title; missionTitle.textContent = obj.title; }
        if (cache.obj !== obj.text) { cache.obj = obj.text; missionObj.textContent = obj.text; }
        const distText = obj.dist !== null && obj.dist !== undefined ? `${obj.dist} m` : '';
        if (cache.dist !== distText) { cache.dist = distText; missionDist.textContent = distText; }
      }
      if (s.speedKmh === null || s.speedKmh === undefined) {
        speedBox.classList.remove('on');
        cache.speed = null;
      } else {
        speedBox.classList.add('on');
        const v = Math.round(s.speedKmh);
        if (cache.speed !== v) { cache.speed = v; speedVal.textContent = String(v); }
      }
      if (s.busted > 0.02) {
        bustedWrap.classList.add('on');
        bustedBar.style.width = `${Math.round(s.busted * 100)}%`;
      } else {
        bustedWrap.classList.remove('on');
      }
      drawMinimap(s);
    },
  };
}
