// Drafting phase: bans then picks, ranked style.
//   Bans: A, B, A, B (2 per team, alternating)
//   Picks: A, B, A, B, ... (5 per team, alternating)
// A banned or picked hero is unavailable to BOTH teams — no duplicates anywhere.
// The player is Team A, slot 0: they make Team A's bans and their own pick.
// Every other step is a bot with a short think delay. A step timer (20s)
// auto-resolves a step so the draft can never stall.
import { BAN_PRIORITY, HEROES, HERO_BY_ID, ROLES } from './heroes.js';
import { pick as rngPick, shuffle } from './util.js';

export function buildSteps() {
  const steps = [];
  steps.push({ type: 'ban', team: 'A' });
  steps.push({ type: 'ban', team: 'B' });
  steps.push({ type: 'ban', team: 'A' });
  steps.push({ type: 'ban', team: 'B' });
  for (let i = 0; i < 10; i++) {
    steps.push({ type: 'pick', team: i % 2 === 0 ? 'A' : 'B' });
  }
  return steps;
}

export function createDraft(rng, opts = {}) {
  return {
    rng,
    steps: buildSteps(),
    stepIndex: 0,
    bans: { A: [], B: [] },
    picks: { A: [], B: [] },
    selectedId: null,
    roleFilter: 'All',
    timer: opts.timerSec ?? 20,
    timerSec: opts.timerSec ?? 20,
    botDelay: 0, // seconds until the current bot step resolves
    done: false,
    auto: !!opts.auto, // bots play the player's steps too (smoke test)
    log: [],
  };
}

export function currentStep(d) {
  return d.steps[d.stepIndex] || null;
}

export function isPlayerStep(d) {
  if (d.auto) return false;
  const s = currentStep(d);
  if (!s) return false;
  if (s.type === 'ban') return s.team === 'A';
  // pick: the player is Team A slot 0, i.e. the first A pick.
  return s.team === 'A' && d.picks.A.length === 0;
}

export function unavailableIds(d) {
  return new Set([...d.bans.A, ...d.bans.B, ...d.picks.A, ...d.picks.B]);
}

export function availableHeroes(d) {
  const used = unavailableIds(d);
  return HEROES.filter((h) => !used.has(h.id));
}

function teamNeedsRole(d, team) {
  const have = new Set(d.picks[team].map((id) => HERO_BY_ID[id].role));
  return ROLES.filter((r) => !have.has(r));
}

function botBan(d) {
  const avail = availableHeroes(d);
  const preferred = BAN_PRIORITY.filter((id) => avail.some((h) => h.id === id));
  return preferred.length ? rngPick(d.rng, preferred.slice(0, 4)) : rngPick(d.rng, avail).id;
}

function botPick(d, team) {
  const avail = availableHeroes(d);
  const needed = teamNeedsRole(d, team);
  const fitting = avail.filter((h) => needed.includes(h.role));
  const pool = fitting.length ? fitting : avail;
  return rngPick(d.rng, pool).id;
}

function resolveStep(d, heroId) {
  const s = currentStep(d);
  if (!s) return;
  if (s.type === 'ban') {
    d.bans[s.team].push(heroId);
    d.log.push({ type: 'ban', team: s.team, heroId });
  } else {
    d.picks[s.team].push(heroId);
    d.log.push({ type: 'pick', team: s.team, heroId });
  }
  d.selectedId = null;
  d.stepIndex++;
  d.timer = d.timerSec;
  d.botDelay = 0;
  if (d.stepIndex >= d.steps.length) d.done = true;
}

export function selectHero(d, heroId) {
  if (!isPlayerStep(d)) return;
  if (unavailableIds(d).has(heroId)) return;
  d.selectedId = heroId;
}

export function lockHero(d) {
  if (!isPlayerStep(d)) return false;
  if (!d.selectedId) return false;
  resolveStep(d, d.selectedId);
  return true;
}

// Advance timers and bot steps. Returns an event string for sounds/announcements.
export function updateDraft(d, dt) {
  if (d.done) return null;
  const s = currentStep(d);
  d.timer -= dt;
  if (d.timer <= 0) {
    // Timeout: auto-resolve with a random available hero.
    const avail = availableHeroes(d);
    const heroId = rngPick(d.rng, avail).id;
    resolveStep(d, heroId);
    return s.type;
  }
  if (isPlayerStep(d)) return null;
  // Bot step: think briefly, then act.
  if (d.botDelay === 0) d.botDelay = 0.9 + d.rng() * 0.9;
  d.botDelay -= dt;
  if (d.botDelay <= 0) {
    const heroId = s.type === 'ban' ? botBan(d) : botPick(d, s.team);
    resolveStep(d, heroId);
    return s.type;
  }
  return null;
}

// Deterministic draft setups for screenshots / tests.
export function draftAtPickStep(rng) {
  const d = createDraft(rng, { timerSec: 20 });
  // Run the 4 bans + 3 picks instantly so the grid shows a mid-pick state.
  while (d.stepIndex < 7 && !d.done) {
    const s = currentStep(d);
    const heroId = s.type === 'ban' ? botBan(d) : botPick(d, s.team);
    resolveStep(d, heroId);
  }
  d.timer = 14;
  return d;
}

export function draftComplete(rng, playerHeroId = 'lyra') {
  const d = createDraft(rng, { timerSec: 20 });
  const savedAuto = d.auto;
  d.auto = true;
  // Force the player's pick to the requested hero on the first A pick.
  while (!d.done) {
    const s = currentStep(d);
    if (s.type === 'pick' && s.team === 'A' && d.picks.A.length === 0) {
      resolveStep(d, playerHeroId);
    } else {
      const heroId = s.type === 'ban' ? botBan(d) : botPick(d, s.team);
      resolveStep(d, heroId);
    }
  }
  d.auto = savedAuto;
  return d;
}
