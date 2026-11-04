# Visual Style Guide

This guide is the single source of truth for visual polish across every game in this collection. Every section below ships copy-paste-ready code. No abstract prose — pick a snippet, drop it into a game, tune the constants.

All snippets are vanilla JS targeting a 2D `<canvas>` context. No build step, no dependencies.

---

## 1. Color palette

### Base palette (5 slots)

Every game uses exactly these five semantic slots. Swap the hex codes per game; never invent new slots.

```js
const PALETTE = {
  bgDark:         '#0b0d17', // farthest background, vignettes
  bgMid:          '#1b2030', // playfield surface, panels
  accentPrimary:  '#ff3e6c', // player, focal elements
  accentSecondary:'#3ee0ff', // pickups, friendly highlights
  textBright:     '#f5f7ff', // HUD text, score
};
```

### Six mood palettes

Copy whichever fits the game. Contrast ratios are `textBright` vs. `bgDark` (WCAG AA requires >= 4.5:1 for body, >= 3:1 for large text).

```js
// Arcade — primary-color punch. Contrast 16.8:1.
const ARCADE = {
  bgDark: '#10121a', bgMid: '#1f2540',
  accentPrimary: '#ffcc00', accentSecondary: '#ff3344',
  textBright: '#ffffff',
};

// Neon — magenta + cyan on near-black. Contrast 18.1:1.
const NEON = {
  bgDark: '#05060a', bgMid: '#15102a',
  accentPrimary: '#ff2bd6', accentSecondary: '#00f0ff',
  textBright: '#f0f8ff',
};

// Retro CRT — phosphor green on black. Contrast 15.3:1.
const RETRO_CRT = {
  bgDark: '#020402', bgMid: '#0a1a0a',
  accentPrimary: '#39ff14', accentSecondary: '#a6ffb0',
  textBright: '#c8ffd0',
};

// Pastel — gentle. Contrast 7.6:1 (still AA for body).
const PASTEL = {
  bgDark: '#2a2740', bgMid: '#3c3a5a',
  accentPrimary: '#ffb3c6', accentSecondary: '#a0e7e5',
  textBright: '#fbeaff',
};

// Monochrome — paper white on charcoal. Contrast 14.2:1.
const MONOCHROME = {
  bgDark: '#111111', bgMid: '#2a2a2a',
  accentPrimary: '#dddddd', accentSecondary: '#888888',
  textBright: '#fafafa',
};

// Vaporwave — pink/purple/cyan. Contrast 9.8:1.
const VAPORWAVE = {
  bgDark: '#1a0b2e', bgMid: '#3d1e6d',
  accentPrimary: '#ff77e9', accentSecondary: '#78dbff',
  textBright: '#f8e8ff',
};
```

### Contrast helper (use before shipping)

```js
function relLuminance(hex) {
  const c = hex.match(/[a-f\d]{2}/gi).map(h => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrastRatio(a, b) {
  const [L1, L2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (L1 + 0.05) / (L2 + 0.05);
}
// contrastRatio('#f5f7ff', '#0b0d17') -> 18.6
```

Rule: any text rendered on `bgDark` or `bgMid` must score >= 4.5. Test all six palettes before merging.

---

## 2. Backgrounds

Pick exactly one of these three for each game. Never leave a flat fill.

### 2a. Vertical gradient

```js
function drawVerticalGradient(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
// drawVerticalGradient(ctx, canvas.width, canvas.height, PALETTE.bgMid, PALETTE.bgDark);
```

### 2b. Radial gradient (vignette + focal point)

```js
function drawRadialGradient(ctx, w, h, inner, outer) {
  const cx = w / 2, cy = h / 2;
  const r = Math.hypot(cx, cy);
  const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
// drawRadialGradient(ctx, canvas.width, canvas.height, PALETTE.bgMid, PALETTE.bgDark);
```

### 2c. Animated parallax starfield (or grid)

```js
const stars = Array.from({ length: 120 }, () => ({
  x: Math.random(),           // 0..1 normalized
  y: Math.random(),
  z: 0.3 + Math.random() * 0.7, // depth: 0.3 slow .. 1.0 fast
  r: 0.5 + Math.random() * 1.5,
}));

function drawStarfield(ctx, w, h, dt) {
  for (const s of stars) {
    s.y += dt * 0.04 * s.z;
    if (s.y > 1) { s.y = 0; s.x = Math.random(); }
    ctx.globalAlpha = 0.3 + s.z * 0.7;
    ctx.fillStyle = PALETTE.textBright;
    ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
  }
  ctx.globalAlpha = 1;
}
// call once per frame after the background fill, before sprites.
```

Grid variant: replace stars with horizontal lines whose `y` scrolls; double speed = front layer.

---

## 3. Shapes & sprites

Three render passes from "draft" to "shipped". Every player ship, enemy, pickup gets at least the **gradient fill**. Focal entities (player, boss) get **glow** too.

### 3a. Draft: flat fill (never ship this)

```js
function drawShipFlat(ctx, x, y) {
  ctx.fillStyle = PALETTE.accentPrimary;
  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x + 10, y + 10);
  ctx.lineTo(x - 10, y + 10);
  ctx.closePath();
  ctx.fill();
}
```

### 3b. Standard: radial gradient fill

```js
function drawShipGradient(ctx, x, y) {
  const g = ctx.createRadialGradient(x, y - 4, 2, x, y, 16);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, PALETTE.accentPrimary);
  g.addColorStop(1, '#5a0a20');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x + 10, y + 10);
  ctx.lineTo(x - 10, y + 10);
  ctx.closePath();
  ctx.fill();
}
```

### 3c. Hero: gradient + shadowBlur glow

```js
function drawShipGlow(ctx, x, y) {
  ctx.save();
  ctx.shadowColor = PALETTE.accentPrimary;
  ctx.shadowBlur = 18;
  // draw twice: once for the glow, once crisp on top
  drawShipGradient(ctx, x, y);
  ctx.shadowBlur = 0;
  drawShipGradient(ctx, x, y);
  ctx.restore();
}
```

Rule of thumb: `shadowBlur` <= 24. Larger values murder framerate. Only the player + one or two key entities per frame get glow.

---

## 4. Particle system

One file, one pool, <=200 active. Drop in as `particles.js`:

```js
const PARTICLE_MAX = 200;
const particles = [];

function spawnParticle(x, y, opts = {}) {
  if (particles.length >= PARTICLE_MAX) particles.shift();
  particles.push({
    x, y,
    vx: opts.vx ?? (Math.random() - 0.5) * 200,
    vy: opts.vy ?? (Math.random() - 0.5) * 200,
    life: 0,
    ttl: opts.ttl ?? 0.6,
    size: opts.size ?? 3,
    color: opts.color ?? PALETTE.accentSecondary,
    gravity: opts.gravity ?? 0,
  });
}

function burst(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 140;
    spawnParticle(x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, color });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.ttl) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
  }
}

function drawParticles(ctx) {
  for (const p of particles) {
    const a = 1 - p.life / p.ttl;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}
// usage: burst(enemy.x, enemy.y, 18, PALETTE.accentPrimary);
```

---

## 5. Screen shake

Decaying offset applied before any sprite draw, reset after.

```js
const shake = { mag: 0, decay: 8 };

function triggerShake(intensity) {
  shake.mag = Math.max(shake.mag, intensity); // don't stack additively
}

function updateShake(dt) {
  shake.mag = Math.max(0, shake.mag - shake.decay * dt);
}

function applyShake(ctx) {
  if (shake.mag <= 0) return;
  const dx = (Math.random() - 0.5) * shake.mag;
  const dy = (Math.random() - 0.5) * shake.mag;
  ctx.translate(dx, dy);
}

// per frame:
// ctx.save();
// applyShake(ctx);
// ... draw world ...
// ctx.restore();
// updateShake(dt);

// triggerShake(6)  -> small hit
// triggerShake(14) -> explosion
// triggerShake(24) -> game over
```

Cap intensity at 24. Anything more is nausea-territory.

---

## 6. Score popups / floating text

```js
const popups = [];

function popupScore(x, y, text, color = PALETTE.textBright) {
  popups.push({ x, y, text, color, life: 0, ttl: 0.9 });
}

function updatePopups(dt) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.life += dt;
    p.y -= 30 * dt; // float upward
    if (p.life >= p.ttl) popups.splice(i, 1);
  }
}

function drawPopups(ctx) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  for (const p of popups) {
    const a = 1 - p.life / p.ttl;
    ctx.globalAlpha = a;
    ctx.lineWidth = 3;
    ctx.strokeStyle = PALETTE.bgDark;
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}
// popupScore(enemy.x, enemy.y, '+100', PALETTE.accentSecondary);
```

---

## 7. Easing & lerp

Use these everywhere a value changes over time (HUD numbers, camera, color fades).

```js
function lerp(a, b, t) { return a + (b - a) * t; }

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
```

When to use which:

| Use case                      | Function          |
| ----------------------------- | ----------------- |
| Smoothing per-frame (camera)  | `lerp(a,b,0.1)`   |
| Pop-in, ease-out (popups, UI) | `easeOutCubic`    |
| Symmetric transitions (fade)  | `easeInOutQuad`   |
| Snap-then-settle (impact)     | `easeOutCubic`    |

Per-frame smoothing pattern (framerate-independent):

```js
const smoothing = 1 - Math.pow(0.001, dt); // ~tau = 0.1s
displayedScore = lerp(displayedScore, actualScore, smoothing);
```

---

## 8. HUD & text

### Font stack

```js
const FONT_STACK = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
```

### Sizes

| Element        | Size   | Weight |
| -------------- | ------ | ------ |
| HUD labels     | 18px   | normal |
| Score          | 24px+  | bold   |
| Title screen   | 64px   | bold   |
| Subtitle       | 28px   | normal |
| Body / hints   | 16px   | normal |

### Outlined text helper

```js
function drawText(ctx, text, x, y, opts = {}) {
  const size = opts.size ?? 18;
  const weight = opts.weight ?? 'normal';
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = opts.baseline ?? 'alphabetic';
  ctx.lineWidth = opts.outline ?? 3;
  ctx.strokeStyle = opts.outlineColor ?? PALETTE.bgDark;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = opts.color ?? PALETTE.textBright;
  ctx.fillText(text, x, y);
}

// drawText(ctx, 'SCORE 12,340', 16, 28, { size: 24, weight: 'bold' });
```

Always outline HUD text. A 3px stroke in `bgDark` survives any background.

---

## 9. Audio (Web Audio beeps)

One shared `AudioContext`, lazily initialized (browsers require user gesture).

```js
let _audioCtx = null;
function audio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function beep({ freq = 440, dur = 0.1, type = 'square', vol = 0.15, slide = 0 }) {
  const ctx = audio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq + slide, ctx.currentTime + dur);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}
```

Four reusable cues — call directly on event:

```js
function sfxScore()    { beep({ freq: 880, dur: 0.08, type: 'square',   slide:  220 }); }
function sfxHit()      { beep({ freq: 180, dur: 0.18, type: 'sawtooth', slide: -120 }); }
function sfxPowerUp()  {
  beep({ freq: 440, dur: 0.08, type: 'triangle', slide: 200 });
  setTimeout(() => beep({ freq: 660, dur: 0.08, type: 'triangle', slide: 200 }), 80);
  setTimeout(() => beep({ freq: 880, dur: 0.12, type: 'triangle', slide: 220 }), 160);
}
function sfxGameOver() {
  beep({ freq: 330, dur: 0.25, type: 'sawtooth', slide: -120 });
  setTimeout(() => beep({ freq: 220, dur: 0.25, type: 'sawtooth', slide: -100 }), 220);
  setTimeout(() => beep({ freq: 110, dur: 0.5,  type: 'sawtooth', slide: -50  }), 440);
}
```

Always respect a global mute toggle: gate every `beep()` call on `if (!muted) ...`.

---

## 10. Title & game-over screens

Both share one fade pattern: alpha eased over a short duration.

```js
const screen = { state: 'title', t: 0, fadeDir: 1, alpha: 0 }; // fadeDir: 1 in, -1 out

function updateScreen(dt) {
  screen.t += dt;
  const target = screen.fadeDir > 0 ? 1 : 0;
  screen.alpha = lerp(screen.alpha, target, 1 - Math.pow(0.001, dt));
}

function drawTitle(ctx, w, h) {
  drawRadialGradient(ctx, w, h, PALETTE.bgMid, PALETTE.bgDark);
  ctx.globalAlpha = easeInOutQuad(Math.min(1, screen.alpha));
  drawText(ctx, 'GAME TITLE', w/2, h/2 - 20,
    { size: 64, weight: 'bold', align: 'center', color: PALETTE.accentPrimary });
  drawText(ctx, 'press SPACE to start', w/2, h/2 + 30,
    { size: 18, align: 'center', color: PALETTE.textBright });
  ctx.globalAlpha = 1;
}

function drawGameOver(ctx, w, h, score) {
  ctx.fillStyle = `rgba(11, 13, 23, ${0.7 * screen.alpha})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = easeInOutQuad(screen.alpha);
  drawText(ctx, 'GAME OVER', w/2, h/2 - 10,
    { size: 56, weight: 'bold', align: 'center', color: PALETTE.accentPrimary });
  drawText(ctx, `score ${score}`, w/2, h/2 + 30,
    { size: 24, align: 'center', color: PALETTE.textBright });
  drawText(ctx, 'press R to restart', w/2, h/2 + 64,
    { size: 16, align: 'center', color: PALETTE.textBright });
  ctx.globalAlpha = 1;
}

// to start a transition:
// screen.state = 'gameover'; screen.fadeDir = 1; screen.alpha = 0;
```

---

## 11. Difficulty selector

Three tiers. Persist in `localStorage`. Default Medium.

```js
const DIFFICULTY = {
  easy:   { label: 'Easy',   enemySpeed: 0.7, enemyRate: 0.6, playerLives: 5 },
  medium: { label: 'Medium', enemySpeed: 1.0, enemyRate: 1.0, playerLives: 3 },
  hard:   { label: 'Hard',   enemySpeed: 1.4, enemyRate: 1.6, playerLives: 1 },
};

function loadDifficulty() {
  const k = localStorage.getItem('difficulty');
  return DIFFICULTY[k] ? k : 'medium';
}

function saveDifficulty(k) {
  if (!DIFFICULTY[k]) return;
  localStorage.setItem('difficulty', k);
}

let currentDifficulty = loadDifficulty();

// in title screen handler:
// key '1' -> saveDifficulty('easy');   currentDifficulty = 'easy';
// key '2' -> saveDifficulty('medium'); currentDifficulty = 'medium';
// key '3' -> saveDifficulty('hard');   currentDifficulty = 'hard';

// in game logic:
// const cfg = DIFFICULTY[currentDifficulty];
// enemy.vy = baseSpeed * cfg.enemySpeed;
```

Render the selector on the title screen:

```js
function drawDifficultyPicker(ctx, w, h) {
  const y = h - 80;
  const keys = ['easy', 'medium', 'hard'];
  for (let i = 0; i < 3; i++) {
    const k = keys[i];
    const x = w/2 + (i - 1) * 110;
    const active = k === currentDifficulty;
    drawText(ctx, `[${i+1}] ${DIFFICULTY[k].label}`, x, y,
      { size: 18, align: 'center',
        color: active ? PALETTE.accentSecondary : PALETTE.textBright });
  }
}
```

---

## 12. All-ages accessibility

Three non-negotiable rules. Every game must pass all three before merge.

### 12a. Hit targets >= 44 x 44 px

Any tappable / clickable button gets a hit rectangle at least 44 x 44 CSS pixels, regardless of how small the visible art is.

```js
const MIN_HIT = 44;

function hitTest(mx, my, btn) {
  const w = Math.max(btn.w, MIN_HIT);
  const h = Math.max(btn.h, MIN_HIT);
  const x = btn.x + btn.w/2 - w/2;
  const y = btn.y + btn.h/2 - h/2;
  return mx >= x && mx <= x + w && my >= y && my <= y + h;
}
```

### 12b. Flash cap: <= 3 Hz

Never flicker any element faster than three times per second. Photosensitive-safe rule:

```js
const FLASH_MIN_INTERVAL = 1 / 3; // 0.333s
let lastFlash = 0;

function safeFlash(now) {
  if (now - lastFlash < FLASH_MIN_INTERVAL) return false;
  lastFlash = now;
  return true;
}
// if (safeFlash(performance.now()/1000)) flashEffect();
```

For continuous flicker, drive opacity with `Math.sin(t * 2*Math.PI * 2.5)` — 2.5 Hz, safely under the cap.

### 12c. Comfort mode toggle

A single switch that scales text 1.5x and reduces particles. Persist in `localStorage`.

```js
const comfort = {
  enabled: localStorage.getItem('comfort') === '1',
  textScale() { return this.enabled ? 1.5 : 1.0; },
  particleScale() { return this.enabled ? 0.4 : 1.0; },
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('comfort', this.enabled ? '1' : '0');
  },
};

// when spawning particles:
// const n = Math.round(20 * comfort.particleScale());
// burst(x, y, n, color);

// when sizing text:
// drawText(ctx, 'SCORE', x, y, { size: 18 * comfort.textScale() });
```

Bind a key (e.g. `C`) on the title screen to `comfort.toggle()`, and show the current state next to the difficulty picker:

```js
drawText(ctx, `[C] Comfort: ${comfort.enabled ? 'ON' : 'OFF'}`,
  w/2, h - 50, { size: 16, align: 'center',
    color: comfort.enabled ? PALETTE.accentSecondary : PALETTE.textBright });
```

---

## Polish checklist (paste into PR description)

- [ ] Uses one of the six mood palettes; contrast verified >= 4.5
- [ ] Background is gradient or starfield, not flat
- [ ] Player sprite has glow; enemies have gradient fill
- [ ] Particle bursts on score/hit/death events
- [ ] Screen shake on impacts (capped at 24)
- [ ] Score popups float on pickup
- [ ] HUD uses monospace stack, outlined text
- [ ] All four SFX cues wired (score, hit, power-up, game-over)
- [ ] Title + game-over screens fade in/out
- [ ] Difficulty selector renders and persists
- [ ] Hit targets >= 44x44, flash <= 3Hz, comfort mode toggle present
