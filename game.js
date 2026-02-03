/* Dragon Fantasy (static)
   Vampire-Survivors-like MVP

   Controls:
   - Move: WASD / Arrow keys
   - Aim: mouse (for Dragon Bow)
   - Pause: P

   Weapons (mixed targeting):
   - Arcane Wand: auto-aim nearest (projectiles)
   - Dragon Bow: aim toward mouse (projectiles)
   - Whirling Blades: orbit around hero (contact)
   - Chain Lightning: auto chain to nearby enemies (hitscan)
   - Meteor: random AoE + burning field DoT
   - Frost Shockwave: expanding ring + knockback + freeze (2s)
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
  start: document.getElementById('start'),
  startBtn: document.getElementById('startBtn'),
  levelup: document.getElementById('levelup'),
  choices: document.getElementById('choices'),
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
  if (state.mode === 'start') {
    if (e.code === 'Enter' || e.code === 'Space') startGame();
    return;
  }

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
  elapsed: 0,
  mode: 'start', // start | play | levelup | dead
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

// weapon model:
// - projectile types: kind auto|mouse uses bullets
// - special types implement their own firing in updateWeapons
const weapons = {
  wand: {
    name: 'Arcane Wand',
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

  blades: {
    name: 'Whirling Blades',
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
    kind: 'meteor',
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
    kind: 'ice',
    enabled: false,
    cd: 0,
    baseCooldown: 2.1,
    damage: 18,
    freezeSec: 2.0,
    knock: 280,
    maxRadius: 230,
    speed: 520, // expansion speed
  }
};

const bullets = []; // {x,y,vx,vy,r, dmg, pierce, life, color}
const enemies = []; // {x,y,r, hp, speed, touchDmg, vx,vy, frozenUntil, burnUntil, burnDps, bladeHitCd}
const gems = [];    // {x,y,r, xp}

// Visual/area effects
const effects = [];
// effects types:
// - bolt {type:'bolt', pts:[[x,y]..], t, ttl}
// - meteor {type:'meteor', x,y, t, ttl, delay, radius, stage:'fall'|'impact'}
// - burn {type:'burn', x,y, t, ttl, radius, dps}
// - wave {type:'wave', x,y, t, ttl, r0, r1}

function spawnEnemy() {
  const margin = 80;
  const w = canvas.width, h = canvas.height;
  const side = (Math.random() * 4) | 0;
  let sx = 0, sy = 0;
  const px = player.x, py = player.y;

  if (side === 0) { sx = px + rand(-w / 2, w / 2); sy = py - h / 2 - margin; }
  if (side === 1) { sx = px + w / 2 + margin; sy = py + rand(-h / 2, h / 2); }
  if (side === 2) { sx = px + rand(-w / 2, w / 2); sy = py + h / 2 + margin; }
  if (side === 3) { sx = px - w / 2 - margin; sy = py + rand(-h / 2, h / 2); }

  const tier = Math.min(5, 1 + (state.elapsed / 55) | 0);
  const r = 11 + tier * 1.5;
  const hp = 24 + tier * 10 + rand(0, 10);
  const speed = 72 + tier * 14 + rand(-8, 10);
  enemies.push({
    x: sx,
    y: sy,
    r,
    hp,
    speed,
    touchDmg: 10 + tier * 2,
    vx: 0,
    vy: 0,
    frozenUntil: 0,
    burnUntil: 0,
    burnDps: 0,
    bladeHitCd: 0,
  });
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
    color: spec.kind === 'mouse' ? '#f6c35c' : '#7cf2d0',
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
  gems.push({ x: e.x, y: e.y, r: 6, xp: 4 + ((state.elapsed / 45) | 0) });
  enemies.splice(index, 1);
}

function damageEnemy(e, amount) {
  e.hp -= amount;
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

function updateProjectileWeapons(dt) {
  for (const w of [weapons.wand, weapons.bow]) {
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

  effects.push({ type: 'bolt', pts, t: 0, ttl: 0.14 });
  w.cd = w.baseCooldown;
}

function spawnMeteor() {
  const w = weapons.meteor;
  const tx = player.x + rand(-w.scatter, w.scatter);
  const ty = player.y + rand(-w.scatter, w.scatter);
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

  spawnMeteor();
  w.cd = w.baseCooldown;
}

function castFrostShockwave() {
  const w = weapons.frost;
  effects.push({
    type: 'wave',
    x: player.x,
    y: player.y,
    t: 0,
    ttl: w.maxRadius / w.speed,
    r0: 0,
    r1: w.maxRadius,
  });

  // actual collision handled in updateEffects per frame (expanding ring)
}

function updateFrostShockwave(dt) {
  const w = weapons.frost;
  if (!w.enabled) return;

  w.cd -= dt;
  if (w.cd > 0) return;

  castFrostShockwave();
  w.cd = w.baseCooldown;
}

function updateWeapons(dt) {
  updateProjectileWeapons(dt);
  updateWhirlingBlades(dt);
  updateChainLightning(dt);
  updateMeteor(dt);
  updateFrostShockwave(dt);
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

    // movement
    const frozen = now < e.frozenUntil;
    if (!frozen) {
      const [nx, ny] = norm(player.x - e.x, player.y - e.y);
      e.x += nx * e.speed * dt;
      e.y += ny * e.speed * dt;
    }

    // knockback velocity (always)
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vx *= Math.pow(0.02, dt); // strong damping
    e.vy *= Math.pow(0.02, dt);

    // touch damage
    const d = dist(e.x, e.y, player.x, player.y);
    if (d < e.r + player.r) {
      if (player.invuln <= 0) {
        player.hp -= e.touchDmg;
        player.invuln = 0.55;
        // small knockback
        const [nx, ny] = norm(player.x - e.x, player.y - e.y);
        player.x += nx * 14;
        player.y += ny * 14;
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

    if (fx.type === 'wave') {
      const w = weapons.frost;
      const t01 = clamp(fx.t / fx.ttl, 0, 1);
      const r = fx.r0 + (fx.r1 - fx.r0) * t01;
      const band = 12;

      for (const e of enemies) {
        const d = dist(fx.x, fx.y, e.x, e.y);
        if (d >= r - band && d <= r + band) {
          // hit once per wave by using a temporary flag
          if (!e._waveHitAt || now - e._waveHitAt > 0.5) {
            e._waveHitAt = now;
            damageEnemy(e, w.damage);
            // knockback outward
            const [nx, ny] = norm(e.x - fx.x, e.y - fx.y);
            e.vx += nx * w.knock;
            e.vy += ny * w.knock;
            // freeze
            e.frozenUntil = Math.max(e.frozenUntil, now + w.freezeSec);
          }
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
    player.xpNeed = Math.floor(10 + player.level * 7 + Math.pow(player.level, 1.25));
    openLevelUp();
  }
}

// ---------- upgrades
const UPGRADE_POOL = [
  // Wand
  {
    id: 'wand_rate',
    title: 'Arcane Wand：施法速度 +15%',
    desc: '魔杖更快自動鎖定與連發。',
    apply() { weapons.wand.baseCooldown *= 0.85; }
  },
  {
    id: 'wand_dmg',
    title: 'Arcane Wand：傷害 +25%',
    desc: '每發法術更痛。',
    apply() { weapons.wand.damage = Math.round(weapons.wand.damage * 1.25); }
  },
  {
    id: 'wand_proj',
    title: 'Arcane Wand：額外飛彈 +1',
    desc: '同時多打一發（散射）。',
    apply() { weapons.wand.projectiles += 1; }
  },

  // Bow
  {
    id: 'unlock_bow',
    title: '解鎖 Dragon Bow（滑鼠瞄準）',
    desc: '獲得第二把武器：朝滑鼠方向射出龍焰箭。',
    apply() { weapons.bow.enabled = true; }
  },
  {
    id: 'bow_rate',
    title: 'Dragon Bow：拉弓速度 +15%',
    desc: '射得更快，控場更強。',
    apply() { weapons.bow.baseCooldown *= 0.85; }
  },
  {
    id: 'bow_dmg',
    title: 'Dragon Bow：傷害 +25%',
    desc: '對高血怪更有效。',
    apply() { weapons.bow.damage = Math.round(weapons.bow.damage * 1.25); }
  },

  // New weapons unlock
  {
    id: 'unlock_blades',
    title: '解鎖 迴旋斬（Whirling Blades）',
    desc: '刀刃圍繞你旋轉，碰到敵人造成傷害。',
    apply() { weapons.blades.enabled = true; }
  },
  {
    id: 'unlock_lightning',
    title: '解鎖 雷電鏈（Chain Lightning）',
    desc: '自動電擊並跳躍到附近敵人。',
    apply() { weapons.lightning.enabled = true; }
  },
  {
    id: 'unlock_meteor',
    title: '解鎖 隕石術（Meteor）',
    desc: '隨機落下隕石：大範圍傷害 + 燃燒持續傷害。',
    apply() { weapons.meteor.enabled = true; }
  },
  {
    id: 'unlock_frost',
    title: '解鎖 冰凍衝擊波（Frost Shockwave）',
    desc: '震退並冰凍敵人 2 秒。',
    apply() { weapons.frost.enabled = true; }
  },

  // Blades upgrades
  {
    id: 'blades_more',
    title: '迴旋斬：刀刃 +1',
    desc: '多一把刀，覆蓋更廣。',
    apply() { weapons.blades.blades += 1; }
  },
  {
    id: 'blades_dmg',
    title: '迴旋斬：傷害 +25%',
    desc: '近戰清怪更快。',
    apply() { weapons.blades.damage = Math.round(weapons.blades.damage * 1.25); }
  },
  {
    id: 'blades_speed',
    title: '迴旋斬：旋轉速度 +15%',
    desc: '更快命中更多敵人。',
    apply() { weapons.blades.angSpeed *= 1.15; }
  },

  // Lightning upgrades
  {
    id: 'lightning_rate',
    title: '雷電鏈：冷卻 -15%',
    desc: '更頻繁放電。',
    apply() { weapons.lightning.baseCooldown *= 0.85; }
  },
  {
    id: 'lightning_chain',
    title: '雷電鏈：跳躍次數 +1',
    desc: '命中更多目標。',
    apply() { weapons.lightning.chains += 1; }
  },
  {
    id: 'lightning_dmg',
    title: '雷電鏈：傷害 +25%',
    desc: '電得更痛。',
    apply() { weapons.lightning.damage = Math.round(weapons.lightning.damage * 1.25); }
  },

  // Meteor upgrades
  {
    id: 'meteor_rate',
    title: '隕石術：冷卻 -15%',
    desc: '更常落隕石。',
    apply() { weapons.meteor.baseCooldown *= 0.85; }
  },
  {
    id: 'meteor_radius',
    title: '隕石術：爆炸半徑 +18',
    desc: '覆蓋更大範圍。',
    apply() { weapons.meteor.impactRadius += 18; weapons.meteor.burnRadius += 12; }
  },
  {
    id: 'meteor_burn',
    title: '隕石術：燃燒傷害 +25%',
    desc: '地面灼燒更致命。',
    apply() { weapons.meteor.burnDps = Math.round(weapons.meteor.burnDps * 1.25); }
  },

  // Frost upgrades
  {
    id: 'frost_rate',
    title: '冰凍衝擊波：冷卻 -15%',
    desc: '更頻繁控場。',
    apply() { weapons.frost.baseCooldown *= 0.85; }
  },
  {
    id: 'frost_freeze',
    title: '冰凍衝擊波：冰凍時間 +0.5s',
    desc: '控場更久。',
    apply() { weapons.frost.freezeSec += 0.5; }
  },
  {
    id: 'frost_dmg',
    title: '冰凍衝擊波：傷害 +25%',
    desc: '震退同時更痛。',
    apply() { weapons.frost.damage = Math.round(weapons.frost.damage * 1.25); }
  },

  // Stats
  {
    id: 'hp',
    title: '體魄：最大 HP +20',
    desc: '更耐打，容錯更高。',
    apply() { player.hpMax += 20; player.hp += 20; }
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

function openLevelUp() {
  state.mode = 'levelup';
  paused = true;

  const pool = UPGRADE_POOL.filter(u => {
    // gate bow upgrades
    if (u.id.startsWith('bow_') && !weapons.bow.enabled) return false;
    if (u.id === 'unlock_bow' && weapons.bow.enabled) return false;

    // gate blades upgrades
    if (u.id.startsWith('blades_') && !weapons.blades.enabled) return false;
    if (u.id === 'unlock_blades' && weapons.blades.enabled) return false;

    // gate lightning upgrades
    if (u.id.startsWith('lightning_') && !weapons.lightning.enabled) return false;
    if (u.id === 'unlock_lightning' && weapons.lightning.enabled) return false;

    // gate meteor upgrades
    if (u.id.startsWith('meteor_') && !weapons.meteor.enabled) return false;
    if (u.id === 'unlock_meteor' && weapons.meteor.enabled) return false;

    // gate frost upgrades
    if (u.id.startsWith('frost_') && !weapons.frost.enabled) return false;
    if (u.id === 'unlock_frost' && weapons.frost.enabled) return false;

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

  // background grid (ancient tiles)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#070a10';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const grid = 56;
  const ox = - (state.camera.x % grid);
  const oy = - (state.camera.y % grid);
  ctx.strokeStyle = 'rgba(246,195,92,.10)';
  ctx.lineWidth = 1;
  for (let x = ox; x < canvas.width; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = oy; y < canvas.height; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // effects: burn fields
  for (const fx of effects) {
    if (fx.type === 'burn') {
      const [sx, sy] = worldToScreen(fx.x, fx.y);
      ctx.fillStyle = 'rgba(246,195,92,.08)';
      ctx.beginPath();
      ctx.arc(sx, sy, fx.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(246,195,92,.22)';
      ctx.stroke();
    }
  }

  // gems (souls)
  for (const g of gems) {
    const [sx, sy] = worldToScreen(g.x, g.y);
    ctx.fillStyle = 'rgba(124,242,208,.92)';
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

  // orbit blades
  if (weapons.blades.enabled) {
    const w = weapons.blades;
    for (let i = 0; i < w.blades; i++) {
      const ang = w.ang + (i * (Math.PI * 2 / w.blades));
      const bx = player.x + Math.cos(ang) * w.radius;
      const by = player.y + Math.sin(ang) * w.radius;
      const [sx, sy] = worldToScreen(bx, by);
      ctx.fillStyle = 'rgba(246,195,92,.92)';
      ctx.beginPath();
      ctx.arc(sx, sy, w.bladeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.stroke();
    }
  }

  // enemies (shadows)
  for (const e of enemies) {
    const [sx, sy] = worldToScreen(e.x, e.y);
    const frozen = state.elapsed < e.frozenUntil;

    ctx.fillStyle = frozen ? 'rgba(120,190,255,.86)' : 'rgba(180,45,65,.92)';
    ctx.beginPath();
    ctx.arc(sx, sy, e.r, 0, Math.PI * 2);
    ctx.fill();

    // tiny hp bar
    const w = e.r * 2;
    const hp01 = clamp(e.hp / 60, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(sx - w / 2, sy - e.r - 10, w, 4);
    ctx.fillStyle = 'rgba(246,195,92,.78)';
    ctx.fillRect(sx - w / 2, sy - e.r - 10, w * hp01, 4);

    // burn indicator
    if (state.elapsed < e.burnUntil) {
      ctx.strokeStyle = 'rgba(246,195,92,.45)';
      ctx.beginPath();
      ctx.arc(sx, sy, e.r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // player
  {
    const [sx, sy] = worldToScreen(player.x, player.y);
    ctx.fillStyle = player.invuln > 0 ? 'rgba(255,255,255,.9)' : 'rgba(170,205,255,.95)';
    ctx.beginPath();
    ctx.arc(sx, sy, player.r, 0, Math.PI * 2);
    ctx.fill();

    // bow aim indicator
    const worldMx = state.camera.x + mouse.x;
    const worldMy = state.camera.y + mouse.y;
    const [nx, ny] = norm(worldMx - player.x, worldMy - player.y);
    ctx.strokeStyle = 'rgba(246,195,92,.55)';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + nx * 26, sy + ny * 26);
    ctx.stroke();
  }

  // effects: lightning bolts & meteors & wave
  for (const fx of effects) {
    if (fx.type === 'bolt') {
      const a = 1 - fx.t / fx.ttl;
      ctx.strokeStyle = `rgba(124,242,208,${0.85 * a})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      fx.pts.forEach((p, idx) => {
        const [sx, sy] = worldToScreen(p[0], p[1]);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (fx.type === 'meteor') {
      const [sx, sy] = worldToScreen(fx.x, fx.y);
      if (fx.stage === 'fall') {
        const t01 = clamp(fx.t / fx.delay, 0, 1);
        const r = 10 + 12 * t01;
        ctx.fillStyle = 'rgba(246,195,92,.14)';
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
  }

  // overlays
  if (paused && state.mode === 'play') {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(246,195,92,.92)';
    ctx.font = '20px system-ui';
    ctx.fillText('Paused (press P)', 18, 34);
  }

  if (state.mode === 'dead') {
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(246,195,92,.95)';
    ctx.font = '28px system-ui';
    ctx.fillText('Fallen Hero', 18, 44);
    ctx.fillStyle = 'rgba(243,241,231,.92)';
    ctx.font = '16px system-ui';
    ctx.fillText('Reload to begin a new legend.', 18, 72);
  }
}

function updateUI() {
  ui.hp.textContent = `${Math.max(0, player.hp | 0)} / ${player.hpMax}`;
  ui.level.textContent = String(player.level);
  ui.xp.textContent = String(player.xp | 0);
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
    const spawnRate = Math.max(0.14, 0.55 - state.elapsed / 180);
    while (enemySpawnAcc > spawnRate) {
      enemySpawnAcc -= spawnRate;
      spawnEnemy();
      if (Math.random() < 0.15) spawnEnemy();
    }

    updateWeapons(dt);
    updateBullets(dt);
    collideBullets();
    updateEffects(dt);
    updateEnemies(dt);
    updateGems(dt);
  }

  draw();
  updateUI();

  if (state.mode !== 'dead') requestAnimationFrame(loop);
}

function resetRun() {
  bullets.length = 0;
  enemies.length = 0;
  gems.length = 0;
  effects.length = 0;

  state.elapsed = 0;
  state.kills = 0;

  player.x = 0;
  player.y = 0;
  player.hpMax = 100;
  player.hp = 100;
  player.speed = 220;
  player.invuln = 0;
  player.level = 1;
  player.xp = 0;
  player.xpNeed = 10;
  player.magnet = 70;

  weapons.wand.enabled = true;
  weapons.wand.baseCooldown = 0.45;
  weapons.wand.damage = 12;
  weapons.wand.projectiles = 1;
  weapons.wand.pierce = 0;
  weapons.wand.cd = 0;

  weapons.bow.enabled = false;
  weapons.bow.baseCooldown = 0.8;
  weapons.bow.damage = 18;
  weapons.bow.projectiles = 1;
  weapons.bow.pierce = 1;
  weapons.bow.cd = 0;

  weapons.blades.enabled = false;
  weapons.blades.blades = 1;
  weapons.blades.damage = 14;
  weapons.blades.tick = 0.22;
  weapons.blades.ang = 0;
  weapons.blades.angSpeed = 3.4;

  weapons.lightning.enabled = false;
  weapons.lightning.baseCooldown = 1.1;
  weapons.lightning.damage = 20;
  weapons.lightning.chains = 3;
  weapons.lightning.range = 190;
  weapons.lightning.cd = 0;

  weapons.meteor.enabled = false;
  weapons.meteor.baseCooldown = 2.4;
  weapons.meteor.impactDamage = 44;
  weapons.meteor.impactRadius = 90;
  weapons.meteor.burnRadius = 80;
  weapons.meteor.burnDps = 16;
  weapons.meteor.burnDuration = 2.6;
  weapons.meteor.delay = 0.6;
  weapons.meteor.scatter = 320;
  weapons.meteor.cd = 0;

  weapons.frost.enabled = false;
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
  resetRun();
  state.t0 = performance.now();
  last = state.t0;
  state.mode = 'play';
  paused = false;

  for (let i = 0; i < 6; i++) spawnEnemy();
  requestAnimationFrame(loop);
}

ui.startBtn?.addEventListener('click', startGame);

// initial render
paused = true;
draw();
updateUI();
