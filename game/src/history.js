// Match history: the last 20 ranked matches, newest first, persisted in
// localStorage. Each entry keeps the result, the player's hero and KDA,
// duration, date, points delta, and a full per-player breakdown for the
// detail view.
const STORAGE_KEY = 'slayer-history-v1';
export const MAX_HISTORY = 20;

export function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && typeof e.id === 'string' && Array.isArray(e.players));
  } catch {
    return [];
  }
}

export function saveHistory(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch {
    // Ignore storage failures.
  }
}

export function recordMatch(list, entry) {
  const next = [entry, ...list].slice(0, MAX_HISTORY);
  saveHistory(next);
  return next;
}

// Sample rows used ONLY to stage the history screenshot (in-memory, never
// saved): the shot needs a populated table to show the layout.
export function sampleHistory() {
  const now = Date.now();
  const mkPlayers = (heroA, heroB) => [
    { name: 'You', heroId: heroA, role: 'Marksman', team: 'A', kills: 12, deaths: 3, assists: 8, level: 14, gold: 9800, damage: 32400 },
    { name: 'Bastion', heroId: 'bastion', role: 'Tank', team: 'A', kills: 2, deaths: 5, assists: 14, level: 12, gold: 7200, damage: 8100 },
    { name: 'Kael', heroId: 'kael', role: 'Fighter', team: 'A', kills: 9, deaths: 6, assists: 7, level: 13, gold: 8900, damage: 24300 },
    { name: 'Aria', heroId: 'aria', role: 'Mage', team: 'A', kills: 8, deaths: 4, assists: 11, level: 13, gold: 8600, damage: 28700 },
    { name: 'Nyx', heroId: 'nyx', role: 'Assassin', team: 'A', kills: 7, deaths: 7, assists: 5, level: 12, gold: 8100, damage: 19800 },
    { name: 'Lyra', heroId: heroB, role: 'Marksman', team: 'B', kills: 10, deaths: 6, assists: 4, level: 13, gold: 9100, damage: 27600 },
    { name: 'Grond', heroId: 'grond', role: 'Tank', team: 'B', kills: 1, deaths: 8, assists: 9, level: 11, gold: 6400, damage: 5900 },
    { name: 'Ragnar', heroId: 'ragnar', role: 'Fighter', team: 'B', kills: 6, deaths: 9, assists: 6, level: 12, gold: 7800, damage: 18900 },
    { name: 'Sol', heroId: 'sol', role: 'Mage', team: 'B', kills: 5, deaths: 8, assists: 7, level: 12, gold: 7600, damage: 21400 },
    { name: 'Zero', heroId: 'zero', role: 'Assassin', team: 'B', kills: 8, deaths: 7, assists: 3, level: 12, gold: 8300, damage: 22100 },
  ];
  return [
    {
      id: 'sample-1', ts: now - 2 * 3600 * 1000, result: 'WIN',
      heroId: 'lyra', heroName: 'Lyra', role: 'Marksman',
      kills: 12, deaths: 3, assists: 8, duration: 1084,
      pointsDelta: 30, tierAfter: 'Elite', scoreA: 38, scoreB: 30,
      items: ['dagger', 'blade', 'swiftboots', 'axe'],
      gold: 9800, damage: 32400, level: 14, players: mkPlayers('lyra', 'bolt'),
    },
    {
      id: 'sample-2', ts: now - 26 * 3600 * 1000, result: 'LOSE',
      heroId: 'kael', heroName: 'Kael', role: 'Fighter',
      kills: 7, deaths: 9, assists: 6, duration: 1420,
      pointsDelta: -20, tierAfter: 'Warrior', scoreA: 24, scoreB: 33,
      items: ['dagger', 'vest', 'ironboots'],
      gold: 8100, damage: 19800, level: 12, players: mkPlayers('kael', 'talon'),
    },
    {
      id: 'sample-3', ts: now - 50 * 3600 * 1000, result: 'WIN',
      heroId: 'aria', heroName: 'Aria', role: 'Mage',
      kills: 9, deaths: 4, assists: 12, duration: 967,
      pointsDelta: 30, tierAfter: 'Warrior', scoreA: 31, scoreB: 22,
      items: ['wand', 'staff', 'swiftboots'],
      gold: 8700, damage: 30100, level: 13, players: mkPlayers('aria', 'juno'),
    },
  ];
}
