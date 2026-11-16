// Bootstrap: screens (menu -> draft -> VS -> match -> end), input, the game
// loop, and the ?shot= / ?ff= / ?autodraft= / ?seed= hooks the play-test rig
// uses. Exposes window.__game and window.__state() for automated checks.
import { mulberry32, clamp, dist2 } from './util.js';
import { HERO_BY_ID, ITEMS, setProgress } from './heroes.js';
import { createDraft, updateDraft, selectHero, lockHero, isPlayerStep, currentStep, draftAtPickStep, draftComplete } from './draft.js';
import { createMatch, updateMatch, simulate, castSkill, upgradeSkill, buyItem, sellItem, heroStats, turretsLeft, testKillCredit, testDestroyTurret, testDamageTurret, testSpawnWave, turretAttackable, baseExposed, inBush, WALLS, BUSHES, WORLD, BASES } from './match.js';
import { drawMenu, drawDraft, drawVS, drawMatch, drawEnd, drawLadder, drawHistory, drawHistoryDetail, VIEW_W, VIEW_H } from './draw.js';
import { sfx, setMuted, isMuted, setMusic, musicTrackName } from './audio.js';
import { loadLadder, applyMatchResult, tierFor, playerRank } from './ladder.js';
import { loadHistory, recordMatch, sampleHistory } from './history.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed')) || (Date.now() % 100000);
const FF = clamp(Number(params.get('ff')) || 1, 1, 30);
const AUTO_DRAFT = params.get('autodraft') === '1';
const SHOT = params.get('shot') || null;
const FAST = params.get('fast') === '1';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = VIEW_W * dpr;
  canvas.height = VIEW_H * dpr;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

const rng = mulberry32(SEED);

const state = {
  screen: 'menu', // menu | ladder | history | history-detail | draft | vs | match | end
  draft: null,
  match: null,
  vsTimer: 0,
  ladder: loadLadder(),
  history: loadHistory(),
  historyDetailId: null,
  lastResult: null, // {won, pointsDelta, tierAfter, promoted, demoted}
  ladderApplied: false,
  shopOpen: false,
  shopCat: 'Attack',
  shopItem: null,
  paused: false,
  time: 0,
  mouse: { x: VIEW_W / 2, y: VIEW_H / 2 },
  input: { move: null, cast: null, auto: false },
  ui: { buttons: [] },
  prev: { logLen: 0, killsA: 0, killsB: 0, turA: 10, turB: 10, pLevel: 1, pAlive: true, lastAnnSeq: 0, pGold: 0 },
};

window.__game = state;
// Test hook: force a kill credit (drives the announcement smoke test).
window.__testKill = (killerUid, victimUid) => {
  const m = state.match;
  if (!m) return false;
  const killer = m.heroes.find((h) => h.uid === killerUid);
  const victim = m.heroes.find((h) => h.uid === victimUid);
  if (!killer || !victim) return false;
  return testKillCredit(m, killer, victim);
};
// Test hooks for the turret / targeting smoke tests.
window.__testDestroyTurret = (team, lane, tier) => state.match ? testDestroyTurret(state.match, team, lane, tier) : false;
window.__testDamageTurret = (team, lane, tier, amount) => state.match ? testDamageTurret(state.match, team, lane, tier, amount) : 0;
window.__testSpawnWave = () => { if (state.match) testSpawnWave(state.match); return true; };
window.__testSetPaused = (p) => { state.paused = !!p; return state.paused; };
// Test hook: god mode for the player (dealDamage ignores god heroes).
window.__testGodMode = (on) => { if (state.match) state.match.player.god = !!on; return !!on; };
window.__testTeleport = (uid, x, y) => {
  const m = state.match;
  if (!m) return false;
  for (const arr of [m.heroes, m.minions, m.monsters]) {
    const e = arr.find((x) => x.uid === uid);
    if (e) { e.x = x; e.y = y; return true; }
  }
  return false;
};
window.__testEntities = () => {
  const m = state.match;
  if (!m) return null;
  return {
    heroes: m.heroes.map((h) => ({ uid: h.uid, name: h.name, team: h.team, alive: h.alive, x: Math.round(h.x), y: Math.round(h.y), isPlayer: h.isPlayer })),
    minions: m.minions.filter((x) => x.alive).map((x) => ({ uid: x.uid, team: x.team, lane: x.lane, melee: x.range <= 120, super: x.super, hp: Math.round(x.hp), maxHp: x.maxHp, x: Math.round(x.x), y: Math.round(x.y) })),
  };
};
// Teleport every hero and minion of a team back to its base, so targeting
// scenarios start from a clean field.
window.__testClearField = (team) => {
  const m = state.match;
  if (!m) return 0;
  const b = BASES[team];
  let n = 0;
  for (const h of m.heroes) if (h.team === team && h.alive) { h.x = b.x; h.y = b.y; n++; }
  for (const mn of m.minions) if (mn.team === team && mn.alive) { mn.x = b.x; mn.y = b.y; n++; }
  return n;
};
window.__state = () => {
  const m = state.match;
  const d = state.draft;
  return {
    screen: state.screen,
    seed: SEED,
    muted: isMuted(),
    music: musicTrackName(),
    ladder: {
      points: state.ladder.player.points,
      wins: state.ladder.player.wins,
      losses: state.ladder.player.losses,
      tier: tierFor(state.ladder.player.points).name,
      rank: playerRank(state.ladder),
    },
    history: state.history.map((e) => ({
      id: e.id, result: e.result, heroId: e.heroId, heroName: e.heroName,
      kills: e.kills, deaths: e.deaths, assists: e.assists,
      duration: Math.round(e.duration), pointsDelta: e.pointsDelta, tierAfter: e.tierAfter,
    })),
    lastResult: state.lastResult,
    draft: d ? {
      done: d.done, stepIndex: d.stepIndex, phase: d.done ? 'done' : currentStep(d).type,
      team: d.done ? null : currentStep(d).team,
      bansA: d.bans.A, bansB: d.bans.B, picksA: d.picks.A, picksB: d.picks.B,
      timer: Math.ceil(d.timer),
    } : null,
    match: m ? {
      time: Math.floor(m.time), winner: m.winner, endReason: m.endReason,
      killsA: m.kills.A, killsB: m.kills.B,
      turretsA: turretsLeft(m, 'A'), turretsB: turretsLeft(m, 'B'),
      baseExposedA: baseExposed(m, 'A'), baseExposedB: baseExposed(m, 'B'),
      superMinions: m.superMinions,
      turrets: m.turrets.map((t) => ({ team: t.team, lane: t.lane, tier: t.tier, alive: t.alive, hp: Math.round(t.hp), maxHp: t.maxHp, x: t.x, y: t.y, range: t.range, target: t.target ? { kind: t.target.kind, uid: t.target.uid } : null, firing: t.firing > 0 })),
      heroesAlive: m.heroes.filter((h) => h.alive).length,
      minions: m.minions.filter((x) => x.alive).length,
      superMinionCount: m.minions.filter((x) => x.alive && x.super).length,
      monsters: m.monsters.filter((x) => x.alive).length,
      walls: WALLS,
      bushes: BUSHES,
      hiddenEnemies: m.heroes.filter((h) => h.team === 'B' && h.hidden).length,
      deadHeroes: m.heroes.filter((h) => !h.alive).map((h) => ({ name: h.name, team: h.team, respawn: Math.ceil(h.respawn), respawnTotal: h.respawnTotal || 0 })),
      announcements: m.announcements.map((a) => ({ text: a.text, sub: a.sub, tier: a.tier, seq: a.seq })),
      player: m.player ? {
        name: m.player.name, level: m.player.level, hp: Math.ceil(m.player.hp),
        alive: m.player.alive, gold: Math.floor(m.player.gold),
        respawn: Math.ceil(m.player.respawn || 0), respawnTotal: m.player.respawnTotal || 0,
        skillLv: m.player.skillLv, skillPts: m.player.skillPts,
        kills: m.player.kills, deaths: m.player.deaths, assists: m.player.assists,
        streak: m.player.streak, multiKills: m.player.multiKills,
        hidden: !!m.player.hidden, inBush: !!inBush(m.player.x, m.player.y),
        uid: m.player.uid,
        items: [...m.player.items],
        sets: setProgress(m.player.items).map((s) => ({ id: s.id, name: s.name, owned: s.owned, total: s.total, complete: s.complete })),
        stats: (() => { const s = heroStats(m.player); return { damage: Math.round(s.damage), power: Math.round(s.power), maxHp: s.maxHp, ms: Math.round(s.ms), armor: Math.round(s.armor), mres: Math.round(s.mres), cdr: s.cdr, jungle: s.jungle, crit: s.crit, critDmg: s.critDmg, lifesteal: s.lifesteal, as: s.as, spellVamp: s.spellVamp, dmgReduction: s.dmgReduction, regen: s.regen }; })(),
        x: Math.round(m.player.x), y: Math.round(m.player.y),
      } : null,
    } : null,
  };
};

function setStatus(s) { if (statusEl) statusEl.textContent = s; }

function startDraft() {
  state.draft = createDraft(mulberry32(SEED + 7), { timerSec: FAST ? 4 : 20, auto: AUTO_DRAFT });
  state.screen = 'draft';
  state.prev.logLen = 0;
  setStatus('Drafting phase: ban and pick your heroes.');
  sfx.click();
}

function startMatch() {
  state.match = createMatch(mulberry32(SEED + 99), state.draft, { autoPlayer: AUTO_DRAFT });
  state.screen = 'match';
  state.shopOpen = false;
  state.paused = false;
  state.prev = { logLen: 0, killsA: 0, killsB: 0, turA: 10, turB: 10, pLevel: 1, pAlive: true, lastAnnSeq: 0, pGold: 0 };
  state.ladderApplied = false;
  state.lastResult = null;
  setStatus('Match started. Destroy the enemy base turret to win.');
}

// Apply a finished ranked match to the ladder + history, exactly once.
function applyMatchEnd(m) {
  if (state.ladderApplied || !m.winner) return;
  state.ladderApplied = true;
  const won = m.winner === 'A';
  const res = applyMatchResult(state.ladder, won);
  const p = m.player;
  const entry = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    ts: Date.now(),
    result: won ? 'WIN' : 'LOSE',
    heroId: p.def.id,
    heroName: p.name,
    role: p.def.role,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    duration: m.time,
    pointsDelta: res.delta,
    tierAfter: res.tierAfter,
    scoreA: m.kills.A,
    scoreB: m.kills.B,
    items: [...p.items],
    gold: p.goldEarned || 0,
    damage: p.damageDealt || 0,
    level: p.level,
    players: m.heroes.map((h) => ({
      name: h.isPlayer ? 'You' : h.name,
      heroId: h.def.id,
      role: h.def.role,
      team: h.team,
      kills: h.kills,
      deaths: h.deaths,
      assists: h.assists,
      level: h.level,
      gold: h.goldEarned || 0,
      damage: Math.round(h.damageDealt || 0),
    })),
  };
  state.history = recordMatch(state.history, entry);
  state.lastResult = { won, pointsDelta: res.delta, tierAfter: res.tierAfter, promoted: res.promoted, demoted: res.demoted };
}

function toWorld(sx, sy) {
  const m = state.match;
  if (!m) return { x: 0, y: 0 };
  const cam = m.camera;
  return {
    x: clamp(sx - VIEW_W / 2 + cam.x, 0, WORLD.w),
    y: clamp(sy - VIEW_H / 2 + cam.y, 0, WORLD.h),
  };
}

function pickTargetAt(wx, wy) {
  const m = state.match;
  if (!m) return null;
  let best = null; let bestD = 40 * 40;
  const consider = (e, r) => {
    const d = dist2(wx, wy, e.x, e.y);
    if (d < (r + 14) * (r + 14) && d < bestD) { bestD = d; best = e; }
  };
  for (const h of m.heroes) if (h.alive && h.team !== 'A' && !h.hidden) consider(h, 22);
  for (const mn of m.minions) if (mn.alive && mn.team !== 'A') consider(mn, 14);
  for (const mo of m.monsters) if (mo.alive) consider(mo, 20);
  for (const t of m.turrets) if (t.alive && t.team !== 'A' && turretAttackable(m, t)) consider(t, 34);
  return best;
}

function castAtMouse(idx) {
  const m = state.match;
  const p = m && m.player;
  if (!p || !p.alive || m.winner) return;
  const w = toWorld(state.mouse.x, state.mouse.y);
  // Self-targeted skills cast on the spot.
  const sk = p.def.skills[idx];
  if (sk.type === 'heal' || sk.type === 'shield' || sk.type === 'buff' || sk.type === 'nova') {
    if (castSkill(m, p, idx, p.x, p.y)) sfx.skill();
    return;
  }
  if (castSkill(m, p, idx, w.x, w.y)) sfx.skill();
}

function castAtNearest(idx) {
  // Clicking a skill button casts toward the nearest enemy (mouse-free play).
  const m = state.match;
  const p = m && m.player;
  if (!p || !p.alive || m.winner) return;
  const sk = p.def.skills[idx];
  if (sk.type === 'heal' || sk.type === 'shield' || sk.type === 'buff' || sk.type === 'nova') {
    if (castSkill(m, p, idx, p.x, p.y)) sfx.skill();
    return;
  }
  let best = null; let bestD = Infinity;
  for (const h of m.heroes) {
    if (!h.alive || h.team === p.team) continue;
    const d = dist2(p.x, p.y, h.x, h.y);
    if (d < bestD) { bestD = d; best = h; }
  }
  if (!best) {
    for (const mn of m.minions) {
      if (!mn.alive || mn.team === p.team) continue;
      const d = dist2(p.x, p.y, mn.x, mn.y);
      if (d < bestD) { bestD = d; best = mn; }
    }
  }
  const tx = best ? best.x : p.x + Math.cos(p.facing) * 200;
  const ty = best ? best.y : p.y + Math.sin(p.facing) * 200;
  if (castSkill(m, p, idx, tx, ty)) sfx.skill();
}

function handleButton(btn) {
  const m = state.match;
  switch (btn.id) {
    case 'play':
      startDraft();
      break;
    case 'ladder':
      state.screen = 'ladder';
      sfx.click();
      break;
    case 'history':
      state.screen = 'history';
      sfx.click();
      break;
    case 'back-menu':
      state.screen = 'menu';
      sfx.click();
      break;
    case 'back-history':
      state.screen = 'history';
      sfx.click();
      break;
    case 'history-row':
      state.historyDetailId = btn.data;
      state.screen = 'history-detail';
      sfx.click();
      break;
    case 'tab':
      if (state.draft) { state.draft.roleFilter = btn.data; sfx.click(); }
      break;
    case 'hero':
      if (state.draft) { selectHero(state.draft, btn.data); sfx.click(); }
      break;
    case 'lock':
      if (state.draft && lockHero(state.draft)) sfx.lock();
      break;
    case 'skill':
      castAtNearest(btn.data);
      break;
    case 'upgrade':
      if (m && m.player && upgradeSkill(m, m.player, btn.data)) sfx.click();
      break;
    case 'shop':
      state.shopOpen = !state.shopOpen;
      sfx.click();
      break;
    case 'shop-close':
      state.shopOpen = false;
      sfx.click();
      break;
    case 'shop-tab':
      state.shopCat = btn.data;
      state.shopItem = null;
      sfx.click();
      break;
    case 'shop-item':
      state.shopItem = btn.data;
      sfx.click();
      break;
    case 'buy':
      if (m && m.player && buyItem(m, m.player, btn.data)) sfx.buy();
      break;
    case 'sell':
      if (m && m.player && sellItem(m, m.player, btn.data)) sfx.click();
      break;
    case 'mute':
      setMuted(!isMuted());
      sfx.muteToggle();
      break;
    case 'again':
      startDraft();
      break;
    case 'menu':
      state.screen = 'menu';
      state.match = null;
      state.draft = null;
      sfx.click();
      break;
    default:
      break;
  }
}

function onPointerDown(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (VIEW_W / rect.width);
  const sy = (e.clientY - rect.top) * (VIEW_H / rect.height);
  state.mouse.x = sx; state.mouse.y = sy;
  // Buttons first (last drawn = topmost).
  for (let i = state.ui.buttons.length - 1; i >= 0; i--) {
    const b = state.ui.buttons[i];
    if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) {
      handleButton(b);
      return;
    }
  }
  // Match world click: move or attack (ignored while the player is dead).
  if (state.screen === 'match' && !state.shopOpen && !state.paused && state.match.player && state.match.player.alive) {
    const w = toWorld(sx, sy);
    const target = pickTargetAt(w.x, w.y);
    state.input.move = { x: w.x, y: w.y, target };
  }
}

function onPointerMove(e) {
  const rect = canvas.getBoundingClientRect();
  state.mouse.x = (e.clientX - rect.left) * (VIEW_W / rect.width);
  state.mouse.y = (e.clientY - rect.top) * (VIEW_H / rect.height);
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (state.screen === 'match') {
    const skillIdx = { q: 0, w: 1, e: 2, 1: 0, 2: 1, 3: 2 }[k];
    if (skillIdx !== undefined && !state.paused) { castAtMouse(skillIdx); return; }
    if (k === 'b') { state.shopOpen = !state.shopOpen; sfx.click(); return; }
    if (k === 'p' || k === 'escape') { state.paused = !state.paused; sfx.click(); return; }
  }
  if (k === 'm') { setMuted(!isMuted()); sfx.muteToggle(); }
});

// ---- Screenshot / test setups ------------------------------------------------

function setupShot() {
  if (AUTO_DRAFT && !SHOT) {
    // Hands-free test hook: skip the menu and run the whole game with bots.
    startDraft();
    return;
  }
  if (!SHOT) return;
  if (SHOT === 'draft') {
    const d = draftAtPickStep(mulberry32(SEED + 7));
    state.draft = d;
    state.screen = 'draft';
    return;
  }
  if (SHOT === 'pick') {
    const d = draftAtPickStep(mulberry32(SEED + 7));
    d.roleFilter = 'Assassin';
    d.selectedId = 'nyx';
    d.timer = 14;
    state.draft = d;
    state.screen = 'draft';
    return;
  }
  if (SHOT === 'ban') {
    // Fresh draft at the very first ban step (Team A bans first).
    state.draft = createDraft(mulberry32(SEED + 7));
    state.screen = 'draft';
    return;
  }
  if (SHOT === 'ladder') {
    state.screen = 'ladder';
    return;
  }
  if (SHOT === 'history') {
    // Stage sample rows in memory only (never saved) so the shot shows the
    // populated table layout.
    state.history = sampleHistory();
    state.screen = 'history';
    return;
  }
  // Match shots: complete a draft, then simulate.
  const d = draftComplete(mulberry32(SEED + 7), 'lyra');
  const m = createMatch(mulberry32(SEED + 99), d, { autoPlayer: true });
  state.draft = d;
  state.match = m;
  state.screen = 'match';
  if (SHOT === 'play') {
    simulate(m, 360, 0.2);
    // Make sure the player is alive and visible for the shot.
    let guard = 0;
    while ((!m.player.alive || m.winner) && guard < 12) { simulate(m, 10, 0.2); guard++; }
    // Frame the action: camera on the centroid of the living heroes, with
    // the player moved into frame, so the shot shows a battle, not a base.
    const alive = m.heroes.filter((h) => h.alive);
    const cx = alive.reduce((s, h) => s + h.x, 0) / Math.max(1, alive.length);
    const cy = alive.reduce((s, h) => s + h.y, 0) / Math.max(1, alive.length);
    m.camera.x = clamp(cx, 640, WORLD.w - 640);
    m.camera.y = clamp(cy, 360, WORLD.h - 360);
    if (m.player.alive) { m.player.x = clamp(cx + 90, 40, WORLD.w - 40); m.player.y = clamp(cy + 70, 40, WORLD.h - 40); }
    return;
  }
  if (SHOT === 'end') {
    simulate(m, 420, 0.2);
    // Stage the victory screen: destroy every enemy turret through the
    // real path (lane order, base last) so the win is genuine.
    m.winner = null; // in case the sim already ended the match
    for (const lane of ['gold', 'mid', 'exp']) {
      for (const tier of ['outer', 'second', 'inner']) testDestroyTurret(m, 'B', lane, tier);
    }
    testDestroyTurret(m, 'B', 'base', 'base');
    state.screen = 'end';
    return;
  }
  if (SHOT === 'kill') {
    simulate(m, 120, 0.2);
    let guard = 0;
    while ((!m.player.alive || m.winner) && guard < 12) { simulate(m, 10, 0.2); guard++; }
    // Stage a DOUBLE KILL banner: the player slays two enemies in a row.
    const foes = m.heroes.filter((h) => h.team === 'B' && h.alive).slice(0, 2);
    for (const f of foes) testKillCredit(m, m.player, f);
    m.camera.x = clamp(m.player.x, 640, WORLD.w - 640);
    m.camera.y = clamp(m.player.y, 360, WORLD.h - 360);
    return;
  }
  if (SHOT === 'respawn') {
    // Late game (~10 min): the player's respawn is long (level + time).
    simulate(m, 600, 0.2);
    let guard = 0;
    while ((!m.player.alive || m.winner) && guard < 12) { simulate(m, 10, 0.2); guard++; }
    const foe = m.heroes.find((h) => h.team === 'B' && h.alive);
    if (foe && m.player.alive) testKillCredit(m, foe, m.player); // foe kills the player
    m.camera.x = clamp(m.player.x, 640, WORLD.w - 640);
    m.camera.y = clamp(m.player.y, 360, WORLD.h - 360);
    return;
  }
  if (SHOT === 'shop') {
    simulate(m, 120, 0.2);
    let guard = 0;
    while ((!m.player.alive || m.winner) && guard < 12) { simulate(m, 10, 0.2); guard++; }
    m.player.gold = 3500;
    state.shopOpen = true;
    state.shopCat = 'Attack';
    state.shopItem = 'blade';
    m.camera.x = clamp(m.player.x, 640, WORLD.w - 640);
    m.camera.y = clamp(m.player.y, 360, WORLD.h - 360);
    return;
  }
  if (SHOT === 'shopset') {
    // Stage a 2/3 Trinity set with the missing piece selected, so the shot
    // shows the set progress + bonus in the detail area.
    simulate(m, 120, 0.2);
    let guard = 0;
    while ((!m.player.alive || m.winner) && guard < 12) { simulate(m, 10, 0.2); guard++; }
    m.player.items = ['demonhunter', 'goldenstaff'];
    m.player.gold = 3500;
    state.shopOpen = true;
    state.shopCat = 'Attack';
    state.shopItem = 'corrosionscythe';
    m.camera.x = clamp(m.player.x, 640, WORLD.w - 640);
    m.camera.y = clamp(m.player.y, 360, WORLD.h - 360);
    return;
  }
  if (SHOT === 'super') {
    // Stage super minions: destroy B's mid inner turret through the real
    // path, spawn a fresh wave, and frame the super minions marching.
    simulate(m, 180, 0.2);
    testDestroyTurret(m, 'B', 'mid', 'outer');
    testDestroyTurret(m, 'B', 'mid', 'second');
    testDestroyTurret(m, 'B', 'mid', 'inner');
    testSpawnWave(m);
    simulate(m, 6, 0.1);
    const supers = m.minions.filter((x) => x.alive && x.super && x.team === 'A' && x.lane === 'mid');
    const anchor = supers.length ? supers[0] : { x: 1200, y: 800 };
    m.camera.x = clamp(anchor.x, 640, WORLD.w - 640);
    m.camera.y = clamp(anchor.y, 360, WORLD.h - 360);
    if (m.player) { m.player.x = clamp(anchor.x + 90, 40, WORLD.w - 40); m.player.y = clamp(anchor.y + 70, 40, WORLD.h - 40); }
    return;
  }
  if (SHOT === 'tower') {
    // One full lane's turret chain + base in a single frame: A mid outer /
    // second / inner + base are all visible from (650, 1100). Fresh match,
    // so the second/inner/base turrets show their shield bubbles.
    if (m.player) { m.player.x = 650; m.player.y = 1100; }
    m.camera.x = 650; m.camera.y = 1100;
    return;
  }
  if (SHOT === 'targeting') {
    // Stage B's mid outer turret firing at A minions inside its range
    // circle, with the player hero at the circle's edge watching.
    simulate(m, 90, 0.2);
    const t = m.turrets.find((x) => x.team === 'B' && x.lane === 'mid' && x.tier === 'outer');
    // The bots may have felled it during the sim; revive it for staging.
    if (!t.alive) { t.alive = true; t.hp = t.maxHp; t.target = null; t.attackCd = 0; }
    testSpawnWave(m);
    for (const mn of m.minions) {
      if (mn.alive && mn.team === 'A' && mn.lane === 'mid') { mn.x = t.x - 120; mn.y = t.y + 40; }
    }
    if (m.player) {
      // The player may have died during the 90s sim — revive them so the
      // respawn overlay does not cover the shot, and keep them alive.
      if (!m.player.alive) { m.player.alive = true; m.player.hp = m.player.maxHp; m.player.respawn = 0; }
      m.player.god = true;
      m.player.x = t.x - 290; m.player.y = t.y;
    }
    simulate(m, 2, 0.1);
    m.camera.x = clamp(t.x - 120, 640, WORLD.w - 640);
    m.camera.y = clamp(t.y, 360, WORLD.h - 360);
    return;
  }
  if (SHOT === 'map') {
    // Centre frame: both centre-guard walls, the river bushes and the
    // mid-lane bushes are all visible from (1200, 800).
    if (m.player) { m.player.x = 1200; m.player.y = 800; }
    m.camera.x = 1200; m.camera.y = 800;
    return;
  }
  if (SHOT === 'details') {
    // West jungle + river frame: grass tufts, flowers, pebbles, mushrooms,
    // fallen leaves, river ripples and stones are all in view.
    if (m.player) { m.player.x = 800; m.player.y = 850; }
    m.camera.x = 800; m.camera.y = 850;
    return;
  }
}

// ---- Main loop ---------------------------------------------------------------

let last = performance.now();
let frameCount = 0;
let lastGoldSfx = 0;

function frame(now) {
  requestAnimationFrame(frame);
  // Clamp the frame delta at 0.1s: at low frame rates (headless software
  // rendering) a 0.05 clamp makes game time crawl at half speed, because the
  // match update substeps at 0.05s anyway.
  const rawDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  state.time += rawDt;
  const dt = rawDt * FF;
  frameCount++;
  // Under fast-forward, skip most match renders: software rendering is the
  // bottleneck, and the simulation is what the test measures. Render once
  // every 30 frames (the end screen and every other screen always render).
  const skipRender = FF > 1 && state.screen === 'match' && frameCount % 30 !== 0;
  if (skipRender) {
    const m = state.match;
    if (m && !state.paused && !m.winner) {
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      for (let i = 0; i < steps; i++) updateMatch(m, dt / steps, state.input);
      if (m.winner) {
        applyMatchEnd(m);
        state.screen = 'end';
        setStatus(m.winner === 'A' ? 'Victory! Enemy base destroyed.' : 'Defeat. The enemy destroyed your base.');
      }
    }
    return;
  }
  state.ui.buttons = [];
  // Background music follows the screen: the calm menu track everywhere
  // outside a match, the battle track in a match, silence on the end
  // screen (the victory/defeat stinger plays instead).
  setMusic(state.screen === 'match' ? 'battle' : state.screen === 'end' ? null : 'menu');

  if (state.screen === 'menu') {
    drawMenu(ctx, state.ui, state.time, state.ladder);
  } else if (state.screen === 'ladder') {
    drawLadder(ctx, state.ui, state.ladder);
  } else if (state.screen === 'history') {
    drawHistory(ctx, state.ui, state.history);
  } else if (state.screen === 'history-detail') {
    const entry = state.history.find((e) => e.id === state.historyDetailId);
    if (entry) drawHistoryDetail(ctx, state.ui, entry);
    else drawHistory(ctx, state.ui, state.history);
  } else if (state.screen === 'draft' && state.draft) {
    const ev = updateDraft(state.draft, dt);
    if (ev === 'ban') sfx.ban();
    else if (ev === 'pick') sfx.pick();
    if (state.draft.done) {
      state.screen = 'vs';
      state.vsTimer = 0;
    }
    drawDraft(ctx, state.ui, state.draft, state.time);
  } else if (state.screen === 'vs') {
    state.vsTimer += rawDt;
    drawVS(ctx, state.ui, state.draft, state.vsTimer);
    if (state.vsTimer >= 3) startMatch();
  } else if (state.screen === 'match' && state.match) {
    const m = state.match;
    if (!state.paused) {
      // Substep large frames (fast-forward) so projectiles never tunnel.
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      for (let i = 0; i < steps; i++) updateMatch(m, dt / steps, state.input);
    }
    // Event sounds.
    const pv = state.prev;
    if (m.kills.A + m.kills.B > pv.killsA + pv.killsB) sfx.kill();
    pv.killsA = m.kills.A; pv.killsB = m.kills.B;
    // Tiered kill-banner stings: play each new tiered announcement once.
    for (const a of m.announcements) {
      if (a.tier !== null && a.tier !== undefined && a.seq > pv.lastAnnSeq) sfx.announce(a.tier);
    }
    pv.lastAnnSeq = Math.max(pv.lastAnnSeq, 0, ...m.announcements.map((a) => a.seq));
    if (turretsLeft(m, 'A') < pv.turA || turretsLeft(m, 'B') < pv.turB) sfx.turret();
    pv.turA = turretsLeft(m, 'A'); pv.turB = turretsLeft(m, 'B');
    if (m.player) {
      if (m.player.level > pv.pLevel) sfx.levelUp();
      pv.pLevel = m.player.level;
      if (!m.player.alive && pv.pAlive) sfx.death();
      if (m.player.alive && !pv.pAlive) sfx.respawn();
      pv.pAlive = m.player.alive;
      // Gold chime, throttled so a wave of last-hits doesn't spam it.
      if (m.player.gold > pv.pGold && state.time - lastGoldSfx > 2) {
        sfx.gold();
        lastGoldSfx = state.time;
      }
      pv.pGold = m.player.gold;
    }
    if (m.winner) {
      if (m.winner === 'A') sfx.victory(); else sfx.defeat();
      applyMatchEnd(m);
      state.screen = 'end';
      setStatus(m.winner === 'A' ? 'Victory! Enemy base destroyed.' : 'Defeat. The enemy destroyed your base.');
    }
    drawMatch(ctx, state.ui, m, { shopOpen: state.shopOpen, paused: state.paused, shopCat: state.shopCat, shopItem: state.shopItem });
  } else if (state.screen === 'end' && state.match) {
    drawEnd(ctx, state.ui, state.match, state.lastResult);
  }
}

setupShot();
requestAnimationFrame(frame);
