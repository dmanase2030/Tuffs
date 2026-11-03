# DESIGN.md

> A deep-charcoal arcade console: quiet surfaces, one violet accent, dense grids, and motion that stays out of the way.

## 1. Visual Theme & Atmosphere

**Style**: Dark Tech, minimal execution
**Keywords**: charcoal, restrained, dense, fast, focused, premium
**Tone**: Quiet and confident — NOT neon, cluttered, or gamified-kitsch. No particle fields, no giant empty heroes, no fake stats.
**Feel**: A well-organized games shelf in a dim room — everything one glance away, nothing shouting.

**Interaction Tier**: L1 (polished static — short hover/page transitions only, per the portal brief; the Scramjet browse tab and the games carry the "wow", not the chrome)
**Dependencies**: None (pure CSS transitions)

## 2. Color Palette & Roles

```css
:root {
  --bg: #141417;                       /* page background - deep charcoal */
  --bg-soft: #17171b;                  /* sidebar */
  --surface: #1b1b20;                  /* cards, inputs */
  --surface-2: #202027;                /* raised elements, fallback thumbs */
  --surface-hover: #242430;
  --border: rgba(255, 255, 255, 0.07);
  --border-strong: rgba(255, 255, 255, 0.13);
  --text: #ececf0;                     /* headings, primary text */
  --text-2: #a3a3ad;                   /* body, descriptions */
  --text-3: #6d6d78;                   /* labels, meta */
  --violet: #8b5cf6;                   /* primary accent */
  --blue: #3b82f6;                     /* gradient partner, secondary accent */
  --accent: var(--violet);             /* user-selectable: violet | blue | teal */
  --accent-soft: rgba(139, 92, 246, 0.14);
  --accent-border: rgba(139, 92, 246, 0.45);
  --success: #34d399; --error: #f87171; --warning: #fbbf24;
  --radius: 12px; --radius-sm: 8px;
  --shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  --transition: 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

**Color rules:** every color via CSS variables (zero hardcoded hex in components); one accent at a time (violet default, user-selectable in Settings); violet+blue appear together only in the brand mark and fallback thumbnails; no neon glow — accents are used on borders, text and small fills, never as large glowing areas.

## 3. Typography Rules

```css
--font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Hero H1 | 24px | 700 | One per page (home welcome only) |
| Page H1 | 22px | 700 | Player/section titles |
| Section H2 | 16px | 600 | |
| Card title | 13.5px | 600 | Single line, ellipsis |
| Body | 14-15px | 400 | Line height 1.55 |
| Labels/meta | 11-13px | 500-600 | Uppercase category tags tracked 0.06em |

**Rules:** system font stack only (no external fonts, no FOUT, no third-party requests); `NEVER use`: webfont CDNs, icon fonts, more than one family. Mono is system default, used only in the credits/settings copy.

## 4. Component Stylings

### Buttons (full states)

```css
.btn { padding: 9px 16px; border-radius: 10px; font-size: 14px; font-weight: 600;
       transition: background var(--transition), border-color var(--transition), transform var(--transition); }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { filter: brightness(1.12); }
.btn-primary:active { transform: translateY(1px); }
.btn-primary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn-ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--border-strong); }
.btn-ghost:hover { background: var(--surface-hover); border-color: var(--accent-border); }
.btn-danger-ghost { color: var(--error); border-color: rgba(248,113,113,.35); } /* destructive confirmations */
```

### Cards

```css
.game-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
             transition: border-color, background, transform, box-shadow (all var(--transition)); }
.game-card:hover, .game-card:focus-within { border-color: var(--accent-border); background: var(--surface-hover);
             transform: translateY(-2px); box-shadow: var(--shadow); }
```

### Navigation

```css
.nav-item { color: var(--text-2); border-radius: var(--radius-sm); }
.nav-item:hover { background: var(--surface-2); color: var(--text); }
.nav-item[aria-current="page"] { background: var(--accent-soft); color: var(--accent); border-color: var(--accent-border); }
```

### Links / badges / inputs

Links: accent color, no underline until hover. Badges: pill, accent-soft fill. Inputs: surface fill, border-strong, accent border on focus. Every interactive element has visible `:focus-visible` ring (2px accent, offset 2px).

## 5. Layout Principles

- Desktop: fixed 224px sidebar + top bar (search, random) + max-1440px content
- Mobile (<900px): sidebar becomes an off-canvas drawer with toggle; single column; no horizontal scroll
- Grid: `repeat(auto-fill, minmax(196px, 1fr))`, gap 14px (10px compact)
- Thumb aspect 16:10, dimensions reserved to prevent layout shift
- Spacing: 24px content padding; sections 30px apart; cards 8px internal padding

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | borders only | Default surfaces |
| Raised | `var(--shadow)` | Card hover only |
| Overlay | backdrop-blur(10px) top bar | Sticky header |
No glow shadows; elevation is communicated by border + subtle lift, not glow.

## 7. Animation & Interaction

**Philosophy**: short (160ms), purposeful, GPU-cheap (transform/opacity only).
- Page in: 240ms fade+rise
- Card hover: border/bg change + 2px lift
- Thumbnail hover: 1.04 scale (280ms)
- Toast/dialog: 200ms in
- Reduced motion: full override via `prefers-reduced-motion` AND a user setting (`html[data-motion="reduced"]`) that applies the same rules

## 8. Do's and Don'ts

**Do**
- Keep the grid dense and scannable; white space is for rhythm, not emptiness
- Show honest counts and empty states (no fake "trending" sections)
- Use inline SVG icons only; label all icon buttons for screen readers
- Reserve thumb dimensions; lazy-load all images

**Don't**
- ❌ Neon glow, particles, background videos, giant empty heroes
- ❌ Fake statistics, reviews, "popular" labels without data
- ❌ Hover-only controls (every action reachable by keyboard)
- ❌ Hardcoded colors anywhere in components
- ❌ Nested interactive controls inside links (favorite button is a sibling, not a child)
- ❌ Frameworks or webfonts for appearance reasons

## 9. Responsive Behavior

| Name | Width | Key changes |
|------|-------|-------------|
| Desktop | >900px | Sidebar + topbar + grid |
| Mobile | <=900px | Off-canvas nav (toggle, Esc closes, focus returns), grid min 150px, player height 62vh, search stays in header |

Touch targets: >=32px visual (44px hit area via padding). Collapsing: grids auto-fill; player stage switches from aspect-ratio to viewport height; hero text wraps.
