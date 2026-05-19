<div align="center">

# Next Style

**Zero-runtime CSS-in-JS for Next.js**

Write styles in TypeScript. Ship pure CSS. Zero overhead.

[![npm version](https://img.shields.io/npm/v/next-style?color=7F77DD&labelColor=000)](https://www.npmjs.com/package/next-style)
[![License: MIT](https://img.shields.io/badge/license-MIT-7F77DD?labelColor=000)](https://opensource.org/licenses/MIT)
[![Turbopack](https://img.shields.io/badge/Turbopack-ready-7F77DD?labelColor=000)](https://turbo.build/pack)

</div>

---

**next-style** extracts all styles at build time through a PostCSS plugin — no style injection, no hydration cost, no runtime. The compiled CSS lands in your `globals.css` exactly once.

```tsx
import { css } from "next-style"

const button = css({
  padding: "8px 16px",
  borderRadius: "6px",
  backgroundColor: "#7F77DD",
  ":hover": { backgroundColor: "#534AB7" },
  "@md": { padding: "10px 20px" },
})

export function Button() {
  return <button className={button}>Click me</button>
}
```

## Features

| | |
|---|---|
| ⚡ **Zero runtime** | All styles extracted at build time — 0 bytes of style JS shipped |
| 🔷 **Turbopack ready** | Works out of the box with Next.js 15+ and Turbopack |
| 🔒 **Fully typed** | Every CSS property and value typed via [csstype](https://github.com/frenic/csstype) |
| 📱 **Responsive first** | Shorthand breakpoints (`@sm` → `@2xl`) sorted mobile-first automatically |
| ♻️ **Deduplication** | Identical style objects always hash to the same class name |
| 🌍 **Global styles** | `global()` for resets, base typography, and third-party overrides |
| 🎞️ **Keyframes** | Declare `@keyframes` inline next to the style that uses them |
| 📦 **Tiny** | ~2 KB minified + gzipped |

Full support for pseudo-classes, pseudo-elements, media queries, container queries, `@supports`, `@layer`, and CSS variables.

## Installation

```bash
# npm
npm install next-style

# pnpm
pnpm add next-style

# bun
bun add next-style
```

> **Peer dependency:** `postcss >= 8.0.0` is required. Most Next.js projects already include it.

## Setup

### 1. Configure PostCSS

Create `postcss.config.js` in your project root:

```js
// postcss.config.js
export default {
  plugins: {
    "next-style/plugin": {},
  },
}
```

<details>
<summary>Using with Autoprefixer</summary>

Install autoprefixer and add it **after** next-style:

```bash
npm install -D autoprefixer
```

```js
// postcss.config.js
export default {
  plugins: {
    "next-style/plugin": {},
    autoprefixer: {},
  },
}
```

> **Order matters** — `next-style/plugin` must be listed before other plugins.

</details>

### 2. Add the import to `globals.css`

```css
/* app/globals.css */
@import "next-style";
```

The PostCSS plugin replaces this import with all compiled styles at build time. Add it before any other rules.

### 3. Use in your components

```tsx
// app/page.tsx
import { css } from "next-style"

const title = css({
  fontSize: "32px",
  fontWeight: 600,
  "@md": { fontSize: "40px" },
  ":hover": { color: "#7F77DD" },
})

export default function Page() {
  return <h1 className={title}>Hello World</h1>
}
```

That's it. No providers, no wrappers, no configuration beyond PostCSS.

## API

### `css(styles)`

```ts
function css(styles: CSSObject): string
```

Converts a style object into a stable, unique class name. Identical style objects always produce the same hash — duplicates are eliminated automatically. All processing happens at build time.

```tsx
const card = css({
  // Base styles
  display: "flex",
  flexDirection: "column",
  padding: "16px",
  borderRadius: "8px",
  backgroundColor: "var(--surface)",

  // Pseudo-classes & pseudo-elements
  ":hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.1)" },
  ":focus-visible": { outline: "2px solid #7F77DD", outlineOffset: "2px" },
  "::before": { content: '""', display: "block" },

  // Responsive breakpoints
  "@md": { flexDirection: "row", padding: "24px" },
  "@lg": { padding: "32px" },

  // Arbitrary media query
  "@media (prefers-reduced-motion: reduce)": { transition: "none" },

  // Container query
  "@container sidebar (min-width: 300px)": { fontSize: "16px" },

  // Feature query
  "@supports (display: grid)": { display: "grid" },

  // Cascade layer
  "@layer utilities": { isolation: "isolate" },

  // Inline keyframes
  animationName: "fadeIn",
  animationDuration: "0.3s",
  "@keyframes fadeIn": {
    from: { opacity: 0, transform: "translateY(4px)" },
    to:   { opacity: 1, transform: "translateY(0)" },
  },
})
```

### `global(styles)`

```ts
function global(styles: Record<string, CSSObject>): void
```

Registers styles directly against selectors — no scoping, no class name. Use for CSS resets, base typography, and overriding third-party elements.

```tsx
// app/globals.ts  (imported once in your layout)
import { global } from "next-style"

global({
  "*": {
    boxSizing: "border-box",
    margin: "0",
    padding: "0",
  },
  "body": {
    fontFamily: "system-ui, sans-serif",
    lineHeight: "1.6",
    color: "var(--text-primary)",
  },
  "h1, h2, h3, h4": {
    fontWeight: 600,
    lineHeight: "1.2",
  },
})
```

## Responsive Design

Shorthand breakpoints expand to `min-width` media queries and are always emitted in mobile-first order, regardless of how you write them.

| Shorthand | Expands to |
|-----------|------------|
| `@sm`  | `@media (min-width: 640px)`  |
| `@md`  | `@media (min-width: 768px)`  |
| `@lg`  | `@media (min-width: 1024px)` |
| `@xl`  | `@media (min-width: 1280px)` |
| `@2xl` | `@media (min-width: 1536px)` |

```tsx
const layout = css({
  display: "grid",
  gridTemplateColumns: "1fr",                        // mobile: single column
  "@md": { gridTemplateColumns: "1fr 2fr" },         // tablet: sidebar + content
  "@lg": { gridTemplateColumns: "240px 1fr 200px" }, // desktop: full layout
})
```

For custom breakpoints, use an arbitrary media query string:

```tsx
const widget = css({
  display: "none",
  "@media (min-width: 900px)": { display: "block" },
})
```

## TypeScript

All CSS properties and values are typed via [csstype](https://github.com/frenic/csstype). Property typos fail at compile time. Values get IDE autocomplete.

```tsx
import { css, type CSSObject } from "next-style"

// Type a reusable style object before passing it to css()
const base: CSSObject = {
  fontSize: "16px",   // ✅
  colour: "red",      // ❌ TypeScript error: unknown property
  display: "flx",     // ❌ TypeScript error: invalid value
}

const el = css(base)
```

**Exported types:**

| Type | Description |
|------|-------------|
| `CSSObject` | Full style object — properties, at-rules, and pseudos |
| `CSSProperties` | CSS properties only, no at-rules or pseudos |

## Advanced

### `createTransformer`

For build tooling, SWC/Babel plugins, and test harnesses that need an isolated style collector independent of the global runtime:

```ts
import { createTransformer } from "next-style"

const { collector, transformCssCall } = createTransformer()

const className = transformCssCall({ color: "red", fontSize: "16px" })
// → "ns-abc123"

const css = collector.getAllStyles()
// → ".ns-abc123 { color: red; font-size: 16px; }"
```

### `StyleCollector`

The class powering both the runtime and `createTransformer`. Exposed for custom integrations:

```ts
import { StyleCollector } from "next-style"

const collector = new StyleCollector()
collector.addStyle({ color: "red" })          // → "ns-abc123"
collector.addGlobalStyle("body", { margin: "0" })
collector.getAllStyles()                       // full CSS string
collector.flush("/custom/path/styles.css")    // write to disk
```

### How the PostCSS bridge works

Because PostCSS runs in a separate process from the module graph, in-memory style collectors cannot be shared. next-style solves this with a file-based bridge:

1. Every `css()` / `global()` call writes compiled CSS to `node_modules/.cache/next-style.css`
2. The PostCSS plugin reads that file and replaces `@import "next-style"` with its contents

This is why `@import "next-style"` must appear in `globals.css` — it's the injection point.

### CSS Variables

next-style pairs naturally with CSS custom properties for design tokens:

```tsx
// Define tokens once in global()
global({
  ":root": {
    "--color-brand":   "#7F77DD",
    "--color-surface": "#ffffff",
    "--radius-base":   "6px",
    "--spacing-4":     "16px",
  },
})

// Consume anywhere in css()
const card = css({
  backgroundColor: "var(--color-surface)",
  borderRadius:    "var(--radius-base)",
  padding:         "var(--spacing-4)",
  ":hover": { color: "var(--color-brand)" },
})
```

## CSS output order

Styles are emitted in this order to ensure correct cascade:

1. `@keyframes` blocks
2. Base class rules
3. Pseudo-class / pseudo-element rules
4. `@layer` blocks
5. `@supports` blocks
6. Media queries (ascending `min-width`, mobile-first)

## Performance

| Metric | Value |
|--------|-------|
| Runtime JS | **0 bytes** |
| Bundle size | ~2 KB minified + gzipped |
| Build overhead | Negligible — hashing + string emit only |
| CSS deduplication | Automatic — one class per unique style object |

Because styles are extracted at build time, there is no style recalculation, no `<style>` injection, and no FOUC. The output is a single static CSS file.

## Troubleshooting

**Styles not appearing**

1. Check that `postcss.config.js` includes `"next-style/plugin": {}`
2. Check that `@import "next-style";` is at the top of `globals.css`
3. Restart the dev server after any PostCSS config change
4. Clear the Next.js cache: `rm -rf .next` and restart

**First cold boot shows no styles**

On the very first build, no `css()` calls have been evaluated yet so the cache file doesn't exist. Run the dev server once to populate the cache, then styles will appear on reload. This is expected behaviour on cold starts.

**Build errors after adding PostCSS plugins**

Ensure next-style is listed **first** in the plugins object — it must run before any other transformations.

## License

MIT © [Tiwz](https://github.com/TiwPhiraphan)
