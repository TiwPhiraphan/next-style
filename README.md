# Next Style

> **Zero-Runtime CSS-in-JS** for Next.js with Turbopack support

A lightweight CSS-in-JS library that extracts styles at build time, resulting in zero runtime overhead. Write styles in JavaScript with full TypeScript support while shipping only pure CSS.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why next-style?

- **Zero Runtime** — All style extraction happens at build time. Ship pure CSS, not JavaScript.
- **Turbopack Ready** — Optimized for Next.js 15+ and Turbopack without additional configuration.
- **Type Safe** — Full TypeScript support powered by [csstype](https://github.com/frenic/csstype) for intelligent autocomplete on every CSS property and value.
- **Automatic Deduplication** — Identical style objects always produce the same class name.
- **Responsive First** — Built-in shorthand breakpoints (`@sm`, `@md`, `@lg`, `@xl`, `@2xl`), sorted mobile-first automatically.
- **Developer Experience** — Simple API. Just `css({})` and go.

## Quick Start

### Installation

```bash
bun add next-style
```

### Setup

#### 1. Configure PostCSS

Create `postcss.config.js` in your project root:

```js
export default {
  plugins: {
    "next-style/plugin": {}
  }
}
```

If you already have `postcss.config.js` (e.g. with Tailwind), add next-style first:

```js
export default {
  plugins: {
    "next-style/plugin": {},
    tailwindcss: {},
    autoprefixer: {}
  }
}
```

> **Order matters** — next-style must come before other plugins.

#### 2. Import styles in `globals.css`

```css
@import "next-style";
/* your other imports/rules */
```

The PostCSS plugin replaces this `@import` with the compiled CSS at build time.

#### 3. Use in components

```tsx
import { css } from "next-style"

const title = css({
  fontSize: "32px",
  fontWeight: 500,
  "@md": { fontSize: "40px" },
  ":hover": { color: "#7F77DD" }
})

export default function App() {
  return <h1 className={title}>Hello World</h1>
}
```

## Features

| Feature | Status | Details |
|---------|--------|---------|
| Zero Runtime | ✅ | Styles extracted at build time |
| Turbopack | ✅ | Native support for Next.js 15+ |
| Type Safety | ✅ | Powered by csstype — full property + value autocomplete |
| Responsive Breakpoints | ✅ | `@sm` `@md` `@lg` `@xl` `@2xl` |
| Arbitrary Media Queries | ✅ | `'@media (min-width: 900px)'` |
| Pseudo-classes | ✅ | `:hover` `:focus` `:active` `:disabled` `:focus-visible` … |
| Pseudo-elements | ✅ | `::before` `::after` `::first-letter` … |
| Keyframe Animations | ✅ | `'@keyframes name'` inline with the style object |
| Container Queries | ✅ | `'@container sidebar (min-width: 300px)'` |
| `@supports` | ✅ | `'@supports (display: grid)'` |
| `@layer` | ✅ | `'@layer utilities'` |
| CSS Variables | ✅ | `var(--token)` as values |
| Deduplication | ✅ | Same object → same class, always |
| Global Styles | ✅ | `global()` for resets and base rules |

## API

### `css(styles: CSSObject): string`

Converts a style object into a unique, stable class name. Identical objects always return the same class (deduplication). Styles are collected at build time — zero cost at runtime.

```tsx
const button = css({
  padding: "8px 16px",
  borderRadius: "6px",
  backgroundColor: "#7F77DD",
  color: "#fff",
  cursor: "pointer",
  ":hover": { backgroundColor: "#534AB7" },
  "@md": { padding: "10px 20px" }
})

export function Button() {
  return <button className={button}>Click me</button>
}
```

### `global(styles: Record<string, CSSObject>): void`

Registers global CSS rules applied directly to selectors — no scoped class. Useful for resets, base typography, and third-party element overrides.

```tsx
import { global } from "next-style"

global({
  "*": { boxSizing: "border-box", margin: "0" },
  "body": { fontFamily: "Inter, sans-serif", lineHeight: "1.6" },
  "h1, h2, h3": { fontWeight: 500, lineHeight: "1.2" }
})
```

## Examples

### Responsive design

Breakpoints expand to standard `min-width` media queries and are sorted mobile-first automatically.

| Shorthand | Expands to |
|-----------|-----------|
| `@sm` | `@media (min-width: 640px)` |
| `@md` | `@media (min-width: 768px)` |
| `@lg` | `@media (min-width: 1024px)` |
| `@xl` | `@media (min-width: 1280px)` |
| `@2xl` | `@media (min-width: 1536px)` |

```tsx
const container = css({
  width: "100%",
  padding: "16px",
  "@md": { width: "768px", padding: "24px" },
  "@lg": { width: "1024px", padding: "32px" }
})
```

Arbitrary media queries are also supported:

```tsx
const sidebar = css({
  display: "none",
  "@media (min-width: 900px)": { display: "block" }
})
```

### Interactive states

```tsx
const link = css({
  color: "#3b82f6",
  textDecoration: "none",
  transition: "color 0.2s",
  ":hover": { color: "#1e40af" },
  ":focus-visible": { outline: "2px solid #3b82f6", outlineOffset: "2px" },
  ":active": { color: "#1e3a8a" }
})
```

### Keyframe animations

Declare `@keyframes` inline alongside the style that uses them:

```tsx
const spinner = css({
  animationName: "spin",
  animationDuration: "1s",
  animationTimingFunction: "linear",
  animationIterationCount: "infinite",
  "@keyframes spin": {
    to: { transform: "rotate(360deg)" }
  }
})
```

### Container queries

```tsx
const card = css({
  fontSize: "14px",
  "@container sidebar (min-width: 300px)": { fontSize: "16px" }
})
```

### CSS variables

```tsx
const card = css({
  backgroundColor: "var(--bg-primary)",
  color: "var(--text-primary)",
  padding: "var(--spacing-4)",
  borderRadius: "var(--radius-lg)"
})
```

## TypeScript

All CSS properties and values are fully typed via [csstype](https://github.com/frenic/csstype). Typos in property names are caught at compile time and your editor will autocomplete valid values.

```tsx
import { css, type CSSObject } from "next-style"

const myStyles: CSSObject = {
  fontSize: "16px",       // ✅ typed
  colour: "red",          // ❌ compile error — unknown property
  "@md": { fontSize: "20px" },
  ":hover": { opacity: 0.8 }
}

const title = css(myStyles)
```

### Exported types

| Type | Description |
|------|-------------|
| `CSSObject` | Style object accepted by `css()` and `global()` |
| `CSSProperties` | CSS properties only (no at-rules or pseudos) — backed by csstype |

## Advanced: `createTransformer`

For SWC/Babel transforms and test harnesses that need an isolated collector independent of the shared runtime instance:

```ts
import { createTransformer } from "next-style"

const { collector, transformCssCall } = createTransformer()
const className = transformCssCall({ color: "red" }) // "ns-abc123"
const css = collector.getAllStyles()                   // ".ns-abc123 { color: red; }"
```

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Watch for changes
bun run dev

# Type-check only
bunx tsc --noEmit

# Lint
bun run lint

# Format
bun run format
```

### Project structure

```
src/
├── runtime/          # css() · global() · CSSObject type
├── postcss-plugin/   # @import "next-style" → compiled CSS
├── compiler/         # StyleCollector · createTransformer
└── utils/            # camelToKebab · generateClassHash · BREAKPOINTS
```

## Performance

- **Bundle size** — ~2 KB minified + gzipped
- **Runtime cost** — 0 bytes (styles extracted at build time)
- **Build overhead** — negligible

## Browser support

All modern browsers (Chrome, Firefox, Safari, Edge).

## Troubleshooting

### Styles not appearing

1. Confirm `postcss.config.js` includes `"next-style/plugin": {}`
2. Confirm `@import "next-style";` is present in `globals.css`
3. Restart the dev server — PostCSS config changes require a restart
4. Clear the Next.js cache: `rm -rf .next` then restart

### Using alongside Tailwind / Autoprefixer

next-style must be listed **first** in the plugins object:

```js
export default {
  plugins: {
    "next-style/plugin": {},   // ← first
    tailwindcss: {},
    autoprefixer: {}
  }
}
```

## License

MIT © [TiwPhiraphan](https://github.com/TiwPhiraphan)

---

**Made with ❤️ for Next.js developers**
