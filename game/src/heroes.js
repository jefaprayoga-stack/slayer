// The 20-hero roster: 5 roles x 4 heroes. Fantasy forms mix humans, beasts
// and robots. Skills are data: the match engine interprets `type`.
//   bolt   — projectile toward a point, damage on first hit
//   aoe    — instant damage in a circle at a point (+ slow/stun when set)
//   dash   — rush toward a point, damaging enemies passed
//   blink  — teleport to a point
//   volley — a fan of projectiles toward a point
//   nova   — radial projectiles around the caster
//   heal   — restore HP (self, or the lowest ally in range when ally=true)
//   shield — absorb shield on self (or nearby allies when ally=true)
//   buff   — temporary attack-speed / damage / move-speed surge
//   execute— huge damage, doubled against targets under 35% HP
//   drain  — damage in a cone that heals the caster for part of it

export const ROLES = ['Tank', 'Fighter', 'Assassin', 'Marksman', 'Mage'];

export const ROLE_COLOR = {
  Tank: '#f5a623',
  Fighter: '#e5484d',
  Assassin: '#9b5de5',
  Marksman: '#2ec4b6',
  Mage: '#3a86ff',
};

export const ROLE_BLURB = {
  Tank: 'Frontline wall. Soaks damage and locks enemies down.',
  Fighter: 'Bruiser. Sustained melee damage with built-in sustain.',
  Assassin: 'Burst killer. Slips in, deletes a target, slips out.',
  Marksman: 'Ranged carry. Fragile early, shreds late.',
  Mage: 'Spell artillery. Area damage and control from range.',
};

// Items: a serious MLBB-style shop. Categories: Attack, Magic, Defense,
// Movement, Jungle. Tier 2/3 items build from components: owning a component
// cuts its price from the upgrade (the component is consumed).
// Stats: dmg, power, hp, armor, mres, ms, as, crit, lifesteal, cdr, jungle.
export const ITEM_CATEGORIES = ['Attack', 'Magic', 'Defense', 'Movement', 'Jungle'];

export const ITEMS = [
  // Attack
  { id: 'dagger', name: 'Iron Dagger', cat: 'Attack', tier: 1, price: 250, icon: 'dagger', desc: '+12 attack damage', dmg: 12 },
  { id: 'blade', name: 'War Blade', cat: 'Attack', tier: 2, price: 550, icon: 'blade', desc: '+25 attack damage', dmg: 25, buildsFrom: ['dagger'] },
  { id: 'critdagger', name: 'Crit Dagger', cat: 'Attack', tier: 2, price: 800, icon: 'crit', desc: '+20% crit chance', crit: 0.2, set: 'critical' },
  { id: 'swiftbow', name: 'Swift Bow', cat: 'Attack', tier: 2, price: 900, icon: 'bow', desc: '+20% attack speed, +15 damage', as: 0.2, dmg: 15 },
  { id: 'fang', name: 'Lifesteal Fang', cat: 'Attack', tier: 2, price: 950, icon: 'fang', desc: '+12% lifesteal, +15 damage', lifesteal: 0.12, dmg: 15 },
  { id: 'axe', name: 'Berserker Axe', cat: 'Attack', tier: 3, price: 1200, icon: 'axe', desc: '+45 attack, +15% crit', dmg: 45, crit: 0.15, buildsFrom: ['blade'] },
  { id: 'slayer', name: 'Demon Slayer', cat: 'Attack', tier: 3, price: 1800, icon: 'slayer', desc: '+60 attack, +20% lifesteal', dmg: 60, lifesteal: 0.2, buildsFrom: ['fang', 'blade'] },
  { id: 'demonhunter', name: 'Demon Hunter', cat: 'Attack', tier: 2, price: 950, icon: 'demonblade', desc: '+20% attack speed, +10 damage', as: 0.2, dmg: 10, set: 'trinity' },
  { id: 'goldenstaff', name: 'Golden Staff', cat: 'Attack', tier: 3, price: 1250, icon: 'goldstaff', desc: '+25% attack speed, +15 damage', as: 0.25, dmg: 15, set: 'trinity' },
  { id: 'corrosionscythe', name: 'Corrosion Scythe', cat: 'Attack', tier: 2, price: 1100, icon: 'scythe', desc: '+15% attack speed, +20 damage, hits slow enemies 25%', as: 0.15, dmg: 20, slowOnHit: 0.25, set: 'trinity' },
  { id: 'phantomedge', name: 'Phantom Edge', cat: 'Attack', tier: 2, price: 1300, icon: 'phantom', desc: '+25% crit chance, +20 damage', crit: 0.25, dmg: 20, set: 'critical' },
  { id: 'executioner', name: 'Executioner', cat: 'Attack', tier: 3, price: 1600, icon: 'executioner', desc: '+20% crit chance, +35 damage', crit: 0.2, dmg: 35, set: 'critical' },
  { id: 'bloodchalice', name: 'Blood Chalice', cat: 'Attack', tier: 2, price: 1000, icon: 'chalice', desc: '+10% lifesteal, +150 HP', lifesteal: 0.1, hp: 150, set: 'sustain' },
  { id: 'vampiricblade', name: 'Vampiric Blade', cat: 'Attack', tier: 2, price: 1200, icon: 'vampblade', desc: '+12% lifesteal, +25 damage', lifesteal: 0.12, dmg: 25, set: 'sustain' },
  // Magic
  { id: 'wand', name: 'Apprentice Wand', cat: 'Magic', tier: 1, price: 300, icon: 'wand', desc: '+18 magic power', power: 18 },
  { id: 'staff', name: 'Arcane Staff', cat: 'Magic', tier: 2, price: 550, icon: 'staff', desc: '+30 magic power', power: 30, buildsFrom: ['wand'], set: 'mage' },
  { id: 'frostorb', name: 'Frost Orb', cat: 'Magic', tier: 2, price: 800, icon: 'orb', desc: '+35 magic power, +150 HP', power: 35, hp: 150, set: 'mage' },
  { id: 'sagestone', name: 'Sage Stone', cat: 'Magic', tier: 2, price: 850, icon: 'tome', desc: '+30 magic power, +15% cooldown reduction', power: 30, cdr: 0.15, set: 'mage' },
  { id: 'voidtome', name: 'Void Tome', cat: 'Magic', tier: 3, price: 1600, icon: 'void', desc: '+80 magic power, +15% cooldown reduction', power: 80, cdr: 0.15, buildsFrom: ['staff', 'sagestone'] },
  { id: 'manacodex', name: 'Mana Codex', cat: 'Magic', tier: 2, price: 700, icon: 'codex', desc: '+15 magic power, +300 max mana', power: 15, mana: 300 },
  // Defense
  { id: 'vest', name: 'Leather Vest', cat: 'Defense', tier: 1, price: 280, icon: 'vest', desc: '+12 armor', armor: 12 },
  { id: 'plate', name: 'Vitality Plate', cat: 'Defense', tier: 2, price: 600, icon: 'plate', desc: '+400 max HP', hp: 400, set: 'defense' },
  { id: 'cloak', name: 'Magic Cloak', cat: 'Defense', tier: 2, price: 850, icon: 'cloak', desc: '+25 magic resist, +200 HP', mres: 25, hp: 200, set: 'defense' },
  { id: 'guardshield', name: 'Guardian Shield', cat: 'Defense', tier: 2, price: 900, icon: 'shield', desc: '+25 armor, +200 HP', armor: 25, hp: 200, buildsFrom: ['vest'], set: 'defense' },
  { id: 'aegis', name: 'Immortal Aegis', cat: 'Defense', tier: 3, price: 1700, icon: 'aegis', desc: '+600 HP, +20 armor, +20 magic resist', hp: 600, armor: 20, mres: 20, buildsFrom: ['guardshield', 'cloak'] },
  { id: 'bulwarkhelm', name: 'Bulwark Helm', cat: 'Defense', tier: 2, price: 1000, icon: 'helm', desc: '+20 magic resist, +300 HP', mres: 20, hp: 300 },
  { id: 'bloodmail', name: 'Bloodmail Armor', cat: 'Defense', tier: 2, price: 1300, icon: 'bloodmail', desc: '+8% lifesteal, +250 HP, +10 armor', lifesteal: 0.08, hp: 250, armor: 10, set: 'sustain' },
  // Movement
  { id: 'swiftboots', name: 'Swift Boots', cat: 'Movement', tier: 1, price: 300, icon: 'boots', desc: '+12% move speed', ms: 0.12 },
  { id: 'ironboots', name: 'Iron Boots', cat: 'Movement', tier: 2, price: 700, icon: 'boots2', desc: '+15% move speed, +8 armor', ms: 0.15, armor: 8, buildsFrom: ['swiftboots'] },
  { id: 'windboots', name: 'Windrunner Boots', cat: 'Movement', tier: 2, price: 1000, icon: 'boots3', desc: '+20% move speed, +10% attack speed', ms: 0.2, as: 0.1, buildsFrom: ['swiftboots'] },
  // Jungle
  { id: 'hunterknife', name: "Hunter's Knife", cat: 'Jungle', tier: 1, price: 250, icon: 'knife', desc: '+20% damage to jungle monsters', jungle: 0.2 },
  { id: 'beasttamer', name: 'Beast Tamer', cat: 'Jungle', tier: 2, price: 700, icon: 'tamer', desc: '+35% damage to monsters, +100 HP', jungle: 0.35, hp: 100, buildsFrom: ['hunterknife'] },
  { id: 'beastfang', name: 'Beast Fang', cat: 'Jungle', tier: 2, price: 600, icon: 'beastfang', desc: '+30% damage to monsters, +150 HP', jungle: 0.3, hp: 150, buildsFrom: ['hunterknife'] },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// Synergy sets: wear ALL items of a set and the set bonus activates (real
// stat effects, applied in heroStats / dealDamage). Set items are standalone
// purchases — no set member builds from another member, so all three can be
// worn at once. (Upgrading a set member into a tier-3 item that consumes it,
// e.g. staff -> Void Tome, breaks the set: a real build choice.)
export const SETS = [
  { id: 'trinity', name: 'Trinity', color: '#ffd60a', items: ['demonhunter', 'goldenstaff', 'corrosionscythe'], bonusDesc: '+25% attack speed, +20 damage', bonus: { as: 0.25, dmg: 20 } },
  { id: 'critical', name: 'Critical Edge', color: '#ff5252', items: ['critdagger', 'phantomedge', 'executioner'], bonusDesc: 'Crits deal +50% damage (2.25x instead of 1.75x)', bonus: { critDmg: 0.5 } },
  { id: 'defense', name: 'Bulwark', color: '#4fc3f7', items: ['plate', 'cloak', 'guardshield'], bonusDesc: 'Take 15% less damage from all sources', bonus: { dmgReduction: 0.15 } },
  { id: 'mage', name: 'Arcane', color: '#ce93d8', items: ['staff', 'frostorb', 'sagestone'], bonusDesc: '12% spell vamp — magic damage heals you', bonus: { spellVamp: 0.12 } },
  { id: 'sustain', name: 'Blood Pact', color: '#69f0ae', items: ['bloodchalice', 'vampiricblade', 'bloodmail'], bonusDesc: '+10% lifesteal, +3 HP/s regeneration', bonus: { lifesteal: 0.1, regen: 3 } },
];

export const SET_BY_ID = Object.fromEntries(SETS.map((s) => [s.id, s]));

// Progress of every set for a list of owned item ids.
export function setProgress(ownedIds) {
  return SETS.map((s) => ({
    ...s,
    owned: s.items.filter((id) => ownedIds.includes(id)).length,
    total: s.items.length,
    complete: s.items.every((id) => ownedIds.includes(id)),
    missing: s.items.filter((id) => !ownedIds.includes(id)),
  }));
}

export function activeSets(ownedIds) {
  return setProgress(ownedIds).filter((s) => s.complete);
}

// Visual identity per hero: weapon + feature + trim colour + effect theme +
// basic-attack style. The renderer draws a distinct figure from form + role +
// weapon + feature, and themed attack/skill effects, so all 20 heroes read
// differently at a glance — no shared circle template.
export const LOOKS = {
  bastion: { weapon: 'hammer', feature: 'antenna', trim: '#ffd60a', theme: 'tech', attack: 'smash' },
  grond: { weapon: 'claws', feature: 'ears', trim: '#d4a373', theme: 'nature', attack: 'claw' },
  seraphina: { weapon: 'sword', feature: 'halo', trim: '#e07a5f', theme: 'holy', attack: 'slash' },
  korr: { weapon: 'hammer', feature: 'horns', trim: '#90e0ef', theme: 'nature', attack: 'smash' },
  ragnar: { weapon: 'claws', feature: 'tail', trim: '#e74c3c', theme: 'nature', attack: 'claw' },
  vex9: { weapon: 'sword', feature: 'antenna', trim: '#ff5d8f', theme: 'tech', attack: 'slash' },
  kael: { weapon: 'sword', feature: 'cape', trim: '#f1c40f', theme: 'fire', attack: 'slash' },
  mira: { weapon: 'claws', feature: 'tail', trim: '#f9c74f', theme: 'fire', attack: 'claw' },
  nyx: { weapon: 'claws', feature: 'ears', trim: '#b5179e', theme: 'shadow', attack: 'claw' },
  zero: { weapon: 'daggers', feature: 'antenna', trim: '#00f5d4', theme: 'tech', attack: 'dagger' },
  sylas: { weapon: 'daggers', feature: 'hood', trim: '#e0aaff', theme: 'shadow', attack: 'dagger' },
  vesper: { weapon: 'orb', feature: 'wings', trim: '#ff9e00', theme: 'void', attack: 'bolt' },
  lyra: { weapon: 'bow', feature: 'cape', trim: '#f7f7ff', theme: 'nature', attack: 'arrow' },
  bolt: { weapon: 'gun', feature: 'antenna', trim: '#ffea00', theme: 'tech', attack: 'shell' },
  talon: { weapon: 'bow', feature: 'wings', trim: '#fefae0', theme: 'nature', attack: 'arrow' },
  juno: { weapon: 'gun', feature: 'cape', trim: '#e63946', theme: 'fire', attack: 'shell' },
  aria: { weapon: 'staff', feature: 'hood', trim: '#457b9d', theme: 'ice', attack: 'bolt' },
  pip: { weapon: 'orb', feature: 'wings', trim: '#80ed99', theme: 'arcane', attack: 'bolt' },
  sol: { weapon: 'staff', feature: 'halo', trim: '#ee964b', theme: 'holy', attack: 'bolt' },
  mochi: { weapon: 'orb', feature: 'ears', trim: '#ffd60a', theme: 'lightning', attack: 'bolt' },
};

export const THEME_COLOR = {
  tech: '#00f5d4',
  nature: '#80ed99',
  holy: '#ffd60a',
  fire: '#ff6b35',
  shadow: '#b5179e',
  void: '#7b2cbf',
  ice: '#90e0ef',
  arcane: '#e0aaff',
  lightning: '#ffea00',
  poison: '#70e000',
};

function hero(id, name, title, role, form, color, accent, stats, passive, skills) {
  return { id, name, title, role, form, color, accent, ...stats, passive, skills };
}

// Q unlocks at Lv 1, W at Lv 3, ultimate at Lv 4 (Mobile Legends style).
export const HEROES = [
  // ---- TANK ----
  hero('bastion', 'Bastion', 'the Iron Wall', 'Tank', 'robot', '#8d99ae', '#ffd60a',
    { hp: 980, hpPl: 100, dmg: 56, dmgPl: 6, range: 75, as: 0.8, ms: 104, armor: 28, mana: 220 },
    { name: 'Armor Plating', kind: 'armor', value: 12, desc: '+12 armor, always.' },
    [
      { key: 'q', name: 'Shield Bash', type: 'dash', damage: 90, dpl: 25, range: 260, radius: 90, cd: 7, mana: 40, unlock: 1, stun: 0.8, desc: 'Charge forward, stunning the first enemy hit.' },
      { key: 'w', name: 'Bulwark', type: 'shield', damage: 0, dpl: 0, range: 0, radius: 0, cd: 12, mana: 50, unlock: 3, shield: 220, desc: 'Raise a 220 HP shield for 4s.' },
      { key: 'e', name: 'Aegis Fortress', type: 'shield', damage: 0, dpl: 0, range: 0, radius: 320, cd: 50, mana: 90, unlock: 4, shield: 380, ally: true, desc: 'Shield yourself and nearby allies for 380 HP.' },
    ]),
  hero('grond', 'Grond', 'the Mountain Bear', 'Tank', 'animal', '#8b5e3c', '#d4a373',
    { hp: 950, hpPl: 98, dmg: 58, dmgPl: 6, range: 78, as: 0.82, ms: 105, armor: 24, mana: 200 },
    { name: 'Thick Hide', kind: 'regen', value: 9, desc: 'Regenerate 9 HP per second.' },
    [
      { key: 'q', name: 'Maul', type: 'aoe', damage: 100, dpl: 28, range: 150, radius: 130, cd: 6, mana: 35, unlock: 1, slow: 0.35, desc: 'Swipe the ground, damaging and slowing enemies.' },
      { key: 'w', name: 'Primal Roar', type: 'buff', damage: 0, dpl: 0, range: 0, radius: 340, cd: 14, mana: 55, unlock: 3, buffDmg: 0.2, desc: 'Roar: nearby allies deal +20% damage for 5s.' },
      { key: 'e', name: 'Avalanche Charge', type: 'dash', damage: 260, dpl: 80, range: 420, radius: 130, cd: 48, mana: 90, unlock: 4, stun: 1.1, desc: 'Charge far, knocking up and stunning all enemies hit.' },
    ]),
  hero('seraphina', 'Seraphina', 'the Dawn Knight', 'Tank', 'human', '#f4f1de', '#e07a5f',
    { hp: 900, hpPl: 92, dmg: 54, dmgPl: 6, range: 75, as: 0.85, ms: 106, armor: 22, mana: 260 },
    { name: 'Holy Ward', kind: 'healAura', value: 5, desc: 'Nearby allies regenerate 5 HP/s.' },
    [
      { key: 'q', name: 'Smite', type: 'bolt', damage: 110, dpl: 30, range: 420, radius: 0, cd: 6, mana: 40, unlock: 1, desc: 'Hurl holy light, damaging the first enemy hit.' },
      { key: 'w', name: 'Blessing', type: 'heal', damage: 150, dpl: 40, range: 380, radius: 0, cd: 11, mana: 60, unlock: 3, ally: true, desc: 'Heal the lowest nearby ally for 150 HP.' },
      { key: 'e', name: 'Divine Sanctuary', type: 'heal', damage: 320, dpl: 90, range: 0, radius: 380, cd: 55, mana: 100, unlock: 4, ally: true, desc: 'Heal all nearby allies for 320 HP.' },
    ]),
  hero('korr', 'Korr', 'the Stone Automaton', 'Tank', 'robot', '#6c757d', '#90e0ef',
    { hp: 1000, hpPl: 105, dmg: 58, dmgPl: 6, range: 78, as: 0.78, ms: 102, armor: 30, mana: 180 },
    { name: 'Stone Skin', kind: 'thorns', value: 12, desc: 'Attackers take 12 damage back.' },
    [
      { key: 'q', name: 'Rock Throw', type: 'bolt', damage: 120, dpl: 32, range: 460, radius: 0, cd: 7, mana: 40, unlock: 1, desc: 'Throw a boulder, damaging the first enemy hit.' },
      { key: 'w', name: 'Seismic Slam', type: 'aoe', damage: 130, dpl: 35, range: 200, radius: 190, cd: 11, mana: 55, unlock: 3, slow: 0.4, desc: 'Slam the ground, damaging and slowing a wide area.' },
      { key: 'e', name: 'Earthquake', type: 'aoe', damage: 280, dpl: 85, range: 320, radius: 280, cd: 52, mana: 95, unlock: 4, stun: 1.2, desc: 'Shatter the earth: huge area damage and stun.' },
    ]),

  // ---- FIGHTER ----
  hero('ragnar', 'Ragnar', 'the Blade Wolf', 'Fighter', 'animal', '#7f8c8d', '#e74c3c',
    { hp: 730, hpPl: 76, dmg: 70, dmgPl: 7, range: 78, as: 0.92, ms: 113, armor: 15, mana: 210 },
    { name: 'Bloodthirst', kind: 'lifesteal', value: 0.08, desc: 'Heal for 8% of damage dealt.' },
    [
      { key: 'q', name: 'Fang Slash', type: 'dash', damage: 120, dpl: 30, range: 300, radius: 80, cd: 6, mana: 35, unlock: 1, desc: 'Dash and slash, damaging enemies in the way.' },
      { key: 'w', name: 'War Howl', type: 'buff', damage: 0, dpl: 0, range: 0, radius: 0, cd: 13, mana: 50, unlock: 3, buffAs: 0.35, desc: '+35% attack speed for 5s.' },
      { key: 'e', name: 'Frenzy', type: 'buff', damage: 0, dpl: 0, range: 0, radius: 0, cd: 45, mana: 80, unlock: 4, buffDmg: 0.4, buffAs: 0.3, desc: '+40% damage and +30% attack speed for 7s.' },
    ]),
  hero('vex9', 'Vex-9', 'the Combat Droid', 'Fighter', 'robot', '#adb5bd', '#ff5d8f',
    { hp: 710, hpPl: 74, dmg: 72, dmgPl: 7, range: 75, as: 0.95, ms: 112, armor: 14, mana: 230 },
    { name: 'Overclock', kind: 'speedOnLow', value: 0.25, desc: '+25% attack speed below 40% HP.' },
    [
      { key: 'q', name: 'Plasma Blade', type: 'bolt', damage: 130, dpl: 32, range: 380, radius: 0, cd: 6, mana: 40, unlock: 1, desc: 'Fire a plasma slash in a line.' },
      { key: 'w', name: 'Rocket Dash', type: 'dash', damage: 110, dpl: 28, range: 380, radius: 90, cd: 9, mana: 45, unlock: 3, desc: 'Rocket forward, damaging enemies passed.' },
      { key: 'e', name: 'Overdrive', type: 'nova', damage: 240, dpl: 75, range: 0, radius: 300, cd: 46, mana: 85, unlock: 4, desc: 'Unleash a ring of plasma bolts all around.' },
    ]),
  hero('kael', 'Kael', 'the Crimson Duelist', 'Fighter', 'human', '#c0392b', '#f1c40f',
    { hp: 720, hpPl: 75, dmg: 71, dmgPl: 7, range: 78, as: 0.9, ms: 114, armor: 14, mana: 200 },
    { name: 'Riposte', kind: 'crit', value: 0.12, desc: '+12% critical strike chance.' },
    [
      { key: 'q', name: 'Lunge', type: 'dash', damage: 115, dpl: 30, range: 320, radius: 80, cd: 6, mana: 35, unlock: 1, desc: 'Lunge forward and stab for heavy damage.' },
      { key: 'w', name: 'Whirlwind', type: 'aoe', damage: 140, dpl: 35, range: 0, radius: 170, cd: 10, mana: 50, unlock: 3, desc: 'Spin, damaging all nearby enemies.' },
      { key: 'e', name: 'Blade Storm', type: 'aoe', damage: 300, dpl: 90, range: 0, radius: 240, cd: 48, mana: 90, unlock: 4, desc: 'A storm of blades around you: huge area damage.' },
    ]),
  hero('mira', 'Mira', 'the Ember Fox', 'Fighter', 'animal', '#e67e22', '#f9c74f',
    { hp: 700, hpPl: 72, dmg: 69, dmgPl: 7, range: 75, as: 0.93, ms: 115, armor: 12, mana: 220 },
    { name: 'Ember Trail', kind: 'slowOnHit', value: 0.15, desc: 'Attacks slow enemies by 15%.' },
    [
      { key: 'q', name: 'Flame Pounce', type: 'dash', damage: 125, dpl: 30, range: 340, radius: 90, cd: 6, mana: 40, unlock: 1, desc: 'Pounce in flames, burning enemies passed.' },
      { key: 'w', name: 'Fireball', type: 'bolt', damage: 140, dpl: 35, range: 460, radius: 0, cd: 8, mana: 45, unlock: 3, desc: 'Launch a fireball that explodes on impact.' },
      { key: 'e', name: 'Nine-Tail Blaze', type: 'volley', damage: 260, dpl: 80, range: 500, radius: 0, cd: 47, mana: 90, unlock: 4, desc: 'A fan of nine blazing tails toward your aim.' },
    ]),

  // ---- ASSASSIN ----
  hero('nyx', 'Nyx', 'the Shadow Panther', 'Assassin', 'animal', '#2d2a4a', '#b5179e',
    { hp: 590, hpPl: 62, dmg: 80, dmgPl: 8, range: 72, as: 1.0, ms: 119, armor: 8, mana: 200 },
    { name: 'Shadow Prowl', kind: 'speedOnLow', value: 0.2, desc: '+20% move speed after a kill for 5s.' },
    [
      { key: 'q', name: 'Shadow Strike', type: 'blink', damage: 130, dpl: 35, range: 380, radius: 110, cd: 7, mana: 45, unlock: 1, desc: 'Blink to a spot and slash nearby enemies.' },
      { key: 'w', name: 'Poison Claws', type: 'buff', damage: 0, dpl: 0, range: 0, radius: 0, cd: 12, mana: 50, unlock: 3, buffDmg: 0.3, desc: 'Claws drip venom: +30% damage for 5s.' },
      { key: 'e', name: 'Death Pounce', type: 'execute', damage: 320, dpl: 95, range: 460, radius: 0, cd: 44, mana: 90, unlock: 4, desc: 'Leap at a target for massive damage. Doubled under 35% HP.' },
    ]),
  hero('zero', 'Zero', 'the Ghost Protocol', 'Assassin', 'robot', '#343a40', '#00f5d4',
    { hp: 580, hpPl: 60, dmg: 82, dmgPl: 8, range: 72, as: 1.02, ms: 120, armor: 7, mana: 210 },
    { name: 'Phase Field', kind: 'dodge', value: 0.12, desc: '12% chance to dodge attacks.' },
    [
      { key: 'q', name: 'Shuriken', type: 'bolt', damage: 140, dpl: 35, range: 480, radius: 0, cd: 6, mana: 40, unlock: 1, desc: 'Throw a spinning energy shuriken.' },
      { key: 'w', name: 'Blink', type: 'blink', damage: 0, dpl: 0, range: 420, radius: 0, cd: 10, mana: 45, unlock: 3, desc: 'Teleport a short distance.' },
      { key: 'e', name: 'Assassinate', type: 'execute', damage: 360, dpl: 100, range: 520, radius: 0, cd: 42, mana: 95, unlock: 4, desc: 'Snipe a target for massive damage. Doubled under 35% HP.' },
    ]),
  hero('sylas', 'Sylas', 'the Night Rogue', 'Assassin', 'human', '#1b263b', '#e0aaff',
    { hp: 600, hpPl: 62, dmg: 79, dmgPl: 8, range: 72, as: 1.0, ms: 118, armor: 8, mana: 200 },
    { name: 'Backstab', kind: 'crit', value: 0.18, desc: '+18% critical strike chance.' },
    [
      { key: 'q', name: 'Dagger Throw', type: 'bolt', damage: 135, dpl: 34, range: 440, radius: 0, cd: 6, mana: 40, unlock: 1, slow: 0.3, desc: 'Throw a dagger that slows the enemy hit.' },
      { key: 'w', name: 'Smoke Bomb', type: 'buff', damage: 0, dpl: 0, range: 0, radius: 0, cd: 13, mana: 50, unlock: 3, buffMs: 0.35, desc: '+35% move speed for 4s and drop enemy focus.' },
      { key: 'e', name: 'Killing Blow', type: 'execute', damage: 330, dpl: 95, range: 300, radius: 0, cd: 43, mana: 90, unlock: 4, desc: 'A lethal strike. Doubled under 35% HP.' },
    ]),
  hero('vesper', 'Vesper', 'the Void Moth', 'Assassin', 'animal', '#3c096c', '#ff9e00',
    { hp: 570, hpPl: 58, dmg: 78, dmgPl: 8, range: 70, as: 1.03, ms: 119, armor: 6, mana: 230 },
    { name: 'Soul Drain', kind: 'lifesteal', value: 0.1, desc: 'Heal for 10% of damage dealt.' },
    [
      { key: 'q', name: 'Void Bolt', type: 'bolt', damage: 145, dpl: 36, range: 470, radius: 0, cd: 6, mana: 42, unlock: 1, desc: 'Fire a bolt of void energy.' },
      { key: 'w', name: 'Phase Step', type: 'blink', damage: 90, dpl: 22, range: 400, radius: 130, cd: 10, mana: 48, unlock: 3, desc: 'Teleport, damaging enemies at the arrival point.' },
      { key: 'e', name: 'Swarm', type: 'nova', damage: 280, dpl: 85, range: 0, radius: 320, cd: 45, mana: 92, unlock: 4, desc: 'Release a swarm of void moths in all directions.' },
    ]),

  // ---- MARKSMAN ----
  hero('lyra', 'Lyra', 'the Star Archer', 'Marksman', 'human', '#7bdff2', '#f7f7ff',
    { hp: 530, hpPl: 55, dmg: 64, dmgPl: 7, range: 320, as: 1.0, ms: 110, armor: 5, mana: 220 },
    { name: 'Longshot', kind: 'range', value: 30, desc: '+30 attack range.' },
    [
      { key: 'q', name: 'Piercing Arrow', type: 'bolt', damage: 130, dpl: 32, range: 560, radius: 0, cd: 6, mana: 40, unlock: 1, desc: 'An arrow that pierces through enemies.' },
      { key: 'w', name: 'Volley', type: 'volley', damage: 150, dpl: 38, range: 480, radius: 0, cd: 11, mana: 55, unlock: 3, desc: 'A fan of arrows toward your aim.' },
      { key: 'e', name: 'Starfall', type: 'aoe', damage: 320, dpl: 95, range: 520, radius: 240, cd: 50, mana: 95, unlock: 4, desc: 'Stars rain down on a wide area.' },
    ]),
  hero('bolt', 'Bolt', 'the Railgun Ranger', 'Marksman', 'robot', '#495057', '#ffea00',
    { hp: 540, hpPl: 56, dmg: 66, dmgPl: 7, range: 310, as: 0.95, ms: 109, armor: 6, mana: 230 },
    { name: 'Charge Shot', kind: 'crit', value: 0.1, desc: '+10% critical strike chance.' },
    [
      { key: 'q', name: 'Railgun Blast', type: 'bolt', damage: 150, dpl: 38, range: 580, radius: 0, cd: 7, mana: 45, unlock: 1, desc: 'A heavy railgun round, long range.' },
      { key: 'w', name: 'Shock Grenade', type: 'aoe', damage: 120, dpl: 30, range: 420, radius: 150, cd: 10, mana: 50, unlock: 3, slow: 0.45, desc: 'A grenade that slows a wide area.' },
      { key: 'e', name: 'Orbital Strike', type: 'aoe', damage: 340, dpl: 100, range: 560, radius: 260, cd: 52, mana: 100, unlock: 4, desc: 'Call down an orbital bombardment.' },
    ]),
  hero('talon', 'Talon', 'the Sky Hawk', 'Marksman', 'animal', '#9c6644', '#fefae0',
    { hp: 520, hpPl: 54, dmg: 63, dmgPl: 7, range: 300, as: 1.05, ms: 112, armor: 5, mana: 210 },
    { name: 'Keen Eye', kind: 'crit', value: 0.14, desc: '+14% critical strike chance.' },
    [
      { key: 'q', name: 'Dive Bomb', type: 'dash', damage: 130, dpl: 32, range: 360, radius: 110, cd: 7, mana: 42, unlock: 1, desc: 'Dive at a spot, damaging enemies there.' },
      { key: 'w', name: 'Feather Storm', type: 'volley', damage: 145, dpl: 36, range: 470, radius: 0, cd: 11, mana: 52, unlock: 3, desc: 'A storm of razor feathers toward your aim.' },
      { key: 'e', name: 'Skyfall', type: 'aoe', damage: 310, dpl: 92, range: 540, radius: 250, cd: 50, mana: 95, unlock: 4, desc: 'A hawk screech summons a sky-shattering strike.' },
    ]),
  hero('juno', 'Juno', 'the Gunslinger', 'Marksman', 'human', '#b08968', '#e63946',
    { hp: 535, hpPl: 55, dmg: 65, dmgPl: 7, range: 305, as: 1.02, ms: 111, armor: 5, mana: 215 },
    { name: 'Fan the Hammer', kind: 'speedOnLow', value: 0.2, desc: '+20% attack speed after a kill for 5s.' },
    [
      { key: 'q', name: 'Deadeye Shot', type: 'bolt', damage: 155, dpl: 38, range: 560, radius: 0, cd: 6, mana: 42, unlock: 1, desc: 'A precise shot with long range.' },
      { key: 'w', name: 'Combat Roll', type: 'dash', damage: 0, dpl: 0, range: 300, radius: 0, cd: 9, mana: 40, unlock: 3, desc: 'Roll to a spot, reloading instantly.' },
      { key: 'e', name: 'Bullet Storm', type: 'volley', damage: 300, dpl: 90, range: 520, radius: 0, cd: 48, mana: 95, unlock: 4, desc: 'A storm of bullets in a wide fan.' },
    ]),

  // ---- MAGE ----
  hero('aria', 'Aria', 'the Frost Witch', 'Mage', 'human', '#a8dadc', '#457b9d',
    { hp: 550, hpPl: 56, dmg: 60, dmgPl: 7, range: 290, as: 0.85, ms: 108, armor: 5, mana: 300 },
    { name: 'Chill', kind: 'slowOnHit', value: 0.2, desc: 'Attacks slow enemies by 20%.' },
    [
      { key: 'q', name: 'Ice Shard', type: 'bolt', damage: 140, dpl: 35, range: 500, radius: 0, cd: 5, mana: 45, unlock: 1, slow: 0.3, desc: 'A shard of ice that chills the enemy hit.' },
      { key: 'w', name: 'Frost Nova', type: 'aoe', damage: 150, dpl: 38, range: 360, radius: 200, cd: 11, mana: 60, unlock: 3, slow: 0.5, desc: 'Freeze the ground around a point.' },
      { key: 'e', name: 'Blizzard', type: 'aoe', damage: 330, dpl: 95, range: 480, radius: 280, cd: 52, mana: 100, unlock: 4, slow: 0.5, desc: 'A raging blizzard over a wide area.' },
    ]),
  hero('pip', 'Pip', 'the Clockwork Owl', 'Mage', 'robot', '#b08968', '#80ed99',
    { hp: 545, hpPl: 55, dmg: 59, dmgPl: 7, range: 285, as: 0.88, ms: 108, armor: 6, mana: 320 },
    { name: 'Wisdom Gears', kind: 'manaRegen', value: 6, desc: '+6 mana per second.' },
    [
      { key: 'q', name: 'Arcane Bolt', type: 'bolt', damage: 145, dpl: 36, range: 510, radius: 0, cd: 5, mana: 42, unlock: 1, desc: 'A bolt of ticking arcane energy.' },
      { key: 'w', name: 'Time Slow', type: 'aoe', damage: 110, dpl: 28, range: 400, radius: 220, cd: 12, mana: 58, unlock: 3, slow: 0.55, desc: 'Slow time itself in an area.' },
      { key: 'e', name: 'Chrono Blast', type: 'aoe', damage: 340, dpl: 98, range: 500, radius: 260, cd: 50, mana: 100, unlock: 4, stun: 0.9, desc: 'Detonate a pocket of frozen time.' },
    ]),
  hero('sol', 'Sol', 'the Solar Priest', 'Mage', 'human', '#f4d35e', '#ee964b',
    { hp: 560, hpPl: 57, dmg: 57, dmgPl: 7, range: 280, as: 0.85, ms: 107, armor: 5, mana: 310 },
    { name: 'Radiance', kind: 'healAura', value: 6, desc: 'Nearby allies regenerate 6 HP/s.' },
    [
      { key: 'q', name: 'Holy Bolt', type: 'bolt', damage: 135, dpl: 34, range: 490, radius: 0, cd: 5, mana: 42, unlock: 1, desc: 'A searing bolt of sunlight.' },
      { key: 'w', name: 'Solar Mend', type: 'heal', damage: 170, dpl: 45, range: 400, radius: 0, cd: 10, mana: 60, unlock: 3, ally: true, desc: 'Heal the lowest nearby ally for 170 HP.' },
      { key: 'e', name: 'Resurrection Light', type: 'heal', damage: 360, dpl: 100, range: 0, radius: 400, cd: 55, mana: 105, unlock: 4, ally: true, desc: 'Bathe nearby allies in healing light.' },
    ]),
  hero('mochi', 'Mochi', 'the Storm Cat', 'Mage', 'animal', '#6d6875', '#ffd60a',
    { hp: 540, hpPl: 55, dmg: 61, dmgPl: 7, range: 285, as: 0.9, ms: 110, armor: 5, mana: 300 },
    { name: 'Static Fur', kind: 'thorns', value: 10, desc: 'Attackers take 10 damage back.' },
    [
      { key: 'q', name: 'Lightning Bolt', type: 'bolt', damage: 150, dpl: 38, range: 520, radius: 0, cd: 5, mana: 45, unlock: 1, desc: 'A crackling bolt of lightning.' },
      { key: 'w', name: 'Storm Shield', type: 'shield', damage: 0, dpl: 0, range: 0, radius: 0, cd: 12, mana: 55, unlock: 3, shield: 200, desc: 'A crackling shield for 200 HP.' },
      { key: 'e', name: 'Thunderstorm', type: 'nova', damage: 300, dpl: 90, range: 0, radius: 330, cd: 50, mana: 100, unlock: 4, desc: 'A storm of lightning bolts in all directions.' },
    ]),
];

export const HERO_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h]));

// Ban priority for bot drafters (strongest-feeling heroes first).
export const BAN_PRIORITY = ['zero', 'nyx', 'aria', 'bolt', 'korr', 'lyra', 'kael', 'mochi'];

// Lane assignment by role (MLBB convention: Marksman -> Gold, Fighter -> EXP,
// Mage -> Mid, Assassin -> Jungle, Tank -> roam with the team).
export const ROLE_LANE = {
  Marksman: 'gold',
  Fighter: 'exp',
  Mage: 'mid',
  Assassin: 'jungle',
  Tank: 'mid',
};

export const LANES = [
  { id: 'gold', name: 'Gold Lane', color: '#ffd60a' },
  { id: 'mid', name: 'Mid Lane', color: '#ff5d8f' },
  { id: 'exp', name: 'EXP Lane', color: '#2ec4b6' },
];

export function expForLevel(level) {
  return Math.round(90 * Math.pow(level, 1.35));
}

export const MAX_LEVEL = 15;
