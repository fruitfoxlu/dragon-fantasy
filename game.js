/* Dragon Fantasy (static)
   Vampire-Survivors-like MVP

   Controls:
   - Move: WASD / Arrow keys
   - Aim: auto / forward
   - Pause: P

   Weapons (mixed targeting):
   - Arcane Wand: auto-aim nearest (projectiles)
   - Dragon Bow: fire forward (projectiles)
   - Whirling Blades: orbit around hero (contact)
   - Chain Lightning: auto chain to nearby enemies (hitscan)
   - Meteor: random AoE + burning field DoT
   - Frost Shockwave: expanding ring + knockback + freeze (2s)
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const IS_COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

// Viewport-aware, full-screen canvas sizing
const view = { w: canvas.width, h: canvas.height, dpr: 1 };
function resizeCanvas() {
  const vv = window.visualViewport;
  const cssW = Math.max(320, Math.floor((vv?.width || window.innerWidth || 960)));
  const cssH = Math.max(240, Math.floor((vv?.height || window.innerHeight || 540)));
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

  view.w = cssW;
  view.h = cssH;
  view.dpr = dpr;

  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);

  // Draw using CSS-pixel coordinates
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

window.addEventListener('resize', () => resizeCanvas());
window.visualViewport?.addEventListener('resize', () => resizeCanvas());
window.visualViewport?.addEventListener('scroll', () => resizeCanvas());
resizeCanvas();
const DEBUG = new URLSearchParams(location.search).has('debug');
const BUILD = 'v14';

// Debug log (on-screen)
const debugLog = [];
function dbg(line) {
  if (!DEBUG) return;
  const t = (performance.now() / 1000).toFixed(2);
  debugLog.push(`${t}s ${line}`);
  while (debugLog.length > 12) debugLog.shift();
}

const ui = {
  hp: document.getElementById('hp'),
  level: document.getElementById('level'),
  xp: document.getElementById('xp'),
  xpNeed: document.getElementById('xpNeed'),
  kills: document.getElementById('kills'),
  time: document.getElementById('time'),
  hpFill: document.getElementById('hpFill'),
  sfxBtn: document.getElementById('sfxBtn'),
  langBtn: document.getElementById('langBtn'),
  start: document.getElementById('start'),
  startBtn: document.getElementById('startBtn'),
  levelup: document.getElementById('levelup'),
  modalTitle: document.getElementById('modalTitle'),
  choices: document.getElementById('choices'),
  joy: document.getElementById('joy'),
  joyKnob: document.querySelector('#joy .joyKnob'),
  pauseBtn: document.getElementById('pauseBtn'),

  hudSlots: document.getElementById('hudSlots'),
  hudWeapons: document.getElementById('hudWeapons'),
  hudMagic: document.getElementById('hudMagic'),
};

// ---------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const norm = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// ---------- audio (procedural fantasy-ish BGM)
let audio = {
  ctx: null,
  master: null,
  sfxOn: true,
};

// ---------- i18n
const I18N = {
  en: {
    sfx: (on) => `SFX: ${on ? 'ON' : 'OFF'}`, 
    levelUpTitle: 'Level Up! Choose 1',
    chestTitle: 'Treasure! Choose 1',
    replaceTitle: 'Weapon Slots Full — Replace One',
    skip: 'Skip',
    slotUp: (n) => `Weapon Slot +1 (now ${n})`,
    vacuum: 'Vacuum Gem: Loot pulled to you!',
  healPick: (n) => `Healed +${n} HP`,

    subtitle: 'Survive the horde. Grow your legend.',
    hintMove: 'Move: WASD / Arrow Keys (mobile: joystick)',
    hintAim: 'Aim: auto / forward',
    hintPause: 'Pause: P',
    startSub: 'Hold the line in the darkness. Upgrade your weapons and abilities.',
    liMove: '<strong>WASD/Arrows</strong> Move',
    liWand: '<strong>Wand</strong> Auto-target nearest enemy',
    liBow: '<strong>Bow</strong> Fire forward (faces your direction; unlock via level-up)',
    liPause: '<strong>P</strong> Pause',
    startBtn: 'Start Adventure',
    startHint: 'Hotkeys: Enter / Space',
    pauseBtn: 'Pause',

    w_wand: 'Arcane Wand',
    w_bow: 'Dragon Bow',
    w_holy: 'Holy Water',
    w_blades: 'Whirling Blades',
    w_lightning: 'Chain Lightning',
    w_meteor: 'Meteor',
    w_frost: 'Frost Shockwave',
    w_dragon: 'Dragon Soul',
  },
  zh: {
    sfx: (on) => `音效：${on ? '開' : '關'}`, 
    levelUpTitle: '升級！選 1 個',
    chestTitle: '寶箱！選 1 個',
    replaceTitle: '武器槽已滿：請替換一把',
    skip: '略過',
    slotUp: (n) => `武器槽 +1（目前 ${n}）`,
    vacuum: '真空寶石：全地圖掉落吸到你身上！',
    healPick: (n) => `回復 +${n} HP`,

    subtitle: '在黑暗中撐住，成長你的傳奇。',
    hintMove: '移動：WASD / 方向鍵（手機：搖桿）',
    hintAim: '瞄準：自動 / 朝前',
    hintPause: '暫停：P',
    startSub: '在黑暗中撐住，升級你的武器與能力。',
    liMove: '<strong>WASD/方向鍵</strong> 移動',
    liWand: '<strong>Wand</strong> 自動瞄準最近敵人',
    liBow: '<strong>Bow</strong> 朝前方射（依角色面向；升級解鎖）',
    liPause: '<strong>P</strong> 暫停',
    startBtn: '開始冒險',
    startHint: '快捷鍵：Enter / Space',
    pauseBtn: '暫停',

    w_wand: '秘法魔杖',
    w_bow: '龍焰弓',
    w_holy: '聖水',
    w_blades: '迴旋斬',
    w_lightning: '雷電鏈',
    w_meteor: '隕石術',
    w_frost: '冰凍衝擊波',
    w_dragon: '龍魂',
  },
};

let lang = (localStorage.getItem('df_lang') || 'zh');
if (!I18N[lang]) lang = 'zh';

function t(key, ...args) {
  const v = I18N[lang][key];
  return typeof v === 'function' ? v(...args) : v;
}

function weaponLabel(key) {
  return t(`w_${key}`) || key;
}

function nextDragonUpgradeId() {
  // sequence: (start slow, 2 crosses) -> speed -> +1 cross -> speed -> +1 cross ... until 6
  if (!weapons.dragon.enabled) return 'unlock_dragon';
  const w = weapons.dragon;
  if (w.crosses >= 6) return null;
  const stage = w.stage || 0;
  // even stages: speed, odd stages: more
  return (stage % 2 === 0) ? `dragon_speed_${stage/2+1}` : `dragon_more_${(stage+1)/2}`;
}

function applyStaticI18n() {
  const set = (id, html) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
  };
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
  };

  setText('subtitle', t('subtitle'));
  setText('build', BUILD);
  // control hints removed from top HUD
  setText('startSub', t('startSub'));
  set('liMove', t('liMove'));
  set('liWand', t('liWand'));
  set('liBow', t('liBow'));
  set('liPause', t('liPause'));
  setText('startBtn', t('startBtn'));
  setText('startHint', t('startHint'));
  if (ui.pauseBtn) ui.pauseBtn.textContent = t('pauseBtn');
}

function setLang(next) {
  lang = next;
  localStorage.setItem('df_lang', lang);
  if (ui.langBtn) ui.langBtn.textContent = (lang === 'zh') ? 'EN' : '中文';

  // update modal title if open
  if (ui.modalTitle) {
    if (state.mode === 'levelup') ui.modalTitle.textContent = t('levelUpTitle');
    if (state.mode === 'chest') ui.modalTitle.textContent = t('chestTitle');
    if (state.mode === 'replace') ui.modalTitle.textContent = t('replaceTitle');
  }

  applyStaticI18n();
  setSfxLabel();
}

function setSfxLabel() {
  if (!ui.sfxBtn) return;
  ui.sfxBtn.textContent = t('sfx', audio.sfxOn);
}

function ensureAudio() {
  if (audio.ctx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audio.ctx = new Ctx();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.22;
  audio.master.connect(audio.ctx.destination);
}

function sfxCast(kind) {
  if (!audio.sfxOn) return;
  try {
    ensureAudio();
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    const t = audio.ctx.currentTime;

    // distinct but gentle motifs
    let base = 520;
    if (kind === 'meteor') base = 460;
    if (kind === 'frost') base = 560;
    if (kind === 'lightning') base = 640;

    const det = 1 + (Math.random() * 0.02 - 0.01);
    const mk = (freq, when, dur, g0, kind='triangle') => {
      const o = audio.ctx.createOscillator();
      const g = audio.ctx.createGain();
      o.type = kind;
      o.frequency.setValueAtTime(freq, when);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(g0, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g);
      g.connect(audio.master);
      o.start(when);
      o.stop(when + dur + 0.02);
    };

    if (kind === 'meteor') {
      // low "whoom" + sparkle
      mk(base * det, t, 0.10, 0.04, 'sine');
      mk(base * 2.0 * det, t + 0.06, 0.07, 0.02, 'triangle');
    } else if (kind === 'frost') {
      // airy chime
      mk(base * det, t, 0.07, 0.03, 'triangle');
      mk(base * 1.5 * det, t + 0.04, 0.07, 0.02, 'sine');
    } else if (kind === 'lightning') {
      // quick zap
      mk(base * det, t, 0.05, 0.03, 'square');
      mk(base * 2.0 * det, t + 0.03, 0.06, 0.02, 'triangle');
    }
  } catch {}
}

function sfxHit() {
  if (!audio.sfxOn) return;
  try {
    ensureAudio();
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    const t = audio.ctx.currentTime;
    const base = 220 * (1 + (Math.random()*0.02-0.01));
    const mk = (freq, when, dur, g0, kind='square') => {
      const o = audio.ctx.createOscillator();
      const g = audio.ctx.createGain();
      o.type = kind;
      o.frequency.setValueAtTime(freq, when);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(g0, when + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g);
      g.connect(audio.master);
      o.start(when);
      o.stop(when + dur + 0.02);
    };
    mk(base, t, 0.06, 0.05, 'square');
    mk(base*0.66, t+0.03, 0.08, 0.035, 'triangle');
  } catch {}
}

function sfxPickup(type) {
  if (!audio.sfxOn) return;
  // Subtle, pleasant 32-bit style chime (varied so it won't get annoying)
  try {
    ensureAudio();
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    const t = audio.ctx.currentTime;
    const base = type === 'reward' ? 820 : (type === 'chest' ? 740 : 620);
    const det = 1 + (Math.random() * 0.018 - 0.009);
    const f1 = base * det;
    const f2 = base * 1.2599 * det; // minor third
    const f3 = base * 1.4983 * det; // fifth

    const mk = (freq, when, dur, g0, kind='triangle') => {
      const o = audio.ctx.createOscillator();
      const g = audio.ctx.createGain();
      o.type = kind;
      o.frequency.setValueAtTime(freq, when);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(g0, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g);
      g.connect(audio.master);
      o.start(when);
      o.stop(when + dur + 0.02);
    };

    // little arpeggio (fast)
    mk(f1, t, 0.08, 0.06);
    mk(f2, t + 0.05, 0.09, 0.05);
    mk(f3, t + 0.10, 0.10, 0.04);

    // tiny click for chests
    if (type === 'chest') mk(base * 2, t + 0.02, 0.04, 0.03, 'square');

    // extra sparkle for "reward" (e.g. chest drop)
    if (type === 'reward') {
      mk(base * 2.52, t + 0.14, 0.08, 0.035, 'triangle');
      mk(base * 3.0, t + 0.18, 0.10, 0.028, 'sine');
    }
  } catch {}
}

// music removed (SFX only)

function startMusic() {
  // music removed
}


function toggleSfx(on) {
  audio.sfxOn = (on !== undefined) ? !!on : !audio.sfxOn;
  setSfxLabel();
}

function formatTime(s) {
  const m = (s / 60) | 0;
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// ---------- pixel art (runtime sprites, GBA-ish 32x32)
function makeSprite(w, h, drawFn) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  drawFn(g);
  return c;
}

function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x | 0, y | 0, w | 0, h | 0);
}

function outline(g, x, y, w, h, color) {
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function hash2(ix, iy) {
  // deterministic pseudo-random based on tile coords
  let n = (ix * 374761393 + iy * 668265263) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = (n * 1274126177) >>> 0;
  return (n ^ (n >>> 16)) >>> 0;
}

const SPR = {
  // 16-bit GBA-ish swordman (4 dirs x 4 frames)
  hero: (() => {
    const P = {
      outline: '#0d0f16',
      skin1: '#f2c9a0',
      skin2: '#dba67b',
      hair1: '#7a4b22',
      hair2: '#5d3517',
      cape1: '#2e7f6e',
      cape2: '#1d5a4d',
      tunic1: '#cbd6e8',
      tunic2: '#8aa1c8',
      pants: '#2a3a5b',
      boot: '#1a1a22',
      steel1: '#e7edf7',
      steel2: '#a9b8d3',
      gold: '#f6c35c',
    };

    function drawSword(g, dir, frame) {
      // tiny sword position depends on dir
      const wob = (frame === 1 ? 1 : frame === 3 ? -1 : 0);
      if (dir === 2) { // right
        px(g, 23 + wob, 15, 6, 1, P.steel1);
        px(g, 23 + wob, 14, 1, 3, P.steel2);
        px(g, 22 + wob, 15, 1, 1, P.gold);
      } else if (dir === 1) { // left
        px(g, 3 + wob, 15, 6, 1, P.steel1);
        px(g, 8 + wob, 14, 1, 3, P.steel2);
        px(g, 9 + wob, 15, 1, 1, P.gold);
      } else if (dir === 0) { // down
        px(g, 15, 20 + wob, 1, 7, P.steel1);
        px(g, 14, 20 + wob, 1, 2, P.steel2);
        px(g, 15, 19 + wob, 1, 1, P.gold);
      } else { // up
        px(g, 16, 7 + wob, 1, 7, P.steel1);
        px(g, 17, 7 + wob, 1, 2, P.steel2);
        px(g, 16, 14 + wob, 1, 1, P.gold);
      }
    }

    function drawBase(dir, frame) {
      return makeSprite(32, 32, (g) => {
        g.clearRect(0, 0, 32, 32);

        const step = (frame === 1 ? 1 : frame === 3 ? -1 : 0);
        const bob = (frame === 2 ? 1 : 0);

        // cape (behind)
        if (dir === 0) {
          px(g, 10, 14 + bob, 12, 12, P.cape1);
          px(g, 10, 20 + bob, 12, 2, P.cape2);
        } else if (dir === 2) {
          px(g, 9, 15 + bob, 10, 12, P.cape1);
          px(g, 9, 22 + bob, 10, 2, P.cape2);
        } else if (dir === 1) {
          px(g, 13, 15 + bob, 10, 12, P.cape1);
          px(g, 13, 22 + bob, 10, 2, P.cape2);
        } else {
          // up: cape less visible
          px(g, 12, 16 + bob, 8, 8, P.cape2);
        }

        // head
        if (dir === 3) {
          // back of head (hair)
          px(g, 12, 6 + bob, 8, 7, P.hair1);
          px(g, 12, 11 + bob, 8, 2, P.hair2);
        } else {
          px(g, 12, 6 + bob, 8, 7, P.skin1);
          px(g, 12, 6 + bob, 8, 2, P.hair1);
          px(g, 12, 8 + bob, 8, 1, P.hair2);
          // eyes (not for back view)
          if (dir !== 3) {
            px(g, 14, 10 + bob, 1, 1, P.outline);
            px(g, 17, 10 + bob, 1, 1, P.outline);
          }
        }
        // outline head
        outline(g, 12, 6 + bob, 8, 7, P.outline);

        // torso
        px(g, 11, 13 + bob, 10, 8, P.tunic1);
        px(g, 12, 16 + bob, 8, 2, P.tunic2);
        // belt
        px(g, 11, 19 + bob, 10, 1, P.boot);
        px(g, 14, 19 + bob, 4, 1, P.gold);
        outline(g, 11, 13 + bob, 10, 8, 'rgba(0,0,0,.28)');

        // arms
        const armY = 14 + bob;
        if (dir === 2) {
          px(g, 20, armY, 3, 7, P.tunic2);
          px(g, 9, armY, 3, 7, P.tunic1);
        } else if (dir === 1) {
          px(g, 9, armY, 3, 7, P.tunic2);
          px(g, 20, armY, 3, 7, P.tunic1);
        } else {
          px(g, 9, armY, 3, 7, P.tunic2);
          px(g, 20, armY, 3, 7, P.tunic2);
        }

        // legs (stepping)
        const legY = 21 + bob;
        if (dir === 0) {
          px(g, 12, legY, 4, 8, P.pants);
          px(g, 16, legY, 4, 8, P.pants);
          px(g, 12 + step, legY + 6, 4, 2, P.boot);
          px(g, 16 - step, legY + 6, 4, 2, P.boot);
        } else if (dir === 3) {
          px(g, 12, legY, 4, 8, P.pants);
          px(g, 16, legY, 4, 8, P.pants);
          px(g, 12 + step, legY + 6, 4, 2, P.boot);
          px(g, 16 - step, legY + 6, 4, 2, P.boot);
        } else {
          // side view
          const fx = dir === 2 ? 15 : 13;
          px(g, fx, legY, 5, 8, P.pants);
          px(g, fx + step, legY + 6, 5, 2, P.boot);
        }

        // shadow
        px(g, 10, 30, 12, 1, 'rgba(0,0,0,.35)');

        // sword
        drawSword(g, dir, frame);
      });
    }

    const frames = Array.from({ length: 4 }, () => Array(4).fill(null));
    for (let dir = 0; dir < 4; dir++) {
      for (let f = 0; f < 4; f++) frames[dir][f] = drawBase(dir, f);
    }
    return frames;
  })(),

  skullMelee: (() => {
    const P = {
      outline: '#0d0f16',
      bone1: '#efece3',
      bone2: '#d6d1c4',
      bone3: '#bdb7ab',
      cloth1: '#5b3b55',
      cloth2: '#40273b',
      steel: '#a9b8d3',
      gold: '#f6c35c',
    };

    function frame(dir, f) {
      return makeSprite(32, 32, (g) => {
        const step = (f === 1 ? 1 : f === 3 ? -1 : 0);
        const bob = (f === 2 ? 1 : 0);

        // cloak rag
        if (dir !== 3) {
          px(g, 10, 14 + bob, 12, 10, P.cloth1);
          px(g, 10, 20 + bob, 12, 2, P.cloth2);
        }

        // skull
        px(g, 12, 6 + bob, 8, 7, P.bone1);
        px(g, 13, 8 + bob, 2, 2, P.outline);
        px(g, 17, 8 + bob, 2, 2, P.outline);
        px(g, 15, 10 + bob, 2, 2, P.outline);
        px(g, 13, 12 + bob, 6, 2, P.bone2);
        outline(g, 12, 6 + bob, 8, 7, P.outline);

        // torso / ribs
        px(g, 11, 14 + bob, 10, 8, P.bone2);
        px(g, 12, 15 + bob, 8, 1, P.bone3);
        px(g, 12, 17 + bob, 8, 1, P.bone3);
        px(g, 12, 19 + bob, 8, 1, P.bone3);

        // arms
        if (dir === 2) {
          px(g, 20, 15 + bob, 4, 7, P.bone2);
          px(g, 8, 15 + bob, 3, 7, P.bone2);
        } else if (dir === 1) {
          px(g, 8, 15 + bob, 4, 7, P.bone2);
          px(g, 21, 15 + bob, 3, 7, P.bone2);
        } else {
          px(g, 8, 15 + bob, 3, 7, P.bone2);
          px(g, 21, 15 + bob, 3, 7, P.bone2);
        }

        // legs
        px(g, 12, 22 + bob, 4, 7, P.bone2);
        px(g, 16, 22 + bob, 4, 7, P.bone2);
        px(g, 12 + step, 28 + bob, 4, 2, P.bone3);
        px(g, 16 - step, 28 + bob, 4, 2, P.bone3);

        // weapon: rusty spear/axe hint
        if (dir === 2) {
          px(g, 25, 16 + bob, 2, 10, P.steel);
          px(g, 24, 15 + bob, 4, 2, P.gold);
        } else if (dir === 1) {
          px(g, 5, 16 + bob, 2, 10, P.steel);
          px(g, 4, 15 + bob, 4, 2, P.gold);
        } else {
          px(g, 15, 20 + bob, 1, 9, P.steel);
          px(g, 14, 20 + bob, 3, 1, P.gold);
        }

        // shadow
        px(g, 10, 30, 12, 1, 'rgba(0,0,0,.35)');
      });
    }

    const frames = Array.from({ length: 4 }, () => Array(4).fill(null));
    for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 4; f++) frames[dir][f] = frame(dir, f);
    return frames;
  })(),

  skullRanger: (() => {
    const P = {
      outline: '#0d0f16',
      bone1: '#efece3',
      bone2: '#d6d1c4',
      bone3: '#bdb7ab',
      cloth1: '#7a2c2c',
      cloth2: '#512020',
      wood1: '#b5833e',
      wood2: '#7a4b22',
      gold: '#f6c35c',
    };

    function frame(dir, f) {
      return makeSprite(32, 32, (g) => {
        const step = (f === 1 ? 1 : f === 3 ? -1 : 0);
        const bob = (f === 2 ? 1 : 0);

        // cloak
        px(g, 10, 13 + bob, 12, 12, P.cloth1);
        px(g, 10, 20 + bob, 12, 2, P.cloth2);

        // skull
        px(g, 12, 6 + bob, 8, 7, P.bone1);
        px(g, 13, 8 + bob, 2, 2, P.outline);
        px(g, 17, 8 + bob, 2, 2, P.outline);
        px(g, 15, 10 + bob, 2, 2, P.outline);
        px(g, 13, 12 + bob, 6, 2, P.bone2);
        outline(g, 12, 6 + bob, 8, 7, P.outline);

        // torso
        px(g, 11, 14 + bob, 10, 7, P.bone2);
        px(g, 12, 15 + bob, 8, 1, P.bone3);
        px(g, 12, 17 + bob, 8, 1, P.bone3);

        // legs
        px(g, 12, 22 + bob, 4, 7, P.bone2);
        px(g, 16, 22 + bob, 4, 7, P.bone2);
        px(g, 12 + step, 28 + bob, 4, 2, P.bone3);
        px(g, 16 - step, 28 + bob, 4, 2, P.bone3);

        // bow
        const wob = (f === 1 ? 1 : f === 3 ? -1 : 0);
        if (dir === 1) {
          px(g, 6 + wob, 14 + bob, 1, 12, P.wood1);
          px(g, 5 + wob, 14 + bob, 1, 2, P.wood2);
          px(g, 7 + wob, 24 + bob, 1, 2, P.wood2);
          px(g, 6 + wob, 15 + bob, 1, 10, P.bone1); // string
          px(g, 7 + wob, 19 + bob, 1, 1, P.gold);
        } else {
          px(g, 25 + wob, 14 + bob, 1, 12, P.wood1);
          px(g, 24 + wob, 14 + bob, 1, 2, P.wood2);
          px(g, 26 + wob, 24 + bob, 1, 2, P.wood2);
          px(g, 25 + wob, 15 + bob, 1, 10, P.bone1);
          px(g, 24 + wob, 19 + bob, 1, 1, P.gold);
        }

        // shadow
        px(g, 10, 30, 12, 1, 'rgba(0,0,0,.35)');
      });
    }

    const frames = Array.from({ length: 4 }, () => Array(4).fill(null));
    for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 4; f++) frames[dir][f] = frame(dir, f);
    return frames;
  })(),

  soul: makeSprite(12, 12, (g) => {
    px(g, 5, 1, 2, 2, '#bffcf0');
    px(g, 4, 3, 4, 4, '#7cf2d0');
    px(g, 3, 5, 6, 5, 'rgba(124,242,208,.85)');
    px(g, 4, 6, 1, 1, '#ffffff');
  }),

  chest: makeSprite(16, 16, (g) => {
    px(g, 2, 6, 12, 8, '#7a4b22');
    px(g, 2, 4, 12, 3, '#9b6a30');
    px(g, 2, 8, 12, 1, '#5d3517');
    px(g, 7, 7, 2, 2, '#f6c35c');
    outline(g, 2, 4, 12, 10, 'rgba(0,0,0,.35)');
  }),

  blade: makeSprite(14, 14, (g) => {
    px(g, 6, 1, 2, 10, '#d9d4c7');
    px(g, 5, 2, 1, 8, '#bfc0ca');
    px(g, 8, 2, 1, 8, '#bfc0ca');
    px(g, 5, 10, 4, 2, '#6b4d2a');
    px(g, 6, 12, 2, 1, '#f6c35c');
  }),

  orbTeal: makeSprite(10, 10, (g) => {
    px(g, 4, 1, 2, 2, '#ffffff');
    px(g, 3, 3, 4, 4, '#7cf2d0');
    px(g, 2, 4, 6, 4, 'rgba(124,242,208,.85)');
  }),

  orbGold: makeSprite(10, 10, (g) => {
    px(g, 4, 1, 2, 2, '#fff6dc');
    px(g, 3, 3, 4, 4, '#f6c35c');
    px(g, 2, 4, 6, 4, 'rgba(246,195,92,.85)');
  }),

  vacuumGem: makeSprite(16, 16, (g) => {
    // a bright cyan gem
    px(g, 7, 1, 2, 2, '#ffffff');
    px(g, 6, 3, 4, 4, '#bffcf0');
    px(g, 5, 6, 6, 6, '#7cf2d0');
    px(g, 6, 7, 4, 4, '#36a15f');
    px(g, 7, 6, 2, 2, '#fff6dc');
    // outline
    outline(g, 5, 3, 6, 9, 'rgba(0,0,0,.28)');
  }),

  heal: makeSprite(16, 16, (g) => {
    // red potion
    px(g, 6, 2, 4, 3, '#cbd6e8');
    px(g, 5, 5, 6, 9, '#b8303a');
    px(g, 6, 6, 4, 6, '#e45b63');
    px(g, 6, 8, 2, 2, '#fff6dc');
    outline(g, 5, 5, 6, 9, 'rgba(0,0,0,.35)');
  }),

  dragonCross: makeSprite(20, 20, (g) => {
    // bright cross
    px(g, 9, 2, 2, 16, '#f6c35c');
    px(g, 2, 9, 16, 2, '#7cf2d0');
    px(g, 9, 9, 2, 2, '#fff6dc');
    outline(g, 2, 2, 16, 16, 'rgba(0,0,0,.18)');
  }),

  boneShot: makeSprite(10, 6, (g) => {
    px(g, 1, 2, 8, 2, '#e9e6dd');
    px(g, 0, 1, 2, 1, '#d6d1c4');
    px(g, 0, 4, 2, 1, '#d6d1c4');
    px(g, 8, 1, 2, 1, '#d6d1c4');
    px(g, 8, 4, 2, 1, '#d6d1c4');
  }),

  // --- Forest adventure tiles
  grassA: makeSprite(32, 32, (g) => {
    px(g, 0, 0, 32, 32, '#1f6b3a');
    // subtle texture
    px(g, 2, 5, 2, 1, '#2d8a4f');
    px(g, 10, 9, 2, 1, '#2d8a4f');
    px(g, 20, 14, 2, 1, '#2d8a4f');
    px(g, 26, 22, 2, 1, '#2d8a4f');
    px(g, 6, 20, 1, 1, '#174a28');
    px(g, 15, 24, 1, 1, '#174a28');
    // tiny flowers
    if ((hash2(1, 7) & 3) === 1) {
      px(g, 24, 10, 1, 1, '#fff6dc');
      px(g, 25, 10, 1, 1, '#f6c35c');
    }
  }),
  grassB: makeSprite(32, 32, (g) => {
    px(g, 0, 0, 32, 32, '#216f3d');
    px(g, 4, 12, 2, 1, '#2d8a4f');
    px(g, 14, 6, 2, 1, '#2d8a4f');
    px(g, 22, 18, 2, 1, '#2d8a4f');
    px(g, 28, 26, 2, 1, '#2d8a4f');
    px(g, 8, 24, 1, 1, '#174a28');
    px(g, 18, 28, 1, 1, '#174a28');
  }),
  pathA: makeSprite(32, 32, (g) => {
    px(g, 0, 0, 32, 32, '#6b4d2a');
    px(g, 0, 0, 32, 32, 'rgba(0,0,0,.08)');
    // lighter sand highlights
    px(g, 3, 8, 6, 2, '#8a6a3a');
    px(g, 18, 12, 9, 2, '#8a6a3a');
    px(g, 7, 22, 8, 2, '#8a6a3a');
    // pebbles
    px(g, 10, 16, 2, 2, '#3b2b18');
    px(g, 24, 24, 2, 2, '#3b2b18');
  }),
  pathB: makeSprite(32, 32, (g) => {
    px(g, 0, 0, 32, 32, '#644626');
    px(g, 0, 0, 32, 32, 'rgba(0,0,0,.08)');
    px(g, 6, 10, 10, 2, '#87633a');
    px(g, 12, 20, 12, 2, '#87633a');
    px(g, 22, 6, 6, 2, '#87633a');
    px(g, 8, 26, 2, 2, '#3b2b18');
  }),
  stoneA: makeSprite(32, 32, (g) => {
    px(g, 0, 0, 32, 32, '#3c4658');
    // slab edges
    px(g, 0, 0, 32, 1, 'rgba(0,0,0,.30)');
    px(g, 0, 0, 1, 32, 'rgba(0,0,0,.30)');
    px(g, 0, 31, 32, 1, 'rgba(255,255,255,.06)');
    px(g, 31, 0, 1, 32, 'rgba(255,255,255,.06)');
    // cracks
    px(g, 6, 12, 12, 1, 'rgba(0,0,0,.20)');
    px(g, 18, 12, 1, 10, 'rgba(0,0,0,.18)');
    px(g, 12, 22, 10, 1, 'rgba(0,0,0,.14)');
  }),
  stoneB: makeSprite(32, 32, (g) => {
    px(g, 0, 0, 32, 32, '#364152');
    px(g, 0, 0, 32, 1, 'rgba(0,0,0,.30)');
    px(g, 0, 0, 1, 32, 'rgba(0,0,0,.30)');
    px(g, 0, 31, 32, 1, 'rgba(255,255,255,.06)');
    px(g, 31, 0, 1, 32, 'rgba(255,255,255,.06)');
    px(g, 8, 8, 14, 1, 'rgba(0,0,0,.18)');
    px(g, 14, 8, 1, 14, 'rgba(0,0,0,.16)');
  }),

  // --- decorations
  bush: makeSprite(32, 32, (g) => {
    px(g, 6, 16, 20, 12, '#1b5a33');
    px(g, 8, 14, 16, 4, '#257445');
    px(g, 10, 12, 12, 3, '#2d8a4f');
    px(g, 12, 10, 8, 3, '#36a15f');
    // outline bottom
    px(g, 6, 28, 20, 1, 'rgba(0,0,0,.25)');
  }),

  flowers: makeSprite(32, 32, (g) => {
    px(g, 0, 0, 32, 32, 'rgba(0,0,0,0)');
    // petals
    px(g, 10, 18, 2, 2, '#fff6dc');
    px(g, 12, 18, 2, 2, '#f6c35c');
    px(g, 18, 22, 2, 2, '#fff6dc');
    px(g, 20, 22, 2, 2, '#f6c35c');
    // stems
    px(g, 11, 20, 1, 6, '#2d8a4f');
    px(g, 19, 24, 1, 6, '#2d8a4f');
  }),

  rock: makeSprite(32, 32, (g) => {
    px(g, 10, 18, 12, 10, '#485468');
    px(g, 12, 16, 8, 4, '#556379');
    px(g, 12, 20, 4, 2, '#6b7a92');
    px(g, 20, 24, 2, 2, '#2b3342');
    px(g, 10, 28, 12, 1, 'rgba(0,0,0,.25)');
  }),

  log: makeSprite(32, 32, (g) => {
    px(g, 8, 20, 16, 8, '#7a4b22');
    px(g, 8, 22, 16, 1, '#5d3517');
    px(g, 8, 26, 16, 1, '#5d3517');
    px(g, 7, 21, 1, 6, '#9b6a30');
    px(g, 24, 21, 1, 6, '#9b6a30');
    px(g, 9, 21, 2, 6, 'rgba(0,0,0,.10)');
    px(g, 22, 21, 2, 6, 'rgba(0,0,0,.10)');
    px(g, 8, 28, 16, 1, 'rgba(0,0,0,.25)');
  }),
};

function tileKind(tx, ty) {
  // Two winding paths + occasional stone ruins patches.
  const h = hash2(tx, ty);

  const y1 = Math.floor(ty * 0.55 + Math.sin(tx * 0.28) * 3);
  const y2 = Math.floor(ty * 0.45 + Math.sin(tx * 0.22 + 2.2) * 4);
  const onPath = (Math.abs(ty - y1) <= 1) || (Math.abs(ty - y2) <= 1);

  if (onPath) return (h & 1) ? 'pathA' : 'pathB';

  // ruins: clustered stones
  const cluster = ((hash2((tx / 3) | 0, (ty / 3) | 0) & 255) / 255);
  if (cluster > 0.82 && (h & 7) === 0) return (h & 1) ? 'stoneA' : 'stoneB';

  return (h & 1) ? 'grassA' : 'grassB';
}

function decorKind(tx, ty) {
  const h = hash2(tx, ty);
  const tile = tileKind(tx, ty);
  if (tile !== 'grassA' && tile !== 'grassB') return null;

  // Keep spawn area clear (so camera feels centered and you don't get stuck).
  // Spawn is near (0,0) tile.
  if (Math.abs(tx) <= 4 && Math.abs(ty) <= 4) return null;

  // much sparser + fewer blocking obstacles (simpler gameplay)
  const r = (h & 255) / 255;
  if (r < 0.04) return 'bush';
  if (r < 0.055) return 'flowers';
  if (r < 0.060) return 'rock';
  if (r < 0.064) return 'log';
  return null;
}

function decorIsBlocking(kind) {
  // No blocking obstacles: focus on dodging mobs and collecting loot.
  return false;
}

function decorRadius(kind) {
  if (kind === 'rock') return 14;
  if (kind === 'log') return 16;
  if (kind === 'bush') return 18;
  return 0;
}

function collidesObstacle(x, y, r) {
  // Disabled: nothing blocks player movement.
  return false;
}

function drawSprite(img, sx, sy, { scale = 1, rot = 0, alpha = 1 } = {}) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);
  if (rot) ctx.rotate(rot);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// ---------- input
const keys = new Set();
let mouse = { x: view.w / 2, y: view.h / 2, down: false };
let paused = false;

// balance knobs
// Leveling curve: easy to reach Lv5, then slows down.
function xpGainMul(level) {
  return level < 5 ? 1.0 : 0.5;
}

window.addEventListener('keydown', (e) => {
  if (state.mode === 'start') {
    if (e.code === 'Enter' || e.code === 'Space') startGame();
    return;
  }

  if (e.code === 'KeyP') {
    paused = !paused;
    if (!paused) requestAnimationFrame(loop);
    return;
  }
  if (state.mode === 'levelup' || state.mode === 'chest') {
    if (e.code === 'Digit1') chooseUpgrade(0);
    if (e.code === 'Digit2') chooseUpgrade(1);
    if (e.code === 'Digit3') chooseUpgrade(2);
    return;
  }
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * view.w;
  mouse.y = ((e.clientY - r.top) / r.height) * view.h;
});
canvas.addEventListener('mousedown', () => (mouse.down = true));
canvas.addEventListener('mouseup', () => (mouse.down = false));

// ---------- touch joystick
const joy = {
  active: false,
  id: null,
  cx: 0,
  cy: 0,
  x: 0,
  y: 0,
  dx: 0,
  dy: 0,
};

function setJoy(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  joy.dx = clamp(dx, -1, 1);
  joy.dy = clamp(dy, -1, 1);
  if (ui.joyKnob) {
    const max = 44;
    ui.joyKnob.style.transform = `translate(calc(-50% + ${joy.dx * max}px), calc(-50% + ${joy.dy * max}px))`;
  }
}

function resetJoy() {
  joy.active = false;
  joy.id = null;
  setJoy(0, 0);
}

ui.joy?.addEventListener('pointerdown', (e) => {
  joy.active = true;
  joy.id = e.pointerId;
  ui.joy.setPointerCapture(e.pointerId);
  const r = ui.joy.getBoundingClientRect();
  joy.cx = r.left + r.width / 2;
  joy.cy = r.top + r.height / 2;
  joy.x = e.clientX;
  joy.y = e.clientY;
  setJoy((joy.x - joy.cx) / 44, (joy.y - joy.cy) / 44);
});
ui.joy?.addEventListener('pointermove', (e) => {
  if (!joy.active || e.pointerId !== joy.id) return;
  joy.x = e.clientX;
  joy.y = e.clientY;
  setJoy((joy.x - joy.cx) / 44, (joy.y - joy.cy) / 44);
});
ui.joy?.addEventListener('pointerup', (e) => {
  if (e.pointerId !== joy.id) return;
  resetJoy();
});
ui.joy?.addEventListener('pointercancel', resetJoy);

ui.pauseBtn?.addEventListener('click', () => {
  paused = !paused;
  if (!paused) requestAnimationFrame(loop);
});

ui.langBtn?.addEventListener('click', () => {
  setLang(lang === 'zh' ? 'en' : 'zh');
});

// SFX toggle (default ON)
try {
  const saved = localStorage.getItem('df_sfx');
  if (saved !== null) audio.sfxOn = saved === '1';
} catch {}
setSfxLabel();
ui.sfxBtn?.addEventListener('click', () => {
  toggleSfx();
  try { localStorage.setItem('df_sfx', audio.sfxOn ? '1' : '0'); } catch {}
});

// init language (deferred until after state init to avoid ReferenceError)


// ---------- game state
const state = {
  t0: performance.now(),
  elapsed: 0,
  mode: 'start', // start | play | levelup | dead
  kills: 0,
  camera: { x: 0, y: 0 },

  nextBossAt: 300,
};

const player = {
  x: 0,
  y: 0,
  r: 14,
  hp: 100,
  hpMax: 100,
  speed: 220,
  invuln: 0,
  level: 1,
  xp: 0,
  xpNeed: 10,
  magnet: 70,
  weaponSlots: 4,
  weaponSlotsMax: 6,
  dir: 0,      // 0 down, 1 left, 2 right, 3 up
  moving: false,
  anim: 0,
};

// weapon model:
// - projectile types: kind auto|forward uses bullets
// - special types implement their own firing in updateWeapons
const WEAPON_KEYS = ['wand','bow','holy','blades'];
const MAGIC_KEYS = ['lightning','frost','meteor','dragon'];

const weapons = {
  wand: {
    name: 'Arcane Wand',
    lvl: 1,
    kind: 'auto',
    enabled: true,
    cd: 0,
    baseCooldown: 0.45,
    damage: 12,
    projectiles: 1,
    spread: 0.12,
    speed: 520,
    pierce: 0,
  },
  bow: {
    name: 'Dragon Bow',
    lvl: 0,
    kind: 'forward',
    enabled: false,
    cd: 0,
    baseCooldown: 0.8,
    damage: 18,
    projectiles: 1,
    spread: 0.03,
    speed: 620,
    pierce: 1,
  },

  holy: {
    name: 'Holy Water',
    kind: 'cardinal',
    enabled: false,
    lvl: 0,
    cd: 0,
    baseCooldown: 0.95,
    damage: 14,
    speed: 520,
    pierce: 1,
  },

  blades: {
    name: 'Whirling Blades',
    lvl: 0,
    kind: 'orbit',
    enabled: false,
    cd: 0, // not used
    blades: 1,
    radius: 46,
    bladeR: 9,
    damage: 14,
    tick: 0.22, // per-enemy hit interval
    ang: 0,
    angSpeed: 3.4, // rad/s
  },

  lightning: {
    name: 'Chain Lightning',
    lvl: 0,
    kind: 'chain',
    enabled: false,
    cd: 0,
    baseCooldown: 1.1,
    damage: 20,
    chains: 3,
    range: 190,
  },

  meteor: {
    name: 'Meteor',
    lvl: 0,
    kind: 'meteor',
    followTrail: false,
    trailDelay: 1.0,
    enabled: false,
    cd: 0,
    baseCooldown: 2.4,
    impactDamage: 44,
    impactRadius: 90,
    burnRadius: 80,
    burnDps: 16,
    burnDuration: 2.6,
    delay: 0.6,
    scatter: 320, // target radius around player
  },

  frost: {
    name: 'Frost Shockwave',
    lvl: 0,
    kind: 'ice',
    enabled: false,
    cd: 0,
    baseCooldown: 2.1,
    damage: 18,
    freezeSec: 2.0,
    knock: 280,
    maxRadius: 230,
    speed: 520, // expansion speed
  },

  dragon: {
    name: 'Dragon Soul',
    kind: 'cross',
    enabled: false,
    lvl: 0,
    stage: 0,
    crosses: 2,
    radius: 120,
    crossSize: 42,
    damage: 60,
    tick: 0.18,
    ang: 0,
    angSpeed: 1.1,
    jitter: 0.45,
  },
};

const bullets = [];       // player bullets {x,y,vx,vy,r, dmg, pierce, life, color}
const enemyBullets = [];  // enemy bullets  {x,y,vx,vy,r, dmg, life}
const enemies = [];       // {x,y,r, hp, speed, touchDmg, vx,vy, frozenUntil, burnUntil, burnDps, bladeHitCd, type, elite, shootCd, shootBase, shootSpeed, shootDmg}
const gems = [];          // {x,y,r, xp}
const chests = [];        // {x,y,r}
const slotOrbs = [];      // {x,y,r}
const vacuumGems = [];    // {x,y,r}
const heals = [];         // {x,y,r, amount}

// Visual/area effects
const effects = [];

const toast = { text: '', t: 0 };

// Player trail for "meteor follows your previous steps" upgrades
const playerTrail = []; // {x,y,t} (t in seconds elapsed)
let trailAcc = 0;
// effects types:
// - bolt {type:'bolt', pts:[[x,y]..], t, ttl}
// - meteor {type:'meteor', x,y, t, ttl, delay, radius, stage:'fall'|'impact'}
// - burn {type:'burn', x,y, t, ttl, radius, dps}
// - wave {type:'wave', x,y, t, ttl, r0, r1}
// - boss_tell / elite_tell (charge telegraph)
// - boss_slam_warn / boss_slam (AoE warning + damage)

function spawnEnemy() {

  const margin = 80;
  const w = view.w, h = view.h;
  const side = (Math.random() * 4) | 0;
  let sx = 0, sy = 0;
  const px = player.x, py = player.y;

  if (side === 0) { sx = px + rand(-w / 2, w / 2); sy = py - h / 2 - margin; }
  if (side === 1) { sx = px + w / 2 + margin; sy = py + rand(-h / 2, h / 2); }
  if (side === 2) { sx = px + rand(-w / 2, w / 2); sy = py + h / 2 + margin; }
  if (side === 3) { sx = px - w / 2 - margin; sy = py + rand(-h / 2, h / 2); }

  const tier = Math.min(6, 1 + (state.elapsed / 55) | 0);

  // enemy mix
  const rangerChance = clamp(0.12 + state.elapsed / 260 * 0.05, 0.12, 0.22);
  const eliteChance = clamp(0.02 + state.elapsed / 420 * 0.03, 0.02, 0.08);

  let type = (Math.random() < rangerChance) ? 'ranger' : 'melee';
  const elite = Math.random() < eliteChance;
  const big = (!elite && Math.random() < 0.14); // second mob variant: big brute

  let r = 11 + tier * 1.5;
  let hp = 24 + tier * 10 + rand(0, 10);
  let speed = 72 + tier * 14 + rand(-8, 10);

  // Difficulty curve by player level:
  // - before Lv10: normal mobs are easy (one-shot by Wand)
  // - Lv10+: scales per level but capped to keep the "爽" feeling
  if (!elite) {
    if (player.level < 10) {
      // Early game: cap mob HP by the currently weakest weapon so everything feels "one-shot".
      const candidates = [];
      if (weapons.wand.enabled) candidates.push(weapons.wand.damage);
      if (weapons.bow.enabled) candidates.push(weapons.bow.damage);
      if (weapons.holy.enabled) candidates.push(weapons.holy.damage);
      if (weapons.blades.enabled) candidates.push(weapons.blades.damage);
      if (weapons.lightning.enabled) candidates.push(weapons.lightning.damage);
      if (weapons.frost.enabled) candidates.push(weapons.frost.damage);
      if (weapons.meteor.enabled) candidates.push(weapons.meteor.impactDamage);

      const weakest = Math.max(1, Math.min(...(candidates.length ? candidates : [weapons.wand.damage])));
      hp = Math.min(hp, weakest * 1.25);
    } else {
      const mul = Math.min(2.6, 1 + 0.16 * (player.level - 10));
      hp *= mul;
    }
  }

  if (type === 'ranger') {
    r += 1;
    hp *= 0.9;
    speed *= 0.95;
  }

  if (big) {
    // big brute: 2x size, 2x HP, slower than the current big (half its previous speed)
    r *= 2.0;
    hp *= 2.0;
    speed *= 1.0;
    // force melee so it feels distinct
    type = 'melee';
  }

  if (elite) {
    r *= 5.0;
    hp *= 15.0; // 5x tougher than before (was 3.0)
    speed *= 0.70;
  }

  enemies.push({
    x: sx,
    y: sy,
    r,
    hp,
    speed,
    big,
    touchDmg: (10 + tier * 2) * (elite ? 1.25 : 1),
    vx: 0,
    vy: 0,
    frozenUntil: 0,
    burnUntil: 0,
    burnDps: 0,
    bladeHitCd: 0,

    type,
    elite,
    dir: 0,
    anim: rand(0, 10),
    shootCd: rand(0.2, 1.0),
    shootBase: elite ? 1.15 : 1.45,
    shootSpeed: elite ? 420 : 380,
    shootDmg: elite ? 14 : 10,

    // elite/boss skill timers
    chargeCd: elite ? rand(3.0, 5.0) : 0,
    chargeT: 0,
    chargeVx: 0,
    chargeVy: 0,
    slamCd: 0,
  });
}

function spawnBoss() {
  // Big Boss: tougher, unique attacks, better loot.
  // Two variants: normal (gold) and purple (harder, double treasure).
  const margin = 120;
  const w = view.w, h = view.h;
  const side = (Math.random() * 4) | 0;
  let sx = 0, sy = 0;
  const px = player.x, py = player.y;

  if (side === 0) { sx = px + rand(-w / 2, w / 2); sy = py - h / 2 - margin; }
  if (side === 1) { sx = px + w / 2 + margin; sy = py + rand(-h / 2, h / 2); }
  if (side === 2) { sx = px + rand(-w / 2, w / 2); sy = py + h / 2 + margin; }
  if (side === 3) { sx = px - w / 2 - margin; sy = py + rand(-h / 2, h / 2); }

  const purple = Math.random() < 0.35;
  const bossHpBase = (1200 + state.elapsed * 3.2) * 5;

  const boss = {
    x: sx,
    y: sy,
    r: 44,
    hp: bossHpBase * (purple ? 2 : 1),
    speed: 95,
    touchDmg: 28,
    vx: 0,
    vy: 0,
    frozenUntil: 0,
    burnUntil: 0,
    burnDps: 0,
    bladeHitCd: 0,

    type: 'boss',
    elite: true,
    purpleBoss: purple,
    dir: 0,
    anim: 0,

    // boss skills
    chargeCd: 3.0,
    chargeT: 0,
    chargeVx: 0,
    chargeVy: 0,
    slamCd: 5.0,
    slamWindup: 0,
    summonCd: 7.5,
  };

  enemies.push(boss);
}

function fireBullet(fromX, fromY, dirX, dirY, spec) {
  const [nx, ny] = norm(dirX, dirY);
  bullets.push({
    x: fromX,
    y: fromY,
    vx: nx * spec.speed,
    vy: ny * spec.speed,
    r: 4,
    dmg: spec.damage,
    pierce: spec.pierce,
    life: 1.6,
    color: spec.kind === 'forward' ? '#f6c35c' : '#7cf2d0',
  });
}

function nearestEnemy(fromX = player.x, fromY = player.y) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    const d = (e.x - fromX) ** 2 + (e.y - fromY) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function killEnemyAt(index) {
  const e = enemies[index];
  if (!e) return;
  state.kills++;

  // drop gem(s)
  const baseXp = (4 + ((state.elapsed / 45) | 0)) * xpGainMul(player.level);
  const drops = e.elite ? 3 : 1;
  for (let i = 0; i < drops; i++) {
    gems.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), r: 6, xp: baseXp });
  }

  // loot
  if (e.type === 'boss') {
    // Big Boss always drops big rewards.
    sfxPickup('reward');
    const chestMul = e.purpleBoss ? 2 : 1;
    for (let k = 0; k < 3 * chestMul; k++) {
      chests.push({ x: e.x + rand(-22, 22), y: e.y + rand(-22, 22), r: 12 });
    }
    for (let k = 0; k < 10; k++) {
      gems.push({ x: e.x + rand(-28, 28), y: e.y + rand(-28, 28), r: 6, xp: baseXp * 2 });
    }
    // Boss: guaranteed vacuum gem
    vacuumGems.push({ x: e.x, y: e.y, r: 14 });
  } else if (e.elite) {
    // Elite: guaranteed chest + extra chance.
    sfxPickup('reward');
    chests.push({ x: e.x, y: e.y, r: 12 });
    if (Math.random() < 0.35) chests.push({ x: e.x + rand(-14, 14), y: e.y + rand(-14, 14), r: 12 });

    // Elite bonus drops: slot-orb only if not maxed; otherwise redistribute odds.
    const roll = Math.random();
    if (player.weaponSlots < player.weaponSlotsMax) {
      if (roll < 0.22) {
        slotOrbs.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), r: 10 });
      } else if (roll < 0.32) {
        vacuumGems.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), r: 12 });
      }
    } else {
      // slot maxed: shift that probability to other loot
      if (roll < 0.18) {
        vacuumGems.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), r: 12 });
      } else if (roll < 0.30) {
        heals.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), r: 12, amount: 25 });
      }
    }
  } else {
    // Normal mobs: small chance to drop a healing potion.
    if (Math.random() < 0.03) {
      heals.push({ x: e.x, y: e.y, r: 12, amount: 25 });
    }
  }

  enemies.splice(index, 1);
}

function damageEnemy(e, amount) {
  e.hp -= amount;
}

function dirFromVec(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 2 : 1;
  return dy > 0 ? 0 : 3;
}

function updatePlayer(dt) {
  // record trail (every ~0.12s while playing)
  if (state.mode === 'play') {
    trailAcc += dt;
    if (trailAcc >= 0.12) {
      trailAcc = 0;
      playerTrail.push({ x: player.x, y: player.y, t: state.elapsed });
      // keep last ~6 seconds
      while (playerTrail.length && (state.elapsed - playerTrail[0].t) > 6.0) playerTrail.shift();
    }
  }

  let dx = 0, dy = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;

  // touch joystick overrides/adds
  dx += joy.dx;
  dy += joy.dy;

  player.moving = !!(dx || dy);
  if (player.moving) {
    const [nx, ny] = norm(dx, dy);
    player.dir = dirFromVec(nx, ny);
    player.anim += dt;

    // tentative move (collision w/ obstacles)
    const nxp = player.x + nx * player.speed * dt;
    const nyp = player.y + ny * player.speed * dt;
    if (!collidesObstacle(nxp, nyp, player.r)) {
      player.x = nxp;
      player.y = nyp;
    }
  } else {
    player.anim = 0;
  }

  // keep player in sane world coords but allow a HUGE map (effectively endless)
  // (Bounds exist only to prevent NaN/overflow issues.)
  const WBOUND = 10000000;
  player.x = clamp(player.x, -WBOUND, WBOUND);
  player.y = clamp(player.y, -WBOUND, WBOUND);

  player.invuln = Math.max(0, player.invuln - dt);
}

function forwardVec(dir) {
  // 0 down, 1 left, 2 right, 3 up
  if (dir === 0) return [0, 1];
  if (dir === 1) return [-1, 0];
  if (dir === 2) return [1, 0];
  return [0, -1];
}

function updateProjectileWeapons(dt) {
  for (const w of [weapons.wand, weapons.bow, weapons.holy]) {
    if (!w.enabled) continue;
    w.cd -= dt;
    if (w.cd > 0) continue;

    if (w.kind === 'cardinal') {
      // Holy Water: fire in 4 directions
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (const [dx, dy] of dirs) {
        fireBullet(player.x, player.y, dx, dy, w);
      }
      w.cd = w.baseCooldown;
      continue;
    }

    let aimX = 1, aimY = 0;
    if (w.kind === 'auto') {
      const e = nearestEnemy();
      if (!e) continue;
      aimX = e.x - player.x;
      aimY = e.y - player.y;
    } else {
      // forward fire (based on hero facing)
      const [fx, fy] = forwardVec(player.dir);
      aimX = fx;
      aimY = fy;
    }

    for (let i = 0; i < w.projectiles; i++) {
      const baseAng = Math.atan2(aimY, aimX);
      const spread = (w.projectiles === 1) ? 0 : (i - (w.projectiles - 1) / 2) * w.spread;
      const jitter = rand(-w.spread, w.spread) * 0.35;
      const ang = baseAng + spread + jitter;
      fireBullet(player.x, player.y, Math.cos(ang), Math.sin(ang), w);
    }

    w.cd = w.baseCooldown;
  }
}

function updateWhirlingBlades(dt) {
  const w = weapons.blades;
  if (!w.enabled) return;

  // orbit angle
  w.ang += w.angSpeed * dt;

  // decay per-enemy cooldowns
  for (const e of enemies) {
    e.bladeHitCd = Math.max(0, e.bladeHitCd - dt);
  }

  // deal contact damage
  for (let i = 0; i < w.blades; i++) {
    const ang = w.ang + (i * (Math.PI * 2 / w.blades));
    const bx = player.x + Math.cos(ang) * w.radius;
    const by = player.y + Math.sin(ang) * w.radius;

    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      const d = dist(bx, by, e.x, e.y);
      if (d < w.bladeR + e.r) {
        if (e.bladeHitCd <= 0) {
          damageEnemy(e, w.damage);
          e.bladeHitCd = w.tick;
          // tiny knockback
          const [nx, ny] = norm(e.x - player.x, e.y - player.y);
          e.vx += nx * 90;
          e.vy += ny * 90;
          if (e.hp <= 0) killEnemyAt(ei);
        }
      }
    }
  }
}

function updateChainLightning(dt) {
  const w = weapons.lightning;
  if (!w.enabled) return;

  w.cd -= dt;
  if (w.cd > 0) return;

  const first = nearestEnemy();
  if (!first) return;

  const chain = [first];
  for (let k = 1; k < w.chains; k++) {
    const last = chain[chain.length - 1];
    let best = null;
    let bestD = Infinity;

    for (const e of enemies) {
      if (chain.includes(e)) continue;
      const d = dist(last.x, last.y, e.x, e.y);
      if (d <= w.range && d < bestD) {
        best = e;
        bestD = d;
      }
    }

    if (!best) break;
    chain.push(best);
  }

  // apply damage (and build a polyline for visuals)
  const pts = [[player.x, player.y]];
  for (const e of chain) {
    pts.push([e.x, e.y]);
  }

  // damage (iterate enemies array to handle kill)
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!chain.includes(e)) continue;
    damageEnemy(e, w.damage);
    // tiny zap knockback
    const [nx, ny] = norm(e.x - player.x, e.y - player.y);
    e.vx += nx * 60;
    e.vy += ny * 60;
    if (e.hp <= 0) killEnemyAt(i);
  }

  sfxCast('lightning');
  effects.push({ type: 'bolt', pts, t: 0, ttl: 0.16 });
  w.cd = w.baseCooldown;
}

function spawnMeteor() {
  const w = weapons.meteor;

  let tx, ty;
  if (w.followTrail && playerTrail.length) {
    // target a previous footstep (about trailDelay seconds ago)
    const targetT = state.elapsed - (w.trailDelay || 1.0);
    let best = playerTrail[0];
    for (let i = 0; i < playerTrail.length; i++) {
      const p = playerTrail[i];
      if (p.t <= targetT) best = p; else break;
    }
    tx = best.x;
    ty = best.y;
  } else {
    tx = player.x + rand(-w.scatter, w.scatter);
    ty = player.y + rand(-w.scatter, w.scatter);
  }

  effects.push({
    type: 'meteor',
    x: tx,
    y: ty,
    t: 0,
    ttl: w.delay + 0.18,
    delay: w.delay,
    radius: w.impactRadius,
    stage: 'fall'
  });
}

function applyMeteorImpact(x, y) {
  const w = weapons.meteor;
  // impact damage
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const d = dist(x, y, e.x, e.y);
    if (d <= w.impactRadius + e.r) {
      damageEnemy(e, w.impactDamage);
      // knockback outward
      const [nx, ny] = norm(e.x - x, e.y - y);
      e.vx += nx * 220;
      e.vy += ny * 220;
      if (e.hp <= 0) {
        killEnemyAt(i);
      }
    }
  }

  // burning field (DoT)
  effects.push({
    type: 'burn',
    x,
    y,
    t: 0,
    ttl: w.burnDuration,
    radius: w.burnRadius,
    dps: w.burnDps,
  });
}

function updateMeteor(dt) {
  const w = weapons.meteor;
  if (!w.enabled) return;

  w.cd -= dt;
  if (w.cd > 0) return;

  sfxCast('meteor');
  spawnMeteor();
  w.cd = w.baseCooldown;
}

function castFrostShockwave() {
  const w = weapons.frost;
  sfxCast('frost');
  const [fx, fy] = forwardVec(player.dir);
  const baseAng = Math.PI / 3; // 60°
  const stepAng = Math.PI / 6; // +30° per frost level
  const coneAng = clamp(baseAng + Math.max(0, (w.lvl - 1)) * stepAng, baseAng, Math.PI * 2);

  effects.push({
    type: 'cone',
    x: player.x,
    y: player.y,
    fx,
    fy,
    t: 0,
    ttl: w.maxRadius / w.speed,
    r0: 0,
    r1: w.maxRadius,
    ang: coneAng,
  });

  // collision handled in updateEffects per frame (expanding cone)
}

function updateFrostShockwave(dt) {
  const w = weapons.frost;
  if (!w.enabled) return;

  w.cd -= dt;
  if (w.cd > 0) return;

  castFrostShockwave();
  w.cd = w.baseCooldown;
}

function updateDragonSoul(dt) {
  const w = weapons.dragon;
  if (!w.enabled) return;

  // drift rotation speed a bit for "irregular" feel
  w.ang += (w.angSpeed + Math.sin(state.elapsed * 1.7) * w.jitter) * dt;

  for (const e of enemies) {
    e.dragonHitCd = Math.max(0, (e.dragonHitCd || 0) - dt);
  }

  for (let i = 0; i < w.crosses; i++) {
    const u = w.ang + i * (Math.PI * 2 / w.crosses);
    const rad = w.radius + Math.sin(state.elapsed * 2.3 + i) * 10;
    // Lemniscate / infinity path (Gerono): x=a*sin(t), y=b*sin(2t)
    const cx = player.x + Math.sin(u) * rad;
    const cy = player.y + Math.sin(2 * u) * rad * 0.55;

    // damage enemies in a small AoE around cross
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      const d = dist(cx, cy, e.x, e.y);
      if (d < (w.crossSize * 0.9) + e.r) {
        if ((e.dragonHitCd || 0) <= 0) {
          damageEnemy(e, w.damage);
          e.dragonHitCd = w.tick;
          // knockback
          const [nx, ny] = norm(e.x - player.x, e.y - player.y);
          e.vx += nx * 180;
          e.vy += ny * 180;
          if (e.hp <= 0) killEnemyAt(ei);
        }
      }
    }
  }
}

function updateWeapons(dt) {
  updateProjectileWeapons(dt);
  updateWhirlingBlades(dt);
  updateChainLightning(dt);
  updateMeteor(dt);
  updateFrostShockwave(dt);
  updateDragonSoul(dt);
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) bullets.splice(i, 1);
  }

  // enemy bullets disabled
}

function collideBullets() {
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      const d = dist(e.x, e.y, b.x, b.y);
      if (d < e.r + b.r) {
        damageEnemy(e, b.dmg);

        if (e.hp <= 0) {
          killEnemyAt(ei);
        }

        if (b.pierce > 0) {
          b.pierce -= 1;
        } else {
          bullets.splice(bi, 1);
        }
        break;
      }
    }
  }
}

function updateEnemies(dt) {
  const now = state.elapsed;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    // status: burn
    if (now < e.burnUntil) {
      damageEnemy(e, e.burnDps * dt);
    }

    const frozen = now < e.frozenUntil;

    // movement + skills
    if (!frozen) {
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = Math.hypot(dx, dy);
      const [nx, ny] = norm(dx, dy);

      if (e.type === 'boss') {
        // --- Big Boss AI (no bullets): charge / slam / summon
        e.chargeCd = Math.max(0, e.chargeCd - dt);
        e.slamCd = Math.max(0, e.slamCd - dt);
        e.summonCd = Math.max(0, e.summonCd - dt);

        if (e.chargeT > 0) {
          // charging
          e.x += e.chargeVx * dt;
          e.y += e.chargeVy * dt;
          e.chargeT -= dt;
        } else {
          // choose action
          if (e.slamWindup > 0) {
            e.slamWindup -= dt;
            if (e.slamWindup <= 0) {
              // slam: damaging shock ring around boss
              effects.push({ type: 'boss_slam', x: e.x, y: e.y, t: 0, ttl: 0.45, radius: 170 });
              e.slamCd = 6.5;
            }
          } else if (e.chargeCd <= 0 && d < 520) {
            // charge with short tell
            effects.push({ type: 'boss_tell', x: e.x, y: e.y, t: 0, ttl: 0.55, dx, dy });
            const [cx, cy] = norm(dx, dy);
            e.chargeVx = cx * 520;
            e.chargeVy = cy * 520;
            e.chargeT = 0.55;
            e.chargeCd = 4.2;
          } else if (e.slamCd <= 0 && d < 260) {
            // slam windup
            effects.push({ type: 'boss_slam_warn', x: e.x, y: e.y, t: 0, ttl: 0.55, radius: 170 });
            e.slamWindup = 0.55;
          } else if (e.summonCd <= 0) {
            // summon a small pack
            for (let k = 0; k < 6; k++) {
              enemies.push({
                x: e.x + rand(-80, 80),
                y: e.y + rand(-80, 80),
                r: 14,
                hp: 45 + (state.elapsed / 2),
                speed: 120,
                touchDmg: 12,
                vx: 0,
                vy: 0,
                frozenUntil: 0,
                burnUntil: 0,
                burnDps: 0,
                bladeHitCd: 0,
                type: 'melee',
                elite: false,
                dir: 0,
                anim: rand(0, 10),
                shootCd: 0,
                shootBase: 0,
                shootSpeed: 0,
                shootDmg: 0,
                chargeCd: 0,
                chargeT: 0,
                chargeVx: 0,
                chargeVy: 0,
                slamCd: 0,
              });
            }
            e.summonCd = 9.5;
          }

          // default chase
          e.x += nx * e.speed * dt;
          e.y += ny * e.speed * dt;
        }
      } else if (e.elite) {
        // --- Elite skill: occasional charge (no bullets)
        e.chargeCd = Math.max(0, (e.chargeCd || 0) - dt);
        if (e.chargeT > 0) {
          e.x += e.chargeVx * dt;
          e.y += e.chargeVy * dt;
          e.chargeT -= dt;
        } else {
          if (e.chargeCd <= 0 && d < 380) {
            effects.push({ type: 'elite_tell', x: e.x, y: e.y, t: 0, ttl: 0.35, dx, dy });
            const [cx, cy] = norm(dx, dy);
            e.chargeVx = cx * 440;
            e.chargeVy = cy * 440;
            e.chargeT = 0.35;
            e.chargeCd = rand(3.5, 6.0);
          }

          // chase
          if (e.type === 'ranger') {
            // prefer mid distance, no bullets
            if (d > 280) {
              e.x += nx * e.speed * dt;
              e.y += ny * e.speed * dt;
            } else if (d < 190) {
              e.x -= nx * e.speed * dt;
              e.y -= ny * e.speed * dt;
            } else {
              e.x += (-ny) * (e.speed * 0.25) * dt;
              e.y += (nx) * (e.speed * 0.25) * dt;
            }
          } else {
            e.x += nx * e.speed * dt;
            e.y += ny * e.speed * dt;
          }
        }
      } else if (e.type === 'ranger') {
        // prefer mid distance
        if (d > 280) {
          e.x += nx * e.speed * dt;
          e.y += ny * e.speed * dt;
        } else if (d < 190) {
          e.x -= nx * e.speed * dt;
          e.y -= ny * e.speed * dt;
        } else {
          // slight strafe
          e.x += (-ny) * (e.speed * 0.25) * dt;
          e.y += (nx) * (e.speed * 0.25) * dt;
        }
      } else {
        // melee
        e.x += nx * e.speed * dt;
        e.y += ny * e.speed * dt;
      }
    }

    // knockback velocity (always)
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vx *= Math.pow(0.02, dt);
    e.vy *= Math.pow(0.02, dt);

    // touch damage
    const d2 = dist(e.x, e.y, player.x, player.y);
    if (d2 < e.r + player.r) {
      if (player.invuln <= 0) {
        player.hp -= e.touchDmg;
        sfxHit();
        player.invuln = (e.type === 'boss') ? 0.70 : 0.55;
        const [nx, ny] = norm(player.x - e.x, player.y - e.y);
        player.x += nx * (e.type === 'boss' ? 26 : 14);
        player.y += ny * (e.type === 'boss' ? 26 : 14);
      }
    }

    if (e.hp <= 0) {
      killEnemyAt(i);
      continue;
    }

    if (player.hp <= 0) {
      state.mode = 'dead';
    }
  }
}

function vacuumAllLootToPlayer() {
  // pull everything close to player so it gets collected quickly.
  for (const g of gems) { g.x = player.x + rand(-8, 8); g.y = player.y + rand(-8, 8); }
  for (const c of chests) { c.x = player.x + rand(-18, 18); c.y = player.y + rand(-18, 18); }
  for (const s of slotOrbs) { s.x = player.x + rand(-12, 12); s.y = player.y + rand(-12, 12); }
  for (const h of heals) { h.x = player.x + rand(-12, 12); h.y = player.y + rand(-12, 12); }
}

function updateVacuumGems(dt) {
  for (let i = vacuumGems.length - 1; i >= 0; i--) {
    const v = vacuumGems[i];
    const d = dist(player.x, player.y, v.x, v.y);
    if (d < player.r + v.r) {
      vacuumGems.splice(i, 1);
      vacuumAllLootToPlayer();
      toast.text = t('vacuum');
      toast.t = 2.0;
      return;
    }
  }
}

function updateHeals(dt) {
  for (let i = heals.length - 1; i >= 0; i--) {
    const h = heals[i];
    const d = dist(player.x, player.y, h.x, h.y);
    if (d < player.r + h.r) {
      heals.splice(i, 1);
      const before = player.hp;
      // heal potions can overheal above max HP (temporary buffer)
      player.hp = Math.min(player.hpMax * 1.5, player.hp + h.amount);
      const gained = Math.max(0, (player.hp - before) | 0);
      if (gained > 0) {
        toast.text = t('healPick', gained);
        toast.t = 1.6;
      }
      return;
    }
  }
}

function updateSlots(dt) {
  for (let i = slotOrbs.length - 1; i >= 0; i--) {
    const s = slotOrbs[i];
    const d = dist(player.x, player.y, s.x, s.y);
    if (d < player.r + s.r) {
      slotOrbs.splice(i, 1);
      if (player.weaponSlots < player.weaponSlotsMax) {
        player.weaponSlots += 1;
        toast.text = t('slotUp', player.weaponSlots);
        toast.t = 2.0;
      }
      return;
    }
  }
}

function updateChests(dt) {
  // simple pickup (no magnet)
  for (let i = chests.length - 1; i >= 0; i--) {
    const c = chests[i];
    const d = dist(player.x, player.y, c.x, c.y);
    if (d < player.r + c.r) {
      chests.splice(i, 1);
      sfxPickup('chest');
      openChest();
      return; // modal opened
    }
  }
}

function updateGems(dt) {
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    const d = dist(player.x, player.y, g.x, g.y);

    if (d < player.magnet) {
      const [nx, ny] = norm(player.x - g.x, player.y - g.y);
      g.x += nx * 420 * dt;
      g.y += ny * 420 * dt;
    }

    if (d < player.r + g.r) {
      player.xp += g.xp;
      gems.splice(i, 1);
      sfxPickup('xp');
      checkLevelUp();
    }
  }
}

function updateEffects(dt) {
  const now = state.elapsed;

  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.t += dt;

    if (fx.type === 'meteor') {
      if (fx.stage === 'fall' && fx.t >= fx.delay) {
        fx.stage = 'impact';
        applyMeteorImpact(fx.x, fx.y);
      }
    }

    if (fx.type === 'burn') {
      // apply burn to enemies inside
      for (const e of enemies) {
        const d = dist(fx.x, fx.y, e.x, e.y);
        if (d <= fx.radius + e.r) {
          // stack by max
          e.burnUntil = Math.max(e.burnUntil, now + dt); // keep alive for this frame
          e.burnDps = Math.max(e.burnDps, fx.dps);
          // also extend burn while standing
          e.burnUntil = Math.max(e.burnUntil, now + 0.15);
        }
      }
    }

    if (fx.type === 'cone') {
      const w = weapons.frost;
      // follow player position while the cone expands
      fx.x = player.x;
      fx.y = player.y;

      const t01 = clamp(fx.t / fx.ttl, 0, 1);
      const r = fx.r0 + (fx.r1 - fx.r0) * t01;
      const band = 14;
      const fLen = Math.hypot(fx.fx, fx.fy) || 1;
      const fwx = fx.fx / fLen;
      const fwy = fx.fy / fLen;
      const cosHalf = Math.cos((fx.ang || (Math.PI * 0.55)) / 2);

      for (const e of enemies) {
        const dx = e.x - fx.x;
        const dy = e.y - fx.y;
        const d = Math.hypot(dx, dy);
        if (d < 1) continue;

        // only in front cone
        const dot = (dx / d) * fwx + (dy / d) * fwy;
        if (dot < cosHalf) continue;

        // hit band near expanding radius
        if (d >= r - band && d <= r + band) {
          if (!e._waveHitAt || now - e._waveHitAt > 0.5) {
            e._waveHitAt = now;
            damageEnemy(e, w.damage);
            const [nx, ny] = norm(e.x - fx.x, e.y - fx.y);
            e.vx += nx * w.knock;
            e.vy += ny * w.knock;
            e.frozenUntil = Math.max(e.frozenUntil, now + w.freezeSec);
          }
        }
      }
    }

    // boss/elite telegraphs + AoE
    if (fx.type === 'boss_slam') {
      // damage player if inside radius early in the effect
      if (fx.t < 0.08) {
        const d = dist(fx.x, fx.y, player.x, player.y);
        if (d <= fx.radius + player.r && player.invuln <= 0) {
          player.hp -= 34;
          sfxHit();
          player.invuln = 0.65;
          const [nx, ny] = norm(player.x - fx.x, player.y - fx.y);
          player.x += nx * 34;
          player.y += ny * 34;
        }
      }
    }

    if (fx.t >= fx.ttl) {
      effects.splice(i, 1);
    }
  }
}

function checkLevelUp() {
  while (player.xp >= player.xpNeed && state.mode === 'play') {
    player.xp -= player.xpNeed;
    player.level += 1;
    // XP needed: fast early, then ramps harder.
    if (player.level < 5) {
      player.xpNeed = Math.floor((8 + player.level * 6) * 3);
    } else {
      player.xpNeed = Math.floor(((10 + player.level * 7 + Math.pow(player.level, 1.25)) * 1.25) * 3);
    }
    openLevelUp();
  }
}

// ---------- upgrades
const CHEST_POOL = [
  {
    id: 'chest_heal',
    title: { zh: '神聖藥水：回復 30 HP', en: 'Holy Potion: Heal 30 HP' },
    desc: { zh: '立刻回復生命（不超過上限）。', en: 'Instantly heal (up to max HP).' },
    apply() { player.hp = Math.min(player.hpMax, player.hp + 30); }
  },
  {
    id: 'chest_xp',
    title: { zh: '靈魂洪流：獲得大量經驗', en: 'Soul Surge: Gain Lots of XP' },
    desc: { zh: '立即獲得 +40 XP（可能直接再升級）。', en: 'Gain +40 XP immediately (may trigger another level-up).' },
    apply() { player.xp += 40 * xpGainMul(player.level); checkLevelUp(); }
  },
  {
    id: 'chest_allcdr',
    title: { zh: '符文：全武器冷卻 -8%', en: 'Rune: All Weapon Cooldowns -8%' },
    desc: { zh: '所有武器出手更頻繁。', en: 'All weapons fire more often.' },
    apply() {
      weapons.wand.baseCooldown *= 0.92;
      weapons.bow.baseCooldown *= 0.92;
      weapons.lightning.baseCooldown *= 0.92;
      weapons.meteor.baseCooldown *= 0.92;
      weapons.frost.baseCooldown *= 0.92;
    }
  },
  {
    id: 'chest_blade_orbit',
    title: { zh: '秘儀：迴旋斬半徑 +18', en: 'Arcana: Blade Orbit Radius +18' },
    desc: { zh: '刀刃轉得更外圈，命中更安全。', en: 'Blades orbit wider for safer hits.' },
    apply() { weapons.blades.radius += 18; }
  },
  {
    id: 'chest_frost_big',
    title: { zh: '冰霜王印：衝擊波範圍 +35', en: 'Frost Sigil: Shockwave Radius +35' },
    desc: { zh: '控場覆蓋更大。', en: 'Bigger crowd-control area.' },
    apply() { weapons.frost.maxRadius += 35; }
  },
  {
    id: 'chest_meteor_big',
    title: { zh: '隕火核心：爆炸半徑 +28', en: 'Meteor Core: Explosion Radius +28' },
    desc: { zh: '隕石更大更狠。', en: 'Bigger, meaner meteors.' },
    apply() { weapons.meteor.impactRadius += 28; weapons.meteor.burnRadius += 18; }
  },
];

const UPGRADE_POOL = [
  // Holy Water
  {
    id: 'holy_rate',
    title: '聖水：攻速 +15%',
    desc: '更頻繁地朝四向噴灑。',
    apply() { weapons.holy.baseCooldown *= 0.85; weapons.holy.lvl += 1; }
  },
  {
    id: 'holy_dmg',
    title: '聖水：傷害 +25%',
    desc: '每一滴更痛。',
    apply() { weapons.holy.damage = Math.round(weapons.holy.damage * 1.25); weapons.holy.lvl += 1; }
  },
  {
    id: 'holy_pierce',
    title: '聖水：穿透 +1',
    desc: '更容易清一排怪。',
    apply() { weapons.holy.pierce += 1; weapons.holy.lvl += 1; }
  },

  // Dragon Soul (sequence upgrades)
  {
    id: 'unlock_dragon',
    title: '解鎖 龍魂（Dragon Soul）',
    desc: '低傷高覆蓋：4 個十字貼身慢轉，升級交替提升轉速/數量。',
    apply() {
      const w = weapons.dragon;
      w.enabled = true;
      w.lvl = Math.max(1, w.lvl);
      w.stage = 0;
      w.crosses = 4;
      w.damage = 60;
      w.radius = 120;
      w.angSpeed = 1.1;
      w.jitter = 0.45;
    }
  },
  {
    id: 'dragon_speed_1',
    title: '龍魂：轉速提升（慢→中）',
    desc: '先讓它轉得更順手。',
    apply() { weapons.dragon.angSpeed *= 1.8; weapons.dragon.stage += 1; weapons.dragon.lvl += 1; }
  },
  {
    id: 'dragon_more_1',
    title: '龍魂：數量 +1（4→5）',
    desc: '多一個十字。',
    apply() { weapons.dragon.crosses += 1; weapons.dragon.stage += 1; weapons.dragon.lvl += 1; }
  },
  {
    id: 'dragon_speed_2',
    title: '龍魂：轉速提升（中→快）',
    desc: '掃怪更密。',
    apply() { weapons.dragon.angSpeed *= 1.6; weapons.dragon.stage += 1; weapons.dragon.lvl += 1; }
  },
  {
    id: 'dragon_more_2',
    title: '龍魂：數量 +1（5→6）',
    desc: '達到 6 個十字。',
    apply() { weapons.dragon.crosses += 1; weapons.dragon.stage += 1; weapons.dragon.lvl += 1; }
  },
  {
    id: 'dragon_speed_3',
    title: '龍魂：轉速提升（快→很快）',
    desc: '幾乎貼身旋轉。',
    apply() { weapons.dragon.angSpeed *= 1.45; weapons.dragon.stage += 1; weapons.dragon.lvl += 1; }
  },
  {
    id: 'dragon_speed_3',
    title: '龍魂：轉速提升（快→很快）',
    desc: '幾乎貼身旋轉。',
    apply() { weapons.dragon.angSpeed *= 1.45; weapons.dragon.stage += 1; weapons.dragon.lvl += 1; }
  },
  {
    id: 'dragon_more_3',
    title: '龍魂：數量 +1（6已滿）',
    desc: '（已達上限）',
    apply() { weapons.dragon.stage += 1; weapons.dragon.lvl += 1; }
  },
  {
    id: 'dragon_speed_4',
    title: '龍魂：轉速提升（很快→爆快）',
    desc: '最後一段加速。',
    apply() { weapons.dragon.angSpeed *= 1.35; weapons.dragon.stage += 1; weapons.dragon.lvl += 1; }
  },
  {
    id: 'dragon_more_4',
    title: '龍魂：數量 +1（6已滿）',
    desc: '（已達上限）',
    apply() { weapons.dragon.stage += 1; weapons.dragon.lvl += 1; }
  },

  // Wand
  {
    id: 'wand_rate',
    title: 'Arcane Wand：施法速度 +15%',
    desc: '魔杖更快自動鎖定與連發。',
    apply() { weapons.wand.baseCooldown *= 0.85; weapons.wand.lvl += 1; }
  },
  {
    id: 'wand_dmg',
    title: 'Arcane Wand：傷害 +25%',
    desc: '每發法術更痛。',
    apply() { weapons.wand.damage = Math.round(weapons.wand.damage * 1.25); weapons.wand.lvl += 1; }
  },
  {
    id: 'wand_proj',
    title: 'Arcane Wand：額外飛彈 +1',
    desc: '同時多打一發（散射）。',
    apply() { weapons.wand.projectiles += 1; weapons.wand.lvl += 1; }
  },

  // Bow
  {
    id: 'unlock_bow',
    title: '解鎖 Dragon Bow',
    desc: '獲得第二把武器：朝前方射出龍焰箭。',
    apply() { if (tryEnableWeapon('bow')) weapons.bow.lvl = Math.max(1, weapons.bow.lvl); }
  },
  {
    id: 'unlock_holy',
    title: '解鎖 聖水（Holy Water）',
    desc: '同時朝上下左右射出聖水。',
    apply() { if (tryEnableWeapon('holy')) weapons.holy.lvl = Math.max(1, weapons.holy.lvl); }
  },
  {
    id: 'bow_rate',
    title: 'Dragon Bow：拉弓速度 +15%',
    desc: '射得更快，控場更強。',
    apply() { weapons.bow.baseCooldown *= 0.85; weapons.bow.lvl += 1; }
  },
  {
    id: 'bow_dmg',
    title: 'Dragon Bow：傷害 +25%',
    desc: '對高血怪更有效。',
    apply() { weapons.bow.damage = Math.round(weapons.bow.damage * 1.25); weapons.bow.lvl += 1; }
  },

  // New weapons unlock
  {
    id: 'unlock_blades',
    title: '解鎖 迴旋斬（Whirling Blades）',
    desc: '刀刃圍繞你旋轉，碰到敵人造成傷害。',
    apply() { if (tryEnableWeapon('blades')) weapons.blades.lvl = Math.max(1, weapons.blades.lvl); }
  },
  {
    id: 'unlock_lightning',
    title: '解鎖 雷電鏈（Chain Lightning）',
    desc: '自動電擊並跳躍到附近敵人。',
    apply() { weapons.lightning.enabled = true; weapons.lightning.lvl = Math.max(1, weapons.lightning.lvl); }
  },
  {
    id: 'unlock_meteor',
    title: '解鎖 隕石術（Meteor）',
    desc: '隨機落下隕石：大範圍傷害 + 燃燒持續傷害。',
    apply() { weapons.meteor.enabled = true; weapons.meteor.lvl = Math.max(1, weapons.meteor.lvl); }
  },
  {
    id: 'unlock_frost',
    title: '解鎖 冰凍衝擊波（Frost Shockwave）',
    desc: '震退並冰凍敵人 2 秒。',
    apply() { weapons.frost.enabled = true; weapons.frost.lvl = Math.max(1, weapons.frost.lvl); }
  },

  // Blades upgrades
  {
    id: 'blades_more',
    title: '迴旋斬：刀刃 +1',
    desc: '多一把刀，覆蓋更廣。',
    apply() { weapons.blades.blades += 1; weapons.blades.lvl += 1; }
  },
  {
    id: 'blades_dmg',
    title: '迴旋斬：傷害 +25%',
    desc: '近戰清怪更快。',
    apply() { weapons.blades.damage = Math.round(weapons.blades.damage * 1.25); weapons.blades.lvl += 1; }
  },
  {
    id: 'blades_speed',
    title: '迴旋斬：旋轉速度 +25%',
    desc: '更快命中更多敵人（很難近身）。',
    apply() { weapons.blades.angSpeed *= 1.25; weapons.blades.lvl += 1; }
  },
  {
    id: 'blades_more2',
    title: '迴旋斬：刀刃 +2',
    desc: '大幅提升近身防禦。',
    apply() { weapons.blades.blades += 2; weapons.blades.lvl += 1; }
  },

  // Lightning upgrades
  {
    id: 'lightning_rate',
    title: '雷電鏈：冷卻 -15%',
    desc: '更頻繁放電。',
    apply() { weapons.lightning.baseCooldown *= 0.85; weapons.lightning.lvl += 1; }
  },
  {
    id: 'lightning_chain',
    title: '雷電鏈：跳躍次數 +1',
    desc: '命中更多目標。',
    apply() { weapons.lightning.chains += 1; weapons.lightning.lvl += 1; }
  },
  {
    id: 'lightning_dmg',
    title: '雷電鏈：傷害 +25%',
    desc: '電得更痛。',
    apply() { weapons.lightning.damage = Math.round(weapons.lightning.damage * 1.25); weapons.lightning.lvl += 1; }
  },

  // Meteor upgrades
  {
    id: 'meteor_rate',
    title: '隕石術：冷卻 -15%',
    desc: '更常落隕石。',
    apply() { weapons.meteor.baseCooldown *= 0.85; weapons.meteor.lvl += 1; }
  },
  {
    id: 'meteor_radius',
    title: '隕石術：爆炸半徑 +18',
    desc: '覆蓋更大範圍。',
    apply() { weapons.meteor.impactRadius += 18; weapons.meteor.burnRadius += 12; weapons.meteor.lvl += 1; }
  },
  {
    id: 'meteor_burn',
    title: '隕石術：燃燒傷害 +25%',
    desc: '地面灼燒更致命。',
    apply() { weapons.meteor.burnDps = Math.round(weapons.meteor.burnDps * 1.25); weapons.meteor.lvl += 1; }
  },
  {
    id: 'meteor_trail',
    title: '隕石術：追蹤腳步（延遲）',
    desc: '隕石會落在你「之前走過的腳步」上。',
    apply() { weapons.meteor.followTrail = true; weapons.meteor.trailDelay = 1.1; weapons.meteor.lvl += 1; }
  },

  // Frost upgrades
  {
    id: 'frost_rate',
    title: '冰凍衝擊波：冷卻 -15%',
    desc: '更頻繁控場。',
    apply() { weapons.frost.baseCooldown *= 0.85; weapons.frost.lvl += 1; }
  },
  {
    id: 'frost_freeze',
    title: '冰凍衝擊波：冰凍時間 +0.5s',
    desc: '控場更久。',
    apply() { weapons.frost.freezeSec += 0.5; weapons.frost.lvl += 1; }
  },
  {
    id: 'frost_dmg',
    title: '冰凍衝擊波：傷害 +25%',
    desc: '震退同時更痛。',
    apply() { weapons.frost.damage = Math.round(weapons.frost.damage * 1.25); weapons.frost.lvl += 1; }
  },

  // Stats
  {
    id: 'hp',
    title: '體魄：最大 HP +20',
    desc: '更耐打，容錯更高。',
    apply() { player.hpMax += 20; player.hp += 20; }
  },
  {
    id: 'hp_pct',
    title: '強健：最大 HP +10%',
    desc: '按比例提高血量上限（越後期越賺）。',
    apply() {
      const before = player.hpMax;
      player.hpMax = Math.ceil(player.hpMax * 1.10);
      player.hp += (player.hpMax - before);
    }
  },
  {
    id: 'speed',
    title: '敏捷：移動速度 +10%',
    desc: '更容易走位與風箏。',
    apply() { player.speed *= 1.10; }
  },
  {
    id: 'magnet',
    title: '龍之召喚：拾取範圍 +25',
    desc: '更容易吸到經驗之魂。',
    apply() { player.magnet += 25; }
  },
];

let currentChoices = [];

let pendingWeaponUnlock = null;

function openLevelUp() {
  openChoiceModal('levelup', t('levelUpTitle'), UPGRADE_POOL);
}

function openChest() {
  openChoiceModal('chest', t('chestTitle'), CHEST_POOL);
}

function openReplaceWeaponModal(newWeaponKey) {
  pendingWeaponUnlock = newWeaponKey;
  state.mode = 'replace';
  paused = true;
  if (ui.modalTitle) ui.modalTitle.textContent = t('replaceTitle');

  const enabled = enabledWeaponKeys();
  currentChoices = enabled.map(k => ({
    id: `replace_${k}`,
    title: { zh: `替換：${weaponLabel(k)}`, en: `Replace: ${weaponLabel(k)}` },
    desc: { zh: `用 ${weaponLabel(newWeaponKey)} 取代 ${weaponLabel(k)}`, en: `Swap ${weaponLabel(k)} for ${weaponLabel(newWeaponKey)}` },
    apply() {
      weapons[k].enabled = false;
      weapons[newWeaponKey].enabled = true;
      pendingWeaponUnlock = null;
    }
  }));
  currentChoices.push({
    id: 'replace_skip',
    title: { zh: t('skip'), en: t('skip') },
    desc: { zh: '不拿這把武器。', en: 'Do not take this weapon.' },
    apply() { pendingWeaponUnlock = null; }
  });

  ui.choices.innerHTML = '';
  currentChoices.forEach((u, idx) => {
    const div = document.createElement('div');
    div.className = 'choice';
    const title = (typeof u.title === 'object') ? (u.title[lang] || u.title.en || u.title.zh) : u.title;
    const desc = (typeof u.desc === 'object') ? (u.desc[lang] || u.desc.en || u.desc.zh) : u.desc;
    div.innerHTML = `<div class="t">${idx + 1}. ${title}</div><div class="d">${desc}</div>`;
    div.addEventListener('click', () => chooseUpgrade(idx));
    ui.choices.appendChild(div);
  });

  ui.levelup.classList.remove('hidden');
}

function enabledWeaponKeys() {
  // weapon slots: Wand/Bow/Holy/Blades only
  return ['wand', 'bow', 'holy', 'blades'].filter(k => weapons[k].enabled);
}

function enabledMagicKeys() {
  return ['lightning', 'frost', 'meteor', 'dragon'].filter(k => weapons[k].enabled);
}

function weaponEnabledCount() {
  return enabledWeaponKeys().length;
}

function tryEnableWeapon(key) {
  if (weapons[key].enabled) return true;

  // if there's room, enable it
  if (weaponEnabledCount() < player.weaponSlots) {
    weapons[key].enabled = true;
    return true;
  }

  // otherwise ask to replace
  openReplaceWeaponModal(key);
  return false;
}

function openChoiceModal(mode, title, poolBase) {
  state.mode = mode;
  paused = true;
  if (ui.modalTitle) ui.modalTitle.textContent = title;

  const pool = poolBase.filter(u => {
    // gate bow upgrades
    if (u.id.startsWith('bow_') && !weapons.bow.enabled) return false;
    if (u.id === 'unlock_bow' && weapons.bow.enabled) return false;

    // gate blades upgrades
    if (u.id.startsWith('blades_') && !weapons.blades.enabled) return false;
    if (u.id === 'unlock_blades' && weapons.blades.enabled) return false;

    // gate holy water upgrades
    if (u.id.startsWith('holy_') && !weapons.holy.enabled) return false;
    if (u.id === 'unlock_holy' && weapons.holy.enabled) return false;

    // gate lightning upgrades
    if (u.id.startsWith('lightning_') && !weapons.lightning.enabled) return false;
    if (u.id === 'unlock_lightning' && weapons.lightning.enabled) return false;

    // gate meteor upgrades
    if (u.id.startsWith('meteor_') && !weapons.meteor.enabled) return false;
    if (u.id === 'unlock_meteor' && weapons.meteor.enabled) return false;

    // gate frost upgrades
    if (u.id.startsWith('frost_') && !weapons.frost.enabled) return false;
    if (u.id === 'unlock_frost' && weapons.frost.enabled) return false;

    // gate dragon soul upgrades (force an ordered sequence)
    if (u.id.startsWith('dragon_') && !weapons.dragon.enabled) return false;
    if (u.id === 'unlock_dragon' && weapons.dragon.enabled) return false;

    const nextD = nextDragonUpgradeId();
    if (u.id.startsWith('dragon_')) {
      if (!nextD) return false;
      if (u.id !== nextD) return false;
    }

    return true;
  });

  currentChoices = [];
  const used = new Set();

  // Guarantee: every LEVEL UP includes at least one elemental magic option.
  // Magic = Fire (meteor), Ice (frost), Lightning (chain lightning).
  if (mode === 'levelup') {
    const magicPool = pool.filter(u => (
      u.id === 'unlock_meteor' || u.id.startsWith('meteor_') ||
      u.id === 'unlock_frost' || u.id.startsWith('frost_') ||
      u.id === 'unlock_lightning' || u.id.startsWith('lightning_') ||
      u.id === 'unlock_dragon' || u.id.startsWith('dragon_')
    ));
    if (magicPool.length) {
      const m = pick(magicPool);
      used.add(m.id);
      currentChoices.push(m);
    }
  }

  while (currentChoices.length < 3 && used.size < pool.length) {
    const u = pick(pool);
    if (used.has(u.id)) continue;
    used.add(u.id);
    currentChoices.push(u);
  }

  ui.choices.innerHTML = '';
  currentChoices.forEach((u, idx) => {
    const div = document.createElement('div');
    div.className = 'choice';
    const title = (typeof u.title === 'object') ? (u.title[lang] || u.title.en || u.title.zh) : u.title;
    const desc = (typeof u.desc === 'object') ? (u.desc[lang] || u.desc.en || u.desc.zh) : u.desc;
    div.innerHTML = `<div class="t">${idx + 1}. ${title}</div><div class="d">${desc}</div>`;
    div.addEventListener('click', () => chooseUpgrade(idx));
    ui.choices.appendChild(div);
  });

  ui.levelup.classList.remove('hidden');
}

function chooseUpgrade(idx) {
  if (state.mode !== 'levelup' && state.mode !== 'chest' && state.mode !== 'replace') return;
  const u = currentChoices[idx];
  if (!u) return;
  u.apply();
  ui.levelup.classList.add('hidden');
  state.mode = 'play';
  paused = false;
  requestAnimationFrame(loop);
}

// ---------- rendering
function worldToScreen(x, y) {
  return [x - state.camera.x, y - state.camera.y];
}

function applyCanvasTransform() {
  // Ensure DPR transform persists (some operations can reset it)
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

function draw() {
  applyCanvasTransform();

  // camera: always keep player at viewport center.
  const centerX = view.w / 2;
  const centerY = view.h / 2 + (IS_COARSE ? 56 : 0); // slight downward bias on phones
  state.viewCenter = { x: centerX, y: centerY };

  state.camera.x = player.x - centerX;
  state.camera.y = player.y - centerY;

  // ---- pixel tile background (32x32)
  ctx.clearRect(0, 0, view.w, view.h);
  const tileSize = 32;
  const startX = Math.floor(state.camera.x / tileSize) - 1;
  const startY = Math.floor(state.camera.y / tileSize) - 1;
  const endX = Math.floor((state.camera.x + view.w) / tileSize) + 1;
  const endY = Math.floor((state.camera.y + view.h) / tileSize) + 1;

  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      const kind = tileKind(tx, ty);
      const tile = SPR[kind];
      const sx = tx * tileSize - state.camera.x;
      const sy = ty * tileSize - state.camera.y;
      ctx.drawImage(tile, sx, sy, tileSize, tileSize);

      // decorations (bush/flowers/rocks/logs)
      const dk = decorKind(tx, ty);
      if (dk) {
        const img = SPR[dk];
        const ox = ((hash2(tx, ty) >>> 8) & 7) - 3;
        const oy = ((hash2(tx, ty) >>> 12) & 7) - 3;
        ctx.drawImage(img, sx + ox, sy + oy, tileSize, tileSize);
      }
    }
  }

  // effects: burn fields (pixel ring)
  for (const fx of effects) {
    if (fx.type === 'burn') {
      const [sx, sy] = worldToScreen(fx.x, fx.y);
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = 'rgba(246,195,92,.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, fx.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // gems (souls)
  for (const g of gems) {
    const [sx, sy] = worldToScreen(g.x, g.y);
    drawSprite(SPR.soul, sx, sy, { scale: 1, alpha: 0.98 });
  }

  // player bullets
  for (const b of bullets) {
    const [sx, sy] = worldToScreen(b.x, b.y);
    const isBow = b.color === '#f6c35c';
    drawSprite(isBow ? SPR.orbGold : SPR.orbTeal, sx, sy, { scale: 1 });
  }

  // enemy bullets disabled

  // vacuum gems
  for (const v of vacuumGems) {
    const [sx, sy] = worldToScreen(v.x, v.y);
    drawSprite(SPR.vacuumGem, sx, sy, { scale: 1.2, alpha: 0.98 });
  }

  // healing potions
  for (const h of heals) {
    const [sx, sy] = worldToScreen(h.x, h.y);
    drawSprite(SPR.heal, sx, sy, { scale: 1.1, alpha: 0.98 });
  }

  // weapon slot orbs
  for (const s of slotOrbs) {
    const [sx, sy] = worldToScreen(s.x, s.y);
    // reuse gold orb sprite for now
    drawSprite(SPR.orbGold, sx, sy, { scale: 1.15, alpha: 0.95 });
  }

  // chests
  for (const c of chests) {
    const [sx, sy] = worldToScreen(c.x, c.y);
    drawSprite(SPR.chest, sx, sy, { scale: 1 });
  }

  // orbit blades
  if (weapons.blades.enabled) {
    const w = weapons.blades;
    for (let i = 0; i < w.blades; i++) {
      const ang = w.ang + (i * (Math.PI * 2 / w.blades));
      const bx = player.x + Math.cos(ang) * w.radius;
      const by = player.y + Math.sin(ang) * w.radius;
      const [sx, sy] = worldToScreen(bx, by);
      drawSprite(SPR.blade, sx, sy, { scale: 1, rot: ang });
    }
  }

  // dragon soul crosses
  if (weapons.dragon.enabled) {
    const w = weapons.dragon;
    for (let i = 0; i < w.crosses; i++) {
      const u = w.ang + i * (Math.PI * 2 / w.crosses);
      const rad = w.radius + Math.sin(state.elapsed * 2.3 + i) * 10;
      const bx = player.x + Math.sin(u) * rad;
      const by = player.y + Math.sin(2 * u) * rad * 0.55;
      const [sx, sy] = worldToScreen(bx, by);
      drawSprite(SPR.dragonCross, sx, sy, { scale: 1.0, rot: u, alpha: 0.95 });
    }
  }

  // enemies (skeletons)
  for (const e of enemies) {
    const [sx, sy] = worldToScreen(e.x, e.y);
    const frozen = state.elapsed < e.frozenUntil;

    // face movement direction
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    e.dir = dirFromVec(dx, dy);
    e.anim = (e.anim || 0) + (frozen ? 0 : 0.016);
    const f = frozen ? 0 : (Math.floor(e.anim * 8) % 4);

    const base = (e.type === 'ranger') ? SPR.skullRanger : SPR.skullMelee;
    const scale = e.elite ? 5.0 : (e.big ? 2.0 : 1.0);
    const alpha = frozen ? 0.75 : 1;

    // Elite visual: add a golden helmet overlay + glowing eyes
    drawSprite(base[e.dir][f], sx, sy, { scale, alpha });

    // Big brute visual: red tint overlay (easy to distinguish)
    if (e.big && !frozen) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgb(220,60,60)';
      ctx.fillRect(sx - 24 * scale/2, sy - 28 * scale/2, 48 * scale/2, 56 * scale/2);
      ctx.restore();
    }
    if (e.elite && !frozen) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.95;
      ctx.translate(sx, sy);
      // helmet (pixel blocks)
      ctx.fillStyle = e.purpleBoss ? 'rgba(180,90,255,.95)' : 'rgba(246,195,92,.95)';
      ctx.fillRect(-14 * scale/5, -34 * scale/5, 28 * scale/5, 10 * scale/5);
      ctx.fillRect(-18 * scale/5, -30 * scale/5, 7 * scale/5, 7 * scale/5);
      ctx.fillRect(11 * scale/5, -30 * scale/5, 7 * scale/5, 7 * scale/5);
      // eyes glow
      ctx.fillStyle = 'rgba(124,242,208,.9)';
      ctx.fillRect(-7 * scale/5, -18 * scale/5, 4 * scale/5, 4 * scale/5);
      ctx.fillRect(3 * scale/5, -18 * scale/5, 4 * scale/5, 4 * scale/5);
      ctx.restore();
    }

    // elite halo (pixel-ish)
    if (e.elite && !frozen) {
      ctx.save();
      ctx.strokeStyle = 'rgba(246,195,92,.85)';
      ctx.beginPath();
      ctx.arc(sx, sy - 24 * scale, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // burn indicator
    if (state.elapsed < e.burnUntil) {
      ctx.save();
      ctx.strokeStyle = 'rgba(246,195,92,.35)';
      ctx.beginPath();
      ctx.arc(sx, sy, 18 * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // tiny hp bar
    const barW = 28 * scale;
    const hp01 = clamp(e.hp / (e.elite ? 140 : 70), 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(sx - barW / 2, sy - 26 * scale, barW, 4);
    ctx.fillStyle = 'rgba(246,195,92,.78)';
    ctx.fillRect(sx - barW / 2, sy - 26 * scale, barW * hp01, 4);
  }

  // player
  {
    const [sx, sy] = worldToScreen(player.x, player.y);
    const alpha = player.invuln > 0 ? 0.8 : 1;
    const f = player.moving ? (Math.floor(player.anim * 10) % 4) : 0;
    const pScale = IS_COARSE ? 1.35 : 1;
    // shadow ring so hero never blends into grass on mobile
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.arc(sx, sy + 10 * pScale, 13 * pScale, 0, Math.PI * 2);
    ctx.fill();

    // Always-visible marker (players keep mistaking hero for skeleton)
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(246,195,92,.95)';
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 30 * pScale);
    ctx.lineTo(sx - 8 * pScale, sy - 16 * pScale);
    ctx.lineTo(sx + 8 * pScale, sy - 16 * pScale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const heroImg = SPR.hero[player.dir][f];
    drawSprite(heroImg, sx, sy, { scale: pScale, alpha });

    if (DEBUG) {
      dbg(`heroDraw sx=${sx.toFixed(1)} sy=${sy.toFixed(1)} dir=${player.dir} f=${f} scale=${pScale.toFixed(2)} a=${alpha.toFixed(2)} img=${heroImg.width}x${heroImg.height}`);
    }

    // HP bar above hero (make it very visible)
    const hp01 = clamp(player.hp / player.hpMax, 0, 1);
    const barW = 46;
    const barH = 7;
    const by = sy - 36;
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.fillRect(sx - barW / 2, by, barW, barH);
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.strokeRect(sx - barW / 2, by, barW, barH);
    ctx.fillStyle = `rgba(${Math.round(80 + 175 * (1 - hp01))}, ${Math.round(210 * hp01)}, 90, .98)`;
    ctx.fillRect(sx - barW / 2, by, barW * hp01, barH);

    // forward aim indicator (subtle)
    const [nx, ny] = forwardVec(player.dir);
    ctx.strokeStyle = 'rgba(246,195,92,.28)';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + nx * 26, sy + ny * 26);
    ctx.stroke();
  }

  // effects: lightning bolts & meteors & wave
  for (const fx of effects) {
    if (fx.type === 'bolt') {
      // true "chain" look: draw a jagged line segment-by-segment between targets
      const a = 1 - fx.t / fx.ttl;
      ctx.strokeStyle = `rgba(124,242,208,${0.92 * a})`;
      ctx.lineWidth = 3.5;

      for (let i = 0; i < fx.pts.length - 1; i++) {
        const p0 = fx.pts[i];
        const p1 = fx.pts[i + 1];
        const [x0, y0] = worldToScreen(p0[0], p0[1]);
        const [x1, y1] = worldToScreen(p1[0], p1[1]);

        const dx = x1 - x0;
        const dy = y1 - y0;
        const L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L;
        const ny = dx / L;

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        const segs = 7;
        for (let s = 1; s < segs; s++) {
          const t = s / segs;
          const j = Math.sin((t + fx.t * 7) * Math.PI * 2) * 6 * (1 - Math.abs(0.5 - t) * 2);
          ctx.lineTo(x0 + dx * t + nx * j, y0 + dy * t + ny * j);
        }
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      ctx.lineWidth = 1;
    }

    if (fx.type === 'meteor') {
      const [sx, sy] = worldToScreen(fx.x, fx.y);
      if (fx.stage === 'fall') {
        const t01 = clamp(fx.t / fx.delay, 0, 1);
        const r = 10 + 12 * t01;
        // opaque telegraph circle
        ctx.fillStyle = 'rgba(246,195,92,1)';
        ctx.beginPath();
        ctx.arc(sx, sy, fx.radius * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(246,195,92,.55)';
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // impact flash
        const a = 1 - (fx.t - fx.delay) / 0.18;
        ctx.fillStyle = `rgba(246,195,92,${0.35 * a})`;
        ctx.beginPath();
        ctx.arc(sx, sy, fx.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (fx.type === 'cone') {
      const t01 = clamp(fx.t / fx.ttl, 0, 1);
      const r = fx.r0 + (fx.r1 - fx.r0) * t01;
      const [sx, sy] = worldToScreen(fx.x, fx.y);
      const ang = fx.ang || (Math.PI * 0.55);
      const a0 = Math.atan2(fx.fy, fx.fx) - ang / 2;
      const a1 = Math.atan2(fx.fy, fx.fx) + ang / 2;

      // Fill the ground (no tile showing through)
      ctx.fillStyle = 'rgba(120,190,255,1)';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, r, a0, a1);
      ctx.closePath();
      ctx.fill();

      // Outline on top
      ctx.strokeStyle = 'rgba(120,190,255,.62)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, r, a0, a1);
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (fx.type === 'wave') {
      const t01 = clamp(fx.t / fx.ttl, 0, 1);
      const r = fx.r0 + (fx.r1 - fx.r0) * t01;
      const [sx, sy] = worldToScreen(fx.x, fx.y);
      ctx.strokeStyle = 'rgba(120,190,255,.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (fx.type === 'boss_tell' || fx.type === 'elite_tell') {
      const [sx, sy] = worldToScreen(fx.x, fx.y);
      const [nx, ny] = norm(fx.dx, fx.dy);
      const a = 1 - fx.t / fx.ttl;
      ctx.strokeStyle = fx.type === 'boss_tell' ? `rgba(246,80,80,${0.7 * a})` : `rgba(246,195,92,${0.7 * a})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + nx * 120, sy + ny * 120);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (fx.type === 'boss_slam_warn' || fx.type === 'boss_slam') {
      const [sx, sy] = worldToScreen(fx.x, fx.y);
      const a = 1 - fx.t / fx.ttl;
      ctx.strokeStyle = fx.type === 'boss_slam' ? `rgba(246,80,80,${0.55 * a})` : `rgba(246,195,92,${0.6 * a})`;
      ctx.lineWidth = fx.type === 'boss_slam' ? 6 : 3;
      ctx.beginPath();
      ctx.arc(sx, sy, fx.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // overlays
  if (paused && state.mode === 'play') {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.fillStyle = 'rgba(246,195,92,.92)';
    ctx.font = '20px system-ui';
    ctx.fillText('Paused (press P)', 18, 34);
  }

  // toast
  if (toast.t > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(toast.t / 2, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(16, view.h - 54, 360, 34);
    ctx.fillStyle = 'rgba(246,195,92,.95)';
    ctx.font = '16px system-ui';
    ctx.fillText(toast.text, 26, view.h - 30);
    ctx.restore();
  }

  if (state.mode === 'dead') {
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.fillStyle = 'rgba(246,195,92,.95)';
    ctx.font = '28px system-ui';
    ctx.fillText('Fallen Hero', 18, 44);
    ctx.fillStyle = 'rgba(243,241,231,.92)';
    ctx.font = '16px system-ui';
    ctx.fillText('Reload to begin a new legend.', 18, 72);
  }

  // debug overlay (draw last so it stays visible)
  if (DEBUG) {
    try {
      const cx = (state.viewCenter && state.viewCenter.x) ? state.viewCenter.x : (view.w / 2);
      const cy = (state.viewCenter && state.viewCenter.y) ? state.viewCenter.y : (view.h / 2);
      const p = worldToScreen(player.x, player.y);
      const psx = p[0], psy = p[1];

      ctx.save();
      ctx.globalAlpha = 0.95;

      // Big visible label (draw near bottom so it won't be covered by the top HUD)
      ctx.fillStyle = 'rgba(0,0,0,.60)';
      ctx.fillRect(10, view.h - 170, 170, 28);
      ctx.fillStyle = 'rgba(255,255,255,.96)';
      ctx.font = '14px ui-monospace, Menlo, monospace';
      ctx.fillText('DEBUG ON (v14)', 18, view.h - 150);

      // red cross = screen center
      ctx.strokeStyle = 'rgba(255,80,80,.98)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy);
      ctx.lineTo(cx + 40, cy);
      ctx.moveTo(cx, cy - 40);
      ctx.lineTo(cx, cy + 40);
      ctx.stroke();

      // SUPER obvious marker at computed player screen position
      ctx.fillStyle = 'rgba(255,0,255,.35)';
      ctx.beginPath();
      ctx.arc(psx, psy, 36, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(80,200,255,.98)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(psx, psy, 32, 0, Math.PI * 2);
      ctx.stroke();

      // bounding box around where hero sprite should be
      ctx.strokeStyle = 'rgba(246,195,92,.95)';
      ctx.lineWidth = 4;
      ctx.strokeRect(psx - 32, psy - 32, 64, 64);
      ctx.lineWidth = 1;

      // bottom single-line numbers
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(10, view.h - 44, 520, 34);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '12px ui-monospace, Menlo, monospace';
      ctx.fillText(
        'player=(' + player.x.toFixed(1) + ',' + player.y.toFixed(1) + ') ' +
        'screen=(' + psx.toFixed(1) + ',' + psy.toFixed(1) + ') ' +
        'cam=(' + state.camera.x.toFixed(1) + ',' + state.camera.y.toFixed(1) + ')',
        16,
        view.h - 22
      );

      // rolling log
      const boxW = 520;
      const boxH = 14 * (debugLog.length + 1);
      const x0 = 10;
      const y0 = view.h - 44 - 10 - boxH;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(x0, y0, boxW, boxH);
      ctx.fillStyle = 'rgba(255,255,255,.90)';
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.fillText('log:', x0 + 6, y0 + 14);
      for (let i = 0; i < debugLog.length; i++) {
        ctx.fillText(debugLog[i], x0 + 6, y0 + 28 + i * 12);
      }

      ctx.restore();
    } catch (e) {
      // last resort
      console.warn('debug overlay failed', e);
    }
  }

}

function updateUI() {
  const hp01 = clamp(player.hp / player.hpMax, 0, 1);
  ui.hp.textContent = `${Math.max(0, player.hp | 0)} / ${player.hpMax}`;
  if (ui.hpFill) ui.hpFill.style.width = `${Math.round(hp01 * 100)}%`;

  ui.level.textContent = String(player.level);
  ui.xp.textContent = String(player.xp | 0);
  ui.xpNeed.textContent = String(player.xpNeed);
  ui.kills.textContent = String(state.kills);
  ui.time.textContent = formatTime(state.elapsed | 0);

  // right HUD
  if (ui.hudSlots) ui.hudSlots.textContent = `Slots: ${weaponEnabledCount()}/${player.weaponSlots} (Max ${player.weaponSlotsMax})`;

  if (ui.hudWeapons) {
    const ws = enabledWeaponKeys();
    ui.hudWeapons.innerHTML = ws.map(k => {
      const lvl = weapons[k].lvl || 0;
      return `<div class="hudItem"><span class="n">${weaponLabel(k)}</span><span class="l">Lv.${lvl}</span></div>`;
    }).join('') || `<div class="hudLine">(none)</div>`;
  }

  if (ui.hudMagic) {
    const ms = enabledMagicKeys();
    ui.hudMagic.innerHTML = ms.map(k => {
      const lvl = weapons[k].lvl || 0;
      return `<div class="hudItem"><span class="n">${weaponLabel(k)}</span><span class="l">Lv.${lvl}</span></div>`;
    }).join('') || `<div class="hudLine">(none)</div>`;
  }
}

// ---------- loop
let last = performance.now();
let enemySpawnAcc = 0;

function loop(now) {
  if (paused) {
    draw();
    updateUI();
    return;
  }

  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;

  if (state.mode === 'play') {
    state.elapsed = (now - state.t0) / 1000;

    toast.t = Math.max(0, toast.t - dt);

    updatePlayer(dt);

    // safety: avoid NaN positions on some in-app browsers
    if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) {
      player.x = 16;
      player.y = 16;
      player.vx = 0;
      player.vy = 0;
      resetJoy();
    }

    // spawn pacing ramps up
    enemySpawnAcc += dt;
    // Spawn pacing: every 60s, spawn speed +50% (i.e., interval * 2/3).
    const minute = Math.floor(state.elapsed / 60);
    const speedMul = Math.pow(1.5, minute);
    const spawnRateBase = Math.max(0.14, 0.55 - state.elapsed / 180);
    const spawnRate = Math.max(0.06, spawnRateBase / speedMul);

    while (enemySpawnAcc > spawnRate) {
      enemySpawnAcc -= spawnRate;
      // double (actually ~2x) mob count
      spawnEnemy();
      spawnEnemy();
      if (Math.random() < 0.30) spawnEnemy();
    }

    // Boss spawn
    const bossAlive = enemies.some(e => e.type === 'boss');
    if (!bossAlive && state.elapsed >= state.nextBossAt) {
      spawnBoss();
      state.nextBossAt += 300;
    }

    updateWeapons(dt);
    updateBullets(dt);
    collideBullets();
    updateEffects(dt);
    updateEnemies(dt);
    updateVacuumGems(dt);
    updateHeals(dt);
    updateSlots(dt);
    updateChests(dt);
    updateGems(dt);
  }

  draw();
  updateUI();

  if (state.mode !== 'dead') requestAnimationFrame(loop);
}

function resetRun() {
  bullets.length = 0;
  enemyBullets.length = 0;
  enemies.length = 0;
  gems.length = 0;
  chests.length = 0;
  slotOrbs.length = 0;
  vacuumGems.length = 0;
  heals.length = 0;
  effects.length = 0;

  toast.text = '';
  toast.t = 0;

  playerTrail.length = 0;
  trailAcc = 0;

  state.elapsed = 0;
  state.kills = 0;
  state.nextBossAt = 300;

  // spawn at a tile center so camera feels centered and joystick is stable
  player.x = 16;
  player.y = 16;
  player.hpMax = 100;
  player.hp = 100;
  player.speed = 220;
  player.invuln = 0;
  player.level = 1;
  player.xp = 0;
  player.xpNeed = 30;
  player.magnet = 70;
  player.weaponSlots = 4;
  player.weaponSlotsMax = 6;

  weapons.wand.enabled = true;
  weapons.wand.lvl = 1;
  weapons.wand.baseCooldown = 0.45;
  weapons.wand.damage = 12;
  weapons.wand.projectiles = 1;
  weapons.wand.pierce = 0;
  weapons.wand.cd = 0;

  weapons.bow.enabled = false;
  weapons.bow.lvl = 0;
  weapons.bow.baseCooldown = 0.8;
  weapons.bow.damage = 18;
  weapons.bow.projectiles = 1;
  weapons.bow.pierce = 1;
  weapons.bow.cd = 0;

  weapons.holy.enabled = false;
  weapons.holy.lvl = 0;
  weapons.holy.baseCooldown = 0.95;
  weapons.holy.damage = 14;
  weapons.holy.speed = 520;
  weapons.holy.pierce = 1;
  weapons.holy.cd = 0;

  weapons.blades.enabled = false;
  weapons.blades.lvl = 0;
  weapons.blades.blades = 1;
  weapons.blades.damage = 14;
  weapons.blades.tick = 0.22;
  weapons.blades.ang = 0;
  weapons.blades.angSpeed = 3.4;

  weapons.lightning.enabled = false;
  weapons.lightning.lvl = 0;
  weapons.lightning.baseCooldown = 1.1;
  weapons.lightning.damage = 20;
  weapons.lightning.chains = 6;
  weapons.lightning.range = 190;
  weapons.lightning.cd = 0;

  weapons.meteor.enabled = false;
  weapons.meteor.lvl = 0;
  weapons.meteor.followTrail = false;
  weapons.meteor.trailDelay = 1.0;
  weapons.meteor.baseCooldown = 2.4;
  weapons.meteor.impactDamage = 88;
  weapons.meteor.impactRadius = 90;
  weapons.meteor.burnRadius = 80;
  weapons.meteor.burnDps = 32;
  weapons.meteor.burnDuration = 2.6;
  weapons.meteor.delay = 0.6;
  weapons.meteor.scatter = 320;
  weapons.meteor.cd = 0;

  weapons.frost.enabled = false;
  weapons.frost.lvl = 0;
  weapons.frost.baseCooldown = 2.1;
  weapons.frost.damage = 18;
  weapons.frost.freezeSec = 2.0;
  weapons.frost.knock = 280;
  weapons.frost.maxRadius = 230;
  weapons.frost.speed = 520;
  weapons.frost.cd = 0;

  enemySpawnAcc = 0;
}

function startGame() {
  if (state.mode !== 'start') return;
  ui.start.style.display = 'none';

  // SFX default ON (no background music)
  toggleSfx(true);
  // ensure iOS starts audio on gesture
  try { ensureAudio(); if (audio.ctx.state === 'suspended') audio.ctx.resume(); } catch {}

  resetRun();
  state.t0 = performance.now();
  last = state.t0;
  state.mode = 'play';
  paused = false;

  for (let i = 0; i < 12; i++) spawnEnemy();
  requestAnimationFrame(loop);
}

ui.startBtn?.addEventListener('click', startGame);

// init language (safe now)
setLang(lang);

// initial render
paused = true;
draw();
updateUI();
