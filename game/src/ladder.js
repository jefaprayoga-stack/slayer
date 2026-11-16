// Ranked ladder: MLBB-style tiers, a leaderboard of named bot players plus
// the player, and persistence in localStorage. Match results move the
// player's points, wins/losses and tier.
export const TIERS = [
  { name: 'Warrior', min: 0, color: '#a1887f', icon: 'shield' },
  { name: 'Elite', min: 100, color: '#90a4ae', icon: 'shield' },
  { name: 'Master', min: 250, color: '#ffd54f', icon: 'shield' },
  { name: 'Grandmaster', min: 450, color: '#ba68c8', icon: 'gem' },
  { name: 'Epic', min: 700, color: '#4fc3f7', icon: 'gem' },
  { name: 'Legend', min: 1000, color: '#ff8a65', icon: 'crown' },
  { name: 'Mythic', min: 1400, color: '#ef5350', icon: 'crown' },
];

export function tierFor(points) {
  let tier = TIERS[0];
  for (const t of TIERS) if (points >= t.min) tier = t;
  return tier;
}

export function nextTier(points) {
  const idx = TIERS.indexOf(tierFor(points));
  return idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

// Progress (0..1) toward the next tier; 1 at Mythic.
export function tierProgress(points) {
  const cur = tierFor(points);
  const nxt = nextTier(points);
  if (!nxt) return 1;
  return Math.min(1, (points - cur.min) / (nxt.min - cur.min));
}

// Named bot rivals with varied tiers and records (deterministic).
const BOTS = [
  { name: 'ShadowReaper', points: 1520, wins: 214, losses: 96 },
  { name: 'xXDragonXx', points: 1380, wins: 187, losses: 101 },
  { name: 'LunaStrike', points: 1210, wins: 165, losses: 88 },
  { name: 'IronFist99', points: 1090, wins: 142, losses: 97 },
  { name: 'NightOwl', points: 960, wins: 131, losses: 104 },
  { name: 'BlazeQueen', points: 845, wins: 118, losses: 92 },
  { name: 'TurboTurtle', points: 760, wins: 104, losses: 89 },
  { name: 'PixelKnight', points: 640, wins: 91, losses: 83 },
  { name: 'StormCaller', points: 555, wins: 79, losses: 74 },
  { name: 'GhostBlade', points: 470, wins: 66, losses: 63 },
  { name: 'MangoTango', points: 380, wins: 55, losses: 58 },
  { name: 'SilentWolf', points: 310, wins: 44, losses: 49 },
  { name: 'RocketRaccoon', points: 240, wins: 36, losses: 44 },
  { name: 'NoobSlayer', points: 150, wins: 24, losses: 38 },
  { name: 'CasualCat', points: 60, wins: 12, losses: 31 },
];

const STORAGE_KEY = 'slayer-ladder-v1';

export function loadLadder() {
  let player = { name: 'You', points: 0, wins: 0, losses: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (typeof saved.points === 'number') {
        player = {
          name: 'You',
          points: Math.max(0, Math.floor(saved.points)),
          wins: Math.max(0, Math.floor(saved.wins || 0)),
          losses: Math.max(0, Math.floor(saved.losses || 0)),
        };
      }
    }
  } catch {
    // Storage unavailable (sandboxed iframe): play with a fresh ladder.
  }
  return { player, bots: BOTS.map((b) => ({ ...b })) };
}

export function saveLadder(ladder) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      points: ladder.player.points,
      wins: ladder.player.wins,
      losses: ladder.player.losses,
    }));
  } catch {
    // Ignore storage failures.
  }
}

// Apply a ranked result. Win: +30 points; loss: -20 (floor 0). Returns the
// delta and tier change for the end screen / tests.
export function applyMatchResult(ladder, won) {
  const before = tierFor(ladder.player.points);
  const delta = won ? 30 : -20;
  ladder.player.points = Math.max(0, ladder.player.points + delta);
  if (won) ladder.player.wins++;
  else ladder.player.losses++;
  saveLadder(ladder);
  const after = tierFor(ladder.player.points);
  return { delta, tierBefore: before.name, tierAfter: after.name, promoted: after.min > before.min, demoted: after.min < before.min };
}

// Full table, best first, with 1-based ranks.
export function rankedTable(ladder) {
  const rows = [
    ...ladder.bots.map((b) => ({ ...b, you: false })),
    { ...ladder.player, you: true },
  ];
  rows.sort((a, b) => b.points - a.points || b.wins - a.wins);
  return rows.map((r, i) => ({ ...r, rank: i + 1, tier: tierFor(r.points) }));
}

export function playerRank(ladder) {
  return rankedTable(ladder).find((r) => r.you).rank;
}
