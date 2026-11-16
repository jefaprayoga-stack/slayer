# Slayer

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/jefaprayoga-stack/slayer/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/jefaprayoga-stack/slayer/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Slayer** — a 5v5 ranked arena battler in vanilla JavaScript and canvas 2D: no libraries, no build step, no network — every sound is synthesised live with WebAudio.

- **20 heroes, 5 roles × 4** — Tank, Fighter, Assassin, Marksman, Mage. Humans, beasts and robots, each with a passive, two actives and an ultimate
- **Ranked draft** — straight from Play into a ban phase (2 bans per team) and an alternating pick phase. Banned and picked heroes are gone for both teams: no duplicates anywhere
- **Three lanes + jungle** — Gold, Mid and EXP lanes, neutral monster camps that pay gold and bonus EXP, and a river crossing at the map centre
- **MLBB-style progression** — skills unlock by level (Lv 1 / Lv 3 / Lv 4 ultimate) and upgrade with skill points earned per level
- **Win by breaking the base** — 10 turrets per team: 3 per lane (outer → second → inner, destroyed in order, shielded until their turn) plus a base turret that opens only after an inner turret falls. Destroy the enemy base turret to win
- **Super minions** — destroying an inner turret upgrades your minions in that lane only (HP +60%, damage +50%, bigger, gold-armoured, glowing). Outer and second turrets don't trigger them
- **Turret targeting** — every turret shoots the nearest enemy minion inside its range circle first, and only fires on a hero when no minion is in range; hero shots hurt 1.8×. Range circles show on the map, brighter while firing or when you approach
- **Full match economy** — gold from minions, monsters, heroes and turrets, plus a full MLBB-style shop: 33 items in 5 categories (Attack, Magic, Defense, Movement, Jungle) with tier/build paths, real stat effects, 6 item slots and 50% sell-back — and 5 synergy sets (Trinity attack speed, Critical Edge, Bulwark defense, Arcane mage, Blood Pact sustain) whose bonuses activate when all 3 set items are worn
- **Respawn that scales with the game** — 8s + 1s per level + 2s per minute of match time (cap 60s), with a big centre countdown, disabled skill buttons while dead, and live respawn timers for every dead hero under the score bar. Revive at base with full HP/mana; gold and items are kept
- **Walls and bushes** — stone walls at jungle chokepoints, lane dividers and the centre crossing block movement and force real pathing around them; elongated tall-grass bushes (MLBB-style) hide heroes from the enemy team (revealed by attacking, casting, or an enemy entering the bush). Bots ambush from bushes
- **A living map** — wild grass tufts, flowers, pebbles, lane cracks and footprints, puddles, jungle mushrooms, fallen leaves, river ripples and stones, all painted into the terrain
- **Kill announcements** — DOUBLE KILL → TRIPLE KILL → MANIAC → SAVAGE multi-kills, KILLING SPREE → UNSTOPPABLE → GODLIKE → LEGENDARY streaks, and SHUTDOWN bonuses for ending a streak, each with its own banner colour, glow and sound
- **Ranked ladder** — MLBB tiers (Warrior → Mythic), a 16-player leaderboard, and points that move with every ranked result (+30 win / −20 loss), saved in localStorage
- **Match history** — the last 20 ranked matches with result, hero, KDA, duration, date and points delta, plus a per-match detail view (both teams' KDA, items, gold and damage)
- **Music + sound, all procedural** — a calm menu theme, a driving battle track, and SFX for clicks, bans/picks, kills, streaks, level-ups, gold, shopping, turrets, death and respawn. M mute (or the speaker button) silences music and SFX
- **9 bots** with role-based AI — laning, jungling, retreating, defending, pushing and bush ambushes

## Controls

- Click the ground to move, click an enemy to attack
- **Q / W / E** (or **1 / 2 / 3**) cast skills at the mouse; click the skill buttons to cast at the nearest enemy
- Click **+** on a skill to spend a skill point
- **B** shop · **P** / **Esc** pause · **M** mute

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Or serve `game/` with any static file server and open `game/index.html`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=kfgdsck0&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
