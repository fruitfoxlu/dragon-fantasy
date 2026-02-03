/* VS-MVP: single-canvas, static web game
   - Move: WASD / arrows
   - Weapons:
     1) Wand (auto-aim nearest)
     2) Bow (shoot toward mouse)
   - Enemies chase, XP gems drop
   - Level up: 3 random upgrades
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = {
  hp: document.getElementById('hp'),
  level: document.getElementById('level'),
  xp: document.getElementById('xp'),
  xpNeed: document.getElementById('xpNeed'),
  kills: document.getElementById('kills'),
  time: document.getElementById('time'),
  levelup: document.getElementById('levelup'),
  choices: document.getElementById('choices'),
};

// ---------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const len = (x, y) => Math.hypot(x, y);
const norm = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function formatTime(s) {
  const m = (s / 60) | 0;
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// ---------- input
const keys = new Set();
let mouse = { x: canvas.width / 2, y: canvas.height / 2, down: false };
let paused = false;

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') {
    paused = !paused;
    if (!paused) requestAnimationFrame(loop);
    return;
  }
  if (state.mode === 'levelup') {
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
  mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
  mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
});
canvas.addEventListener('mousedown', () => (mouse.down = true));
canvas.addEventListener('mouseup', () => (mouse.down = false));

// ---------- game state
const state = {
  t0: performance.now(),
  elapsed: 0, // seconds
  mode: 'play', // play | levelup | dead
  kills: 0,
  camera: { x: 0, y: 0 },
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
};

const weapons = {
  wand: {
    name: 'Wand',
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
    name: 'Bow',
    kind: 'mouse',
    enabled: false,
    cd: 0,
    baseCooldown: 0.8,
    damage: 18,
    projectiles: 1,
    spread: 0.03,
    speed: 620,
    pierce: 1,
  },
};

const bullets = []; // {x,y,vx,vy,r, dmg, pierce, life, color}
const enemies = []; // {x,y,r, hp, speed, touchDmg}
const gems = [];    // {x,y,r, xp}

function spawnEnemy() {
  // spawn around player, just outside view
  const margin = 80;
  const w = canvas.width, h = canvas.height;
  const side = (Math.random() * 4) | 0;
  let sx = 0, sy = 0;
  const px = player.x, py = player.y;

  if (side === 0) { sx = px + rand(-w / 2, w / 2); sy = py - h / 2 - margin; }
  if (side === 1) { sx = px + w / 2 + margin; sy = py + rand(-h / 2, h / 2); }
  if (side === 2) { sx = px + rand(-w / 2, w / 2); sy = py + h / 2 + margin; }
  if (side === 3) { sx = px - w / 2 - margin; sy = py + rand(-h / 2, h / 2); }

  const tier = Math.min(4, 1 + (state.elapsed / 50) | 0);
  const r = 11 + tier * 1.6;
  const hp = 22 + tier * 10 + rand(0, 8);
  const speed = 70 + tier * 16 + rand(-8, 8);
  enemies.push({ x: sx, y: sy, r, hp, speed, touchDmg: 10 + tier * 2 });
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
    color: spec.kind === 'mouse' ? '#ffd36e' : '#6ee7ff',
  });
}

function nearestEnemy() {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function updateWeapons(dt) {
  for (const w of Object.values(weapons)) {
    if (!w.enabled) continue;
    w.cd -= dt;
    if (w.cd > 0) continue;

    let aimX = 1, aimY = 0;
    if (w.kind === 'auto') {
      const e = nearestEnemy();
      if (!e) continue;
      aimX = e.x - player.x;
      aimY = e.y - player.y;
    } else {
      // mouse aim in screen-space: translate to world-space
      const worldMx = state.camera.x + mouse.x;
      const worldMy = state.camera.y + mouse.y;
      aimX = worldMx - player.x;
      aimY = worldMy - player.y;
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

function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
  if (dx || dy) {
    const [nx, ny] = norm(dx, dy);
    player.x += nx * player.speed * dt;
    player.y += ny * player.speed * dt;
  }
  player.invuln = Math.max(0, player.invuln - dt);
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) bullets.splice(i, 1);
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const [nx, ny] = norm(player.x - e.x, player.y - e.y);
    e.x += nx * e.speed * dt;
    e.y += ny * e.speed * dt;

    // touch damage
    const d = len(e.x - player.x, e.y - player.y);
    if (d < e.r + player.r) {
      if (player.invuln <= 0) {
        player.hp -= e.touchDmg;
        player.invuln = 0.55;
        // small knockback
        player.x -= nx * 14;
        player.y -= ny * 14;
      }
    }

    if (player.hp <= 0) {
      state.mode = 'dead';
    }
  }
}

function collideBullets() {
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    let hit = false;
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      const d = len(e.x - b.x, e.y - b.y);
      if (d < e.r + b.r) {
        e.hp -= b.dmg;
        hit = true;

        if (e.hp <= 0) {
          state.kills++;
          // drop gem
          gems.push({ x: e.x, y: e.y, r: 6, xp: 4 + ((state.elapsed / 45) | 0) });
          enemies.splice(ei, 1);
        }

        if (b.pierce > 0) {
          b.pierce -= 1;
        } else {
          bullets.splice(bi, 1);
        }
        break;
      }
    }

    if (hit) continue;
  }
}

function updateGems(dt) {
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    const dx = player.x - g.x;
    const dy = player.y - g.y;
    const d = Math.hypot(dx, dy);

    if (d < player.magnet) {
      const [nx, ny] = norm(dx, dy);
      g.x += nx * 420 * dt;
      g.y += ny * 420 * dt;
    }

    if (d < player.r + g.r) {
      player.xp += g.xp;
      gems.splice(i, 1);
      checkLevelUp();
    }
  }
}

function checkLevelUp() {
  while (player.xp >= player.xpNeed && state.mode === 'play') {
    player.xp -= player.xpNeed;
    player.level += 1;
    player.xpNeed = Math.floor(10 + player.level * 7 + Math.pow(player.level, 1.25));
    openLevelUp();
  }
}

// ---------- upgrades
const UPGRADE_POOL = [
  {
    id: 'wand_rate',
    title: 'Wand: 攻速 +15%',
    desc: '自動瞄準武器更快發射。',
    apply() { weapons.wand.baseCooldown *= 0.85; }
  },
  {
    id: 'wand_dmg',
    title: 'Wand: 傷害 +25%',
    desc: '每發傷害更高。',
    apply() { weapons.wand.damage = Math.round(weapons.wand.damage * 1.25); }
  },
  {
    id: 'wand_proj',
    title: 'Wand: 額外投射物 +1',
    desc: '同時多打一發（有散射）。',
    apply() { weapons.wand.projectiles += 1; }
  },
  {
    id: 'unlock_bow',
    title: '解鎖 Bow（滑鼠瞄準）',
    desc: '新增第二把武器：朝滑鼠射箭。',
    apply() { weapons.bow.enabled = true; }
  },
  {
    id: 'bow_rate',
    title: 'Bow: 攻速 +15%',
    desc: '滑鼠瞄準武器更快發射。',
    apply() { weapons.bow.baseCooldown *= 0.85; }
  },
  {
    id: 'bow_dmg',
    title: 'Bow: 傷害 +25%',
    desc: '每發更痛，適合打高血怪。',
    apply() { weapons.bow.damage = Math.round(weapons.bow.damage * 1.25); }
  },
  {
    id: 'hp',
    title: '最大 HP +20',
    desc: '容錯更高。',
    apply() { player.hpMax += 20; player.hp += 20; }
  },
  {
    id: 'speed',
    title: '移動速度 +10%',
    desc: '更容易走位。',
    apply() { player.speed *= 1.10; }
  },
  {
    id: 'magnet',
    title: '拾取範圍 +25',
    desc: '更容易吸到經驗球。',
    apply() { player.magnet += 25; }
  },
];

let currentChoices = [];

function openLevelUp() {
  state.mode = 'levelup';
  paused = true;

  // pick 3 distinct upgrades (avoid bow-only upgrades if bow not unlocked? allow but keep sane)
  const pool = UPGRADE_POOL.filter(u => {
    if (u.id.startsWith('bow_') && !weapons.bow.enabled) return false;
    if (u.id === 'unlock_bow' && weapons.bow.enabled) return false;
    return true;
  });

  currentChoices = [];
  const used = new Set();
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
    div.innerHTML = `<div class="t">${idx + 1}. ${u.title}</div><div class="d">${u.desc}</div>`;
    div.addEventListener('click', () => chooseUpgrade(idx));
    ui.choices.appendChild(div);
  });

  ui.levelup.classList.remove('hidden');
}

function chooseUpgrade(idx) {
  if (state.mode !== 'levelup') return;
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

function draw() {
  // camera centered on player
  state.camera.x = player.x - canvas.width / 2;
  state.camera.y = player.y - canvas.height / 2;

  // background grid
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#070a16';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const grid = 48;
  const ox = - (state.camera.x % grid);
  const oy = - (state.camera.y % grid);
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  for (let x = ox; x < canvas.width; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = oy; y < canvas.height; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // gems
  for (const g of gems) {
    const [sx, sy] = worldToScreen(g.x, g.y);
    ctx.fillStyle = 'rgba(110,231,255,.9)';
    ctx.beginPath();
    ctx.arc(sx, sy, g.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // bullets
  for (const b of bullets) {
    const [sx, sy] = worldToScreen(b.x, b.y);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(sx, sy, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // enemies
  for (const e of enemies) {
    const [sx, sy] = worldToScreen(e.x, e.y);
    ctx.fillStyle = 'rgba(255,90,90,.92)';
    ctx.beginPath();
    ctx.arc(sx, sy, e.r, 0, Math.PI * 2);
    ctx.fill();

    // tiny hp bar
    const w = e.r * 2;
    const hp01 = clamp(e.hp / 60, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(sx - w / 2, sy - e.r - 10, w, 4);
    ctx.fillStyle = 'rgba(110,231,255,.8)';
    ctx.fillRect(sx - w / 2, sy - e.r - 10, w * hp01, 4);
  }

  // player
  {
    const [sx, sy] = worldToScreen(player.x, player.y);
    ctx.fillStyle = player.invuln > 0 ? 'rgba(255,255,255,.9)' : 'rgba(170,205,255,.95)';
    ctx.beginPath();
    ctx.arc(sx, sy, player.r, 0, Math.PI * 2);
    ctx.fill();

    // facing indicator for bow aim
    const worldMx = state.camera.x + mouse.x;
    const worldMy = state.camera.y + mouse.y;
    const [nx, ny] = norm(worldMx - player.x, worldMy - player.y);
    ctx.strokeStyle = 'rgba(255,211,110,.6)';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + nx * 26, sy + ny * 26);
    ctx.stroke();
  }

  // overlays
  if (paused && state.mode === 'play') {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.font = '20px system-ui';
    ctx.fillText('Paused (P to resume)', 18, 34);
  }

  if (state.mode === 'dead') {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = '28px system-ui';
    ctx.fillText('Game Over', 18, 44);
    ctx.font = '16px system-ui';
    ctx.fillText('Reload the page to try again.', 18, 72);
  }
}

function updateUI() {
  ui.hp.textContent = `${Math.max(0, player.hp)} / ${player.hpMax}`;
  ui.level.textContent = String(player.level);
  ui.xp.textContent = String(player.xp);
  ui.xpNeed.textContent = String(player.xpNeed);
  ui.kills.textContent = String(state.kills);
  ui.time.textContent = formatTime(state.elapsed | 0);
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

    updatePlayer(dt);

    // spawn pacing ramps up
    enemySpawnAcc += dt;
    const spawnRate = Math.max(0.14, 0.55 - state.elapsed / 180); // seconds per spawn
    while (enemySpawnAcc > spawnRate) {
      enemySpawnAcc -= spawnRate;
      spawnEnemy();
      if (Math.random() < 0.15) spawnEnemy();
    }

    updateWeapons(dt);
    updateBullets(dt);
    updateEnemies(dt);
    collideBullets();
    updateGems(dt);
  }

  draw();
  updateUI();

  if (state.mode !== 'dead') requestAnimationFrame(loop);
}

// start with a few enemies
for (let i = 0; i < 6; i++) spawnEnemy();
requestAnimationFrame(loop);
