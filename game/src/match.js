// Match simulation: the 5v5 MOBA itself. Pure logic — no canvas, no DOM.
// World 2400x1600. Blue base bottom-left, Red base top-right. Three lanes
// (Gold top, Mid diagonal, EXP bottom), jungle camps between lanes, a river
// across the middle.
// Win rule (the user's): destroy the enemy BASE turret. Per team, 3 lane
// turrets per lane (outer -> second -> inner, destroyed in that order) plus
// the base turret, which opens only after an inner turret falls. Destroying
// an INNER turret upgrades the attacker's minions in that lane to super
// minions. At 30:00 a sudden-death tiebreak (turrets, then kills, then
// gold) guarantees a result.
import { HERO_BY_ID, ITEMS, ITEM_BY_ID, SETS, LOOKS, THEME_COLOR, MAX_LEVEL, ROLE_LANE, expForLevel } from './heroes.js';
import { clamp, dist, dist2, angleTo, pick as rngPick, shuffle } from './util.js';

export const WORLD = { w: 2400, h: 1600 };
export const BASES = { A: { x: 260, y: 1340 }, B: { x: 2140, y: 260 } };
export const MATCH_END_TIME = 1800; // 30:00 sudden death

export const LANE_PATHS = {
  gold: { A: [[260, 1340], [260, 260], [1200, 260], [2140, 260]], B: [[2140, 260], [260, 260], [260, 1340]] },
  mid: { A: [[260, 1340], [700, 1100], [1200, 800], [1700, 500], [2140, 260]], B: [[2140, 260], [1700, 500], [1200, 800], [700, 1100], [260, 1340]] },
  exp: { A: [[260, 1340], [1200, 1340], [2140, 1340], [2140, 260]], B: [[2140, 260], [2140, 1340], [1200, 1340], [260, 1340]] },
};

// Turret structure (the user's rules): per team, 3 turrets per lane in a
// fixed order — OUTER (nearest mid) -> SECOND -> INNER (nearest base) —
// plus 1 BASE turret inside the base. Order matters: array order is the
// destruction order, so `find(alive)` always returns the outermost alive
// turret of a lane. A lane turret can only be damaged once the previous
// tier in its lane is down; the base turret only once at least one inner
// turret of its team is down. Destroying the enemy BASE turret wins.
export const TURRET_SPOTS = [
  // Team A (Azure, bottom-left base).
  { team: 'A', lane: 'gold', tier: 'outer', x: 310, y: 260 },
  { team: 'A', lane: 'gold', tier: 'second', x: 260, y: 710 },
  { team: 'A', lane: 'gold', tier: 'inner', x: 260, y: 1110 },
  { team: 'A', lane: 'mid', tier: 'outer', x: 920, y: 960 },
  { team: 'A', lane: 'mid', tier: 'second', x: 730, y: 1070 },
  { team: 'A', lane: 'mid', tier: 'inner', x: 561, y: 1167 },
  { team: 'A', lane: 'exp', tier: 'outer', x: 1050, y: 1340 },
  { team: 'A', lane: 'exp', tier: 'second', x: 800, y: 1340 },
  { team: 'A', lane: 'exp', tier: 'inner', x: 480, y: 1340 },
  { team: 'A', lane: 'base', tier: 'base', x: 370, y: 1230 },
  // Team B (Crimson, top-right base).
  { team: 'B', lane: 'gold', tier: 'outer', x: 1010, y: 260 },
  { team: 'B', lane: 'gold', tier: 'second', x: 1510, y: 260 },
  { team: 'B', lane: 'gold', tier: 'inner', x: 1910, y: 260 },
  { team: 'B', lane: 'mid', tier: 'outer', x: 1480, y: 640 },
  { team: 'B', lane: 'mid', tier: 'second', x: 1670, y: 530 },
  { team: 'B', lane: 'mid', tier: 'inner', x: 1839, y: 433 },
  { team: 'B', lane: 'exp', tier: 'outer', x: 1350, y: 1340 },
  { team: 'B', lane: 'exp', tier: 'second', x: 1600, y: 1340 },
  { team: 'B', lane: 'exp', tier: 'inner', x: 1920, y: 1340 },
  { team: 'B', lane: 'base', tier: 'base', x: 2030, y: 370 },
];

export const CAMPS = [
  { x: 520, y: 640 }, { x: 820, y: 470 }, { x: 700, y: 1120 }, { x: 1000, y: 1230 },
  { x: 1880, y: 960 }, { x: 1580, y: 1130 }, { x: 1700, y: 480 }, { x: 1400, y: 370 },
  { x: 900, y: 500 }, { x: 1500, y: 1100 },
];

// Impassable walls: stone barriers that shape paths and chokepoints.
// Placement (MOBA-sensible): chokepoints at the jungle entrances, dividers
// between lanes and jungle, and guards on the centre/river crossing. Every
// wall stands clear of lanes, the river, camps, turrets and bases, so every
// lane and the centre stay reachable.
export const WALLS = [
  { x: 520, y: 760, w: 36, h: 220 },   // west jungle entrance chokepoint
  { x: 1840, y: 620, w: 36, h: 220 },  // east jungle entrance chokepoint
  { x: 950, y: 420, w: 220, h: 36 },   // north lane/jungle divider
  { x: 1230, y: 1140, w: 220, h: 36 }, // south lane/jungle divider
  { x: 900, y: 600, w: 36, h: 180 },   // centre west guard
  { x: 1460, y: 820, w: 36, h: 180 },  // centre east guard
];

// Bushes: elongated tall-grass patches (MLBB-style rectangles, rotated to
// follow their lane/river), along lanes, near the river and at jungle gank
// spots. A hero standing in one is hidden from the enemy team.
export const BUSHES = [
  { x: 650, y: 330, w: 260, h: 70, rot: 0 },       // gold lane, west
  { x: 1550, y: 350, w: 240, h: 70, rot: 0 },      // gold lane, east
  { x: 800, y: 880, w: 220, h: 70, rot: -0.52 },   // mid lane, west side
  { x: 1380, y: 560, w: 220, h: 70, rot: -0.52 },  // mid lane, east side
  { x: 750, y: 640, w: 240, h: 70, rot: 0.46 },    // river, west
  { x: 1650, y: 1080, w: 240, h: 70, rot: 0.46 },  // river, east
  { x: 700, y: 1270, w: 260, h: 70, rot: 0 },      // exp lane, west
  { x: 1700, y: 1270, w: 260, h: 70, rot: 0 },     // exp lane, east
];

// Bounding radius of a bush (for decoration exclusion / minimap).
export function bushRadius(b) { return Math.hypot(b.w, b.h) / 2; }

export function inBush(x, y) {
  for (const b of BUSHES) {
    // Rotate the point into the bush's local frame, then test the rect.
    const dx = x - b.x; const dy = y - b.y;
    const c = Math.cos(b.rot); const s = Math.sin(b.rot);
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return b;
  }
  return null;
}

// Push a circle (entity) out of every wall it overlaps. Axis-aligned walls,
// so the push-out is the smallest penetration axis — entities slide along
// wall faces naturally.
export function resolveWalls(e, radius = 20) {
  for (const w of WALLS) {
    const nx = clamp(e.x, w.x, w.x + w.w);
    const ny = clamp(e.y, w.y, w.y + w.h);
    const dx = e.x - nx;
    const dy = e.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.01) {
      const d = Math.sqrt(d2);
      e.x = nx + (dx / d) * radius;
      e.y = ny + (dy / d) * radius;
    } else {
      // Centre inside the wall: push out along the smallest penetration.
      const left = e.x - w.x + radius;
      const right = w.x + w.w - e.x + radius;
      const top = e.y - w.y + radius;
      const bottom = w.y + w.h - e.y + radius;
      const m = Math.min(left, right, top, bottom);
      if (m === left) e.x = w.x - radius;
      else if (m === right) e.x = w.x + w.w + radius;
      else if (m === top) e.y = w.y - radius;
      else e.y = w.y + w.h + radius;
    }
  }
}

let UID = 1;
function uid() { return UID++; }

export function heroStats(h) {
  const d = h.def;
  const items = h.items.map((id) => ITEMS.find((i) => i.id === id)).filter(Boolean);
  const sum = (k) => items.reduce((a, i) => a + (i[k] || 0), 0);
  // Synergy set bonuses: wear every item of a set and its bonus activates.
  const setBonus = {};
  for (const s of SETS) {
    if (s.items.every((id) => h.items.includes(id))) {
      for (const [k, v] of Object.entries(s.bonus)) setBonus[k] = (setBonus[k] || 0) + v;
    }
  }
  const lvl = h.level - 1;
  const buffDmg = h.buffs.dmgUntil > 0 ? h.buffs.dmg : 0;
  const buffAs = h.buffs.asUntil > 0 ? h.buffs.as : 0;
  const buffMs = h.buffs.msUntil > 0 ? h.buffs.ms : 0;
  return {
    maxHp: d.hp + d.hpPl * lvl + sum('hp'),
    damage: (d.dmg + d.dmgPl * lvl + sum('dmg') + (setBonus.dmg || 0)) * (1 + buffDmg),
    power: sum('power'),
    range: d.range + (d.passive.kind === 'range' ? d.passive.value : 0),
    as: d.as * (1 + sum('as') + (setBonus.as || 0) + buffAs) * (d.passive.kind === 'speedOnLow' && h.hp < h.maxHp * 0.4 ? 1 + d.passive.value : 1),
    ms: d.ms * (1 + sum('ms') + buffMs),
    armor: d.armor + sum('armor') + (d.passive.kind === 'armor' ? d.passive.value : 0),
    mres: sum('mres'),
    cdr: Math.min(0.4, sum('cdr')),
    jungle: sum('jungle'),
    crit: sum('crit') + (d.passive.kind === 'crit' ? d.passive.value : 0),
    critDmg: 1.75 + (setBonus.critDmg || 0),
    dmgReduction: setBonus.dmgReduction || 0,
    spellVamp: setBonus.spellVamp || 0,
    lifesteal: sum('lifesteal') + (setBonus.lifesteal || 0) + (d.passive.kind === 'lifesteal' ? d.passive.value : 0),
    regen: (d.passive.kind === 'regen' ? d.passive.value : 0) + (setBonus.regen || 0),
    manaRegen: 2 + (d.passive.kind === 'manaRegen' ? d.passive.value : 0),
    dodge: d.passive.kind === 'dodge' ? d.passive.value : 0,
    thorns: d.passive.kind === 'thorns' ? d.passive.value : 0,
    slowOnHit: sum('slowOnHit') + (d.passive.kind === 'slowOnHit' ? d.passive.value : 0),
    maxMana: d.mana + 20 * lvl + sum('mana'),
  };
}

function makeHero(def, team, x, y, isPlayer) {
  const h = {
    uid: uid(), kind: 'hero', team, def, name: def.name, role: def.role,
    x, y, facing: team === 'A' ? -Math.PI / 4 : (Math.PI * 3) / 4,
    level: 1, exp: 0, gold: 300, skillLv: [0, 0, 0], skillPts: 1,
    cds: [0, 0, 0], items: [], alive: true, respawn: 0, respawnTotal: 0,
    moveX: null, moveY: null, attackTarget: null, attackCd: 0,
    buffs: { dmg: 0, dmgUntil: 0, as: 0, asUntil: 0, ms: 0, msUntil: 0 },
    shield: 0, shieldUntil: 0, slowUntil: 0, slowPct: 0, stunUntil: 0,
    kills: 0, deaths: 0, assists: 0, lastHitters: [],
    damageDealt: 0, goldEarned: 0,
    streak: 0, multiKills: 0, lastKillTime: -99,
    isPlayer,
    revealUntil: 0, hidden: false,
    ai: { state: 'lane', lane: ROLE_LANE[def.role] || 'mid', campIdx: 0, think: 0, tx: x, ty: y, defend: null, bushCd: 0, bushUntil: 0, detour: null, lastDist: Infinity, stuckT: 0 },
    walkPhase: 0, flash: 0, attackAnim: 99, castAnim: 99, animKind: null,
  };
  const st = heroStats(h);
  h.maxHp = st.maxHp; h.hp = st.maxHp;
  h.maxMana = st.maxMana; h.mana = st.maxMana;
  return h;
}

function makeMinion(team, lane, x, y, kind, scale, isSuper = false) {
  const melee = kind === 'melee';
  // Super minions: +60% HP, +50% damage, slightly faster.
  const hpMul = isSuper ? 1.6 : 1;
  const dmgMul = isSuper ? 1.5 : 1;
  const hp = Math.round((melee ? 420 : 280) * scale * hpMul);
  return {
    uid: uid(), kind: 'minion', team, lane, x, y, hp, maxHp: hp, super: !!isSuper,
    damage: Math.round((melee ? 24 : 32) * scale * dmgMul), range: melee ? 70 : 230,
    as: 0.8, ms: isSuper ? 75 : 68, armor: 0, wp: 1, attackCd: 0, alive: true,
    slowUntil: 0, slowPct: 0, stunUntil: 0, facing: 0, flash: 0,
  };
}

function makeMonster(campIdx, cx, cy, kind) {
  const brute = kind === 'brute';
  const hp = brute ? 750 : 320;
  return {
    uid: uid(), kind: 'monster', team: null, campIdx, homeX: cx, homeY: cy,
    x: cx + (brute ? 0 : (campIdx % 2 === 0 ? -34 : 34)), y: cy + (brute ? 0 : 26),
    hp, maxHp: hp, damage: brute ? 34 : 18, range: 70, as: 0.7, ms: 60, armor: 4,
    gold: brute ? 65 : 25, exp: brute ? 95 : 38, attackCd: 0, alive: true,
    slowUntil: 0, slowPct: 0, stunUntil: 0, facing: 0, flash: 0, aggro: null,
  };
}

function makeTurret(spot) {
  const isBase = spot.tier === 'base';
  const hp = isBase ? 1800 : 1400;
  return {
    uid: uid(), kind: 'turret', team: spot.team, lane: spot.lane, tier: spot.tier,
    x: spot.x, y: spot.y, hp, maxHp: hp, damage: 95, range: 290, as: 0.8,
    attackCd: 0, alive: true, flash: 0, target: null, firing: 0,
  };
}

// Sequential-destruction gate: a turret can only be damaged once the
// previous tier in its lane is down; the base turret only once at least
// one inner turret of its team is down. Outer turrets are always open.
export function turretAttackable(m, t) {
  if (!t || !t.alive) return false;
  if (t.tier === 'outer') return true;
  if (t.tier === 'base') {
    return m.turrets.some((x) => x.team === t.team && x.tier === 'inner' && !x.alive);
  }
  const prev = t.tier === 'second' ? 'outer' : 'second';
  return !m.turrets.some((x) => x.team === t.team && x.lane === t.lane && x.tier === prev && x.alive);
}

export function baseExposed(m, team) {
  const base = m.turrets.find((t) => t.team === team && t.tier === 'base');
  return !!base && base.alive && turretAttackable(m, base);
}

export function createMatch(rng, draft, opts = {}) {
  const m = {
    rng, time: 0, winner: null, endReason: '', firstBlood: false,
    heroes: [], minions: [], monsters: [], turrets: [], projectiles: [],
    particles: [], dmgNums: [], feed: [], announcements: [], fx: [],
    kills: { A: 0, B: 0 },
    // Super minions: destroying an INNER turret upgrades the attacker's
    // minions in that lane only (per-lane, per-team).
    superMinions: { A: { gold: false, mid: false, exp: false }, B: { gold: false, mid: false, exp: false } },
    waveTimer: 8, campTimers: CAMPS.map(() => 0),
    autoPlayer: !!opts.autoPlayer,
    playerTeam: 'A',
    camera: { x: BASES.A.x, y: BASES.A.y },
    shake: 0,
  };
  for (const spot of TURRET_SPOTS) m.turrets.push(makeTurret(spot));
  for (let ci = 0; ci < CAMPS.length; ci++) {
    m.monsters.push(makeMonster(ci, CAMPS[ci].x, CAMPS[ci].y, 'brute'));
    m.monsters.push(makeMonster(ci, CAMPS[ci].x, CAMPS[ci].y, 'small'));
    m.monsters.push(makeMonster(ci, CAMPS[ci].x, CAMPS[ci].y, 'small'));
  }
  // Spawn heroes: the player is Team A slot 0.
  const spawnOffsets = [[0, 0], [-60, -50], [60, -50], [-50, 60], [50, 60]];
  for (const team of ['A', 'B']) {
    draft.picks[team].forEach((heroId, i) => {
      const def = HERO_BY_ID[heroId];
      const b = BASES[team];
      const o = spawnOffsets[i];
      const isPlayer = team === 'A' && i === 0;
      const h = makeHero(def, team, b.x + o[0], b.y + o[1], isPlayer);
      // Lane assignment: role lane; duplicates take the missing lane.
      const lanesTaken = m.heroes.filter((x) => x.team === team).map((x) => x.ai.lane);
      if (h.ai.lane !== 'jungle' && lanesTaken.includes(h.ai.lane)) {
        const missing = ['gold', 'mid', 'exp'].find((l) => !lanesTaken.includes(l));
        if (missing) h.ai.lane = missing;
      }
      if (h.ai.lane === 'jungle' && lanesTaken.includes('jungle')) h.ai.lane = 'mid';
      m.heroes.push(h);
    });
  }
  m.player = m.heroes.find((h) => h.isPlayer);
  return m;
}

export function playerHero(m) { return m.player; }
export function aliveHeroes(m, team) { return m.heroes.filter((h) => h.team === team && h.alive); }
export function turretsLeft(m, team) { return m.turrets.filter((t) => t.team === team && t.alive).length; }

let ANNOUNCE_SEQ = 1;

function announce(m, text, sub = '', color = '#ffd60a', tier = null) {
  // tier marks a kill banner (0..3, higher = flashier); null = plain notice.
  m.announcements.push({ text, sub, color, t: 0, tier, seq: ANNOUNCE_SEQ++ });
  if (m.announcements.length > 5) m.announcements.shift();
}

function feed(m, text, color = '#ffffff') {
  m.feed.unshift({ text, color, t: m.time });
  if (m.feed.length > 6) m.feed.pop();
}

function addDmgNum(m, x, y, value, color, crit = false) {
  if (m.dmgNums.length > 60) return;
  m.dmgNums.push({ x: x + (m.rng() - 0.5) * 20, y: y - 18, value, color, crit, t: 0 });
}

function burst(m, x, y, color, n = 8, speed = 120) {
  for (let i = 0; i < n; i++) {
    if (m.particles.length > 300) return;
    const a = m.rng() * Math.PI * 2;
    const v = speed * (0.4 + m.rng() * 0.8);
    m.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + m.rng() * 0.4, t: 0, color, size: 2 + m.rng() * 3 });
  }
}

// Themed transient effects (rings, slashes, trails, AoE circles). Capped so
// a teamfight can't flood the renderer.
function pushFx(m, fx) {
  if (m.fx.length > 80) m.fx.shift();
  m.fx.push({ t: 0, life: 0.5, ...fx });
}

export function heroLook(h) { return LOOKS[h.def.id] || {}; }
export function themeColor(h) { return THEME_COLOR[heroLook(h).theme] || h.def.accent; }

function gainExp(m, h, amount) {
  if (!h.alive || h.level >= MAX_LEVEL) return;
  h.exp += amount;
  while (h.level < MAX_LEVEL && h.exp >= expForLevel(h.level)) {
    h.exp -= expForLevel(h.level);
    h.level++;
    h.skillPts++;
    const st = heroStats(h);
    h.maxHp = st.maxHp; h.hp = Math.min(h.maxHp, h.hp + 120);
    h.maxMana = st.maxMana; h.mana = Math.min(h.maxMana, h.mana + 60);
    burst(m, h.x, h.y - 20, '#ffd60a', 14, 160);
    if (h.isPlayer) announce(m, `LEVEL ${h.level}!`, 'Skill point gained — click + to upgrade', '#ffd60a');
    // Bots spend points immediately: ultimate first, then Q, then W.
    // (In autoPlayer mode the player hero is bot-driven too.)
    if (!h.isPlayer || m.autoPlayer) {
      while (h.skillPts > 0) {
        const order = [2, 0, 1];
        let spent = false;
        for (const idx of order) {
          const sk = h.def.skills[idx];
          const max = idx === 2 ? 3 : 5;
          if (h.level >= sk.unlock && h.skillLv[idx] < max) {
            h.skillLv[idx]++; h.skillPts--; spent = true; break;
          }
        }
        if (!spent) break;
      }
    }
  }
}

function gainGold(h, amount) {
  h.gold += amount;
  h.goldEarned = (h.goldEarned || 0) + amount;
}

export function upgradeSkill(m, h, idx) {
  if (!h.alive || h.skillPts <= 0) return false;
  const sk = h.def.skills[idx];
  const max = idx === 2 ? 3 : 5;
  if (h.level < sk.unlock || h.skillLv[idx] >= max) return false;
  h.skillLv[idx]++; h.skillPts--;
  return true;
}

// Effective price of an item for a hero: components already owned are
// consumed and their price is deducted (MLBB build-path pricing).
export function buyPrice(h, item) {
  if (!item.buildsFrom) return item.price;
  let discount = 0;
  for (const comp of item.buildsFrom) {
    if (h.items.includes(comp)) discount += (ITEM_BY_ID[comp] || {}).price || 0;
  }
  return Math.max(0, item.price - discount);
}

export function buyItem(m, h, itemId) {
  const item = ITEMS.find((i) => i.id === itemId);
  if (!item) return false;
  // Slots after consuming owned components must fit in 6.
  const ownedComps = (item.buildsFrom || []).filter((c) => h.items.includes(c)).length;
  if (h.items.length - ownedComps + 1 > 6) return false;
  const price = buyPrice(h, item);
  if (h.gold < price) return false;
  h.gold -= price;
  if (item.buildsFrom) {
    for (const comp of item.buildsFrom) {
      const i = h.items.indexOf(comp);
      if (i >= 0) h.items.splice(i, 1);
    }
  }
  h.items.push(itemId);
  const st = heroStats(h);
  h.maxHp = st.maxHp; h.hp = Math.min(h.maxHp, h.hp + (item.hp || 0));
  h.maxMana = st.maxMana;
  burst(m, h.x, h.y - 10, '#ffd60a', 8, 100);
  return true;
}

export function sellItem(m, h, itemId) {
  const item = ITEMS.find((i) => i.id === itemId);
  const i = h.items.indexOf(itemId);
  if (!item || i < 0) return false;
  h.items.splice(i, 1);
  h.gold += Math.floor(item.price / 2);
  const st = heroStats(h);
  h.maxHp = st.maxHp; h.hp = Math.min(h.maxHp, h.hp);
  h.maxMana = st.maxMana;
  return true;
}

// Respawn time scales with BOTH the hero's level and the match duration:
// 8s base + 1s per level + 2s per minute of game time, capped at 60s.
// (Lv 1, min 0 -> 9s; Lv 10, min 10 -> 38s; Lv 15+, min 20+ -> 60s cap.)
// Every hero, player or bot, both teams, uses the same formula.
export function respawnTime(m, hero) {
  const minutes = m.time / 60;
  return Math.min(60, Math.round(8 + hero.level + 2 * minutes));
}

function killCredit(m, victim, killer) {
  victim.deaths++;
  victim.alive = false;
  victim.respawn = victim.respawnTotal = respawnTime(m, victim);
  victim.moveX = victim.moveY = null;
  victim.attackTarget = null;
  burst(m, victim.x, victim.y, victim.team === 'A' ? '#3a86ff' : '#e5484d', 22, 200);
  if (killer && killer.kind === 'hero' && killer.team !== victim.team) {
    killer.kills++;
    m.kills[killer.team]++;
    gainGold(killer, 200);
    gainExp(m, killer, 150);
    for (const h of victim.lastHitters) {
      if (h !== killer && h.alive && h.team === killer.team) {
        h.assists++; gainGold(h, 50); gainExp(m, h, 60);
      }
    }
    if (!m.firstBlood) {
      m.firstBlood = true;
      announce(m, 'FIRST BLOOD!', `${killer.name} slays ${victim.name}`, '#ff5d8f', 0);
      feed(m, `FIRST BLOOD — ${killer.name} ⚔ ${victim.name}`, '#ff5d8f');
    } else {
      feed(m, `${killer.name} ⚔ ${victim.name}`, killer.team === 'A' ? '#7bdff2' : '#ff8fa3');
    }
    // SHUTDOWN: killing a hero on a 3+ streak pays a bonus that scales
    // with the victim's streak.
    if (victim.streak >= 3) {
      const bonus = 100 + victim.streak * 50;
      gainGold(killer, bonus);
      announce(m, 'SHUTDOWN!', `${killer.name} ends ${victim.name}'s streak (+${bonus}g)`, '#ef5350', 2);
      feed(m, `SHUTDOWN! ${killer.name} shuts down ${victim.name} (+${bonus}g)`, '#ef5350');
    }
    // Multi-kill: kills by the same hero within a 5s window.
    killer.multiKills = (m.time - killer.lastKillTime <= 5) ? killer.multiKills + 1 : 1;
    killer.lastKillTime = m.time;
    const multi = [
      null, null,
      { name: 'DOUBLE KILL', color: '#4fc3f7', tier: 0 },
      { name: 'TRIPLE KILL', color: '#ce93d8', tier: 1 },
      { name: 'MANIAC', color: '#ff8a65', tier: 2 },
    ];
    const multiTier = killer.multiKills >= 5
      ? { name: 'SAVAGE', color: '#ffd60a', tier: 3 }
      : multi[killer.multiKills];
    if (multiTier) {
      announce(m, multiTier.name, killer.name, multiTier.color, multiTier.tier);
      feed(m, `${multiTier.name} — ${killer.name}`, multiTier.color);
    }
    // Killing streak: kills without dying, across the hero's whole life.
    killer.streak++;
    const streakTier = killer.streak >= 9
      ? { name: 'LEGENDARY', color: '#ff5252', tier: 3 }
      : killer.streak === 7 ? { name: 'GODLIKE', color: '#ffd54f', tier: 2 }
      : killer.streak === 5 ? { name: 'UNSTOPPABLE', color: '#ffab91', tier: 1 }
      : killer.streak === 3 ? { name: 'KILLING SPREE', color: '#80cbc4', tier: 0 }
      : null;
    if (streakTier) {
      announce(m, streakTier.name, killer.name, streakTier.color, streakTier.tier);
      feed(m, `${streakTier.name} — ${killer.name}`, streakTier.color);
    }
  }
  // The victim's streak and multi-kill chain die with them.
  victim.streak = 0;
  victim.multiKills = 0;
  victim.lastKillTime = -99;
  victim.lastHitters = [];
}

// Test hook: force a kill credit (drives the announcement smoke test).
export function testKillCredit(m, killer, victim) {
  if (!killer || !victim || !victim.alive) return false;
  killCredit(m, victim, killer);
  return true;
}

// Test/shot helpers for turrets: destroy through the shared destruction
// path (bypasses the sequential gate, as a staging tool), damage through
// the real path (respects the gate), and force a minion wave.
export function testDestroyTurret(m, team, lane, tier) {
  const t = m.turrets.find((x) => x.team === team && x.lane === lane && x.tier === tier && x.alive);
  if (!t) return false;
  t.hp = 0; t.alive = false;
  onTurretDestroyed(m, t, null);
  return true;
}

export function testDamageTurret(m, team, lane, tier, amount) {
  const t = m.turrets.find((x) => x.team === team && x.lane === lane && x.tier === tier && x.alive);
  if (!t) return 0;
  return dealDamage(m, t, amount, null, {});
}

export function testSpawnWave(m) { spawnWave(m); }

function dealDamage(m, target, amount, source, opts = {}) {
  if (!target || !target.alive) return 0;
  // Test hook: god-mode heroes take no damage (smoke test only; the flag
  // is never set during real play).
  if (target.kind === 'hero' && target.god) return 0;
  // Sequential-destruction gate: a protected turret takes no damage at all
  // (the shield just ripples).
  if (target.kind === 'turret' && !turretAttackable(m, target)) {
    pushFx(m, { kind: 'ring', x: target.x, y: target.y, r: 30, maxR: 52, color: '#4fc3f7', life: 0.3 });
    return 0;
  }
  if (target.kind === 'hero' && target.shield > 0) {
    const absorbed = Math.min(target.shield, amount);
    target.shield -= absorbed;
    amount -= absorbed;
    if (amount <= 0) return 0;
  }
  let armor = 0;
  if (target.kind === 'hero') armor = heroStats(target).armor;
  else if (target.kind === 'monster') armor = target.armor || 0;
  let reduced = opts.magic ? amount : amount * (100 / (100 + armor));
  if (opts.magic && target.kind === 'hero') {
    const mr = heroStats(target).mres;
    reduced = amount * (100 / (100 + mr));
  }
  // Jungle items: bonus damage to neutral monsters.
  if (source && source.kind === 'hero' && target.kind === 'monster') {
    reduced *= 1 + heroStats(source).jungle;
  }
  // Dodge (heroes only).
  if (target.kind === 'hero' && !opts.magic && m.rng() < heroStats(target).dodge) {
    addDmgNum(m, target.x, target.y, 'DODGE', '#cccccc');
    return 0;
  }
  let final = reduced;
  // Bulwark set: the target takes less damage from all sources.
  if (target.kind === 'hero') {
    const tst = heroStats(target);
    if (tst.dmgReduction > 0) final *= 1 - tst.dmgReduction;
  }
  let crit = false;
  if (source && source.kind === 'hero' && !opts.skill) {
    const st = heroStats(source);
    if (m.rng() < st.crit) { final *= st.critDmg; crit = true; }
  }
  target.hp -= final;
  target.flash = 0.12;
  // Track damage dealt by heroes (feeds the match-history detail view).
  if (source && source.kind === 'hero') {
    source.damageDealt = (source.damageDealt || 0) + final;
  }
  // Hit ring: a quick impact ripple, coloured by the attacker's theme.
  if (source && source.kind === 'hero') {
    pushFx(m, { kind: 'ring', x: target.x, y: target.y, r: 10, maxR: 30, color: themeColor(source), life: 0.22 });
  }
  addDmgNum(m, target.x, target.y, Math.round(final), crit ? '#ffd60a' : (source && source.team === 'A' ? '#ffffff' : '#ff8fa3'), crit);
  if (source && source.kind === 'hero') {
    const st = heroStats(source);
    if (st.lifesteal > 0 && target.kind !== 'turret') {
      source.hp = Math.min(source.maxHp, source.hp + final * st.lifesteal);
    }
    // Arcane set: magic damage heals the caster (spell vamp).
    if (opts.magic && st.spellVamp > 0 && target.kind !== 'turret') {
      source.hp = Math.min(source.maxHp, source.hp + final * st.spellVamp);
    }
    if (st.slowOnHit > 0 && target.kind === 'hero') {
      target.slowUntil = m.time + 1.2; target.slowPct = st.slowOnHit;
    }
    if (target.kind === 'hero') {
      if (!target.lastHitters.includes(source)) target.lastHitters.push(source);
      if (target.lastHitters.length > 4) target.lastHitters.shift();
    }
    // Thorns reflect.
    if (target.kind === 'hero') {
      const th = heroStats(target).thorns;
      if (th > 0 && source.alive) source.hp = Math.max(1, source.hp - th);
    }
  }
  if (opts.slow && target.kind !== 'turret') {
    target.slowUntil = m.time + 1.5; target.slowPct = Math.max(target.slowPct, opts.slow);
  }
  if (opts.stun && target.kind !== 'turret') {
    target.stunUntil = m.time + opts.stun;
  }
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    if (target.kind === 'hero') killCredit(m, target, source);
    else if (target.kind === 'turret') onTurretDestroyed(m, target, source); else if (target.kind === 'monster') {
      if (source && source.kind === 'hero') {
        gainGold(source, target.gold);
        gainExp(m, source, target.exp);
        feed(m, `${source.name} slew a jungle monster (+${target.gold}g)`, '#b7e4c7');
      }
      m.campTimers[target.campIdx] = 60;
    } else if (target.kind === 'minion') {
      if (source && source.kind === 'hero') {
        gainGold(source, 25);
        gainExp(m, source, 45);
      }
    }
  }
  return final;
}

const LANE_NAMES = { gold: 'Gold', mid: 'Mid', exp: 'EXP', base: 'Base' };

// Shared destruction path for turrets (real damage and test hooks alike):
// banner, team gold, super-minion unlock on INNER turrets only, base-exposed
// callout when the first inner falls, and the base win check.
function onTurretDestroyed(m, target, source) {
  burst(m, target.x, target.y, '#ff9e00', 30, 260);
  m.shake = 0.35;
  const enemyTeam = target.team === 'A' ? 'B' : 'A';
  const laneName = LANE_NAMES[target.lane] || target.lane;
  const title = target.tier === 'base'
    ? 'BASE TURRET DESTROYED!'
    : `${laneName.toUpperCase()} ${target.tier.toUpperCase()} TURRET DESTROYED!`;
  announce(m, title, `Team ${enemyTeam} destroys a turret`, '#ff9e00');
  feed(m, `${title} — Team ${enemyTeam} +150g each`, '#ff9e00');
  for (const h of m.heroes.filter((x) => x.team === enemyTeam)) gainGold(h, 150);
  if (target.tier === 'inner') {
    // Super minions: ONLY an inner turret unlocks them, for the attacker's
    // minions in that lane only. Outer/second turrets do not.
    if (!m.superMinions[enemyTeam][target.lane]) {
      m.superMinions[enemyTeam][target.lane] = true;
      announce(m, 'SUPER MINIONS!', `${laneName} lane minions empowered!`, '#ffd60a', 2);
      feed(m, `Super minions empowered in the ${laneName} lane!`, '#ffd60a');
    }
    // First inner down exposes the base turret.
    const innersLeft = m.turrets.filter((x) => x.team === target.team && x.tier === 'inner' && x.alive).length;
    if (innersLeft === 2) {
      announce(m, 'BASE EXPOSED!', `Team ${target.team}'s base turret can now be attacked`, '#ff5d8f', 1);
    }
  }
  checkWin(m);
}

function checkWin(m) {
  if (m.winner) return;
  // Win rule (the user's): destroy the enemy BASE turret.
  const baseB = m.turrets.find((t) => t.team === 'B' && t.tier === 'base');
  const baseA = m.turrets.find((t) => t.team === 'A' && t.tier === 'base');
  if (baseB && !baseB.alive) {
    m.winner = 'A'; m.endReason = 'Enemy base destroyed';
  } else if (baseA && !baseA.alive) {
    m.winner = 'B'; m.endReason = 'Enemy base destroyed';
  }
}

function enemiesInRange(m, x, y, radius, team) {
  const out = [];
  for (const h of m.heroes) if (h.alive && h.team !== team && dist2(x, y, h.x, h.y) <= radius * radius) out.push(h);
  for (const mn of m.minions) if (mn.alive && mn.team !== team && dist2(x, y, mn.x, mn.y) <= radius * radius) out.push(mn);
  for (const mo of m.monsters) if (mo.alive && dist2(x, y, mo.x, mo.y) <= radius * radius) out.push(mo);
  return out;
}

function nearestEnemy(m, x, y, range, team, heroesOnly = false) {
  let best = null;
  let bestD = range * range;
  const consider = (e) => {
    // Hidden heroes cannot be targeted.
    if (e.kind === 'hero' && e.hidden) return;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  };
  for (const h of m.heroes) if (h.alive && h.team !== team) consider(h);
  if (!heroesOnly) {
    for (const mn of m.minions) if (mn.alive && mn.team !== team) consider(mn);
    for (const mo of m.monsters) if (mo.alive) consider(mo);
  }
  return best;
}

function nearestEnemyHero(m, x, y, range, team) {
  return nearestEnemy(m, x, y, range, team, true);
}

function fireProjectile(m, from, tx, ty, opts) {
  const a = angleTo(from.x, from.y, tx, ty);
  const speed = opts.speed || 700;
  m.projectiles.push({
    x: from.x, y: from.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
    team: from.team, dmg: opts.dmg, from, target: opts.target || null,
    pierce: !!opts.pierce, radius: opts.radius || 26, life: opts.life || 1.2,
    color: opts.color || '#ffffff', magic: !!opts.magic, skill: !!opts.skill,
    slow: opts.slow || 0, hit: new Set(),
    shape: opts.shape || 'orb', theme: opts.theme || null, trail: [],
  });
}

export function castSkill(m, h, idx, tx, ty) {
  if (!h.alive || m.winner) return false;
  const sk = h.def.skills[idx];
  const lvl = h.skillLv[idx];
  if (lvl <= 0 || h.level < sk.unlock) return false;
  if (h.cds[idx] > 0 || h.mana < sk.mana) return false;
  const st = heroStats(h);
  const dmg = (sk.damage + sk.dpl * (lvl - 1)) * (1 + st.power / 120);
  const dx = tx - h.x;
  const dy = ty - h.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const range = sk.range || 0;
  const cx = range > 0 && d > range ? h.x + (dx / d) * range : tx;
  const cy = range > 0 && d > range ? h.y + (dy / d) * range : ty;
  h.mana -= sk.mana;
  h.cds[idx] = sk.cd * (1 - st.cdr);
  // Casting reveals a hidden hero for a short time.
  h.revealUntil = m.time + 1.5;
  h.facing = Math.atan2(dy, dx);
  const color = h.def.accent;
  const look = heroLook(h);
  const theme = THEME_COLOR[look.theme] || color;
  // Cast pose: leaps for dashes/blinks, a throw for bolts/volleys, a channel
  // stance for everything else.
  h.castAnim = 0;
  h.animKind = sk.type === 'dash' || sk.type === 'blink' ? 'leap'
    : sk.type === 'bolt' || sk.type === 'volley' || sk.type === 'nova' ? 'throw' : 'cast';
  const atkShape = look.attack === 'arrow' ? 'arrow' : look.attack === 'shell' ? 'shell'
    : look.attack === 'dagger' ? 'dagger' : 'orb';
  switch (sk.type) {
    case 'bolt':
      fireProjectile(m, h, cx, cy, { dmg, color: theme, magic: h.role === 'Mage', skill: true, slow: sk.slow || 0, pierce: sk.pierce, shape: atkShape, theme: look.theme });
      break;
    case 'volley': {
      const base = Math.atan2(dy, dx);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.16;
        m.projectiles.push({
          x: h.x, y: h.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700,
          team: h.team, dmg: dmg * 0.55, from: h, target: null, pierce: false,
          radius: 24, life: 0.9, color: theme, magic: h.role === 'Mage', skill: true, slow: 0, hit: new Set(),
          shape: atkShape, theme: look.theme, trail: [],
        });
      }
      pushFx(m, { kind: 'ring', x: h.x, y: h.y, r: 16, maxR: 44, color: theme, life: 0.3 });
      break;
    }
    case 'nova': {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        m.projectiles.push({
          x: h.x, y: h.y, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620,
          team: h.team, dmg: dmg * 0.5, from: h, target: null, pierce: false,
          radius: 24, life: 0.7, color: theme, magic: true, skill: true, slow: 0, hit: new Set(),
          shape: 'orb', theme: look.theme, trail: [],
        });
      }
      pushFx(m, { kind: 'ring', x: h.x, y: h.y, r: 20, maxR: 130, color: theme, life: 0.45 });
      burst(m, h.x, h.y, theme, 16, 220);
      break;
    }
    case 'aoe': {
      pushFx(m, { kind: 'aoe', x: cx, y: cy, radius: sk.radius, color: theme, theme: look.theme, life: 0.6 });
      burst(m, cx, cy, theme, 18, 200);
      for (const e of enemiesInRange(m, cx, cy, sk.radius, h.team)) {
        dealDamage(m, e, dmg, h, { magic: true, skill: true, slow: sk.slow || 0, stun: sk.stun || 0 });
      }
      break;
    }
    case 'dash': {
      const ox = h.x; const oy = h.y;
      h.x = cx; h.y = cy;
      h.x = clamp(h.x, 20, WORLD.w - 20); h.y = clamp(h.y, 20, WORLD.h - 20);
      pushFx(m, { kind: 'trail', x1: ox, y1: oy, x2: h.x, y2: h.y, color: theme, life: 0.4 });
      pushFx(m, { kind: 'ring', x: h.x, y: h.y, r: 14, maxR: 60, color: theme, life: 0.3 });
      burst(m, h.x, h.y, theme, 10, 150);
      if (sk.damage > 0) {
        for (const e of enemiesInRange(m, h.x, h.y, sk.radius || 90, h.team)) {
          dealDamage(m, e, dmg, h, { skill: true, stun: sk.stun || 0 });
        }
      }
      break;
    }
    case 'blink': {
      pushFx(m, { kind: 'ring', x: h.x, y: h.y, r: 10, maxR: 40, color: theme, life: 0.3 });
      burst(m, h.x, h.y, theme, 8, 120);
      h.x = cx; h.y = cy;
      h.x = clamp(h.x, 20, WORLD.w - 20); h.y = clamp(h.y, 20, WORLD.h - 20);
      pushFx(m, { kind: 'ring', x: h.x, y: h.y, r: 14, maxR: 54, color: theme, life: 0.3 });
      burst(m, h.x, h.y, theme, 10, 150);
      if (sk.damage > 0) {
        for (const e of enemiesInRange(m, h.x, h.y, sk.radius || 110, h.team)) {
          dealDamage(m, e, dmg, h, { magic: true, skill: true });
        }
      }
      break;
    }
    case 'execute': {
      const target = nearestEnemyHero(m, cx, cy, 160, h.team) || nearestEnemyHero(m, h.x, h.y, range, h.team);
      if (!target) {
        // No target in range: refund the cast.
        h.mana += sk.mana;
        h.cds[idx] = 0;
        return false;
      }
      const mult = target.hp < target.maxHp * 0.35 ? 2 : 1;
      pushFx(m, { kind: 'slashX', x: target.x, y: target.y, color: '#ff2222', life: 0.35 });
      dealDamage(m, target, dmg * mult, h, { skill: true });
      burst(m, target.x, target.y, '#ff0000', 14, 200);
      break;
    }
    case 'heal': {
      if (sk.ally) {
        const allies = m.heroes.filter((a) => a.alive && a.team === h.team && dist2(h.x, h.y, a.x, a.y) <= (sk.radius || sk.range || 400) ** 2);
        if (sk.radius) {
          for (const a of allies) { a.hp = Math.min(a.maxHp, a.hp + dmg); pushFx(m, { kind: 'heal', x: a.x, y: a.y, color: '#7CFC00', life: 0.7 }); }
        } else {
          allies.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
          const t = allies[0] || h;
          t.hp = Math.min(t.maxHp, t.hp + dmg);
          pushFx(m, { kind: 'heal', x: t.x, y: t.y, color: '#7CFC00', life: 0.7 });
        }
      } else {
        h.hp = Math.min(h.maxHp, h.hp + dmg);
        pushFx(m, { kind: 'heal', x: h.x, y: h.y, color: '#7CFC00', life: 0.7 });
      }
      break;
    }
    case 'shield': {
      const amount = (sk.shield || 0) + (lvl - 1) * 60;
      if (sk.ally) {
        for (const a of m.heroes.filter((x) => x.alive && x.team === h.team && dist2(h.x, h.y, x.x, x.y) <= (sk.radius || 320) ** 2)) {
          a.shield = Math.max(a.shield, amount); a.shieldUntil = m.time + 4;
          pushFx(m, { kind: 'ring', x: a.x, y: a.y, r: 20, maxR: 46, color: '#80ed99', life: 0.4 });
        }
      } else {
        h.shield = Math.max(h.shield, amount); h.shieldUntil = m.time + 4;
        pushFx(m, { kind: 'ring', x: h.x, y: h.y, r: 20, maxR: 46, color: '#80ed99', life: 0.4 });
      }
      burst(m, h.x, h.y, '#80ed99', 8, 100);
      break;
    }
    case 'buff': {
      const dur = 5 + (sk.buffDmg ? 2 : 0);
      const targets = sk.radius
        ? m.heroes.filter((a) => a.alive && a.team === h.team && dist2(h.x, h.y, a.x, a.y) <= sk.radius * sk.radius)
        : [h];
      for (const t of targets) {
        if (sk.buffDmg) { t.buffs.dmg = sk.buffDmg; t.buffs.dmgUntil = m.time + dur; }
        if (sk.buffAs) { t.buffs.as = sk.buffAs; t.buffs.asUntil = m.time + dur; }
        if (sk.buffMs) { t.buffs.ms = sk.buffMs; t.buffs.msUntil = m.time + 4; }
        pushFx(m, { kind: 'aura', x: t.x, y: t.y, color: theme, life: 0.6 });
        burst(m, t.x, t.y, theme, 6, 110);
      }
      break;
    }
    case 'drain': {
      pushFx(m, { kind: 'ring', x: h.x, y: h.y, r: 30, maxR: 260, color: theme, life: 0.5 });
      for (const e of enemiesInRange(m, h.x, h.y, 260, h.team)) {
        const dealt = dealDamage(m, e, dmg * 0.5, h, { magic: true, skill: true });
        h.hp = Math.min(h.maxHp, h.hp + dealt * 0.4);
      }
      break;
    }
    default:
      break;
  }
  return true;
}

function moveToward(e, tx, ty, dt, speed) {
  const d = dist(e.x, e.y, tx, ty);
  if (d < 4) return true;
  const step = Math.min(d, speed * dt);
  e.x += ((tx - e.x) / d) * step;
  e.y += ((ty - e.y) / d) * step;
  e.facing = Math.atan2(ty - e.y, tx - e.x);
  e.walkPhase = (e.walkPhase || 0) + dt * 10;
  // Walls are solid: push out after every step (entities slide along faces).
  resolveWalls(e, e.kind === 'hero' ? 20 : 14);
  return d <= step + 1;
}

// Hero movement with wall detours: if a hero makes no progress toward its
// target for ~1s (pressed against a wall face), route via the corner that
// minimises the whole route (hero -> corner -> target), then resume.
// Returns true when the target is reached.
function moveHeroToward(m, h, tx, ty, dt, speed) {
  const ai = h.ai;
  const targetDist = dist(h.x, h.y, tx, ty);
  // Follow an active detour waypoint first.
  if (ai.detour) {
    const dd = dist(h.x, h.y, ai.detour.x, ai.detour.y);
    if (dd < 26 || m.time > ai.detour.until) ai.detour = null;
    else {
      moveToward(h, ai.detour.x, ai.detour.y, dt, speed);
      return false;
    }
  }
  if (targetDist < 4) { ai.stuckT = 0; return true; }
  // Stuck detection: no meaningful progress while moving.
  if (targetDist > ai.lastDist - 2) ai.stuckT += dt;
  else ai.stuckT = 0;
  ai.lastDist = targetDist;
  if (ai.stuckT > 1.0) {
    ai.stuckT = 0;
    // Find the wall blocking the straight path (sample along the segment).
    let blocking = null;
    for (let s = 0; s <= 1 && !blocking; s += 0.05) {
      const px = h.x + (tx - h.x) * s;
      const py = h.y + (ty - h.y) * s;
      blocking = WALLS.find((w) => px > w.x - 24 && px < w.x + w.w + 24 && py > w.y - 24 && py < w.y + w.h + 24) || null;
    }
    if (blocking) {
      // Pick the corner that minimises the whole route (hero -> corner ->
      // target). The nearest corner is usually the near side, which the hero
      // already stands at — routing there just loops forever against the
      // same face. The far corner gets the hero past the wall.
      const corners = [
        { x: blocking.x, y: blocking.y },
        { x: blocking.x + blocking.w, y: blocking.y },
        { x: blocking.x, y: blocking.y + blocking.h },
        { x: blocking.x + blocking.w, y: blocking.y + blocking.h },
      ];
      corners.sort((a, b) => (dist(h.x, h.y, a.x, a.y) + dist(a.x, a.y, tx, ty)) - (dist(h.x, h.y, b.x, b.y) + dist(b.x, b.y, tx, ty)));
      const c = corners[0];
      const cx = blocking.x + blocking.w / 2;
      const cy = blocking.y + blocking.h / 2;
      const ox = c.x - cx; const oy = c.y - cy;
      const ol = Math.hypot(ox, oy) || 1;
      ai.detour = { x: clamp(c.x + (ox / ol) * 42, 20, WORLD.w - 20), y: clamp(c.y + (oy / ol) * 42, 20, WORLD.h - 20), until: m.time + 5 };
      moveToward(h, ai.detour.x, ai.detour.y, dt, speed);
      return false;
    }
  }
  return moveToward(h, tx, ty, dt, speed);
}

function effectiveSpeed(m, e, base) {
  let s = base;
  if (e.slowUntil > m.time) s *= 1 - e.slowPct;
  return s;
}

function stunned(m, e) { return e.stunUntil > m.time; }

function heroAttack(m, h, target) {
  const st = heroStats(h);
  const look = heroLook(h);
  h.attackCd = 1 / st.as;
  h.attackAnim = 0;
  // Attacking reveals a hidden hero for a short time.
  h.revealUntil = m.time + 1.5;
  h.animKind = look.attack === 'arrow' || look.attack === 'shell' || look.attack === 'bolt' ? 'shoot'
    : look.attack === 'claw' || look.attack === 'slash' ? 'swing' : 'thrust';
  h.facing = angleTo(h.x, h.y, target.x, target.y);
  if (st.range > 120) {
    fireProjectile(m, h, target.x, target.y, {
      dmg: st.damage, target, color: themeColor(h), magic: h.role === 'Mage',
      speed: 800, life: 1.5, shape: look.attack, theme: look.theme,
    });
  } else {
    // Melee strike visual: a slash arc / claw marks / hammer shockwave at
    // the target, matched to the hero's attack style.
    pushFx(m, { kind: 'strike', x: target.x, y: target.y, angle: h.facing, style: look.attack, color: themeColor(h), life: 0.22 });
    dealDamage(m, target, st.damage, h, {});
    burst(m, target.x, target.y, themeColor(h), 3, 80);
  }
}

function updateHero(m, h, dt, input) {
  if (!h.alive) {
    h.respawn -= dt;
    if (h.respawn <= 0) {
      const b = BASES[h.team];
      h.alive = true;
      h.hp = h.maxHp; h.mana = h.maxMana;
      h.x = b.x; h.y = b.y;
      h.shield = 0; h.slowUntil = 0; h.stunUntil = 0;
      // Clear stale orders (e.g. clicks issued while dead).
      h.moveX = h.moveY = null; h.attackTarget = null;
      burst(m, h.x, h.y, '#ffffff', 12, 140);
    }
    return;
  }
  const st = heroStats(h);
  h.maxHp = st.maxHp; h.maxMana = st.maxMana;
  for (let i = 0; i < 3; i++) if (h.cds[i] > 0) h.cds[i] -= dt;
  if (h.attackCd > 0) h.attackCd -= dt;
  if (h.flash > 0) h.flash -= dt;
  if (h.attackAnim < 99) h.attackAnim += dt;
  if (h.castAnim < 99) h.castAnim += dt;
  if (h.shieldUntil < m.time) h.shield = 0;
  // Bush stealth: hidden while standing in a bush, unless recently revealed
  // (attacked / cast a skill) or an enemy hero is close enough to spot them.
  const bush = inBush(h.x, h.y);
  let hidden = false;
  if (bush && m.time >= h.revealUntil) {
    const enemyNear = m.heroes.some((e) => e.alive && e.team !== h.team && dist2(h.x, h.y, e.x, e.y) < 150 * 150);
    hidden = !enemyNear;
  }
  h.hidden = hidden;
  // Regen + base healing.
  h.hp = Math.min(h.maxHp, h.hp + st.regen * dt);
  h.mana = Math.min(h.maxMana, h.mana + st.manaRegen * dt);
  const base = BASES[h.team];
  if (dist2(h.x, h.y, base.x, base.y) < 220 * 220) {
    h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.08 * dt);
    h.mana = Math.min(h.maxMana, h.mana + h.maxMana * 0.1 * dt);
  }
  // Heal auras.
  for (const a of m.heroes) {
    if (a.alive && a.team === h.team && a !== h && a.def.passive.kind === 'healAura' && dist2(h.x, h.y, a.x, a.y) < 300 * 300) {
      h.hp = Math.min(h.maxHp, h.hp + a.def.passive.value * dt);
    }
  }
  if (stunned(m, h)) return;
  const isAuto = h.isPlayer ? (m.autoPlayer || input.auto) : true;
  if (h.isPlayer && !isAuto) {
    updatePlayerHero(m, h, dt, input);
  } else {
    updateBotHero(m, h, dt);
  }
}

function tryAutoAttack(m, h, dt) {
  if (h.attackCd > 0) return false;
  const st = heroStats(h);
  // Prefer heroes, then anything in range.
  let target = nearestEnemyHero(m, h.x, h.y, st.range, h.team);
  if (!target) target = nearestEnemy(m, h.x, h.y, st.range, h.team);
  if (!target) {
    // Turrets are valid targets too — but only attackable ones (a
    // shielded turret is never worth walking up to).
    let best = null; let bestD = st.range * st.range;
    for (const t of m.turrets) {
      if (!t.alive || t.team === h.team || !turretAttackable(m, t)) continue;
      const d = dist2(h.x, h.y, t.x, t.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    target = best;
  }
  if (target) { heroAttack(m, h, target); return true; }
  return false;
}

function updatePlayerHero(m, h, dt, input) {
  const st = heroStats(h);
  // Skill casts from input.
  if (input.cast) {
    const c = input.cast;
    input.cast = null;
    castSkill(m, h, c.idx, c.x, c.y);
  }
  // Click-to-move / click-to-attack.
  if (input.move) {
    h.moveX = input.move.x; h.moveY = input.move.y;
    h.attackTarget = input.move.target || null;
    input.move = null;
  }
  if (h.attackTarget) {
    const t = h.attackTarget;
    if (!t.alive) { h.attackTarget = null; }
    else if (dist2(h.x, h.y, t.x, t.y) <= st.range * st.range) {
      if (h.attackCd <= 0) heroAttack(m, h, t);
      return;
    } else {
      moveHeroToward(m, h, t.x, t.y, dt, effectiveSpeed(m, h, st.ms));
      return;
    }
  }
  if (h.moveX !== null) {
    const arrived = moveHeroToward(m, h, h.moveX, h.moveY, dt, effectiveSpeed(m, h, st.ms));
    if (arrived) { h.moveX = null; h.moveY = null; }
    return;
  }
  // Idle: auto-attack anything in range.
  tryAutoAttack(m, h, dt);
}

function laneAnchor(m, team, lane) {
  // Midpoint between the two turrets of a lane (or the lane's middle).
  const own = m.turrets.find((t) => t.team === team && t.lane === lane);
  const foe = m.turrets.find((t) => t.team !== team && t.lane === lane);
  if (own && foe) return { x: (own.x + foe.x) / 2, y: (own.y + foe.y) / 2 };
  const path = LANE_PATHS[lane][team];
  const mid = path[Math.floor(path.length / 2)];
  return { x: mid[0], y: mid[1] };
}

function updateBotHero(m, h, dt) {
  const st = heroStats(h);
  const ai = h.ai;
  ai.think -= dt;
  if (ai.bushCd > 0) ai.bushCd -= dt;
  const base = BASES[h.team];
  const hpPct = h.hp / h.maxHp;

  // Retreat when hurt.
  if (hpPct < 0.3 && ai.state !== 'retreat') ai.state = 'retreat';
  if (ai.state === 'retreat' && hpPct > 0.85) ai.state = ai.lane === 'jungle' ? 'jungle' : 'lane';

  if (ai.think <= 0) {
    ai.think = 0.3;
    const enemyNear = nearestEnemyHero(m, h.x, h.y, 420, h.team);
    const myTurretThreatened = m.turrets.find((t) => t.team === h.team && t.alive &&
      m.minions.some((mn) => mn.alive && mn.team !== h.team && dist2(mn.x, mn.y, t.x, t.y) < 320 * 320));
    if (ai.state === 'retreat') {
      ai.tx = base.x; ai.ty = base.y;
    } else if (enemyNear && hpPct > 0.35) {
      ai.state = 'fight';
      ai.tx = enemyNear.x; ai.ty = enemyNear.y;
    } else if (ai.state === 'bush') {
      // Stay in the bush until the ambush window ends or prey walks by.
      if (m.time > ai.bushUntil) { ai.state = 'lane'; }
    } else if (myTurretThreatened && dist2(h.x, h.y, myTurretThreatened.x, myTurretThreatened.y) < 900 * 900) {
      ai.state = 'defend';
      ai.tx = myTurretThreatened.x; ai.ty = myTurretThreatened.y;
    } else if (ai.lane === 'jungle') {
      ai.state = 'jungle';
      // Pick the nearest alive camp on our side of the map.
      let best = null; let bestD = Infinity;
      for (let i = 0; i < CAMPS.length; i++) {
        const alive = m.monsters.some((mo) => mo.alive && mo.campIdx === i);
        if (!alive) continue;
        const d = dist2(h.x, h.y, CAMPS[i].x, CAMPS[i].y);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best !== null) { ai.campIdx = best; ai.tx = CAMPS[best].x; ai.ty = CAMPS[best].y; }
      else { const a = laneAnchor(m, h.team, 'mid'); ai.tx = a.x; ai.ty = a.y; }
    } else {
      ai.state = 'lane';
      const a = laneAnchor(m, h.team, ai.lane);
      // Push toward the enemy turret when our minions are ahead.
      const foeTurret = m.turrets.find((t) => t.team !== h.team && t.lane === ai.lane && t.alive);
      const myMinionsAhead = m.minions.some((mn) => mn.alive && mn.team === h.team && mn.lane === ai.lane &&
        foeTurret && dist2(mn.x, mn.y, foeTurret.x, foeTurret.y) < 400 * 400);
      if (foeTurret && myMinionsAhead) { ai.tx = foeTurret.x; ai.ty = foeTurret.y; }
      else if (!foeTurret) {
        // Lane cleared: push the exposed base turret with the minion wave.
        const foeBase = m.turrets.find((t) => t.team !== h.team && t.tier === 'base' && t.alive);
        const waveAtBase = foeBase && m.minions.some((mn) => mn.alive && mn.team === h.team &&
          dist2(mn.x, mn.y, foeBase.x, foeBase.y) < 420 * 420);
        if (foeBase && waveAtBase && turretAttackable(m, foeBase)) { ai.tx = foeBase.x; ai.ty = foeBase.y; }
        else {
          const a2 = laneAnchor(m, h.team, ai.lane);
          ai.tx = a2.x; ai.ty = a2.y;
        }
      }
      else {
        // Ambush: healthy bots sometimes slip into a nearby bush and wait
        // for a passing enemy instead of standing in the lane.
        const bush = ai.bushCd <= 0 && hpPct > 0.6
          ? BUSHES.find((b) => dist2(h.x, h.y, b.x, b.y) < 520 * 520)
          : null;
        if (bush && m.rng() < 0.3) {
          ai.state = 'bush';
          ai.tx = bush.x; ai.ty = bush.y;
          ai.bushUntil = m.time + 8;
          ai.bushCd = 25;
        } else {
          ai.tx = a.x + (m.rng() - 0.5) * 120; ai.ty = a.y + (m.rng() - 0.5) * 120;
        }
      }
    }
  }

  // Cast skills at nearby enemies.
  const foe = nearestEnemyHero(m, h.x, h.y, 520, h.team);
  if (foe && ai.state !== 'retreat') {
    for (let idx = 2; idx >= 0; idx--) {
      const sk = h.def.skills[idx];
      if (h.skillLv[idx] > 0 && h.cds[idx] <= 0 && h.mana >= sk.mana && m.rng() < 0.5) {
        if (sk.type === 'heal' || sk.type === 'shield' || sk.type === 'buff') {
          if (hpPct < 0.7 || idx === 2) castSkill(m, h, idx, h.x, h.y);
        } else if (dist2(h.x, h.y, foe.x, foe.y) <= (sk.range || 300) ** 2 + 100 * 100) {
          castSkill(m, h, idx, foe.x, foe.y);
        }
        break;
      }
    }
  }

  // Attack if something is in range, else move to the target point.
  if (ai.state !== 'retreat' || dist2(h.x, h.y, base.x, base.y) < 200 * 200) {
    if (tryAutoAttack(m, h, dt)) return;
  }
  if (ai.state === 'retreat') {
    moveHeroToward(m, h, base.x, base.y, dt, effectiveSpeed(m, h, st.ms));
    return;
  }
  // Bush ambush: once inside the bush, hold still and wait for prey.
  if (ai.state === 'bush') {
    if (inBush(h.x, h.y)) return;
    moveHeroToward(m, h, ai.tx, ai.ty, dt, effectiveSpeed(m, h, st.ms));
    return;
  }
  moveHeroToward(m, h, ai.tx, ai.ty, dt, effectiveSpeed(m, h, st.ms));
}

function updateMinion(m, mn, dt) {
  if (!mn.alive) return;
  if (mn.flash > 0) mn.flash -= dt;
  if (mn.attackCd > 0) mn.attackCd -= dt;
  if (stunned(m, mn)) return;
  // Find a target: nearest enemy unit (hero/minion/turret) in aggro range.
  let target = nearestEnemy(m, mn.x, mn.y, 200, mn.team);
  if (!target) {
    let bestD = 200 * 200;
    for (const t of m.turrets) {
      if (!t.alive || t.team === mn.team || !turretAttackable(m, t)) continue;
      const d = dist2(mn.x, mn.y, t.x, t.y);
      if (d < bestD) { bestD = d; target = t; }
    }
  }
  if (target) {
    if (dist2(mn.x, mn.y, target.x, target.y) <= mn.range * mn.range) {
      if (mn.attackCd <= 0) {
        mn.attackCd = 1 / mn.as;
        if (mn.range > 120) {
          fireProjectile(m, mn, target.x, target.y, { dmg: mn.damage, target, color: mn.team === 'A' ? '#7bdff2' : '#ff8fa3', speed: 600, life: 1 });
        } else {
          dealDamage(m, target, mn.damage, mn, {});
        }
      }
      return;
    }
    moveToward(mn, target.x, target.y, dt, effectiveSpeed(m, mn, mn.ms));
    return;
  }
  // March along the lane.
  const path = LANE_PATHS[mn.lane][mn.team];
  if (mn.wp >= path.length) return;
  const [wx, wy] = path[mn.wp];
  if (moveToward(mn, wx, wy, dt, effectiveSpeed(m, mn, mn.ms))) mn.wp++;
}

function updateMonster(m, mo, dt) {
  if (!mo.alive) return;
  if (mo.flash > 0) mo.flash -= dt;
  if (mo.attackCd > 0) mo.attackCd -= dt;
  if (stunned(m, mo)) return;
  const home = dist2(mo.x, mo.y, mo.homeX, mo.homeY);
  // Leash: return home if dragged too far.
  if (home > 320 * 320) {
    mo.aggro = null;
    moveToward(mo, mo.homeX, mo.homeY, dt, mo.ms * 1.5);
    mo.hp = Math.min(mo.maxHp, mo.hp + mo.maxHp * 0.05 * dt);
    return;
  }
  if (!mo.aggro || !mo.aggro.alive) {
    mo.aggro = nearestEnemyHero(m, mo.x, mo.y, 260, null) || null;
    // Monsters attack any hero that comes close (team-agnostic aggro).
    if (!mo.aggro) {
      let best = null; let bestD = 260 * 260;
      for (const h of m.heroes) {
        if (!h.alive) continue;
        const d = dist2(mo.x, mo.y, h.x, h.y);
        if (d < bestD) { bestD = d; best = h; }
      }
      mo.aggro = best;
    }
  }
  if (mo.aggro) {
    if (dist2(mo.x, mo.y, mo.aggro.x, mo.aggro.y) <= mo.range * mo.range) {
      if (mo.attackCd <= 0) {
        mo.attackCd = 1 / mo.as;
        dealDamage(m, mo.aggro, mo.damage, mo, {});
      }
    } else {
      moveToward(mo, mo.aggro.x, mo.aggro.y, dt, effectiveSpeed(m, mo, mo.ms));
    }
  } else if (home > 10 * 10) {
    moveToward(mo, mo.homeX, mo.homeY, dt, mo.ms);
  }
}

function updateTurret(m, t, dt) {
  if (!t.alive) return;
  if (t.flash > 0) t.flash -= dt;
  if (t.firing > 0) t.firing -= dt;
  if (t.attackCd > 0) t.attackCd -= dt;
  // Target persistence: stick to the current target until it dies or
  // leaves the range circle — no retargeting to a closer unit mid-fight.
  if (t.target) {
    if (!t.target.alive || dist2(t.x, t.y, t.target.x, t.target.y) > t.range * t.range) t.target = null;
  }
  if (!t.target) {
    // Targeting priority (the user's rules): nearest enemy MINION in the
    // circle first; only with no minion in range, an enemy HERO; nothing
    // in range means the turret stays silent.
    let bestD = t.range * t.range;
    for (const mn of m.minions) {
      if (!mn.alive || mn.team === t.team) continue;
      const d = dist2(t.x, t.y, mn.x, mn.y);
      if (d < bestD) { bestD = d; t.target = mn; }
    }
    if (!t.target) {
      for (const h of m.heroes) {
        if (!h.alive || h.team === t.team) continue;
        const d = dist2(t.x, t.y, h.x, h.y);
        if (d < bestD) { bestD = d; t.target = h; }
      }
    }
  }
  if (t.target && t.attackCd <= 0) {
    t.attackCd = 1 / t.as;
    t.firing = 0.6; // lights up the range circle briefly
    // Turret shots hurt HEROES far more than minions (standard MOBA):
    // an early-game hero cannot tank turret fire for long.
    const dmg = t.target.kind === 'hero' ? Math.round(t.damage * 1.8) : t.damage;
    fireProjectile(m, t, t.target.x, t.target.y, { dmg, target: t.target, color: '#ffd60a', speed: 900, life: 1 });
  }
}

function spawnWave(m) {
  const minutes = m.time / 60;
  const scale = Math.min(2.5, 1 + 0.06 * Math.max(0, minutes - 4));
  for (const lane of ['gold', 'mid', 'exp']) {
    for (const team of ['A', 'B']) {
      const path = LANE_PATHS[lane][team];
      const [sx, sy] = path[0];
      const s = scale;
      const isSuper = !!m.superMinions[team][lane];
      for (let i = 0; i < 3; i++) {
        const kind = i === 2 ? 'ranged' : 'melee';
        const off = (i - 1) * 46;
        m.minions.push(makeMinion(team, lane, sx + off, sy + off, kind, s, isSuper));
      }
    }
  }
}

function updateProjectiles(m, dt) {
  for (const p of m.projectiles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    // Homing projectiles track their target — unless it hides in a bush,
    // in which case they lose the lock and fly straight.
    if (p.target && p.target.alive) {
      if (p.target.kind === 'hero' && p.target.hidden) p.target = null;
      else {
        const a = angleTo(p.x, p.y, p.target.x, p.target.y);
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Trail points for the renderer (glowing projectiles leave a streak).
    if (p.trail) { p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 5) p.trail.shift(); }
    // Hit test against enemy units.
    const targets = [];
    for (const h of m.heroes) if (h.alive && h.team !== p.team) targets.push(h);
    for (const mn of m.minions) if (mn.alive && mn.team !== p.team) targets.push(mn);
    for (const mo of m.monsters) if (mo.alive) targets.push(mo);
    for (const t of m.turrets) if (t.alive && t.team !== p.team) targets.push(t);
    let hit = false;
    for (const t of targets) {
      if (p.hit.has(t.uid)) continue;
      const rr = p.radius + (t.kind === 'turret' ? 34 : 22);
      if (dist2(p.x, p.y, t.x, t.y) <= rr * rr) {
        p.hit.add(t.uid);
        dealDamage(m, t, p.dmg, p.from, { magic: p.magic, skill: p.skill, slow: p.slow });
        hit = true;
        if (!p.pierce) break;
      }
    }
    if (hit && !p.pierce) p.life = 0;
    if (p.x < 0 || p.x > WORLD.w || p.y < 0 || p.y > WORLD.h) p.life = 0;
  }
  m.projectiles = m.projectiles.filter((p) => p.life > 0);
}

function separate(m, dt) {
  // Cheap separation so heroes and minions do not stack on one point.
  const units = [...m.heroes.filter((h) => h.alive), ...m.minions.filter((x) => x.alive)];
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i]; const b = units[j];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = a.kind === 'hero' || b.kind === 'hero' ? 34 : 26;
      if (d2 > 0.01 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / 2) * 0.5;
        const nx = dx / d; const ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

export function updateMatch(m, dt, input = {}) {
  if (m.winner) {
    // Keep particles and announcements animating on the end screen.
    for (const p of m.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    m.particles = m.particles.filter((p) => p.t < p.life);
    return;
  }
  m.time += dt;
  if (m.shake > 0) m.shake = Math.max(0, m.shake - dt);

  // Waves.
  m.waveTimer -= dt;
  if (m.waveTimer <= 0) { spawnWave(m); m.waveTimer = 20; }

  // Jungle respawns.
  for (let i = 0; i < m.campTimers.length; i++) {
    if (m.campTimers[i] > 0) {
      m.campTimers[i] -= dt;
      if (m.campTimers[i] <= 0) {
        m.monsters.push(makeMonster(i, CAMPS[i].x, CAMPS[i].y, 'brute'));
        m.monsters.push(makeMonster(i, CAMPS[i].x, CAMPS[i].y, 'small'));
        m.monsters.push(makeMonster(i, CAMPS[i].x, CAMPS[i].y, 'small'));
      }
    }
  }

  // Sudden death at 30:00.
  if (m.time >= MATCH_END_TIME) {
    const total = m.turrets.filter((t) => t.team === 'B').length; // 10 per team
    const ta = turretsLeft(m, 'B'); // turrets A destroyed
    const tb = turretsLeft(m, 'A');
    const da = total - ta; const db = total - tb;
    if (da !== db) m.winner = da > db ? 'A' : 'B';
    else if (m.kills.A !== m.kills.B) m.winner = m.kills.A > m.kills.B ? 'A' : 'B';
    else {
      const ga = m.heroes.filter((h) => h.team === 'A').reduce((s, h) => s + h.gold, 0);
      const gb = m.heroes.filter((h) => h.team === 'B').reduce((s, h) => s + h.gold, 0);
      m.winner = ga >= gb ? 'A' : 'B';
    }
    m.endReason = 'Sudden death — time expired';
    return;
  }
  if (m.time >= 1500 && !m.warnedLate) {
    m.warnedLate = true;
    announce(m, 'FINAL 5 MINUTES', 'Sudden death decides the match at 30:00', '#ff5d8f');
  }

  for (const h of m.heroes) updateHero(m, h, dt, h.isPlayer ? input : {});
  m.minions = m.minions.filter((x) => x.alive);
  for (const mn of m.minions) updateMinion(m, mn, dt);
  m.monsters = m.monsters.filter((x) => x.alive);
  for (const mo of m.monsters) updateMonster(m, mo, dt);
  for (const t of m.turrets) updateTurret(m, t, dt);
  updateProjectiles(m, dt);
  separate(m, dt);

  // Particles / damage numbers / announcements / effects age.
  for (const p of m.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; }
  m.particles = m.particles.filter((p) => p.t < p.life);
  for (const d of m.dmgNums) { d.t += dt; d.y -= 34 * dt; }
  m.dmgNums = m.dmgNums.filter((d) => d.t < 0.9);
  for (const a of m.announcements) a.t += dt;
  m.announcements = m.announcements.filter((a) => a.t < 3.2);
  for (const f of m.fx) f.t += dt;
  m.fx = m.fx.filter((f) => f.t < f.life);

  // Camera follows the player, clamped so the view never leaves the world
  // (otherwise the screen shows empty void at the map edges).
  const p = m.player;
  if (p) {
    m.camera.x += (p.x - m.camera.x) * Math.min(1, dt * 5);
    m.camera.y += (p.y - m.camera.y) * Math.min(1, dt * 5);
  }
  m.camera.x = clamp(m.camera.x, 640, WORLD.w - 640);
  m.camera.y = clamp(m.camera.y, 360, WORLD.h - 360);
}

// Test/shot helpers: fast-forward a match without rendering.
export function simulate(m, seconds, step = 0.1) {
  const n = Math.ceil(seconds / step);
  for (let i = 0; i < n && !m.winner; i++) updateMatch(m, step, { auto: true });
}
