// All canvas rendering: menu, draft, VS screen, match (world + HUD), end.
// Each draw function fills `ui.buttons` with clickable rects the input layer
// uses for hit-testing. No game logic lives here.
//
// Visuals are all drawn in code: a pre-rendered textured map (grass noise,
// stone lanes, river, trees), distinct hero figures per form/role/weapon
// (no shared circle template), detailed turrets and bases, creature sprites
// for minions/monsters, and themed attack/skill effects.
import { HEROES, HERO_BY_ID, ITEMS, ITEM_BY_ID, ITEM_CATEGORIES, SETS, SET_BY_ID, setProgress, LOOKS, THEME_COLOR, ROLES, ROLE_COLOR, ROLE_BLURB, expForLevel } from './heroes.js';
import { WORLD, BASES, LANE_PATHS, CAMPS, TURRET_SPOTS, WALLS, BUSHES, bushRadius, turretAttackable, baseExposed, turretsLeft, heroStats, buyPrice } from './match.js';
import { isMuted } from './audio.js';
import { isPlayerStep } from './draft.js';
import { TIERS, tierFor, nextTier, tierProgress, rankedTable } from './ladder.js';
import { clamp, fmtTime, mulberry32 } from './util.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;

const TEAM_COLOR = { A: '#3a86ff', B: '#e5484d' };
const TEAM_NAME = { A: 'Team Azure', B: 'Team Crimson' };

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function text(ctx, s, x, y, size, color, align = 'center', weight = 'bold', font = 'system-ui, sans-serif') {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

// Text truncated with an ellipsis so it never overflows its box.
function textFit(ctx, s, x, y, size, color, maxW, align = 'center', weight = 'bold') {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  let str = s;
  while (str.length > 1 && ctx.measureText(str).width > maxW) str = str.slice(0, -1);
  if (str.length < s.length) str = str.slice(0, -1) + '…';
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function panel(ctx, x, y, w, h, fill = 'rgba(10, 16, 32, 0.88)', stroke = 'rgba(255,255,255,0.14)') {
  // Soft drop shadow + vertical gradient + rim light: the MLBB panel look.
  rr(ctx, x + 2, y + 3, w, h, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(38, 52, 84, 0.94)');
  g.addColorStop(1, 'rgba(12, 18, 36, 0.94)');
  rr(ctx, x, y, w, h, 10);
  ctx.fillStyle = fill === 'rgba(10, 16, 32, 0.88)' ? g : fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Top rim highlight.
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 1);
  ctx.lineTo(x + w - 10, y + 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function goldPill(ctx, x, y, amount, size = 14) {
  text(ctx, '◉', x, y, size + 2, '#ffd60a', 'left');
  text(ctx, `${Math.floor(amount)}`, x + size + 2, y, size, '#ffd60a', 'left');
}

// ---- Item icons (drawn glyphs, one per item) -------------------------------

const ICON_COLOR = {
  dagger: '#cfd8dc', blade: '#e0e0e0', crit: '#ff5252', bow: '#8d6e63', fang: '#ff8a65',
  axe: '#bcaaa4', slayer: '#7b1fa2', wand: '#64b5f6', staff: '#5c6bc0', orb: '#4fc3f7',
  tome: '#81c784', void: '#7e57c2', vest: '#a1887f', plate: '#90a4ae', cloak: '#5c6bc0',
  shield: '#78909c', aegis: '#ffd54f', boots: '#8d6e63', boots2: '#78909c', boots3: '#4db6ac',
  knife: '#aed581', tamer: '#66bb6a',
  demonblade: '#7b1fa2', goldstaff: '#ffd60a', scythe: '#66bb6a', phantom: '#b3e5fc',
  executioner: '#d32f2f', vampblade: '#c62828', chalice: '#e53935', codex: '#42a5f5',
  helm: '#78909c', bloodmail: '#b71c1c', beastfang: '#ff9800',
};

export function drawItemIcon(ctx, item, cx, cy, size) {
  const s = size / 44; // glyphs are drawn on a 44px grid
  const c = ICON_COLOR[item.icon] || '#cccccc';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (item.icon) {
    case 'dagger': case 'knife': {
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(5, -6); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.lineTo(-5, -6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5d4037'; ctx.fillRect(-7, 6, 14, 4);
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(-3, 10, 6, 8);
      break;
    }
    case 'blade': case 'slayer': {
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = item.icon === 'slayer' ? '#ce93d8' : c;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(6, -10); ctx.lineTo(6, 8); ctx.lineTo(-6, 8); ctx.lineTo(-6, -10); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 6); ctx.stroke();
      ctx.fillStyle = '#ffd60a'; ctx.fillRect(-9, 8, 18, 4);
      ctx.fillStyle = '#5d4037'; ctx.fillRect(-3, 12, 6, 8);
      break;
    }
    case 'crit': {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(6, -4); ctx.lineTo(16, -4); ctx.lineTo(8, 4); ctx.lineTo(12, 16); ctx.lineTo(0, 9); ctx.lineTo(-12, 16); ctx.lineTo(-8, 4); ctx.lineTo(-16, -4); ctx.lineTo(-6, -4); ctx.closePath(); ctx.fill();
      break;
    }
    case 'bow': {
      ctx.strokeStyle = c; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(-4, 0, 18, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(4, -16); ctx.lineTo(4, 16); ctx.stroke();
      ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke();
      break;
    }
    case 'fang': {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(-10, -14); ctx.quadraticCurveTo(-14, 6, -4, 18); ctx.quadraticCurveTo(0, 2, -2, -14); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10, -14); ctx.quadraticCurveTo(14, 6, 4, 18); ctx.quadraticCurveTo(0, 2, 2, -14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5252'; circle(ctx, -6, -16, 3); ctx.fill(); circle(ctx, 6, -16, 3); ctx.fill();
      break;
    }
    case 'axe': {
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(-2, -6, 4, 24);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-2, -18); ctx.quadraticCurveTo(-20, -14, -16, 2); ctx.lineTo(-2, 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2, -18); ctx.quadraticCurveTo(20, -14, 16, 2); ctx.lineTo(2, 2); ctx.closePath(); ctx.fill();
      break;
    }
    case 'wand': case 'staff': {
      ctx.rotate(-Math.PI / 5);
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(-2, -14, 4, 32);
      ctx.fillStyle = item.icon === 'staff' ? '#ffd60a' : c;
      circle(ctx, 0, -18, item.icon === 'staff' ? 7 : 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; circle(ctx, -2, -20, 2); ctx.fill();
      break;
    }
    case 'orb': {
      const g = ctx.createRadialGradient(-3, -4, 2, 0, 0, 16);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, c); g.addColorStop(1, '#01579b');
      ctx.fillStyle = g; circle(ctx, 0, 0, 15); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 19, 0.5, 2.4); ctx.stroke();
      break;
    }
    case 'tome': case 'void': {
      ctx.fillStyle = item.icon === 'void' ? '#4527a0' : '#2e7d32';
      rr(ctx, -14, -16, 28, 32, 3); ctx.fill();
      ctx.fillStyle = item.icon === 'void' ? '#b39ddb' : '#a5d6a7';
      rr(ctx, -10, -12, 20, 24, 2); ctx.fill();
      ctx.strokeStyle = item.icon === 'void' ? '#7e57c2' : '#66bb6a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(5, -6); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(-5, 6); ctx.lineTo(5, 6); ctx.stroke();
      break;
    }
    case 'vest': case 'plate': {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(-6, -18); ctx.lineTo(6, -18); ctx.lineTo(14, -12); ctx.lineTo(12, 16); ctx.lineTo(-12, 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.moveTo(-6, -18); ctx.lineTo(0, -8); ctx.lineTo(6, -18); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-12, 4); ctx.lineTo(12, 4); ctx.stroke();
      break;
    }
    case 'cloak': {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(16, -6, 14, 16); ctx.lineTo(-14, 16); ctx.quadraticCurveTo(-16, -6, 0, -18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd60a'; circle(ctx, 0, -10, 4); ctx.fill();
      break;
    }
    case 'shield': case 'aegis': {
      ctx.fillStyle = item.icon === 'aegis' ? '#ffca28' : c;
      ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(14, -16); ctx.lineTo(14, 2); ctx.quadraticCurveTo(14, 14, 0, 20); ctx.quadraticCurveTo(-14, 14, -14, 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.stroke();
      break;
    }
    case 'boots': case 'boots2': case 'boots3': {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-12, -16); ctx.lineTo(-2, -16); ctx.lineTo(-2, 2); ctx.lineTo(14, 2); ctx.lineTo(14, 12); ctx.lineTo(-12, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-12, 12, 26, 4);
      if (item.icon !== 'boots') { ctx.fillStyle = '#ffd60a'; ctx.fillRect(-10, -10, 6, 4); ctx.fillRect(-10, -2, 6, 4); }
      if (item.icon === 'boots3') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(16, -14); ctx.lineTo(22, -8); ctx.lineTo(16, -4); ctx.closePath(); ctx.fill(); }
      break;
    }
    case 'tamer': {
      ctx.fillStyle = '#fff';
      circle(ctx, -6, -6, 6); ctx.fill(); circle(ctx, 6, -6, 6); ctx.fill();
      ctx.fillStyle = '#222'; circle(ctx, -6, -6, 2.5); ctx.fill(); circle(ctx, 6, -6, 2.5); ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-12, 2); ctx.quadraticCurveTo(0, 18, 12, 2); ctx.quadraticCurveTo(0, 8, -12, 2); ctx.closePath(); ctx.fill();
      break;
    }
    case 'demonblade': case 'vampblade': case 'phantom': {
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(6, -10); ctx.lineTo(6, 8); ctx.lineTo(-6, 8); ctx.lineTo(-6, -10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-1.5, -16, 3, 20);
      ctx.fillStyle = '#ffd60a'; ctx.fillRect(-9, 8, 18, 4);
      ctx.fillStyle = '#5d4037'; ctx.fillRect(-3, 12, 6, 8);
      break;
    }
    case 'goldstaff': {
      ctx.rotate(-Math.PI / 5);
      ctx.fillStyle = '#b8860b'; ctx.fillRect(-2, -12, 4, 30);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(4, -10); ctx.lineTo(12, -10); ctx.lineTo(6, -4); ctx.lineTo(8, 4); ctx.lineTo(0, 0); ctx.lineTo(-8, 4); ctx.lineTo(-6, -4); ctx.lineTo(-12, -10); ctx.lineTo(-4, -10); ctx.closePath(); ctx.fill();
      break;
    }
    case 'scythe': {
      ctx.rotate(Math.PI / 5);
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(-2, -20, 4, 40);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-2, -20); ctx.quadraticCurveTo(-24, -22, -22, -2); ctx.quadraticCurveTo(-12, -10, -2, -10); ctx.closePath(); ctx.fill();
      break;
    }
    case 'executioner': {
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#5d4037'; ctx.fillRect(-2, 2, 4, 18);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-14, -18); ctx.lineTo(14, -18); ctx.lineTo(10, 4); ctx.lineTo(-10, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-10, -14, 20, 3);
      break;
    }
    case 'chalice': {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-12, -16); ctx.lineTo(12, -16); ctx.lineTo(8, 2); ctx.quadraticCurveTo(0, 8, -8, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff8a80'; ctx.fillRect(-10, -14, 20, 5);
      ctx.fillStyle = '#ffd60a'; ctx.fillRect(-2, 6, 4, 8); ctx.fillRect(-8, 14, 16, 4);
      break;
    }
    case 'codex': {
      ctx.fillStyle = '#1565c0';
      rr(ctx, -14, -16, 28, 32, 3); ctx.fill();
      ctx.fillStyle = '#90caf9';
      rr(ctx, -10, -12, 20, 24, 2); ctx.fill();
      ctx.strokeStyle = '#0d47a1'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(5, -6); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(-5, 6); ctx.lineTo(5, 6); ctx.stroke();
      break;
    }
    case 'helm': {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-16, 6); ctx.arc(0, 6, 16, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillRect(-18, 4, 36, 5);
      ctx.fillStyle = '#37474f'; ctx.fillRect(-3, -12, 6, 18);
      ctx.fillStyle = '#ffd60a'; circle(ctx, 0, -12, 3); ctx.fill();
      break;
    }
    case 'bloodmail': {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(-6, -18); ctx.lineTo(6, -18); ctx.lineTo(14, -12); ctx.lineTo(12, 16); ctx.lineTo(-12, 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5252'; circle(ctx, 0, 0, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-12, 8, 24, 2);
      break;
    }
    case 'beastfang': {
      ctx.fillStyle = '#fff3e0';
      ctx.beginPath(); ctx.moveTo(-8, -18); ctx.quadraticCurveTo(-14, 4, 0, 20); ctx.quadraticCurveTo(14, 4, 8, -18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; circle(ctx, 0, -14, 4); ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = c; rr(ctx, -12, -12, 24, 24, 4); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ---- Hero figures ----------------------------------------------------------
// A hero is drawn from its form + role + weapon + feature, so all 20 read
// differently: bulky shield Tanks, slim twin-dagger Assassins, robed Mages,
// bow/rifle Marksmen, greatsword Fighters, quadruped beasts, angular mechs.
// opts: { team, time, walkPhase, flash, attackAnim, castAnim, animKind, scale }

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}

function drawWeapon(ctx, weapon, x, y, angle, len, accent, swing = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + swing);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (weapon) {
    case 'sword': {
      ctx.fillStyle = '#8d6e63'; ctx.fillRect(-2, -2, 8, 4);
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(len, -2.5); ctx.lineTo(len + 7, 0); ctx.lineTo(len, 2.5); ctx.lineTo(6, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd60a'; ctx.fillRect(4, -6, 3, 12);
      break;
    }
    case 'hammer': {
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(0, -2.5, len, 5);
      ctx.fillStyle = '#90a4ae'; rr(ctx, len - 4, -10, 14, 20, 3); ctx.fill();
      ctx.fillStyle = accent; ctx.fillRect(len - 4, -10, 14, 4);
      break;
    }
    case 'bow': {
      ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(0, 0, len * 0.55, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(Math.cos(-1.2) * len * 0.55, Math.sin(-1.2) * len * 0.55); ctx.lineTo(Math.cos(1.2) * len * 0.55, Math.sin(1.2) * len * 0.55); ctx.stroke();
      break;
    }
    case 'gun': {
      ctx.fillStyle = '#37474f'; rr(ctx, 0, -4, len * 0.8, 8, 2); ctx.fill();
      ctx.fillStyle = '#607d8b'; ctx.fillRect(len * 0.8, -2, 8, 4);
      ctx.fillStyle = accent; ctx.fillRect(2, -6, 6, 3);
      break;
    }
    case 'staff': {
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(0, -2, len, 4);
      ctx.fillStyle = accent; circle(ctx, len + 3, 0, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; circle(ctx, len + 1, -2, 2.5); ctx.fill();
      break;
    }
    case 'orb': {
      ctx.fillStyle = accent; circle(ctx, len * 0.6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; circle(ctx, len * 0.6 - 2, -2, 3); ctx.fill();
      break;
    }
    case 'daggers': {
      for (const off of [-6, 6]) {
        ctx.save();
        ctx.translate(0, off);
        ctx.rotate(off > 0 ? 0.35 : -0.35);
        ctx.fillStyle = '#e8e8e8';
        ctx.beginPath(); ctx.moveTo(0, -2.5); ctx.lineTo(len * 0.6, -1.5); ctx.lineTo(len * 0.6 + 5, 0); ctx.lineTo(len * 0.6, 1.5); ctx.lineTo(0, 2.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'claws': {
      ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 2.5;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 5);
        ctx.quadraticCurveTo(len * 0.6, i * 5 - 3, len, i * 5 - 6);
        ctx.stroke();
      }
      break;
    }
    default: break;
  }
  ctx.restore();
}

export function drawHeroFigure(ctx, def, x, y, scale, facing, team, opts = {}) {
  const look = LOOKS[def.id] || {};
  const tc = TEAM_COLOR[team] || '#888888';
  const time = opts.time || 0;
  const body = def.color;
  const dark = shade(body, -38);
  const light = shade(body, 42);
  const accent = def.accent;
  const trim = look.trim || accent;
  const R = 17 * scale; // base body radius
  const roleScale = def.role === 'Tank' ? 1.22 : def.role === 'Assassin' ? 0.92 : def.role === 'Mage' ? 0.98 : 1.06;
  const s = scale * roleScale;

  // Attack / cast animation pose.
  const atk = opts.attackAnim !== undefined ? opts.attackAnim : 99;
  const cst = opts.castAnim !== undefined ? opts.castAnim : 99;
  const kind = opts.animKind || null;
  let lunge = 0; let swing = 0; let lift = 0; let glow = 0;
  if (atk < 0.35) {
    const p = atk / 0.35;
    const env = Math.sin(p * Math.PI);
    lunge = env * 7;
    swing = kind === 'swing' ? -1.1 + p * 2.2 : kind === 'thrust' ? 0 : -0.4 + p * 0.8;
  }
  if (cst < 0.5) {
    const p = cst / 0.5;
    if (kind === 'leap') lift = -Math.sin(p * Math.PI) * 16;
    else if (kind === 'throw') swing = -0.9 + p * 1.5;
    else glow = Math.sin(p * Math.PI);
    lunge = Math.max(lunge, kind === 'leap' ? 4 : 0);
  }
  const bob = Math.sin((opts.walkPhase || 0) * 2) * 1.5;
  const fx = x + Math.cos(facing) * lunge;
  const fy = y + Math.sin(facing) * lunge * 0.5 + lift + bob;

  ctx.save();
  // Ground shadow + team ring.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ellipse(ctx, x, y + R * 0.95, R * 1.05, R * 0.42);
  ctx.fill();
  ctx.strokeStyle = tc;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2;
  ellipse(ctx, x, y + R * 0.95, R * 1.15, R * 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Facing wedge.
  ctx.fillStyle = tc;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(facing) * R * 1.5, y + Math.sin(facing) * R * 0.75 + R * 0.95);
  ctx.lineTo(x + Math.cos(facing + 2.6) * R * 0.9, y + Math.sin(facing + 2.6) * R * 0.45 + R * 0.95);
  ctx.lineTo(x + Math.cos(facing - 2.6) * R * 0.9, y + Math.sin(facing - 2.6) * R * 0.45 + R * 0.95);
  ctx.closePath();
  ctx.fill();

  const bx = fx; const by = fy;
  const facingRight = Math.cos(facing) >= 0;
  const wAng = facing; // weapon points at the target

  // ---- Cape / wings behind the body ----
  if (look.feature === 'cape') {
    ctx.fillStyle = shade(tc, -20);
    ctx.beginPath();
    ctx.moveTo(bx - Math.cos(facing) * R * 0.4, by - R * 0.6);
    ctx.quadraticCurveTo(bx - Math.cos(facing) * R * 1.6, by + R * 0.4, bx - Math.cos(facing) * R * 1.1, by + R * 1.15);
    ctx.quadraticCurveTo(bx - Math.cos(facing) * R * 0.5, by + R * 0.7, bx - Math.cos(facing) * R * 0.4, by - R * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  if (look.feature === 'wings') {
    const flap = Math.sin(time * 6 + (opts.seed || 0)) * 0.25;
    ctx.fillStyle = shade(body, -20);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(bx, by - R * 0.3);
      ctx.rotate(side * (0.7 + flap));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * R * 1.4, -R * 1.1, side * R * 1.7, -R * 0.2);
      ctx.quadraticCurveTo(side * R * 0.9, R * 0.3, 0, R * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  if (look.feature === 'tail') {
    ctx.strokeStyle = dark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bx - Math.cos(facing) * R * 0.8, by + R * 0.3);
    ctx.quadraticCurveTo(bx - Math.cos(facing) * R * 1.5, by + R * 0.9 + Math.sin(time * 3) * 3, bx - Math.cos(facing) * R * 1.2, by + R * 1.3);
    ctx.stroke();
  }

  // ---- Body by form ----
  if (def.form === 'animal') {
    // Quadruped: elongated body along the facing direction, head at front.
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(facing);
    // Legs.
    ctx.fillStyle = dark;
    for (const [lx, ly] of [[-R * 0.5, -R * 0.55], [-R * 0.5, R * 0.55], [R * 0.55, -R * 0.55], [R * 0.55, R * 0.55]]) {
      ctx.fillRect(lx - 2.5, ly - 5 + Math.sin((opts.walkPhase || 0) * 2 + lx) * 1.5, 5, 10);
    }
    // Body.
    ctx.fillStyle = body;
    ellipse(ctx, 0, 0, R * 1.15, R * 0.72);
    ctx.fill();
    ctx.fillStyle = light;
    ellipse(ctx, -R * 0.2, -R * 0.18, R * 0.7, R * 0.36);
    ctx.fill();
    // Team saddle stripe.
    ctx.fillStyle = tc;
    ctx.fillRect(-R * 0.25, -R * 0.72, R * 0.5, R * 0.22);
    // Head.
    ctx.fillStyle = body;
    circle(ctx, R * 1.05, 0, R * 0.62);
    ctx.fill();
    // Snout + eyes.
    ctx.fillStyle = dark;
    circle(ctx, R * 1.5, 0, R * 0.28);
    ctx.fill();
    ctx.fillStyle = '#111';
    circle(ctx, R * 1.05, -R * 0.28, R * 0.11);
    ctx.fill();
    circle(ctx, R * 1.05, R * 0.28, R * 0.11);
    ctx.fill();
    // Ears / horns on the head.
    if (look.feature === 'ears') {
      ctx.fillStyle = body;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(R * 0.8, side * R * 0.45);
        ctx.lineTo(R * 0.95, side * R * 0.95);
        ctx.lineTo(R * 1.25, side * R * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  } else if (def.form === 'robot') {
    // Angular mech: chassis, dome head, visor, treads.
    ctx.fillStyle = '#263238';
    rr(ctx, bx - R * 0.75, by + R * 0.55, R * 1.5, R * 0.5, 3);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(bx - R * 0.6, by + R * 0.7, R * 0.3, R * 0.2);
    ctx.fillRect(bx + R * 0.3, by + R * 0.7, R * 0.3, R * 0.2);
    // Chassis.
    ctx.fillStyle = body;
    rr(ctx, bx - R * 0.85, by - R * 0.75, R * 1.7, R * 1.4, 5);
    ctx.fill();
    ctx.fillStyle = light;
    rr(ctx, bx - R * 0.85, by - R * 0.75, R * 1.7, R * 0.45, 5);
    ctx.fill();
    // Chest core (team colour).
    ctx.fillStyle = tc;
    circle(ctx, bx, by + R * 0.1, R * 0.3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    circle(ctx, bx, by + R * 0.1, R * 0.14);
    ctx.fill();
    // Shoulder pads.
    ctx.fillStyle = trim;
    rr(ctx, bx - R * 1.05, by - R * 0.7, R * 0.35, R * 0.6, 3);
    ctx.fill();
    rr(ctx, bx + R * 0.7, by - R * 0.7, R * 0.35, R * 0.6, 3);
    ctx.fill();
    // Dome head + visor.
    ctx.fillStyle = dark;
    circle(ctx, bx, by - R * 0.95, R * 0.55);
    ctx.fill();
    ctx.fillStyle = accent;
    rr(ctx, bx - R * 0.35, by - R * 1.05, R * 0.7, R * 0.22, 2);
    ctx.fill();
    // Antenna.
    if (look.feature === 'antenna') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, by - R * 1.45); ctx.lineTo(bx, by - R * 1.95); ctx.stroke();
      ctx.fillStyle = accent;
      circle(ctx, bx, by - R * 2.0, 2.5);
      ctx.fill();
    }
  } else {
    // Human: legs, torso with armour, head, arms.
    const robe = def.role === 'Mage';
    // Legs (hidden by a robe for mages).
    if (!robe) {
      ctx.fillStyle = '#2b2b3a';
      const lp = Math.sin((opts.walkPhase || 0) * 2) * 3;
      ctx.fillRect(bx - R * 0.45, by + R * 0.45, R * 0.32, R * 0.55 + lp * 0.2);
      ctx.fillRect(bx + R * 0.13, by + R * 0.45, R * 0.32, R * 0.55 - lp * 0.2);
    }
    if (robe) {
      // Robe cone.
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(bx - R * 0.55, by - R * 0.1);
      ctx.lineTo(bx + R * 0.55, by - R * 0.1);
      ctx.lineTo(bx + R * 0.85, by + R * 1.0);
      ctx.lineTo(bx - R * 0.85, by + R * 1.0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = trim;
      ctx.beginPath();
      ctx.moveTo(bx - R * 0.2, by - R * 0.1);
      ctx.lineTo(bx + R * 0.2, by - R * 0.1);
      ctx.lineTo(bx + R * 0.3, by + R * 1.0);
      ctx.lineTo(bx - R * 0.3, by + R * 1.0);
      ctx.closePath();
      ctx.fill();
    }
    // Torso.
    const torsoW = def.role === 'Tank' ? R * 1.5 : def.role === 'Assassin' ? R * 1.0 : R * 1.25;
    ctx.fillStyle = body;
    rr(ctx, bx - torsoW / 2, by - R * 0.75, torsoW, R * 1.3, 6);
    ctx.fill();
    ctx.fillStyle = light;
    rr(ctx, bx - torsoW / 2, by - R * 0.75, torsoW, R * 0.4, 6);
    ctx.fill();
    // Armour / belt in team colour.
    ctx.fillStyle = tc;
    ctx.fillRect(bx - torsoW / 2, by + R * 0.3, torsoW, R * 0.22);
    // Tank shield on the off-hand side.
    if (def.role === 'Tank') {
      const sx2 = bx + (facingRight ? -1 : 1) * R * 0.95;
      ctx.fillStyle = trim;
      ctx.beginPath();
      ctx.moveTo(sx2 - R * 0.35, by - R * 0.7);
      ctx.lineTo(sx2 + R * 0.35, by - R * 0.7);
      ctx.lineTo(sx2 + R * 0.35, by + R * 0.3);
      ctx.quadraticCurveTo(sx2 + R * 0.35, by + R * 0.85, sx2, by + R * 1.05);
      ctx.quadraticCurveTo(sx2 - R * 0.35, by + R * 0.85, sx2 - R * 0.35, by + R * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx2, by - R * 0.55); ctx.lineTo(sx2, by + R * 0.7); ctx.stroke();
    }
    // Shoulder pads.
    ctx.fillStyle = trim;
    circle(ctx, bx - torsoW / 2, by - R * 0.55, R * 0.28);
    ctx.fill();
    circle(ctx, bx + torsoW / 2, by - R * 0.55, R * 0.28);
    ctx.fill();
    // Head.
    ctx.fillStyle = '#f1c27d';
    circle(ctx, bx, by - R * 1.05, R * 0.52);
    ctx.fill();
    // Hair / helmet / hood.
    if (look.feature === 'hood') {
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(bx, by - R * 1.05, R * 0.62, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    } else if (def.role === 'Tank' || def.role === 'Fighter') {
      ctx.fillStyle = shade(body, -10);
      ctx.beginPath();
      ctx.arc(bx, by - R * 1.05, R * 0.55, Math.PI * 0.95, Math.PI * 2.05);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = shade(accent, -10);
      ctx.beginPath();
      ctx.arc(bx, by - R * 1.1, R * 0.5, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
    // Eyes.
    ctx.fillStyle = '#111';
    circle(ctx, bx - R * 0.18, by - R * 1.0, R * 0.07);
    ctx.fill();
    circle(ctx, bx + R * 0.18, by - R * 1.0, R * 0.07);
    ctx.fill();
    // Halo.
    if (look.feature === 'halo') {
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 2.5;
      ellipse(ctx, bx, by - R * 1.75, R * 0.45, R * 0.16);
      ctx.stroke();
    }
    // Horns (Korr the golem is a robot; horns here are for humans).
    if (look.feature === 'horns') {
      ctx.fillStyle = '#f5f5f5';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx + side * R * 0.3, by - R * 1.4);
        ctx.quadraticCurveTo(bx + side * R * 0.6, by - R * 1.8, bx + side * R * 0.75, by - R * 1.5);
        ctx.quadraticCurveTo(bx + side * R * 0.5, by - R * 1.3, bx + side * R * 0.3, by - R * 1.4);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  // Robot horns (Korr).
  if (def.form === 'robot' && look.feature === 'horns') {
    ctx.fillStyle = '#e0e0e0';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(bx + side * R * 0.3, by - R * 1.3);
      ctx.quadraticCurveTo(bx + side * R * 0.7, by - R * 1.7, bx + side * R * 0.85, by - R * 1.35);
      ctx.quadraticCurveTo(bx + side * R * 0.5, by - R * 1.15, bx + side * R * 0.3, by - R * 1.3);
      ctx.closePath();
      ctx.fill();
    }
  }
  // ---- Weapon (rotated toward the target, swings on attack) ----
  const wx = bx + Math.cos(wAng) * R * 0.7;
  const wy = by + Math.sin(wAng) * R * 0.4;
  drawWeapon(ctx, look.weapon || 'sword', wx, wy, wAng, R * 1.35, trim, swing);
  // Cast glow.
  if (glow > 0) {
    ctx.globalAlpha = glow * 0.5;
    ctx.fillStyle = THEME_COLOR[look.theme] || accent;
    circle(ctx, bx, by - R * 0.2, R * (1.1 + glow * 0.4));
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Hit flash.
  if (opts.flash > 0) {
    ctx.globalAlpha = Math.min(0.7, opts.flash * 4);
    ctx.fillStyle = '#ffffff';
    circle(ctx, bx, by, R * 1.1);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// Portrait: a mini hero figure on a dark disc, ringed by the role colour.
export function drawPortrait(ctx, hero, x, y, r, opts = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  g.addColorStop(0, '#3a4a6b');
  g.addColorStop(1, '#141c30');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  drawHeroFigure(ctx, hero, x, y + r * 0.18, (r / 17) * 0.78, -Math.PI / 2 + 0.6, opts.team || 'A', { time: opts.time || 0, walkPhase: 0, seed: hero.name.length });
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = opts.dim ? '#555' : ROLE_COLOR[hero.role];
  ctx.beginPath();
  ctx.arc(x, y, r - 1.5, 0, Math.PI * 2);
  ctx.stroke();
  if (opts.dim) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.banned) {
    ctx.strokeStyle = '#e5484d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.7, y - r * 0.7);
    ctx.lineTo(x + r * 0.7, y + r * 0.7);
    ctx.moveTo(x + r * 0.7, y - r * 0.7);
    ctx.lineTo(x - r * 0.7, y + r * 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- Pre-rendered map ------------------------------------------------------
// The static terrain (grass noise, stone lanes, river, trees, bushes, rocks)
// is painted once to an offscreen canvas and blitted each frame —
// far cheaper than redrawing ~200 trees per frame, and it lets the terrain
// carry real texture.

let mapCanvas = null;

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1; const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx; const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function nearLane(x, y, margin) {
  for (const lane of Object.values(LANE_PATHS)) {
    const path = lane.A;
    for (let i = 0; i < path.length - 1; i++) {
      if (distToSeg(x, y, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]) < margin) return true;
    }
  }
  return false;
}

// River: the diagonal band y = 0.5x + 200 (passes through the map centre).
function riverDist(x, y) {
  return Math.abs(y - (0.5 * x + 200)) / Math.hypot(1, 0.5);
}

function buildMapCanvas() {
  const c = document.createElement('canvas');
  c.width = WORLD.w; c.height = WORLD.h;
  const g = c.getContext('2d');
  const rng = mulberry32(20261117);

  // Grass base: vertical gradient + noise dots + soft patches.
  const base = g.createLinearGradient(0, 0, 0, WORLD.h);
  base.addColorStop(0, '#2f7a33');
  base.addColorStop(0.5, '#357f36');
  base.addColorStop(1, '#2c7430');
  g.fillStyle = base;
  g.fillRect(0, 0, WORLD.w, WORLD.h);
  for (let i = 0; i < 70; i++) {
    const x = rng() * WORLD.w; const y = rng() * WORLD.h;
    const r = 90 + rng() * 180;
    const pg = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng() > 0.5;
    pg.addColorStop(0, dark ? 'rgba(20, 90, 25, 0.25)' : 'rgba(120, 200, 90, 0.14)');
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = pg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 5200; i++) {
    const x = rng() * WORLD.w; const y = rng() * WORLD.h;
    g.fillStyle = rng() > 0.5 ? 'rgba(20, 80, 25, 0.35)' : 'rgba(140, 220, 110, 0.22)';
    g.beginPath();
    g.arc(x, y, 1 + rng() * 3.5, 0, Math.PI * 2);
    g.fill();
  }
  // Grass blades: tiny strokes.
  g.strokeStyle = 'rgba(30, 110, 35, 0.5)';
  g.lineWidth = 1;
  for (let i = 0; i < 1600; i++) {
    const x = rng() * WORLD.w; const y = rng() * WORLD.h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rng() - 0.5) * 6, y - 4 - rng() * 4);
    g.stroke();
  }

  // Jungle clearings under camps (packed dirt).
  for (const camp of CAMPS) {
    g.fillStyle = 'rgba(139, 109, 59, 0.5)';
    g.beginPath(); g.arc(camp.x, camp.y, 78, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(160, 128, 70, 0.4)';
    g.beginPath(); g.arc(camp.x, camp.y, 56, 0, Math.PI * 2); g.fill();
  }

  // Lanes: dirt bed, then stone paving with edge lines.
  for (const lane of Object.values(LANE_PATHS)) {
    const path = lane.A;
    const drawPath = (width, style) => {
      g.strokeStyle = style;
      g.lineWidth = width;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(path[0][0], path[0][1]);
      for (let i = 1; i < path.length; i++) g.lineTo(path[i][0], path[i][1]);
      g.stroke();
    };
    drawPath(122, '#7a5c33'); // dirt bed
    drawPath(104, '#9c8a6b'); // stone base
    // Paving stones: small rounded tiles along the path.
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, y1] = path[i]; const [x2, y2] = path[i + 1];
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.floor(segLen / 34);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      for (let sIdx = 0; sIdx < steps; sIdx++) {
        const t = (sIdx + 0.5) / steps;
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;
        for (const off of [-30, 0, 30]) {
          const ox = px + Math.cos(ang + Math.PI / 2) * off;
          const oy = py + Math.sin(ang + Math.PI / 2) * off;
          g.save();
          g.translate(ox, oy);
          g.rotate(ang + (rng() - 0.5) * 0.2);
          g.fillStyle = rng() > 0.5 ? 'rgba(180, 165, 135, 0.7)' : 'rgba(150, 135, 105, 0.7)';
          rr(g, -13, -11, 26, 22, 4);
          g.fill();
          g.restore();
        }
      }
    }
    // Edge lines.
    drawPath(104, 'rgba(0,0,0,0)');
    g.strokeStyle = 'rgba(60, 45, 20, 0.55)';
    g.lineWidth = 3;
    for (const side of [-1, 1]) {
      g.beginPath();
      for (let i = 0; i < path.length; i++) {
        const [px, py] = path[i];
        const [nx, ny] = path[Math.min(i + 1, path.length - 1)];
        const [px2, py2] = path[Math.max(i - 1, 0)];
        const a = Math.atan2(ny - py2, nx - px2);
        const ex = px + Math.cos(a + Math.PI / 2) * 52 * side;
        const ey = py + Math.sin(a + Math.PI / 2) * 52 * side;
        if (i === 0) g.moveTo(ex, ey); else g.lineTo(ex, ey);
      }
      g.stroke();
    }
  }

  // River: blue gradient band with banks and shine streaks.
  const riverPath = [[-40, 180], [1200, 800], [2440, 1420]];
  const drawRiver = (width, style) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(riverPath[0][0], riverPath[0][1]);
    for (let i = 1; i < riverPath.length; i++) g.lineTo(riverPath[i][0], riverPath[i][1]);
    g.stroke();
  };
  drawRiver(170, '#c2a878'); // sandy banks
  const riverGrad = g.createLinearGradient(0, 180, 2400, 1420);
  riverGrad.addColorStop(0, '#1e88e5');
  riverGrad.addColorStop(0.5, '#42a5f5');
  riverGrad.addColorStop(1, '#1e88e5');
  drawRiver(150, riverGrad);
  drawRiver(90, 'rgba(100, 180, 255, 0.6)');
  // Shine streaks.
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 4;
  g.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    const t = rng();
    const x = -40 + t * 2480;
    const y = 180 + t * 1240 + (rng() - 0.5) * 70;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 30 + rng() * 30, y + 15 + rng() * 15);
    g.stroke();
  }

  // Walls: stone barriers with shadow, brick courses, top highlight.
  for (const w of WALLS) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    rr(g, w.x + 5, w.y + 7, w.w, w.h, 6);
    g.fill();
    g.fillStyle = '#8d8577';
    rr(g, w.x, w.y, w.w, w.h, 6);
    g.fill();
    g.fillStyle = '#a39a89';
    rr(g, w.x, w.y, w.w, Math.max(10, w.h * 0.45), 6);
    g.fill();
    // Brick joints.
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w.x, w.y + w.h / 2);
    g.lineTo(w.x + w.w, w.y + w.h / 2);
    g.stroke();
    const vertical = w.h > w.w;
    const joints = Math.floor((vertical ? w.h : w.w) / 40);
    for (let i = 1; i <= joints; i++) {
      const t = (i / (joints + 1));
      g.beginPath();
      if (vertical) { g.moveTo(w.x, w.y + w.h * t); g.lineTo(w.x + w.w, w.y + w.h * t); }
      else { g.moveTo(w.x + w.w * t, w.y); g.lineTo(w.x + w.w * t, w.y + w.h); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w.x + 6, w.y + 2);
    g.lineTo(w.x + w.w - 6, w.y + 2);
    g.stroke();
  }

  // Bushes: elongated dense tall-grass patches (MLBB-style), clearly
  // distinct from the lawn. Rotated to follow their lane/river.
  for (const b of BUSHES) {
    g.save();
    g.translate(b.x, b.y);
    g.rotate(b.rot);
    g.fillStyle = '#14521c';
    rr(g, -b.w / 2, -b.h / 2, b.w, b.h, b.h / 2);
    g.fill();
    g.fillStyle = '#1b6b25';
    rr(g, -b.w / 2 + 6, -b.h / 2 + 6, b.w - 12, b.h - 12, (b.h - 12) / 2);
    g.fill();
    g.strokeStyle = 'rgba(8, 60, 16, 0.85)';
    g.lineWidth = 2;
    g.lineCap = 'round';
    const blades = Math.round(b.w * b.h / 130);
    for (let i = 0; i < blades; i++) {
      const bx = (rng() - 0.5) * (b.w - 16);
      const by = (rng() - 0.5) * (b.h - 10);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + (rng() - 0.5) * 8, by - 8 - rng() * 9);
      g.stroke();
    }
    g.strokeStyle = 'rgba(140, 230, 140, 0.35)';
    for (let i = 0; i < blades / 3; i++) {
      const bx = (rng() - 0.5) * (b.w - 16);
      const by = (rng() - 0.5) * (b.h - 10);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + (rng() - 0.5) * 6, by - 6 - rng() * 6);
      g.stroke();
    }
    g.strokeStyle = 'rgba(20, 90, 25, 0.9)';
    g.lineWidth = 3;
    rr(g, -b.w / 2, -b.h / 2, b.w, b.h, b.h / 2);
    g.stroke();
    g.restore();
  }

  // Base platforms.
  for (const team of ['A', 'B']) {
    const b = BASES[team];
    g.fillStyle = 'rgba(120, 110, 90, 0.8)';
    g.beginPath(); g.arc(b.x, b.y, 150, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(90, 82, 66, 0.8)';
    g.beginPath(); g.arc(b.x, b.y, 128, 0, Math.PI * 2); g.fill();
  }

  // Trees: real trees — trunk, layered canopy, highlight, shadow.
  const treeSpots = [];
  let guard = 0;
  while (treeSpots.length < 130 && guard < 3000) {
    guard++;
    const x = 60 + rng() * (WORLD.w - 120);
    const y = 60 + rng() * (WORLD.h - 120);
    if (nearLane(x, y, 110)) continue;
    if (riverDist(x, y) < 120) continue;
    if (Math.hypot(x - BASES.A.x, y - BASES.A.y) < 220) continue;
    if (Math.hypot(x - BASES.B.x, y - BASES.B.y) < 220) continue;
    if (CAMPS.some((c) => Math.hypot(x - c.x, y - c.y) < 110)) continue;
    if (TURRET_SPOTS.some((t) => Math.hypot(x - t.x, y - t.y) < 110)) continue;
    if (WALLS.some((w) => x > w.x - 40 && x < w.x + w.w + 40 && y > w.y - 40 && y < w.y + w.h + 40)) continue;
    if (BUSHES.some((b) => Math.hypot(x - b.x, y - b.y) < bushRadius(b) + 30)) continue;
    treeSpots.push({ x, y, s: 0.8 + rng() * 0.7 });
  }
  for (const t of treeSpots) {
    const s = t.s;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(t.x + 10 * s, t.y + 26 * s, 22 * s, 9 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5d4037';
    g.fillRect(t.x - 4 * s, t.y + 4 * s, 8 * s, 24 * s);
    const canopy = [['#1b5e20', 0, 0, 26], ['#2e7d32', -12, 6, 20], ['#2e7d32', 12, 6, 20], ['#43a047', -4, -8, 16], ['#66bb6a', 2, -12, 9]];
    for (const [col, ox, oy, r] of canopy) {
      g.fillStyle = col;
      g.beginPath(); g.arc(t.x + ox * s, t.y + oy * s, r * s, 0, Math.PI * 2); g.fill();
    }
  }
  // Bushes.
  for (let i = 0; i < 46; i++) {
    const x = 50 + rng() * (WORLD.w - 100);
    const y = 50 + rng() * (WORLD.h - 100);
    if (nearLane(x, y, 80) || riverDist(x, y) < 100) continue;
    const s = 0.7 + rng() * 0.8;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(x + 6, y + 10, 20 * s, 7 * s, 0, 0, Math.PI * 2); g.fill();
    for (const [ox, oy, r] of [[-10, 0, 11], [8, -3, 12], [0, 4, 10]]) {
      g.fillStyle = '#1e6b24';
      g.beginPath(); g.arc(x + ox * s, y + oy * s, r * s, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#43a047';
    g.beginPath(); g.arc(x - 3 * s, y - 4 * s, 5 * s, 0, Math.PI * 2); g.fill();
  }
  // Rocks.
  for (let i = 0; i < 26; i++) {
    const x = 50 + rng() * (WORLD.w - 100);
    const y = 50 + rng() * (WORLD.h - 100);
    if (nearLane(x, y, 90) || riverDist(x, y) < 105) continue;
    const s = 0.7 + rng() * 1.1;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(x + 5, y + 8, 16 * s, 6 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#78909c';
    g.beginPath();
    g.moveTo(x - 14 * s, y + 6 * s);
    g.lineTo(x - 8 * s, y - 10 * s);
    g.lineTo(x + 8 * s, y - 12 * s);
    g.lineTo(x + 15 * s, y + 6 * s);
    g.closePath();
    g.fill();
    g.fillStyle = '#b0bec5';
    g.beginPath();
    g.moveTo(x - 8 * s, y - 10 * s);
    g.lineTo(x + 8 * s, y - 12 * s);
    g.lineTo(x + 2 * s, y - 2 * s);
    g.closePath();
    g.fill();
  }

  // Small decorative details (static, painted once — zero runtime cost):
  // wild grass tufts, flowers, pebbles, lane cracks, puddles, mushrooms,
  // fallen leaves, river ripples + stones, lane edge stones, footprints.
  // Kept off lanes (except lane dressing), turrets, bushes, camps, bases
  // and the pit, and subtle enough never to hide a unit or text.
  const clearOf = (x, y, pad) => {
    if (Math.hypot(x - BASES.A.x, y - BASES.A.y) < 190 + pad) return false;
    if (Math.hypot(x - BASES.B.x, y - BASES.B.y) < 190 + pad) return false;
    if (CAMPS.some((c) => Math.hypot(x - c.x, y - c.y) < 95 + pad)) return false;
    if (TURRET_SPOTS.some((t) => Math.hypot(x - t.x, y - t.y) < 95 + pad)) return false;
    if (WALLS.some((w) => x > w.x - 30 - pad && x < w.x + w.w + 30 + pad && y > w.y - 30 - pad && y < w.y + w.h + 30 + pad)) return false;
    if (BUSHES.some((b) => Math.hypot(x - b.x, y - b.y) < bushRadius(b) + 20 + pad)) return false;
    return true;
  };
  // Wild grass tufts: denser in the jungle, sparse near lanes.
  for (let i = 0; i < 240; i++) {
    const x = 40 + rng() * (WORLD.w - 80);
    const y = 40 + rng() * (WORLD.h - 80);
    if (nearLane(x, y, 70) || riverDist(x, y) < 95 || !clearOf(x, y, 0)) continue;
    const jungle = !nearLane(x, y, 200) && riverDist(x, y) > 200;
    if (!jungle && rng() < 0.6) continue; // lanes stay cleaner
    g.strokeStyle = rng() > 0.5 ? 'rgba(25, 100, 30, 0.55)' : 'rgba(90, 170, 60, 0.5)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      const ox = (rng() - 0.5) * 10;
      g.beginPath();
      g.moveTo(x + ox, y);
      g.lineTo(x + ox + (rng() - 0.5) * 6, y - 7 - rng() * 7);
      g.stroke();
    }
  }
  // Flowers: tiny white/yellow/pink dots on the grass.
  const FLOWER_COLS = ['#ffffff', '#ffeb3b', '#f48fb1', '#ce93d8'];
  for (let i = 0; i < 90; i++) {
    const x = 40 + rng() * (WORLD.w - 80);
    const y = 40 + rng() * (WORLD.h - 80);
    if (nearLane(x, y, 75) || riverDist(x, y) < 100 || !clearOf(x, y, 0)) continue;
    g.fillStyle = FLOWER_COLS[Math.floor(rng() * FLOWER_COLS.length)];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      g.beginPath(); g.arc(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, 1.8, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ff8f00';
    g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
  }
  // Pebbles and small stones.
  for (let i = 0; i < 130; i++) {
    const x = 40 + rng() * (WORLD.w - 80);
    const y = 40 + rng() * (WORLD.h - 80);
    if (nearLane(x, y, 60) || !clearOf(x, y, 0)) continue;
    const s = 2 + rng() * 3;
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(x + 1, y + 2, s, s * 0.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = rng() > 0.5 ? '#9e9e9e' : '#8d8d8d';
    g.beginPath(); g.ellipse(x, y, s, s * 0.7, rng() * Math.PI, 0, Math.PI * 2); g.fill();
  }
  // Lane dressing: cracks, footprints, edge stones along the paving.
  for (const lane of Object.values(LANE_PATHS)) {
    const path = lane.A;
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, y1] = path[i]; const [x2, y2] = path[i + 1];
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const steps = Math.floor(segLen / 90);
      for (let sIdx = 0; sIdx < steps; sIdx++) {
        const t = (sIdx + 0.5) / steps;
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;
        // Crack: a short dark jagged line on the paving.
        if (rng() < 0.5) {
          const cx = px + (rng() - 0.5) * 60;
          const cy = py + (rng() - 0.5) * 60;
          g.strokeStyle = 'rgba(60, 45, 20, 0.4)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + 8 + rng() * 8, cy + (rng() - 0.5) * 10);
          g.lineTo(cx + 16 + rng() * 8, cy + (rng() - 0.5) * 10);
          g.stroke();
        }
        // Footprints: faint ovals marching along the lane.
        if (rng() < 0.6) {
          const perp = ang + Math.PI / 2;
          const fx = px + Math.cos(perp) * (rng() - 0.5) * 40;
          const fy = py + Math.sin(perp) * (rng() - 0.5) * 40;
          g.fillStyle = 'rgba(60, 45, 20, 0.28)';
          for (let k = 0; k < 3; k++) {
            const ox = Math.cos(ang) * k * 14;
            const oy = Math.sin(ang) * k * 14;
            g.beginPath();
            g.ellipse(fx + ox, fy + oy, 4, 2.5, ang, 0, Math.PI * 2);
            g.fill();
          }
        }
        // Edge stones: small border rocks flanking the lane.
        if (rng() < 0.7) {
          const side = rng() > 0.5 ? 1 : -1;
          const perp = ang + Math.PI / 2;
          const ex = px + Math.cos(perp) * 58 * side;
          const ey = py + Math.sin(perp) * 58 * side;
          g.fillStyle = '#8d8d8d';
          g.beginPath(); g.arc(ex, ey, 4 + rng() * 3, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.25)';
          g.beginPath(); g.arc(ex - 1.5, ey - 1.5, 2, 0, Math.PI * 2); g.fill();
        }
      }
    }
  }
  // Puddles: small still-water ellipses near the river.
  for (let i = 0; i < 12; i++) {
    const t = rng();
    const x = 100 + t * 2200;
    const y = 180 + t * 1240 + (rng() > 0.5 ? 110 + rng() * 60 : -110 - rng() * 60);
    if (x < 40 || x > WORLD.w - 40 || y < 40 || y > WORLD.h - 40) continue;
    if (nearLane(x, y, 80) || !clearOf(x, y, 10)) continue;
    g.fillStyle = 'rgba(90, 150, 200, 0.5)';
    g.beginPath(); g.ellipse(x, y, 26 + rng() * 18, 12 + rng() * 8, rng() * Math.PI, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(x - 8, y - 3, 10, 3, -0.4, 0, Math.PI * 2); g.fill();
  }
  // Mushrooms in the jungle (away from lanes and the river).
  for (let i = 0; i < 26; i++) {
    const x = 60 + rng() * (WORLD.w - 120);
    const y = 60 + rng() * (WORLD.h - 120);
    if (nearLane(x, y, 160) || riverDist(x, y) < 160 || !clearOf(x, y, 0)) continue;
    const s = 0.8 + rng() * 0.7;
    g.fillStyle = '#e8e0cc';
    g.fillRect(x - 1.5 * s, y - 2 * s, 3 * s, 6 * s);
    g.fillStyle = rng() > 0.4 ? '#d32f2f' : '#7b1fa2';
    g.beginPath(); g.arc(x, y - 2 * s, 5 * s, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(x - 1.5 * s, y - 4 * s, 1 * s, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + 2 * s, y - 3 * s, 0.8 * s, 0, Math.PI * 2); g.fill();
  }
  // Fallen leaves: small orange/brown ovals on the grass.
  for (let i = 0; i < 110; i++) {
    const x = 40 + rng() * (WORLD.w - 80);
    const y = 40 + rng() * (WORLD.h - 80);
    if (nearLane(x, y, 70) || riverDist(x, y) < 95 || !clearOf(x, y, 0)) continue;
    g.fillStyle = ['rgba(200, 130, 40, 0.55)', 'rgba(170, 90, 30, 0.5)', 'rgba(140, 110, 40, 0.5)'][Math.floor(rng() * 3)];
    g.beginPath(); g.ellipse(x, y, 4 + rng() * 3, 2.5, rng() * Math.PI, 0, Math.PI * 2); g.fill();
  }
  // River ripples + half-submerged stones along the banks.
  for (let i = 0; i < 36; i++) {
    const t = rng();
    const x = -20 + t * 2440;
    const y = 180 + t * 1240 + (rng() - 0.5) * 90;
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, 8 + rng() * 10, 0.2, Math.PI - 0.4);
    g.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const t = rng();
    const side = rng() > 0.5 ? 1 : -1;
    const x = 40 + t * 2320;
    const y = 180 + t * 1240 + side * (75 + rng() * 25);
    g.fillStyle = '#78909c';
    g.beginPath(); g.arc(x, y, 7 + rng() * 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath(); g.arc(x - 2, y - 2, 3, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function getMapCanvas() {
  if (!mapCanvas) mapCanvas = buildMapCanvas();
  return mapCanvas;
}

// ---- World entities ---------------------------------------------------------

function hpBar(ctx, x, y, w, pct, color = '#4caf50') {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x - w / 2, y, w, 6);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2 + 1, y + 1, Math.max(0, (w - 2) * clamp(pct, 0, 1)), 4);
}

function drawTurret(ctx, t, time, m) {
  if (!t.alive) {
    // Rubble where a turret fell.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ellipse(ctx, t.x, t.y + 12, 30, 10);
    ctx.fill();
    ctx.fillStyle = '#5d5346';
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.translate(t.x - 18 + i * 9, t.y + 6 + (i % 2) * 6);
      ctx.rotate(i * 0.7);
      ctx.fillRect(-6, -4, 12, 8);
      ctx.restore();
    }
    return;
  }
  const tc = TEAM_COLOR[t.team];
  // Range circle: faint normally, bright while firing or when the player
  // hero is near, so the player always knows the danger zone.
  const p = m ? m.player : null;
  const nearPlayer = p && p.alive && Math.hypot(p.x - t.x, p.y - t.y) < t.range + 160;
  const hot = t.firing > 0 || nearPlayer;
  ctx.save();
  ctx.globalAlpha = hot ? 0.4 : 0.12;
  ctx.strokeStyle = tc;
  ctx.lineWidth = hot ? 2.5 : 1.5;
  ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2); ctx.stroke();
  if (hot) {
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = tc;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Shield bubble while the turret is protected by the destruction order.
  if (m && !turretAttackable(m, t)) {
    const pulse = 1 + Math.sin(time * 2.5) * 0.04;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath(); ctx.arc(t.x, t.y - 10, 52 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#b3e5fc';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x, t.y - 10, 52 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    text(ctx, '🛡', t.x + 40, t.y - 66, 16, '#b3e5fc');
  }
  // The base turret is bigger than lane turrets: it is the final objective.
  const sc = t.tier === 'base' ? 1.25 : 1;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.scale(sc, sc);
  ctx.translate(-t.x, -t.y);
  // Shadow + platform.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ellipse(ctx, t.x, t.y + 26, 34, 12);
  ctx.fill();
  ctx.fillStyle = '#6d6252';
  ellipse(ctx, t.x, t.y + 20, 36, 14);
  ctx.fill();
  ctx.fillStyle = '#8d8171';
  ellipse(ctx, t.x, t.y + 18, 32, 12);
  ctx.fill();
  // Tower body: tapered stone with brick courses.
  ctx.fillStyle = '#9a8f7d';
  ctx.beginPath();
  ctx.moveTo(t.x - 22, t.y + 18);
  ctx.lineTo(t.x - 16, t.y - 34);
  ctx.lineTo(t.x + 16, t.y - 34);
  ctx.lineTo(t.x + 22, t.y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const yy = t.y + 8 - i * 12;
    ctx.beginPath(); ctx.moveTo(t.x - 21 + i, yy); ctx.lineTo(t.x + 21 - i, yy); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(t.x - 22, t.y + 18);
  ctx.lineTo(t.x - 16, t.y - 34);
  ctx.lineTo(t.x - 8, t.y - 34);
  ctx.lineTo(t.x - 12, t.y + 18);
  ctx.closePath();
  ctx.fill();
  // Crenellated top.
  ctx.fillStyle = '#7a6f5d';
  ctx.fillRect(t.x - 19, t.y - 44, 38, 12);
  for (let i = 0; i < 4; i++) ctx.fillRect(t.x - 19 + i * 10, t.y - 52, 7, 9);
  // Team crystal with glow.
  const pulse = 1 + Math.sin(time * 3) * 0.12;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = tc;
  circle(ctx, t.x, t.y - 62, 14 * pulse);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = tc;
  ctx.beginPath();
  ctx.moveTo(t.x, t.y - 76);
  ctx.lineTo(t.x + 9, t.y - 62);
  ctx.lineTo(t.x, t.y - 48);
  ctx.lineTo(t.x - 9, t.y - 62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.moveTo(t.x, t.y - 76);
  ctx.lineTo(t.x + 4, t.y - 64);
  ctx.lineTo(t.x, t.y - 60);
  ctx.lineTo(t.x - 4, t.y - 64);
  ctx.closePath();
  ctx.fill();
  // Banner.
  ctx.fillStyle = tc;
  ctx.beginPath();
  ctx.moveTo(t.x + 20, t.y - 30);
  ctx.lineTo(t.x + 34, t.y - 26);
  ctx.lineTo(t.x + 30, t.y - 18);
  ctx.lineTo(t.x + 20, t.y - 20);
  ctx.closePath();
  ctx.fill();
  // Hit flash.
  if (t.flash > 0) {
    ctx.globalAlpha = Math.min(0.6, t.flash * 4);
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, t.x, t.y - 10, 26, 40);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  hpBar(ctx, t.x, t.y - 88, 56, t.hp / t.maxHp, t.team === 'A' ? '#4fc3f7' : '#ef5350');
  text(ctx, t.tier === 'base' ? 'BASE' : `${t.tier.toUpperCase()} ${t.lane.toUpperCase()}`, t.x, t.y - 98, 10, 'rgba(255,255,255,0.85)', 'center', 'bold');
  ctx.restore();
}

function drawBase(ctx, team, time) {
  const b = BASES[team];
  const tc = TEAM_COLOR[team];
  // Walls: an arc of stone blocks around the platform.
  ctx.fillStyle = '#8d8171';
  for (let i = 0; i < 12; i++) {
    const a = team === 'A' ? Math.PI * (0.03 + i * 0.08) : Math.PI * (1.03 + i * 0.08);
    const wx = b.x + Math.cos(a) * 118;
    const wy = b.y + Math.sin(a) * 118;
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillRect(-15, -8, 30, 16);
    ctx.restore();
  }
  // Keep: stone building with a pitched roof.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ellipse(ctx, b.x, b.y + 34, 52, 16);
  ctx.fill();
  ctx.fillStyle = '#9a8f7d';
  rr(ctx, b.x - 34, b.y - 26, 68, 56, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(b.x - 34, b.y - 6); ctx.lineTo(b.x + 34, b.y - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(b.x - 34, b.y + 12); ctx.lineTo(b.x + 34, b.y + 12); ctx.stroke();
  // Roof.
  ctx.fillStyle = tc;
  ctx.beginPath();
  ctx.moveTo(b.x - 42, b.y - 24);
  ctx.lineTo(b.x, b.y - 58);
  ctx.lineTo(b.x + 42, b.y - 24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(b.x - 42, b.y - 24);
  ctx.lineTo(b.x, b.y - 58);
  ctx.lineTo(b.x - 6, b.y - 24);
  ctx.closePath();
  ctx.fill();
  // Gate.
  ctx.fillStyle = '#3e3428';
  ctx.beginPath();
  ctx.arc(b.x, b.y + 30, 14, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(b.x - 14, b.y + 28, 28, 4);
  // Big team crystal above the keep.
  const pulse = 1 + Math.sin(time * 2) * 0.1;
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = tc;
  circle(ctx, b.x, b.y - 78, 22 * pulse);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = tc;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y - 100);
  ctx.lineTo(b.x + 13, b.y - 78);
  ctx.lineTo(b.x, b.y - 56);
  ctx.lineTo(b.x - 13, b.y - 78);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(b.x, b.y - 100);
  ctx.lineTo(b.x + 5, b.y - 80);
  ctx.lineTo(b.x, b.y - 74);
  ctx.lineTo(b.x - 5, b.y - 80);
  ctx.closePath();
  ctx.fill();
  // Flags.
  for (const side of [-1, 1]) {
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(b.x + side * 52, b.y - 10); ctx.lineTo(b.x + side * 52, b.y - 52); ctx.stroke();
    ctx.fillStyle = tc;
    ctx.beginPath();
    ctx.moveTo(b.x + side * 52, b.y - 52);
    ctx.lineTo(b.x + side * 52 + side * 20, b.y - 47);
    ctx.lineTo(b.x + side * 52, b.y - 40);
    ctx.closePath();
    ctx.fill();
  }
  text(ctx, team === 'A' ? 'AZURE BASE' : 'CRIMSON BASE', b.x, b.y + 56, 11, 'rgba(255,255,255,0.9)');
}

function drawMinion(ctx, mn) {
  const tc = TEAM_COLOR[mn.team];
  const melee = mn.range <= 120;
  const sup = !!mn.super;
  // Super minions: bigger, gold-armoured, glowing — unmistakable at a
  // glance, so the player knows a lane is empowered.
  if (sup) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 2.5;
    ellipse(ctx, mn.x, mn.y + 10, 20, 9);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(mn.x, mn.y);
  ctx.scale(sup ? 1.25 : 1, sup ? 1.25 : 1);
  ctx.translate(-mn.x, -mn.y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ellipse(ctx, mn.x, mn.y + 10, 11, 4.5);
  ctx.fill();
  const bob = Math.sin((mn.walkPhase || 0) * 2) * 1.2;
  const y = mn.y + bob;
  // Legs.
  ctx.fillStyle = '#2b2b3a';
  ctx.fillRect(mn.x - 5, y + 4, 4, 7);
  ctx.fillRect(mn.x + 1, y + 4, 4, 7);
  // Body: team-coloured tunic.
  ctx.fillStyle = tc;
  rr(ctx, mn.x - 7, y - 6, 14, 12, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  rr(ctx, mn.x - 7, y - 6, 14, 4, 4);
  ctx.fill();
  // Head + helmet (gold for super minions).
  ctx.fillStyle = '#f1c27d';
  circle(ctx, mn.x, y - 10, 6);
  ctx.fill();
  ctx.fillStyle = sup ? '#d4af37' : melee ? '#90a4ae' : '#6d4c41';
  ctx.beginPath();
  ctx.arc(mn.x, y - 11, 6.5, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  if (melee) {
    // Sword + shield.
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(mn.x + 8, y - 4);
    ctx.lineTo(mn.x + 14, y - 12);
    ctx.stroke();
    ctx.fillStyle = '#b0bec5';
    circle(ctx, mn.x - 8, y - 2, 4.5);
    ctx.fill();
  } else {
    // Bow.
    ctx.strokeStyle = '#8d6e63';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mn.x + 8, y - 4, 8, -1.2, 1.2);
    ctx.stroke();
  }
  if (mn.flash > 0) {
    ctx.globalAlpha = Math.min(0.6, mn.flash * 4);
    ctx.fillStyle = '#ffffff';
    circle(ctx, mn.x, y, 11);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (mn.hp < mn.maxHp) hpBar(ctx, mn.x, y - 22, 22, mn.hp / mn.maxHp);
  ctx.restore();
  // Gold star above super minions (unscaled, so it stays crisp).
  if (sup) text(ctx, '★', mn.x, y - 30, 12, '#ffd60a');
}

function drawMonster(ctx, mo, time) {
  const brute = mo.maxHp > 500;
  const s = brute ? 1.5 : 1;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ellipse(ctx, mo.x, mo.y + 12 * s, 16 * s, 6 * s);
  ctx.fill();
  const bob = Math.sin(time * 2 + mo.campIdx) * 1.5;
  if (brute) {
    // Boar brute: bulky brown body, snout, tusks, angry eyes.
    ctx.fillStyle = '#5d4037';
    for (const [lx, ly] of [[-10, 6], [10, 6], [-10, -6], [10, -6]]) ctx.fillRect(mo.x + lx - 2, mo.y + ly, 5, 8);
    ctx.fillStyle = '#795548';
    ellipse(ctx, mo.x, mo.y + bob, 22 * s, 15 * s);
    ctx.fill();
    ctx.fillStyle = '#8d6e63';
    ellipse(ctx, mo.x - 4, mo.y + bob - 4, 14 * s, 9 * s);
    ctx.fill();
    // Head.
    ctx.fillStyle = '#795548';
    circle(ctx, mo.x + 18 * s, mo.y + bob, 11 * s);
    ctx.fill();
    ctx.fillStyle = '#a1887f';
    ellipse(ctx, mo.x + 26 * s, mo.y + bob + 2, 6 * s, 4.5 * s);
    ctx.fill();
    ctx.fillStyle = '#3e2723';
    circle(ctx, mo.x + 24 * s, mo.y + bob + 2, 1.5);
    ctx.fill();
    circle(ctx, mo.x + 28 * s, mo.y + bob + 2, 1.5);
    ctx.fill();
    // Tusks.
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(mo.x + 20 * s, mo.y + bob + 6); ctx.lineTo(mo.x + 24 * s, mo.y + bob + 12); ctx.lineTo(mo.x + 27 * s, mo.y + bob + 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(mo.x + 14 * s, mo.y + bob + 8); ctx.lineTo(mo.x + 15 * s, mo.y + bob + 13); ctx.lineTo(mo.x + 19 * s, mo.y + bob + 7); ctx.closePath(); ctx.fill();
    // Eyes + ears.
    ctx.fillStyle = '#ff5252';
    circle(ctx, mo.x + 16 * s, mo.y + bob - 6, 2.5);
    ctx.fill();
    ctx.fillStyle = '#5d4037';
    ctx.beginPath(); ctx.moveTo(mo.x + 12 * s, mo.y + bob - 8); ctx.lineTo(mo.x + 16 * s, mo.y + bob - 16); ctx.lineTo(mo.x + 20 * s, mo.y + bob - 8); ctx.closePath(); ctx.fill();
  } else {
    // Imp: small green creature with horns and a tail.
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mo.x - 8 * s, mo.y + 4);
    ctx.quadraticCurveTo(mo.x - 16 * s, mo.y + 10, mo.x - 12 * s, mo.y + 14);
    ctx.stroke();
    ctx.fillStyle = '#43a047';
    ellipse(ctx, mo.x, mo.y + bob, 11 * s, 9 * s);
    ctx.fill();
    ctx.fillStyle = '#66bb6a';
    ellipse(ctx, mo.x - 2, mo.y + bob - 3, 7 * s, 5 * s);
    ctx.fill();
    ctx.fillStyle = '#fff';
    circle(ctx, mo.x + 3, mo.y + bob - 3, 2.5);
    ctx.fill();
    circle(ctx, mo.x - 4, mo.y + bob - 3, 2.5);
    ctx.fill();
    ctx.fillStyle = '#111';
    circle(ctx, mo.x + 3, mo.y + bob - 3, 1.2);
    ctx.fill();
    circle(ctx, mo.x - 4, mo.y + bob - 3, 1.2);
    ctx.fill();
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath(); ctx.moveTo(mo.x - 7, mo.y + bob - 6); ctx.lineTo(mo.x - 9, mo.y + bob - 12); ctx.lineTo(mo.x - 4, mo.y + bob - 7); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(mo.x + 7, mo.y + bob - 6); ctx.lineTo(mo.x + 9, mo.y + bob - 12); ctx.lineTo(mo.x + 4, mo.y + bob - 7); ctx.closePath(); ctx.fill();
  }
  if (mo.flash > 0) {
    ctx.globalAlpha = Math.min(0.6, mo.flash * 4);
    ctx.fillStyle = '#ffffff';
    circle(ctx, mo.x, mo.y, 16 * s);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (mo.hp < mo.maxHp) hpBar(ctx, mo.x, mo.y - 24 * s, 30 * s, mo.hp / mo.maxHp, '#ffb74d');
}

// ---- Projectiles & effects ---------------------------------------------------

function drawProjectile(ctx, p, time) {
  const ang = Math.atan2(p.vy, p.vx);
  // Trail.
  if (p.trail && p.trail.length > 1) {
    ctx.strokeStyle = p.color;
    ctx.lineCap = 'round';
    for (let i = 1; i < p.trail.length; i++) {
      ctx.globalAlpha = (i / p.trail.length) * 0.5;
      ctx.lineWidth = 5 * (i / p.trail.length);
      ctx.beginPath();
      ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
      ctx.lineTo(p.trail[i].x, p.trail[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  switch (p.shape) {
    case 'arrow': {
      ctx.strokeStyle = '#d7ccc8';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath(); ctx.moveTo(10, -4); ctx.lineTo(20, 0); ctx.lineTo(10, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(-18, 0); ctx.lineTo(-14, 4); ctx.closePath(); ctx.fill();
      break;
    }
    case 'shell': {
      ctx.fillStyle = '#fff59d';
      ellipse(ctx, 0, 0, 10, 3);
      ctx.fill();
      ctx.fillStyle = p.color;
      circle(ctx, 6, 0, 3);
      ctx.fill();
      break;
    }
    case 'dagger': {
      ctx.rotate(time * 14);
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath(); ctx.moveTo(-10, -2.5); ctx.lineTo(6, -2); ctx.lineTo(12, 0); ctx.lineTo(6, 2); ctx.lineTo(-10, 2.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(-14, -1.5, 5, 3);
      break;
    }
    default: {
      // Glowing orb / magic bolt.
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = p.color;
      circle(ctx, 0, 0, 10);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.color;
      circle(ctx, 0, 0, 6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      circle(ctx, -1.5, -1.5, 2.5);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawFx(ctx, f) {
  const p = clamp(f.t / f.life, 0, 1);
  const fade = 1 - p;
  ctx.save();
  switch (f.kind) {
    case 'ring': {
      const r = f.r + (f.maxR - f.r) * p;
      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3.5 * fade + 1;
      circle(ctx, f.x, f.y, r);
      ctx.stroke();
      break;
    }
    case 'aoe': {
      // Themed AoE ground circle: fill + ring + themed glyphs.
      ctx.globalAlpha = fade * 0.45;
      ctx.fillStyle = f.color;
      circle(ctx, f.x, f.y, f.radius * (0.7 + 0.3 * p));
      ctx.fill();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      circle(ctx, f.x, f.y, f.radius * (0.7 + 0.3 * p));
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + p;
        const gx = f.x + Math.cos(a) * f.radius * 0.55;
        const gy = f.y + Math.sin(a) * f.radius * 0.55;
        if (f.theme === 'ice') {
          ctx.save(); ctx.translate(gx, gy); ctx.rotate(a);
          ctx.fillRect(-2, -7, 4, 14); ctx.restore();
        } else if (f.theme === 'lightning') {
          ctx.save(); ctx.translate(gx, gy); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-3, 0); ctx.lineTo(2, 0); ctx.lineTo(-2, 7); ctx.lineTo(4, -1); ctx.lineTo(0, -1); ctx.closePath(); ctx.fill();
          ctx.restore();
        } else {
          circle(ctx, gx, gy, 3.5);
          ctx.fill();
        }
      }
      break;
    }
    case 'trail': {
      // Dash trail: a fading streak from the start point to the end.
      ctx.globalAlpha = fade * 0.7;
      ctx.strokeStyle = f.color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.globalAlpha = fade * 0.9;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      break;
    }
    case 'strike': {
      // Melee strike at the target, matched to the attack style.
      ctx.globalAlpha = fade;
      ctx.strokeStyle = f.color;
      ctx.lineCap = 'round';
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      if (f.style === 'claw') {
        ctx.lineWidth = 3.5;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(-16, i * 9 - 8);
          ctx.lineTo(14, i * 9 + 8);
          ctx.stroke();
        }
      } else if (f.style === 'smash') {
        ctx.lineWidth = 4;
        circle(ctx, 0, 0, 10 + p * 22);
        ctx.stroke();
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
          ctx.lineTo(Math.cos(a) * 24, Math.sin(a) * 24);
          ctx.stroke();
        }
      } else if (f.style === 'dagger') {
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(-16, -10); ctx.lineTo(16, 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-16, 10); ctx.lineTo(16, -10); ctx.stroke();
      } else {
        // Sword slash arc.
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 24, -1.1 + p * 0.8, 0.7 + p * 0.8);
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = f.color;
        ctx.beginPath();
        ctx.arc(0, 0, 30, -1.1 + p * 0.8, 0.7 + p * 0.8);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'slashX': {
      ctx.globalAlpha = fade;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(f.x - 22, f.y - 22); ctx.lineTo(f.x + 22, f.y + 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(f.x + 22, f.y - 22); ctx.lineTo(f.x - 22, f.y + 22); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f.x - 22, f.y - 22); ctx.lineTo(f.x + 22, f.y + 22); ctx.stroke();
      break;
    }
    case 'heal': {
      ctx.globalAlpha = fade;
      ctx.fillStyle = f.color;
      for (let i = 0; i < 3; i++) {
        const hx = f.x - 12 + i * 12;
        const hy = f.y - 10 - p * 34 - i * 6;
        ctx.fillRect(hx - 1.5, hy - 6, 3, 12);
        ctx.fillRect(hx - 6, hy - 1.5, 12, 3);
      }
      ctx.globalAlpha = fade * 0.4;
      circle(ctx, f.x, f.y, 22 + p * 10);
      ctx.fill();
      break;
    }
    case 'aura': {
      ctx.globalAlpha = fade * 0.8;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ellipse(ctx, f.x, f.y + 14, 26 + p * 10, 11 + p * 4);
      ctx.stroke();
      break;
    }
    default: break;
  }
  ctx.restore();
}

// Tall grass blades drawn OVER heroes standing in a bush, so they look
// half-covered. Positions are seeded once so they never jitter.
const BUSH_BLADES = (() => {
  const rng = mulberry32(777);
  return BUSHES.map((b) => {
    const blades = [];
    const c = Math.cos(b.rot); const s = Math.sin(b.rot);
    for (let i = 0; i < 16; i++) {
      const lx = (rng() - 0.5) * (b.w - 16);
      const ly = (rng() - 0.5) * (b.h - 10);
      blades.push({ x: b.x + lx * c - ly * s, y: b.y + lx * s + ly * c, h: 14 + rng() * 10, lean: (rng() - 0.5) * 8 });
    }
    return blades;
  });
})();

// ---- Hero sprite (world space) ----------------------------------------------

function drawHeroSprite(ctx, h, cam, time) {
  // A hidden enemy hero is invisible to the player's team: don't draw it
  // (or its nameplate) at all.
  if (h.hidden && h.team !== 'A') return;
  // Called inside drawWorld's translated context: draw at WORLD coordinates.
  const ssx = h.x - cam.x + VIEW_W / 2;
  const ssy = h.y - cam.y + VIEW_H / 2;
  if (ssx < -70 || ssx > VIEW_W + 70 || ssy < -100 || ssy > VIEW_H + 90) return;
  if (!h.alive) {
    // Ghost marker while dead.
    ctx.globalAlpha = 0.4;
    drawHeroFigure(ctx, h.def, h.x, h.y, 1, h.facing, h.team, { time, walkPhase: 0 });
    ctx.globalAlpha = 1;
    return;
  }
  // Hidden allies stay visible to the player, marked with a green ring.
  if (h.hidden && h.team === 'A') {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#7CFC00';
    ctx.lineWidth = 2;
    ellipse(ctx, h.x, h.y + 16, 28, 12);
    ctx.stroke();
    ctx.restore();
  }
  drawHeroFigure(ctx, h.def, h.x, h.y, 1, h.facing, h.team, {
    time, walkPhase: h.walkPhase, flash: h.flash,
    attackAnim: h.attackAnim, castAnim: h.castAnim, animKind: h.animKind,
    seed: h.uid,
  });
  // Shield bubble.
  if (h.shield > 0) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#80ed99';
    circle(ctx, h.x, h.y - 4, 26);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#b7e4c7';
    ctx.lineWidth = 2;
    circle(ctx, h.x, h.y - 4, 26);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Slow / stun indicators.
  if (h.stunUntil > 0) {
    text(ctx, '★', h.x, h.y - 52, 14, '#ffd60a');
  }
  // Nameplate: HP bar + name + level. Clamped so it never leaves the top
  // of the screen (plate goes BELOW the hero near the top edge) and never
  // runs off the left/right edges (plate shifts inward).
  const above = ssy > 72;
  const plateY = above ? h.y - 52 : h.y + 34;
  const nameY = above ? h.y - 64 : h.y + 46;
  const shiftX = ssx < 46 ? 46 - ssx : ssx > VIEW_W - 46 ? VIEW_W - 46 - ssx : 0;
  const px = h.x + shiftX;
  const lvlX = px - 30;
  hpBar(ctx, px, plateY, 44, h.hp / h.maxHp, h.team === 'A' ? '#4fc3f7' : '#ef5350');
  // Mana sliver.
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(px - 22, plateY + 7, 44, 3);
  ctx.fillStyle = '#42a5f5';
  ctx.fillRect(px - 21, plateY + 7.5, 42 * clamp(h.mana / h.maxMana, 0, 1), 2);
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(h.name, px, nameY);
  ctx.fillStyle = h.isPlayer ? '#ffd60a' : '#ffffff';
  ctx.fillText(h.name, px, nameY);
  // Level badge.
  ctx.fillStyle = h.team === 'A' ? '#1565c0' : '#b71c1c';
  circle(ctx, lvlX, plateY + 3, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  circle(ctx, lvlX, plateY + 3, 8);
  ctx.stroke();
  text(ctx, `${h.level}`, lvlX, plateY + 3, 10, '#ffffff');
  // Player marker.
  if (h.isPlayer) {
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.moveTo(h.x, h.y - (above ? 76 : -52));
    ctx.lineTo(h.x - 6, h.y - (above ? 86 : -62));
    ctx.lineTo(h.x + 6, h.y - (above ? 86 : -62));
    ctx.closePath();
    ctx.fill();
  }
}

// ---- World -------------------------------------------------------------------

function drawWorld(ctx, m, cam, time) {
  ctx.save();
  ctx.translate(-cam.x + VIEW_W / 2, -cam.y + VIEW_H / 2);
  // Blit only the visible slice of the pre-rendered map.
  const map = getMapCanvas();
  const vx = clamp(cam.x - VIEW_W / 2, 0, WORLD.w - 1);
  const vy = clamp(cam.y - VIEW_H / 2, 0, WORLD.h - 1);
  const vw = Math.min(VIEW_W, WORLD.w - vx);
  const vh = Math.min(VIEW_H, WORLD.h - vy);
  ctx.drawImage(map, vx, vy, vw, vh, vx, vy, vw, vh);
  // River shimmer: a moving highlight along the river band.
  ctx.save();
  ctx.globalAlpha = 0.25 + Math.sin(time * 1.5) * 0.1;
  ctx.strokeStyle = '#b3e5fc';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  const shimmer = (time * 60) % 2600;
  ctx.beginPath();
  ctx.moveTo(-40 + shimmer * 0.4, 180 + shimmer * 0.2);
  ctx.lineTo(120 + shimmer * 0.4, 260 + shimmer * 0.2);
  ctx.stroke();
  ctx.restore();

  drawBase(ctx, 'A', time);
  drawBase(ctx, 'B', time);
  for (const t of m.turrets) drawTurret(ctx, t, time, m);
  for (const mo of m.monsters) if (mo.alive) drawMonster(ctx, mo, time);
  for (const mn of m.minions) if (mn.alive) drawMinion(ctx, mn);
  // Y-sort heroes so closer figures overlap correctly.
  const sorted = [...m.heroes].sort((a, b) => a.y - b.y);
  for (const h of sorted) drawHeroSprite(ctx, h, cam, time);
  // Bush canopy: tall blades over anything standing inside a bush.
  ctx.strokeStyle = 'rgba(14, 75, 22, 0.9)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const blades of BUSH_BLADES) {
    for (const bl of blades) {
      const bsx = bl.x - cam.x + VIEW_W / 2;
      const bsy = bl.y - cam.y + VIEW_H / 2;
      if (bsx < -20 || bsx > VIEW_W + 20 || bsy < -30 || bsy > VIEW_H + 20) continue;
      ctx.beginPath();
      ctx.moveTo(bl.x, bl.y);
      ctx.lineTo(bl.x + bl.lean, bl.y - bl.h);
      ctx.stroke();
    }
  }
  for (const f of m.fx) drawFx(ctx, f);
  for (const p of m.projectiles) drawProjectile(ctx, p, time);
  // Particles.
  for (const pt of m.particles) {
    ctx.globalAlpha = 1 - pt.t / pt.life;
    ctx.fillStyle = pt.color;
    circle(ctx, pt.x, pt.y, pt.size);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Damage numbers.
  for (const d of m.dmgNums) {
    ctx.globalAlpha = 1 - d.t / 0.9;
    ctx.font = `bold ${d.crit ? 18 : 13}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(`${d.value}`, d.x, d.y);
    ctx.fillStyle = d.color;
    ctx.fillText(`${d.value}`, d.x, d.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---- HUD ----------------------------------------------------------------------

function drawMinimap(ctx, m) {
  const X = 12; const Y = 10; const W = 168; const H = 112;
  panel(ctx, X - 2, Y - 2, W + 4, H + 4);
  ctx.save();
  rr(ctx, X, Y, W, H, 8);
  ctx.clip();
  ctx.fillStyle = '#1e4d22';
  ctx.fillRect(X, Y, W, H);
  const sx = (wx) => X + (wx / WORLD.w) * W;
  const sy = (wy) => Y + (wy / WORLD.h) * H;
  // River.
  ctx.strokeStyle = '#42a5f5';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(sx(-40), sy(180));
  ctx.lineTo(sx(2440), sy(1420));
  ctx.stroke();
  // Lanes.
  ctx.strokeStyle = '#c9b18c';
  ctx.lineWidth = 3;
  for (const lane of Object.values(LANE_PATHS)) {
    ctx.beginPath();
    lane.A.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(sx(px), sy(py)) : ctx.lineTo(sx(px), sy(py))));
    ctx.stroke();
  }
  // Walls + bushes.
  ctx.fillStyle = '#9e9e9e';
  for (const w of WALLS) ctx.fillRect(sx(w.x), sy(w.y), Math.max(2, (w.w / WORLD.w) * W), Math.max(2, (w.h / WORLD.h) * H));
  for (const b of BUSHES) {
    ctx.save();
    ctx.translate(sx(b.x), sy(b.y));
    ctx.rotate(b.rot);
    const bw = (b.w / WORLD.w) * W;
    const bh = (b.h / WORLD.h) * H;
    ctx.fillStyle = '#1b5e20';
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.strokeStyle = '#66bb6a';
    ctx.lineWidth = 1;
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }
  // Bases.
  ctx.fillStyle = TEAM_COLOR.A;
  ctx.fillRect(sx(BASES.A.x) - 5, sy(BASES.A.y) - 5, 10, 10);
  ctx.fillStyle = TEAM_COLOR.B;
  ctx.fillRect(sx(BASES.B.x) - 5, sy(BASES.B.y) - 5, 10, 10);
  // Turrets: diamonds per tier; the base turret is a bigger diamond with
  // a ring — white while protected, gold once exposed.
  for (const t of m.turrets) {
    if (!t.alive) continue;
    const px = sx(t.x); const py = sy(t.y);
    ctx.fillStyle = TEAM_COLOR[t.team];
    const r = t.tier === 'base' ? 6 : t.tier === 'inner' ? 4.5 : 3.5;
    ctx.beginPath();
    ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py);
    ctx.closePath();
    ctx.fill();
    if (t.tier === 'base') {
      ctx.strokeStyle = baseExposed(m, t.team) ? '#ffd60a' : '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // Heroes (hidden enemies don't show on the minimap).
  for (const h of m.heroes) {
    if (!h.alive) continue;
    if (h.hidden && h.team !== 'A') continue;
    ctx.fillStyle = TEAM_COLOR[h.team];
    ctx.beginPath();
    ctx.arc(sx(h.x), sy(h.y), h.isPlayer ? 4.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (h.isPlayer) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx(h.x), sy(h.y), 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Camera viewport.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx(m.camera.x - VIEW_W / 2), sy(m.camera.y - VIEW_H / 2), (VIEW_W / WORLD.w) * W, (VIEW_H / WORLD.h) * H);
  ctx.restore();
  text(ctx, 'MINIMAP', X + W / 2, Y + H + 12, 9, 'rgba(255,255,255,0.6)');
}

function drawScoreBar(ctx, m) {
  const X = VIEW_W / 2 - 230; const Y = 8; const W = 460; const H = 64;
  panel(ctx, X, Y, W, H);
  text(ctx, `${m.kills.A}`, X + 46, Y + 21, 22, '#7bdff2');
  text(ctx, '—', X + 84, Y + 21, 18, '#888888');
  text(ctx, `${m.kills.B}`, X + 122, Y + 21, 22, '#ff8fa3');
  text(ctx, fmtTime(m.time), X + 210, Y + 21, 20, '#ffffff');
  text(ctx, 'TURRETS', X + 230, Y + 34, 8, 'rgba(255,255,255,0.55)');
  // Per team: base diamond (ringed white while protected, gold when
  // exposed) + 3 pips per lane (outer -> second -> inner, left to right).
  const turretRow = (team, ox, flip) => {
    const base = m.turrets.find((t) => t.team === team && t.tier === 'base');
    const bx = flip ? ox + 124 : ox + 8;
    ctx.fillStyle = base && base.alive ? TEAM_COLOR[team] : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(bx, Y + 42); ctx.lineTo(bx + 6, Y + 48); ctx.lineTo(bx, Y + 54); ctx.lineTo(bx - 6, Y + 48);
    ctx.closePath();
    ctx.fill();
    if (base && base.alive) {
      ctx.strokeStyle = baseExposed(m, team) ? '#ffd60a' : 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(bx, Y + 48, 9, 0, Math.PI * 2); ctx.stroke();
    }
    ['gold', 'mid', 'exp'].forEach((lane, li) => {
      ['outer', 'second', 'inner'].forEach((tier, ti) => {
        const t = m.turrets.find((x) => x.team === team && x.lane === lane && x.tier === tier);
        const px = ox + (flip ? 0 : 24) + li * 36 + ti * 11;
        ctx.fillStyle = t && t.alive ? TEAM_COLOR[team] : 'rgba(255,255,255,0.15)';
        circle(ctx, px, Y + 48, 4);
        ctx.fill();
      });
    });
  };
  turretRow('A', X + 16, false);
  turretRow('B', X + 312, true);
}

// Respawn timers for dead heroes (both teams), so the player can plan
// pushes and ganks around who is about to come back.
function drawDeadTimers(ctx, m) {
  const dead = m.heroes.filter((h) => !h.alive).sort((a, b) => a.respawn - b.respawn);
  if (dead.length === 0) return;
  const entryW = 72;
  const W = dead.length * entryW + 16;
  const X = VIEW_W / 2 - W / 2;
  const Y = 80; // below the taller score bar (ends at 72)
  panel(ctx, X, Y, W, 34, 'rgba(8, 12, 24, 0.72)', 'rgba(255,255,255,0.08)');
  dead.forEach((h, i) => {
    const cx = X + 8 + i * entryW + entryW / 2;
    drawPortrait(ctx, h.def, cx - 18, Y + 17, 12, { team: h.team, dim: true });
    text(ctx, `${Math.ceil(h.respawn)}s`, cx + 12, Y + 17, 13, h.team === 'A' ? '#7bdff2' : '#ff8fa3');
  });
}

// Big respawn countdown while the player's hero is dead.
function drawRespawnOverlay(ctx, m) {
  const p = m.player;
  if (!p || p.alive) return;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const W = 460; const H = 130;
  const X = VIEW_W / 2 - W / 2; const Y = 270;
  panel(ctx, X, Y, W, H, 'rgba(16, 10, 10, 0.92)', 'rgba(239, 83, 80, 0.5)');
  text(ctx, '☠  YOU DIED', VIEW_W / 2, Y + 30, 20, '#ef5350');
  text(ctx, `Respawn in ${Math.ceil(p.respawn)}s`, VIEW_W / 2, Y + 66, 30, '#ffffff');
  // Countdown progress bar.
  const barW = W - 80;
  const frac = p.respawnTotal > 0 ? clamp(1 - p.respawn / p.respawnTotal, 0, 1) : 0;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  rr(ctx, VIEW_W / 2 - barW / 2, Y + 88, barW, 10, 5);
  ctx.fill();
  ctx.fillStyle = '#ef5350';
  rr(ctx, VIEW_W / 2 - barW / 2, Y + 88, barW * frac, 10, 5);
  ctx.fill();
  text(ctx, 'You revive at base with full HP and mana. Gold and items are kept.', VIEW_W / 2, Y + 116, 11, 'rgba(255,255,255,0.6)');
}

function skillIcon(ctx, sk, x, y, r) {
  // Skill glyph by type.
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (sk.type) {
    case 'bolt': case 'volley': case 'nova': {
      circle(ctx, 0, 0, r * 0.45);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.lineTo(0, -r * 0.55);
      ctx.moveTo(0, r * 0.55);
      ctx.lineTo(0, r * 0.85);
      ctx.moveTo(-r * 0.85, 0);
      ctx.lineTo(-r * 0.55, 0);
      ctx.moveTo(r * 0.55, 0);
      ctx.lineTo(r * 0.85, 0);
      ctx.stroke();
      break;
    }
    case 'aoe': {
      circle(ctx, 0, 0, r * 0.7);
      ctx.stroke();
      circle(ctx, 0, 0, r * 0.3);
      ctx.fill();
      break;
    }
    case 'dash': case 'blink': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, r * 0.4);
      ctx.quadraticCurveTo(0, -r * 0.8, r * 0.7, r * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.7, r * 0.2);
      ctx.lineTo(r * 0.35, r * 0.05);
      ctx.lineTo(r * 0.45, r * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'execute': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.6);
      ctx.lineTo(r * 0.6, r * 0.6);
      ctx.moveTo(r * 0.6, -r * 0.6);
      ctx.lineTo(-r * 0.6, r * 0.6);
      ctx.stroke();
      break;
    }
    case 'heal': {
      ctx.fillRect(-r * 0.15, -r * 0.7, r * 0.3, r * 1.4);
      ctx.fillRect(-r * 0.7, -r * 0.15, r * 1.4, r * 0.3);
      break;
    }
    case 'shield': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.6);
      ctx.lineTo(r * 0.6, -r * 0.6);
      ctx.lineTo(r * 0.6, r * 0.1);
      ctx.quadraticCurveTo(r * 0.6, r * 0.6, 0, r * 0.8);
      ctx.quadraticCurveTo(-r * 0.6, r * 0.6, -r * 0.6, r * 0.1);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'buff': {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.8);
      ctx.lineTo(r * 0.25, -r * 0.25);
      ctx.lineTo(r * 0.8, -r * 0.2);
      ctx.lineTo(r * 0.4, r * 0.2);
      ctx.lineTo(r * 0.5, r * 0.75);
      ctx.lineTo(0, r * 0.45);
      ctx.lineTo(-r * 0.5, r * 0.75);
      ctx.lineTo(-r * 0.4, r * 0.2);
      ctx.lineTo(-r * 0.8, -r * 0.2);
      ctx.lineTo(-r * 0.25, -r * 0.25);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'drain': {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.65, 0.4, Math.PI * 1.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.55, -r * 0.55);
      ctx.lineTo(r * 0.2, -r * 0.1);
      ctx.lineTo(r * 0.7, -r * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: {
      circle(ctx, 0, 0, r * 0.4);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawSkillBar(ctx, ui, m) {
  const p = m.player;
  if (!p) return;
  const st = heroStats(p);
  const X = VIEW_W / 2 - 340; const Y = VIEW_H - 84; const W = 680; const H = 74;
  // Skill-points hint sits ABOVE the bar so it never overlaps the hint line.
  if (p.skillPts > 0) {
    text(ctx, `${p.skillPts} skill point${p.skillPts > 1 ? 's' : ''} — click + to upgrade`, VIEW_W / 2, Y - 12, 12, '#ffd60a');
  }
  // Active synergy sets, as chips above the bar's right end.
  const active = setProgress(p.items).filter((s) => s.complete);
  if (active.length > 0) {
    textFit(ctx, active.map((s) => `⬥ ${s.name} ✓`).join('   '), X + W - 8, Y - 12, 12, active[0].color, 260, 'right');
  }
  panel(ctx, X, Y, W, H);
  // Portrait + name + gold.
  drawPortrait(ctx, p.def, X + 38, Y + 37, 27, { team: 'A' });
  textFit(ctx, `${p.name}  Lv ${p.level}`, X + 74, Y + 14, 14, '#ffffff', 130, 'left');
  if (p.hidden) {
    // Hidden indicator: the player is concealed in a bush.
    rr(ctx, X + 208, Y + 6, 62, 17, 8);
    ctx.fillStyle = '#2e7d32';
    ctx.fill();
    text(ctx, '◉ HIDDEN', X + 239, Y + 14.5, 10, '#7CFC00');
  }
  goldPill(ctx, X + 74, Y + 34, p.gold, 13);
  // HP / mana bars.
  const barX = X + 74; const barW = 150;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(barX, Y + 46, barW, 9);
  ctx.fillStyle = p.hp / p.maxHp > 0.3 ? '#4caf50' : '#ef5350';
  ctx.fillRect(barX + 1, Y + 47, (barW - 2) * clamp(p.hp / p.maxHp, 0, 1), 7);
  text(ctx, `${Math.ceil(p.hp)}/${p.maxHp}`, barX + barW / 2, Y + 50.5, 9, '#ffffff');
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(barX, Y + 58, barW, 7);
  ctx.fillStyle = '#42a5f5';
  ctx.fillRect(barX + 1, Y + 59, (barW - 2) * clamp(p.mana / p.maxMana, 0, 1), 5);
  // Stat readout: damage / power / move speed.
  text(ctx, `ATK ${Math.round(st.damage)}`, barX + barW + 16, Y + 16, 11, '#ffb74d', 'left');
  text(ctx, `PWR ${Math.round(st.power)}`, barX + barW + 16, Y + 32, 11, '#ce93d8', 'left');
  text(ctx, `SPD ${Math.round(st.ms)}`, barX + barW + 16, Y + 48, 11, '#80cbc4', 'left');
  // Skill buttons (greyed out and unclickable while the player is dead).
  const keys = ['Q', 'W', 'E'];
  const dead = !p.alive;
  for (let i = 0; i < 3; i++) {
    const sk = p.def.skills[i];
    const cx = X + 350 + i * 74;
    const cy = Y + 37;
    const lvl = p.skillLv[i];
    const locked = p.level < sk.unlock;
    const cd = p.cds[i];
    const r = 26;
    // Button disc.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = dead ? 'rgba(40,40,40,0.9)' : locked ? 'rgba(60,60,60,0.9)' : lvl > 0 ? 'rgba(30, 45, 75, 0.95)' : 'rgba(50, 50, 70, 0.9)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = i === 2 ? '#ffd60a' : 'rgba(255,255,255,0.35)';
    ctx.stroke();
    if (lvl > 0 && !locked) skillIcon(ctx, sk, cx, cy, r * 0.7);
    else text(ctx, locked ? `Lv ${sk.unlock}` : '—', cx, cy, 10, 'rgba(255,255,255,0.6)');
    // Cooldown sweep.
    if (cd > 0 && lvl > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (cd / sk.cd) * Math.PI * 2);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fill();
      text(ctx, `${Math.ceil(cd)}`, cx, cy, 15, '#ffffff');
    }
    // Key label + level pips.
    text(ctx, keys[i], cx - r - 2, cy - r + 2, 10, 'rgba(255,255,255,0.7)', 'right');
    const maxLv = i === 2 ? 3 : 5;
    for (let pip = 0; pip < maxLv; pip++) {
      ctx.fillStyle = pip < lvl ? '#ffd60a' : 'rgba(255,255,255,0.2)';
      circle(ctx, cx - (maxLv - 1) * 4 + pip * 8, cy + r + 6, 2.5);
      ctx.fill();
    }
    if (!dead) ui.buttons.push({ id: 'skill', data: i, x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
    // Upgrade (+) button.
    if (p.skillPts > 0 && !locked && lvl < maxLv && !dead) {
      ctx.beginPath();
      ctx.arc(cx + r - 2, cy - r + 2, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd60a';
      ctx.fill();
      ctx.strokeStyle = '#7a5c00';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text(ctx, '+', cx + r - 2, cy - r + 2, 14, '#222222');
      ui.buttons.push({ id: 'upgrade', data: i, x: cx + r - 12, y: cy - r - 8, w: 20, h: 20 });
    }
  }
  // Item slots (6) with real icons.
  const slotX = X + 572;
  for (let i = 0; i < 6; i++) {
    const sx2 = slotX + (i % 3) * 34;
    const sy2 = Y + 10 + Math.floor(i / 3) * 34;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(ctx, sx2, sy2, 30, 30, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    rr(ctx, sx2, sy2, 30, 30, 5);
    ctx.stroke();
    const itemId = p.items[i];
    if (itemId) {
      const item = ITEM_BY_ID[itemId];
      if (item) drawItemIcon(ctx, item, sx2 + 15, sy2 + 15, 26);
    }
  }
  text(ctx, 'ITEMS', slotX + 45, Y + 68, 8, 'rgba(255,255,255,0.5)');
}

function drawFeed(ctx, m) {
  // Recent events in a panel at the top-right, inset from the edge, with
  // text truncated so nothing ever runs off-screen.
  const now = m.time;
  const entries = m.feed.filter((f) => now - f.t < 8).slice(0, 4);
  if (entries.length === 0) return;
  const W = 320; const H = entries.length * 20 + 12;
  const X = VIEW_W - W - 12; const Y = 58;
  panel(ctx, X, Y, W, H, 'rgba(8, 12, 24, 0.72)', 'rgba(255,255,255,0.08)');
  entries.forEach((f, i) => {
    textFit(ctx, f.text, X + 10, Y + 16 + i * 20, 12, f.color, W - 20, 'left', 'normal');
  });
}

function drawAnnouncements(ctx, m) {
  m.announcements.forEach((a, i) => {
    const alpha = a.t < 2.6 ? 1 : (3.2 - a.t) / 0.6;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    const y = 120 + i * 58;
    // Kill banners scale with their tier (higher = bigger + glow) and pop in.
    const isBanner = a.tier !== null && a.tier !== undefined;
    const pop = a.t < 0.25 ? 0.7 + (a.t / 0.25) * 0.3 : 1;
    const size = Math.round((isBanner ? 30 + a.tier * 5 : 30) * pop);
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (isBanner && a.tier >= 2) {
      // Glow halo for MANIAC / SAVAGE / GODLIKE / LEGENDARY / SHUTDOWN.
      ctx.globalAlpha = clamp(alpha, 0, 1) * 0.4;
      ctx.fillStyle = a.color;
      for (const [ox, oy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2]]) {
        ctx.fillText(a.text, VIEW_W / 2 + ox, y + oy);
      }
      ctx.globalAlpha = clamp(alpha, 0, 1);
    }
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(a.text, VIEW_W / 2, y);
    ctx.fillStyle = a.color;
    ctx.fillText(a.text, VIEW_W / 2, y);
    if (a.sub) text(ctx, a.sub, VIEW_W / 2, y + 26 + (isBanner ? a.tier * 3 : 0), 14, '#ffffff');
    ctx.globalAlpha = 1;
  });
}

// ---- Shop -------------------------------------------------------------------
// Right-side panel (not full-screen): category tabs, item grid with drawn
// icons + prices, detail area with build path, Buy and Sell buttons.

export function drawShop(ctx, ui, m, opts = {}) {
  const p = m.player;
  if (!p) return;
  const cat = opts.shopCat || 'Attack';
  const selId = opts.shopItem || null;
  const X = 742; const Y = 52; const W = 526; const H = 574;
  panel(ctx, X, Y, W, H);
  text(ctx, 'ITEM SHOP', X + 16, Y + 22, 18, '#ffd60a', 'left');
  goldPill(ctx, X + 150, Y + 22, p.gold, 15);
  // Close button.
  rr(ctx, X + W - 40, Y + 8, 30, 30, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  text(ctx, '✕', X + W - 25, Y + 23, 14, '#ffffff');
  ui.buttons.push({ id: 'shop-close', x: X + W - 40, y: Y + 8, w: 30, h: 30 });
  // Category tabs.
  const tabW = (W - 32) / ITEM_CATEGORIES.length;
  ITEM_CATEGORIES.forEach((c, i) => {
    const tx = X + 16 + i * tabW;
    const ty = Y + 44;
    const active = c === cat;
    rr(ctx, tx + 2, ty, tabW - 4, 30, 6);
    ctx.fillStyle = active ? '#ffd60a' : 'rgba(255,255,255,0.1)';
    ctx.fill();
    text(ctx, c.toUpperCase(), tx + tabW / 2, ty + 15, 11, active ? '#222222' : '#cccccc');
    ui.buttons.push({ id: 'shop-tab', data: c, x: tx + 2, y: ty, w: tabW - 4, h: 30 });
  });
  // Item grid (5 columns so the 14-item Attack tab fits in 3 rows).
  const items = ITEMS.filter((it) => it.cat === cat);
  const cols = 5;
  const cellW = (W - 32) / cols;
  const cellH = items.length > 10 ? 84 : 92;
  items.forEach((it, i) => {
    const cx = X + 16 + (i % cols) * cellW;
    const cy = Y + 84 + Math.floor(i / cols) * cellH;
    const selected = it.id === selId;
    const owned = p.items.includes(it.id);
    const set = it.set ? SET_BY_ID[it.set] : null;
    rr(ctx, cx + 3, cy, cellW - 6, cellH - 8, 8);
    ctx.fillStyle = selected ? 'rgba(255, 214, 10, 0.22)' : 'rgba(255,255,255,0.06)';
    ctx.fill();
    // Set members carry their set's colour as the cell border.
    ctx.strokeStyle = selected ? '#ffd60a' : set ? set.color : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = selected || set ? 2 : 1;
    rr(ctx, cx + 3, cy, cellW - 6, cellH - 8, 8);
    ctx.stroke();
    // Tier stars.
    text(ctx, '★'.repeat(it.tier), cx + cellW / 2, cy + 10, 8, it.tier === 3 ? '#ffd60a' : it.tier === 2 ? '#90caf9' : '#9e9e9e');
    if (set) text(ctx, set.name.toUpperCase(), cx + cellW / 2, cy + 21, 8, set.color);
    drawItemIcon(ctx, it, cx + cellW / 2, cy + 40, 36);
    textFit(ctx, it.name, cx + cellW / 2, cy + 63, 10, '#ffffff', cellW - 6);
    text(ctx, `${it.price}g`, cx + cellW / 2, cy + 73, 11, p.gold >= it.price ? '#ffd60a' : '#ef5350');
    if (owned) {
      ctx.fillStyle = '#4caf50';
      circle(ctx, cx + cellW - 14, cy + 12, 8);
      ctx.fill();
      text(ctx, '✓', cx + cellW - 14, cy + 12, 10, '#ffffff');
    }
    ui.buttons.push({ id: 'shop-item', data: it.id, x: cx + 3, y: cy, w: cellW - 6, h: cellH - 8 });
  });
  // Detail area.
  const dY = Y + 84 + Math.ceil(items.length / cols) * cellH + 8;
  const sel = selId ? ITEM_BY_ID[selId] : null;
  rr(ctx, X + 16, dY, W - 32, Y + H - dY - 16, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  if (!sel) {
    text(ctx, 'Select an item to see its stats, set and build path', X + W / 2, dY + 24, 13, 'rgba(255,255,255,0.65)');
    // Set progress overview: every set the player has started or completed.
    const prog = setProgress(p.items).filter((s) => s.owned > 0);
    if (prog.length > 0) {
      text(ctx, 'SET PROGRESS', X + 32, dY + 52, 11, 'rgba(255,255,255,0.55)', 'left');
      prog.forEach((s, i) => {
        const sy = dY + 72 + i * 20;
        text(ctx, `⬥ ${s.name} ${s.owned}/${s.total}`, X + 32, sy, 12, s.color, 'left');
        if (s.complete) text(ctx, `✓ ACTIVE: ${s.bonusDesc}`, X + 190, sy, 11, '#7CFC00', 'left');
        else text(ctx, `buy ${ITEM_BY_ID[s.missing[0]].name} for the bonus`, X + 190, sy, 11, 'rgba(255,255,255,0.6)', 'left');
      });
    } else {
      text(ctx, 'Items boost your hero permanently. Sell back for 50%.', X + W / 2, dY + 52, 11, 'rgba(255,255,255,0.45)');
      text(ctx, 'Buy all 3 items of a set (coloured borders) to unlock its bonus.', X + W / 2, dY + 72, 11, 'rgba(255,255,255,0.45)');
    }
    return;
  }
  const price = buyPrice(p, sel);
  const owned = p.items.includes(sel.id);
  const ownedComps = (sel.buildsFrom || []).filter((c) => p.items.includes(c)).length;
  const slotsAfter = p.items.length - ownedComps + 1;
  const canBuy = !owned && p.gold >= price && slotsAfter <= 6;
  text(ctx, sel.name, X + 32, dY + 18, 16, '#ffffff', 'left');
  text(ctx, `${sel.cat} · Tier ${sel.tier}`, X + W - 32, dY + 18, 11, '#90caf9', 'right');
  textFit(ctx, sel.desc, X + 32, dY + 40, 13, '#b7e4c7', W - 64, 'left', 'normal');
  let infoY = dY + 62;
  // Synergy set: name, progress, bonus, and member icons (owned = green).
  if (sel.set) {
    const s = SET_BY_ID[sel.set];
    const ownedCount = s.items.filter((id) => p.items.includes(id)).length;
    const complete = ownedCount === s.items.length;
    text(ctx, `⬥ SET: ${s.name} ${ownedCount}/${s.items.length}`, X + 32, infoY, 13, s.color, 'left');
    textFit(ctx, complete ? `✓ ACTIVE: ${s.bonusDesc}` : s.bonusDesc, X + 32, infoY + 18, 11, complete ? '#7CFC00' : 'rgba(255,255,255,0.65)', W - 64, 'left', 'normal');
    let bx = X + 32;
    s.items.forEach((memberId) => {
      const member = ITEM_BY_ID[memberId];
      const has = p.items.includes(memberId);
      rr(ctx, bx, infoY + 28, 30, 30, 5);
      ctx.fillStyle = has ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.strokeStyle = has ? '#4caf50' : s.color;
      ctx.lineWidth = 1;
      rr(ctx, bx, infoY + 28, 30, 30, 5);
      ctx.stroke();
      if (member) drawItemIcon(ctx, member, bx + 15, infoY + 43, 26);
      bx += 38;
    });
    if (!complete) text(ctx, `Buy ${s.items.filter((id) => !p.items.includes(id)).map((id) => ITEM_BY_ID[id].name).join(', ')} to complete the set`, bx + 4, infoY + 43, 11, 'rgba(255,255,255,0.6)', 'left');
    infoY += 68;
  }
  // Upgrade: which item this one builds into.
  const upgradesInto = ITEMS.filter((it) => (it.buildsFrom || []).includes(sel.id));
  if (upgradesInto.length > 0) {
    text(ctx, `Upgrades into: ${upgradesInto.map((it) => it.name).join(', ')}`, X + 32, infoY, 11, '#90caf9', 'left');
    infoY += 18;
  }
  // Build path.
  if (sel.buildsFrom && sel.buildsFrom.length > 0) {
    text(ctx, 'BUILDS FROM:', X + 32, infoY + 2, 10, 'rgba(255,255,255,0.55)', 'left');
    let bx = X + 130;
    sel.buildsFrom.forEach((compId, i) => {
      const comp = ITEM_BY_ID[compId];
      const has = p.items.includes(compId);
      rr(ctx, bx, infoY - 8, 30, 30, 5);
      ctx.fillStyle = has ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.strokeStyle = has ? '#4caf50' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      rr(ctx, bx, infoY - 8, 30, 30, 5);
      ctx.stroke();
      if (comp) drawItemIcon(ctx, comp, bx + 15, infoY + 7, 26);
      if (i < sel.buildsFrom.length - 1) text(ctx, '+', bx + 38, infoY + 7, 13, '#ffffff');
      bx += 48;
    });
    text(ctx, '→', bx - 6, infoY + 7, 16, '#ffd60a');
    rr(ctx, bx + 6, infoY - 8, 30, 30, 5);
    ctx.fillStyle = 'rgba(255, 214, 10, 0.2)';
    ctx.fill();
    drawItemIcon(ctx, sel, bx + 21, infoY + 7, 26);
    if (ownedComps > 0) text(ctx, `You own ${ownedComps}/${sel.buildsFrom.length} — price reduced`, X + 32, infoY + 34, 11, '#4caf50', 'left');
  }
  // Buy / sell buttons (disabled while the player is dead).
  const btnY = Y + H - 56;
  const dead = !p.alive;
  if (owned) {
    rr(ctx, X + W - 176, btnY, 144, 36, 8);
    ctx.fillStyle = dead ? 'rgba(255,255,255,0.15)' : '#ef5350';
    ctx.fill();
    text(ctx, `SELL  +${Math.floor(sel.price / 2)}g`, X + W - 104, btnY + 18, 13, dead ? '#888888' : '#ffffff');
    if (!dead) ui.buttons.push({ id: 'sell', data: sel.id, x: X + W - 176, y: btnY, w: 144, h: 36 });
    text(ctx, 'OWNED', X + 32, btnY + 18, 13, '#4caf50', 'left');
  } else {
    rr(ctx, X + W - 176, btnY, 144, 36, 8);
    ctx.fillStyle = canBuy && !dead ? '#ffb300' : 'rgba(255,255,255,0.15)';
    ctx.fill();
    text(ctx, `BUY  ${price}g`, X + W - 104, btnY + 18, 14, canBuy && !dead ? '#222222' : '#888888');
    if (canBuy && !dead) ui.buttons.push({ id: 'buy', data: sel.id, x: X + W - 176, y: btnY, w: 144, h: 36 });
    if (dead) text(ctx, 'You must be alive to buy', X + 32, btnY + 18, 12, '#ef5350', 'left');
    else if (p.gold < price) text(ctx, 'Not enough gold', X + 32, btnY + 18, 12, '#ef5350', 'left');
    else if (slotsAfter > 6) text(ctx, 'Item slots full (6)', X + 32, btnY + 18, 12, '#ef5350', 'left');
  }
}

// ---- Screens -------------------------------------------------------------------

export function drawMenu(ctx, ui, time, ladder) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#0a1020');
  g.addColorStop(0.5, '#131f3d');
  g.addColorStop(1, '#0a1020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Decorative hero figures.
  const showcase = ['kael', 'lyra', 'aria', 'nyx', 'bastion'];
  showcase.forEach((id, i) => {
    const def = HERO_BY_ID[id];
    const x = 280 + i * 180;
    const y = 228 + Math.sin(time * 1.5 + i) * 8;
    drawHeroFigure(ctx, def, x, y, 1.6, -Math.PI / 2, i % 2 === 0 ? 'A' : 'B', { time, walkPhase: 0, seed: i });
  });
  text(ctx, 'SLAYER', VIEW_W / 2, 118, 64, '#ffffff');
  text(ctx, '5v5 RANKED  ·  DRAFT  ·  3 LANES  ·  JUNGLE', VIEW_W / 2, 162, 15, '#ffd60a');
  text(ctx, '20 unique heroes — draft your team, destroy the enemy base turret', VIEW_W / 2, 300, 16, 'rgba(255,255,255,0.75)');
  // Player's current tier (mini-panel).
  if (ladder) {
    const tier = tierFor(ladder.player.points);
    panel(ctx, VIEW_W / 2 - 130, 322, 260, 56, 'rgba(10, 16, 32, 0.8)', 'rgba(255,255,255,0.12)');
    drawTierBadge(ctx, tier, VIEW_W / 2 - 102, 350, 20);
    text(ctx, tier.name, VIEW_W / 2 - 74, 342, 15, tier.color, 'left');
    text(ctx, `${ladder.player.points} pts  ·  ${ladder.player.wins}W - ${ladder.player.losses}L`, VIEW_W / 2 - 74, 362, 12, 'rgba(255,255,255,0.7)', 'left');
  }
  // Play button.
  const bw = 260; const bh = 60; const bx = VIEW_W / 2 - bw / 2; const by = 400;
  const bg = ctx.createLinearGradient(bx, by, bx, by + bh);
  bg.addColorStop(0, '#ffb300');
  bg.addColorStop(1, '#ff8f00');
  rr(ctx, bx, by, bw, bh, 14);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  rr(ctx, bx, by, bw, bh, 14);
  ctx.stroke();
  text(ctx, '▶  PLAY  —  RANKED', VIEW_W / 2, by + bh / 2 + 1, 22, '#222222');
  ui.buttons.push({ id: 'play', x: bx, y: by, w: bw, h: bh });
  // Leaderboard button.
  const lbY = by + bh + 12;
  rr(ctx, bx, lbY, bw, 46, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  rr(ctx, bx, lbY, bw, 46, 14);
  ctx.stroke();
  text(ctx, '🏆  LEADERBOARD', VIEW_W / 2, lbY + 24, 18, '#ffffff');
  ui.buttons.push({ id: 'ladder', x: bx, y: lbY, w: bw, h: 46 });
  // History button.
  const histY = lbY + 58;
  rr(ctx, bx, histY, bw, 46, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  rr(ctx, bx, histY, bw, 46, 14);
  ctx.stroke();
  text(ctx, '📜  MATCH HISTORY', VIEW_W / 2, histY + 24, 18, '#ffffff');
  ui.buttons.push({ id: 'history', x: bx, y: histY, w: bw, h: 46 });
  text(ctx, 'Click to move · Q / W / E skills · B shop · M mute', VIEW_W / 2, 600, 13, 'rgba(255,255,255,0.55)');
  text(ctx, 'Win by destroying the enemy base turret. Break the lane turrets in order to open it.', VIEW_W / 2, 622, 13, 'rgba(255,255,255,0.55)');
  // Role legend.
  ROLES.forEach((role, i) => {
    const x = 340 + i * 120;
    text(ctx, '●', x - 34, 650, 12, ROLE_COLOR[role], 'left');
    text(ctx, role, x - 18, 650, 12, 'rgba(255,255,255,0.75)', 'left');
  });
  // Mute button (top-right) + speaker state indicator.
  drawMuteButton(ctx, ui, VIEW_W - 56, 16);
}

// Speaker button: shows the mute state, toggles it on click (id 'mute').
function drawMuteButton(ctx, ui, x, y, size = 40) {
  panel(ctx, x, y, size, size, 'rgba(10, 16, 32, 0.8)', 'rgba(255,255,255,0.2)');
  text(ctx, isMuted() ? '🔇' : '🔊', x + size / 2, y + size / 2 + 1, 20, '#ffffff');
  ui.buttons.push({ id: 'mute', x, y, w: size, h: size });
}

// Tier badge: a shield (Warrior/Elite/Master), gem (Grandmaster/Epic) or
// crown (Legend/Mythic) in the tier's colour.
export function drawTierBadge(ctx, tier, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = tier.color;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  if (tier.icon === 'crown') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, r * 0.6);
    ctx.lineTo(-r * 0.9, -r * 0.2);
    ctx.lineTo(-r * 0.45, r * 0.1);
    ctx.lineTo(0, -r * 0.8);
    ctx.lineTo(r * 0.45, r * 0.1);
    ctx.lineTo(r * 0.9, -r * 0.2);
    ctx.lineTo(r * 0.9, r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    circle(ctx, 0, -r * 0.35, r * 0.16);
    ctx.fill();
  } else if (tier.icon === 'gem') {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.8, -r * 0.2);
    ctx.lineTo(r * 0.45, r * 0.85);
    ctx.lineTo(-r * 0.45, r * 0.85);
    ctx.lineTo(-r * 0.8, -r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.35, -r * 0.2);
    ctx.lineTo(0, r * 0.2);
    ctx.lineTo(-r * 0.35, -r * 0.2);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, -r * 0.8);
    ctx.lineTo(r * 0.8, -r * 0.8);
    ctx.lineTo(r * 0.8, r * 0.1);
    ctx.quadraticCurveTo(r * 0.8, r * 0.7, 0, r);
    ctx.quadraticCurveTo(-r * 0.8, r * 0.7, -r * 0.8, r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.45);
    ctx.lineTo(r * 0.28, r * 0.1);
    ctx.lineTo(0, r * 0.45);
    ctx.lineTo(-r * 0.28, r * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawLadder(ctx, ui, ladder) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#0a1020');
  g.addColorStop(0.5, '#131f3d');
  g.addColorStop(1, '#0a1020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text(ctx, '🏆  RANKED LEADERBOARD', VIEW_W / 2, 44, 30, '#ffd60a');
  // Back button.
  rr(ctx, 24, 20, 110, 40, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  rr(ctx, 24, 20, 110, 40, 10);
  ctx.stroke();
  text(ctx, '←  BACK', 79, 40, 15, '#ffffff');
  ui.buttons.push({ id: 'back-menu', x: 24, y: 20, w: 110, h: 40 });

  // Player tier panel.
  const p = ladder.player;
  const tier = tierFor(p.points);
  const nxt = nextTier(p.points);
  const rows = rankedTable(ladder);
  const myRow = rows.find((r) => r.you);
  panel(ctx, 190, 76, 900, 104);
  drawTierBadge(ctx, tier, 250, 128, 34);
  text(ctx, tier.name, 300, 104, 24, tier.color, 'left');
  text(ctx, `Rank #${myRow.rank} of ${rows.length}  ·  ${p.points} pts  ·  ${p.wins}W - ${p.losses}L`, 300, 130, 14, 'rgba(255,255,255,0.75)', 'left');
  // Progress to the next tier (its own row, clear of the rank line above).
  const barX = 300; const barY = 162; const barW = 560;
  text(ctx, nxt ? `Next: ${nxt.name} (${nxt.min} pts)` : 'Top tier reached — Mythic!', barX, barY - 12, 12, 'rgba(255,255,255,0.6)', 'left');
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  rr(ctx, barX, barY, barW, 10, 5);
  ctx.fill();
  ctx.fillStyle = tier.color;
  rr(ctx, barX, barY, barW * tierProgress(p.points), 10, 5);
  ctx.fill();
  const wr = p.wins + p.losses > 0 ? Math.round((p.wins / (p.wins + p.losses)) * 100) : 0;
  text(ctx, `${wr}% WR`, 1010, 128, 20, '#ffffff', 'right');
  text(ctx, 'WIN RATE', 1010, 150, 10, 'rgba(255,255,255,0.5)', 'right');

  // Table.
  panel(ctx, 190, 196, 900, 492);
  const cols = [
    { label: 'RANK', x: 214, w: 60, align: 'left' },
    { label: 'PLAYER', x: 280, w: 220, align: 'left' },
    { label: 'TIER', x: 540, w: 150, align: 'left' },
    { label: 'POINTS', x: 720, w: 90, align: 'right' },
    { label: 'W', x: 830, w: 50, align: 'right' },
    { label: 'L', x: 890, w: 50, align: 'right' },
    { label: 'WIN RATE', x: 1066, w: 90, align: 'right' },
  ];
  for (const c of cols) text(ctx, c.label, c.align === 'right' ? c.x + c.w - 24 : c.x, 220, 11, 'rgba(255,255,255,0.5)', c.align);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(206, 234);
  ctx.lineTo(1074, 234);
  ctx.stroke();
  rows.forEach((r, i) => {
    const y = 252 + i * 27;
    if (r.you) {
      ctx.fillStyle = 'rgba(255, 214, 10, 0.14)';
      rr(ctx, 198, y - 12, 884, 25, 6);
      ctx.fill();
    }
    const wrRow = r.wins + r.losses > 0 ? Math.round((r.wins / (r.wins + r.losses)) * 100) : 0;
    const medal = r.rank === 1 ? '#ffd60a' : r.rank === 2 ? '#cfd8dc' : r.rank === 3 ? '#ffab91' : 'rgba(255,255,255,0.6)';
    text(ctx, `#${r.rank}`, 214, y, 13, medal, 'left');
    textFit(ctx, r.you ? 'You  ★' : r.name, 280, y, 13, r.you ? '#ffd60a' : '#ffffff', 220, 'left');
    drawTierBadge(ctx, r.tier, 548, y, 10);
    text(ctx, r.tier.name, 564, y, 12, r.tier.color, 'left');
    text(ctx, `${r.points}`, 786, y, 13, '#ffffff', 'right');
    text(ctx, `${r.wins}`, 856, y, 13, '#7CFC00', 'right');
    text(ctx, `${r.losses}`, 916, y, 13, '#ff8fa3', 'right');
    text(ctx, `${wrRow}%`, 1042, y, 13, '#ffffff', 'right');
  });
  text(ctx, 'Win a ranked match: +30 pts · Lose: -20 pts · Your progress is saved on this device.', VIEW_W / 2, 706, 11, 'rgba(255,255,255,0.4)');
}

function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function drawHistory(ctx, ui, history) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#0a1020');
  g.addColorStop(0.5, '#131f3d');
  g.addColorStop(1, '#0a1020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text(ctx, '📜  MATCH HISTORY', VIEW_W / 2, 44, 30, '#ffd60a');
  // Back button.
  rr(ctx, 24, 20, 110, 40, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  rr(ctx, 24, 20, 110, 40, 10);
  ctx.stroke();
  text(ctx, '←  BACK', 79, 40, 15, '#ffffff');
  ui.buttons.push({ id: 'back-menu', x: 24, y: 20, w: 110, h: 40 });

  if (!history.length) {
    panel(ctx, 340, 280, 600, 140);
    text(ctx, 'Belum ada match — mainkan ranked pertamamu!', VIEW_W / 2, 330, 18, '#ffffff');
    text(ctx, 'Your finished ranked matches will appear here.', VIEW_W / 2, 362, 13, 'rgba(255,255,255,0.6)');
    return;
  }
  // List, newest first. Shows up to 12 rows.
  const shown = history.slice(0, 12);
  panel(ctx, 190, 80, 900, 600);
  const headers = [
    ['HERO', 230], ['RESULT', 470], ['KDA', 570], ['DURATION', 680], ['DATE', 790], ['RANKED', 920],
  ];
  for (const [label, x] of headers) text(ctx, label, x, 104, 11, 'rgba(255,255,255,0.5)', 'left');
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(206, 118);
  ctx.lineTo(1074, 118);
  ctx.stroke();
  shown.forEach((e, i) => {
    const y = 138 + i * 46;
    const win = e.result === 'WIN';
    ctx.fillStyle = win ? 'rgba(46, 125, 50, 0.25)' : 'rgba(183, 28, 28, 0.25)';
    rr(ctx, 198, y - 16, 884, 40, 8);
    ctx.fill();
    drawPortrait(ctx, HERO_BY_ID[e.heroId] || HEROES[0], 232, y + 4, 18, { team: 'A' });
    textFit(ctx, e.heroName, 258, y - 2, 14, '#ffffff', 130, 'left');
    text(ctx, e.role, 258, y + 14, 10, 'rgba(255,255,255,0.5)', 'left');
    text(ctx, win ? 'WIN' : 'LOSE', 470, y + 4, 15, win ? '#7CFC00' : '#ff5252', 'left');
    text(ctx, `${e.kills}/${e.deaths}/${e.assists}`, 570, y + 4, 14, '#ffffff', 'left');
    text(ctx, fmtDuration(e.duration), 680, y + 4, 13, 'rgba(255,255,255,0.8)', 'left');
    text(ctx, fmtDate(e.ts), 790, y + 4, 13, 'rgba(255,255,255,0.8)', 'left');
    text(ctx, `${e.pointsDelta > 0 ? '+' : ''}${e.pointsDelta} pts`, 920, y - 2, 13, e.pointsDelta > 0 ? '#7CFC00' : '#ff5252', 'left');
    text(ctx, e.tierAfter, 920, y + 14, 10, 'rgba(255,255,255,0.5)', 'left');
    text(ctx, '›', 1064, y + 4, 18, 'rgba(255,255,255,0.5)');
    ui.buttons.push({ id: 'history-row', x: 198, y: y - 16, w: 884, h: 40, data: e.id });
  });
  if (history.length > shown.length) {
    text(ctx, `Showing the ${shown.length} most recent of ${history.length} matches`, VIEW_W / 2, 700, 11, 'rgba(255,255,255,0.4)');
  } else {
    text(ctx, 'Click a match for the full breakdown.', VIEW_W / 2, 700, 11, 'rgba(255,255,255,0.4)');
  }
}

export function drawHistoryDetail(ctx, ui, entry) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#0a1020');
  g.addColorStop(0.5, '#131f3d');
  g.addColorStop(1, '#0a1020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const win = entry.result === 'WIN';
  text(ctx, win ? '🏆  VICTORY' : '💔  DEFEAT', VIEW_W / 2, 44, 30, win ? '#7CFC00' : '#ff5252');
  text(ctx, `${entry.heroName}  ·  ${fmtDate(entry.ts)}  ·  ${fmtDuration(entry.duration)}  ·  ${entry.pointsDelta > 0 ? '+' : ''}${entry.pointsDelta} pts (${entry.tierAfter})`, VIEW_W / 2, 72, 13, 'rgba(255,255,255,0.7)');
  // Back button.
  rr(ctx, 24, 20, 150, 40, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  rr(ctx, 24, 20, 150, 40, 10);
  ctx.stroke();
  text(ctx, '←  HISTORY', 99, 40, 15, '#ffffff');
  ui.buttons.push({ id: 'back-history', x: 24, y: 20, w: 150, h: 40 });

  // Team score header.
  panel(ctx, 190, 92, 900, 46);
  text(ctx, `BLUE  ${entry.scoreA}`, 400, 115, 18, '#7bdff2', 'left');
  text(ctx, '—', VIEW_W / 2, 115, 18, 'rgba(255,255,255,0.5)');
  text(ctx, `${entry.scoreB}  RED`, 880, 115, 18, '#ff8fa3', 'right');
  text(ctx, 'KILLS', VIEW_W / 2, 132, 9, 'rgba(255,255,255,0.4)');

  // Per-team KDA tables.
  const drawTeam = (team, x0) => {
    panel(ctx, x0, 152, 440, 300);
    text(ctx, team === 'A' ? 'BLUE TEAM' : 'RED TEAM', x0 + 20, 176, 14, team === 'A' ? '#7bdff2' : '#ff8fa3', 'left');
    text(ctx, 'K / D / A', x0 + 290, 176, 11, 'rgba(255,255,255,0.5)', 'left');
    text(ctx, 'GOLD', x0 + 370, 176, 11, 'rgba(255,255,255,0.5)', 'left');
    entry.players.filter((p) => p.team === team).forEach((p, i) => {
      const y = 204 + i * 48;
      const isYou = p.name === 'You';
      if (isYou) {
        ctx.fillStyle = 'rgba(255, 214, 10, 0.12)';
        rr(ctx, x0 + 8, y - 16, 424, 42, 6);
        ctx.fill();
      }
      drawPortrait(ctx, HERO_BY_ID[p.heroId] || HEROES[0], x0 + 30, y + 4, 16, { team });
      textFit(ctx, p.name, x0 + 54, y - 2, 13, isYou ? '#ffd60a' : '#ffffff', 120, 'left');
      text(ctx, `Lv ${p.level} · ${p.role}`, x0 + 54, y + 14, 10, 'rgba(255,255,255,0.5)', 'left');
      text(ctx, `${p.kills}/${p.deaths}/${p.assists}`, x0 + 290, y + 4, 13, '#ffffff', 'left');
      text(ctx, `${Math.floor(p.gold / 100) / 10}k`, x0 + 370, y + 4, 13, '#ffd60a', 'left');
    });
  };
  drawTeam('A', 190);
  drawTeam('B', 650);

  // Player's items + extra stats.
  panel(ctx, 190, 466, 900, 150);
  text(ctx, 'YOUR ITEMS', 214, 492, 12, 'rgba(255,255,255,0.5)', 'left');
  const items = entry.items || [];
  if (!items.length) {
    text(ctx, 'No items bought this match.', 214, 528, 13, 'rgba(255,255,255,0.6)', 'left');
  }
  items.forEach((id, i) => {
    const it = ITEM_BY_ID[id];
    if (!it) return;
    drawItemIcon(ctx, it, 214 + i * 56, 508, 44);
  });
  const me = entry.players.find((p) => p.name === 'You');
  const dmg = me ? Math.round(me.damage) : entry.damage || 0;
  text(ctx, `Damage dealt: ${dmg.toLocaleString('en-US')}   ·   Gold earned: ${Math.floor(entry.gold).toLocaleString('en-US')}   ·   Final level: ${entry.level}   ·   KDA: ${entry.kills}/${entry.deaths}/${entry.assists}`, VIEW_W / 2, 590, 13, 'rgba(255,255,255,0.8)');
  text(ctx, 'Press BACK or click ← HISTORY to return to the list.', VIEW_W / 2, 660, 11, 'rgba(255,255,255,0.4)');
}

function drawTeamPanel(ctx, ui, draft, team, x, y) {
  const W = 176; const H = 500;
  panel(ctx, x, y, W, H);
  text(ctx, TEAM_NAME[team], x + W / 2, y + 20, 15, TEAM_COLOR[team]);
  text(ctx, 'BANS', x + W / 2, y + 46, 10, 'rgba(255,255,255,0.5)');
  draft.bans[team].forEach((id, i) => {
    const bx = x + 44 + i * 88;
    const by = y + 78;
    drawPortrait(ctx, HERO_BY_ID[id], bx, by, 26, { banned: true, team });
  });
  for (let i = draft.bans[team].length; i < 2; i++) {
    const bx = x + 44 + i * 88;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    circle(ctx, bx, y + 78, 26);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  text(ctx, 'PICKS', x + W / 2, y + 122, 10, 'rgba(255,255,255,0.5)');
  for (let i = 0; i < 5; i++) {
    const py = y + 156 + i * 66;
    const id = draft.picks[team][i];
    if (id) {
      const def = HERO_BY_ID[id];
      drawPortrait(ctx, def, x + 34, py, 24, { team });
      textFit(ctx, def.name, x + 66, py - 10, 13, '#ffffff', 100, 'left');
      text(ctx, def.role, x + 66, py + 10, 11, ROLE_COLOR[def.role], 'left');
    } else {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      circle(ctx, x + 34, py, 24);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, `PLAYER ${i + 1}`, x + 66, py, 11, 'rgba(255,255,255,0.4)', 'left');
    }
  }
}

export function drawDraft(ctx, ui, draft, time) {
  ctx.fillStyle = '#0a1020';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const step = draft.done ? null : draft.steps[draft.stepIndex];
  const phaseLabel = draft.done ? 'DRAFT COMPLETE' : step.type === 'ban' ? 'BANNING' : 'PICKING';
  const teamLabel = step ? TEAM_NAME[step.team] : '';
  const action = step ? (step.type === 'ban' ? 'bans' : 'picks') : '';
  text(ctx, `${phaseLabel}  ${draft.done ? '' : fmtTime(draft.timer)}`, VIEW_W / 2, 32, 26, step && step.team === 'A' ? '#7bdff2' : '#ff8fa3');
  if (step) text(ctx, `${teamLabel} ${action}`, VIEW_W / 2, 60, 14, 'rgba(255,255,255,0.7)');

  drawTeamPanel(ctx, ui, draft, 'A', 12, 96);
  drawTeamPanel(ctx, ui, draft, 'B', 1092, 96);

  // Role filter tabs. The draft stores the filter as 'All' (not 'ALL').
  const tabs = ['All', ...ROLES];
  const tabW = 96;
  const tabX0 = 240;
  tabs.forEach((t, i) => {
    const tx = tabX0 + i * (tabW + 8);
    const active = (draft.roleFilter || 'All') === t;
    rr(ctx, tx, 96, tabW, 32, 8);
    ctx.fillStyle = active ? '#3a86ff' : 'rgba(255,255,255,0.08)';
    ctx.fill();
    text(ctx, t.toUpperCase(), tx + tabW / 2, 112, 12, active ? '#ffffff' : 'rgba(255,255,255,0.7)');
    ui.buttons.push({ id: 'tab', data: t, x: tx, y: 96, w: tabW, h: 32 });
  });

  // Hero grid: 5 columns x 4 rows, 96px rows so the last row never touches
  // the detail panel below.
  const grid = HEROES.filter((h) => (draft.roleFilter || 'All') === 'All' || h.role === draft.roleFilter);
  const gx0 = 240; const gy0 = 146; const cw = 162; const ch = 96;
  grid.forEach((def, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const cx = gx0 + col * cw + cw / 2;
    const cy = gy0 + row * ch;
    const banned = draft.bans.A.includes(def.id) || draft.bans.B.includes(def.id);
    const picked = draft.picks.A.includes(def.id) || draft.picks.B.includes(def.id);
    const unavailable = banned || picked;
    const selected = draft.selectedId === def.id;
    if (selected) {
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 3;
      rr(ctx, cx - 52, cy - 6, 104, ch - 10, 10);
      ctx.stroke();
    }
    drawPortrait(ctx, def, cx, cy + 26, 30, { dim: unavailable, banned, team: 'A', time });
    textFit(ctx, def.name, cx, cy + 66, 13, unavailable ? 'rgba(255,255,255,0.4)' : '#ffffff', 150);
    text(ctx, def.role, cx, cy + 82, 11, ROLE_COLOR[def.role]);
    if (!unavailable) ui.buttons.push({ id: 'hero', data: def.id, x: cx - 52, y: cy - 6, w: 104, h: ch - 10 });
  });

  // Detail panel: selected hero, or a prompt. LOCK IN lives inside it.
  const dY = 540; const dH = 118;
  panel(ctx, 240, dY, 800, dH);
  const sel = draft.selectedId ? HERO_BY_ID[draft.selectedId] : null;
  if (sel) {
    drawPortrait(ctx, sel, 290, dY + 46, 34, { team: 'A', time });
    textFit(ctx, `${sel.name} — ${sel.title}`, 340, dY + 22, 16, '#ffffff', 480, 'left');
    text(ctx, `${sel.role} · ${sel.form} · HP ${sel.hp} · DMG ${sel.dmg} · RNG ${sel.range}`, 340, dY + 46, 12, 'rgba(255,255,255,0.7)', 'left');
    textFit(ctx, `Passive: ${sel.passive.name} — ${sel.passive.desc}`, 340, dY + 70, 12, '#b7e4c7', 480, 'left', 'normal');
    const skNames = sel.skills.map((s) => `${s.name} (${s.type})`).join('  ·  ');
    textFit(ctx, skNames, 340, dY + 94, 11, 'rgba(255,255,255,0.55)', 480, 'left', 'normal');
  } else {
    text(ctx, 'Select a hero from the grid', 640, dY + 46, 16, 'rgba(255,255,255,0.6)');
    text(ctx, ROLE_BLURB[draft.roleFilter] || 'Banned and picked heroes are gone for both teams', 640, dY + 74, 12, 'rgba(255,255,255,0.45)');
  }
  // LOCK IN button (inside the detail panel, right side).
  const canLock = !!sel && !draft.done && isPlayerStep(draft);
  rr(ctx, 880, dY + 34, 140, 50, 10);
  ctx.fillStyle = canLock ? '#ffb300' : 'rgba(255,255,255,0.12)';
  ctx.fill();
  text(ctx, 'LOCK IN', 950, dY + 59, 16, canLock ? '#222222' : 'rgba(255,255,255,0.5)');
  if (canLock) ui.buttons.push({ id: 'lock', x: 880, y: dY + 34, w: 140, h: 50 });
}

export function drawVS(ctx, ui, draft, t) {
  ctx.fillStyle = '#0a1020';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text(ctx, 'MATCHUP', VIEW_W / 2, 80, 30, '#ffffff');
  ['A', 'B'].forEach((team, ti) => {
    const x0 = ti === 0 ? 140 : 800;
    text(ctx, TEAM_NAME[team], x0 + 170, 140, 20, TEAM_COLOR[team]);
    draft.picks[team].forEach((id, i) => {
      const def = HERO_BY_ID[id];
      const y = 200 + i * 92;
      drawPortrait(ctx, def, x0 + 40, y, 34, { team });
      textFit(ctx, def.name, x0 + 92, y - 12, 17, '#ffffff', 200, 'left');
      text(ctx, `${def.role} · ${def.title}`, x0 + 92, y + 12, 12, 'rgba(255,255,255,0.6)', 'left');
    });
  });
  text(ctx, 'VS', VIEW_W / 2, 360, 64, '#ffd60a');
  text(ctx, 'Destroy the enemy base turret to win', VIEW_W / 2, 440, 15, 'rgba(255,255,255,0.7)');
  // Progress bar (3s).
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  rr(ctx, VIEW_W / 2 - 150, 480, 300, 10, 5);
  ctx.fill();
  ctx.fillStyle = '#ffd60a';
  rr(ctx, VIEW_W / 2 - 150, 480, 300 * clamp(t / 3, 0, 1), 10, 5);
  ctx.fill();
}

export function drawMatch(ctx, ui, m, opts = {}) {
  const time = m.time;
  drawWorld(ctx, m, m.camera, time);
  drawMinimap(ctx, m);
  drawScoreBar(ctx, m);
  drawDeadTimers(ctx, m);
  drawSkillBar(ctx, ui, m);
  drawFeed(ctx, m);
  drawAnnouncements(ctx, m);
  drawRespawnOverlay(ctx, m);
  // SHOP button (bottom-right).
  const sbX = VIEW_W - 132; const sbY = VIEW_H - 84;
  const bg = ctx.createLinearGradient(sbX, sbY, sbX, sbY + 44);
  bg.addColorStop(0, '#ffb300');
  bg.addColorStop(1, '#ff8f00');
  rr(ctx, sbX, sbY, 120, 44, 10);
  ctx.fillStyle = bg;
  ctx.fill();
  text(ctx, '🛒  SHOP (B)', sbX + 60, sbY + 22, 15, '#222222');
  ui.buttons.push({ id: 'shop', x: sbX, y: sbY, w: 120, h: 44 });
  // Mute button + speaker state, left of SHOP.
  drawMuteButton(ctx, ui, VIEW_W - 184, VIEW_H - 84, 40);
  // Controls hint above the SHOP button (kept off the top-right, where the
  // world and the kill feed already live).
  text(ctx, 'P pause · B shop · Q/W/E skills', VIEW_W - 12, VIEW_H - 96, 11, 'rgba(255,255,255,0.55)', 'right');
  if (opts.shopOpen) drawShop(ctx, ui, m, opts);
  if (opts.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    panel(ctx, VIEW_W / 2 - 200, VIEW_H / 2 - 80, 400, 160);
    text(ctx, 'PAUSED', VIEW_W / 2, VIEW_H / 2 - 30, 32, '#ffffff');
    text(ctx, 'Press P or Esc to resume', VIEW_W / 2, VIEW_H / 2 + 16, 14, 'rgba(255,255,255,0.7)');
  }
}

export function drawEnd(ctx, ui, m, lastResult) {
  const won = m.winner === 'A';
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, won ? '#0d2b1a' : '#2b0d0d');
  g.addColorStop(1, '#0a1020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text(ctx, won ? 'VICTORY!' : 'DEFEAT', VIEW_W / 2, 110, 56, won ? '#ffd60a' : '#ef5350');
  text(ctx, m.endReason || '', VIEW_W / 2, 158, 16, 'rgba(255,255,255,0.8)');
  text(ctx, `Match time ${fmtTime(m.time)}  ·  Kills ${m.kills.A} — ${m.kills.B}  ·  Turrets ${10 - turretsLeft(m, 'B')} — ${10 - turretsLeft(m, 'A')}`, VIEW_W / 2, 190, 14, 'rgba(255,255,255,0.7)');
  // Ranked result line (from the ladder update).
  if (lastResult) {
    const delta = lastResult.pointsDelta > 0 ? `+${lastResult.pointsDelta}` : `${lastResult.pointsDelta}`;
    const move = lastResult.promoted ? ' — PROMOTED!' : lastResult.demoted ? ' — demoted' : '';
    text(ctx, `RANKED ${delta} pts  ·  ${lastResult.tierAfter}${move}`, VIEW_W / 2, 540, 15, lastResult.won ? '#7CFC00' : '#ff5252');
  }
  // Scoreboard.
  panel(ctx, 190, 220, 900, 300);
  text(ctx, 'HERO', 220, 248, 12, 'rgba(255,255,255,0.5)', 'left');
  text(ctx, 'K / D / A', 760, 248, 12, 'rgba(255,255,255,0.5)');
  text(ctx, 'LEVEL', 880, 248, 12, 'rgba(255,255,255,0.5)');
  text(ctx, 'GOLD', 1000, 248, 12, 'rgba(255,255,255,0.5)');
  m.heroes.forEach((h, i) => {
    const y = 280 + i * 24;
    drawPortrait(ctx, h.def, 236, y, 11, { team: h.team });
    textFit(ctx, `${h.name}${h.isPlayer ? ' (YOU)' : ''}`, 258, y, 13, h.team === 'A' ? '#7bdff2' : '#ff8fa3', 220, 'left');
    text(ctx, `${h.kills} / ${h.deaths} / ${h.assists}`, 760, y, 13, '#ffffff');
    text(ctx, `${h.level}`, 880, y, 13, '#ffffff');
    text(ctx, `${Math.floor(h.gold)}`, 1000, y, 13, '#ffd60a');
  });
  // Buttons.
  const again = { x: VIEW_W / 2 - 220, y: 560, w: 200, h: 52 };
  const menu = { x: VIEW_W / 2 + 20, y: 560, w: 200, h: 52 };
  rr(ctx, again.x, again.y, again.w, again.h, 12);
  ctx.fillStyle = '#ffb300';
  ctx.fill();
  text(ctx, 'PLAY AGAIN', again.x + again.w / 2, again.y + 26, 16, '#222222');
  ui.buttons.push({ id: 'again', ...again });
  rr(ctx, menu.x, menu.y, menu.w, menu.h, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  text(ctx, 'MAIN MENU', menu.x + menu.w / 2, menu.y + 26, 16, '#ffffff');
  ui.buttons.push({ id: 'menu', ...menu });
}
