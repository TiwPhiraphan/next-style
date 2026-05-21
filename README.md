<div align="center">

# Next Style

**Zero-runtime CSS-in-JS for Next.js**

Write styles in TypeScript. Ship pure CSS. Zero overhead.

[![npm version](https://img.shields.io/npm/v/next-style?color=7F77DD&labelColor=000)](https://www.npmjs.com/package/next-style)
[![npm downloads](https://img.shields.io/npm/dm/next-style?color=7F77DD&labelColor=000)](https://www.npmjs.com/package/next-style)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-7F77DD?labelColor=000)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-7F77DD?labelColor=000)](https://opensource.org/licenses/MIT)
[![Turbopack](https://img.shields.io/badge/Turbopack-ready-7F77DD?labelColor=000)](https://turbo.build/pack)

</div>

---

## Overview

**next-style** extracts all styles at build time through a PostCSS plugin — no style injection, no hydration cost, no runtime. The compiled CSS lands in your `globals.css` exactly once.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Features](#features)
- [Installation](#installation)
- [Setup](#setup)
- [API](#api)
- [Responsive Design](#responsive-design)
- [TypeScript](#typescript)
- [Advanced](#advanced)
- [Performance](#performance)
- [Best Practices](#best-practices--common-patterns)
- [Troubleshooting](#troubleshooting)
- [Browser Support](#browser-support)
- [How It Works](#how-it-works)
- [Contributing](#contributing)
- [License](#license)

## Quick Start

1. **Install the package:**
```bash
npm install next-style
```

2. **Configure PostCSS** (`postcss.config.js`):
```js
export default {
  plugins: {
    "next-style/plugin": {},
  },
}
```

3. **Import in `globals.css`:**
```css
@import "next-style";
```

4. **Use in your components:**
```tsx
import { css } from "next-style"

const button = css({
  padding: "8px 16px",
  borderRadius: "6px",
  backgroundColor: "#7F77DD",
  ":hover": { backgroundColor: "#534AB7" },
})

export function Button() {
  return <button className={button}>Click me</button>
}
```

That's it! No providers, wrappers, or complex configuration. All styles are extracted at build time.

### App Router & Server Components

next-style works seamlessly with Next.js 13+ App Router and Server Components:

```tsx
// app/components/Button.tsx (Server Component)
import { css } from "next-style"

const button = css({ /* styles */ })

export function Button() {
  return <button className={button}>Click</button>
}
```

```tsx
// app/components/Counter.tsx (Client Component)
'use client'

import { css } from "next-style"
import { useState } from "react"

const counter = css({ /* styles */ })

export function Counter() {
  const [count, setCount] = useState(0)
  return <div className={counter}>{count}</div>
}
```

Both work identically — the `css()` call is evaluated at build time regardless of component type.

## Example

```tsx
import { css } from "next-style"

const button = css({
  padding: "8px 16px",
  borderRadius: "6px",
  backgroundColor: "#7F77DD",
  cursor: "pointer",
  transition: "background-color 0.2s",
  ":hover": { backgroundColor: "#534AB7" },
  ":active": { transform: "scale(0.98)" },
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
| 🔷 **Turbopack ready** | Works out of the box with Next.js 16+ and Turbopack |
| 🔒 **Fully typed** | Every CSS property and value typed via [csstype](https://github.com/frenic/csstype) |
| 📱 **Responsive first** | Shorthand breakpoints (`@sm` → `@2xl`) sorted mobile-first automatically |
| ♻️ **Deduplication** | Identical style objects always hash to the same class name |
| 🌍 **Global styles** | `global()` for resets, base typography, and third-party overrides |
| 🎞️ **Keyframes** | Declare `@keyframes` inline next to the style that uses them |
| 📦 **Tiny** | ~2 KB minified + gzipped |
| 🚀 **Fast builds** | Negligible build-time overhead — simple hashing and string concatenation |
| 🎨 **CSS-in-JS power** | All CSS features: pseudo-classes, container queries, `@supports`, `@layer`, CSS variables |

Full support for pseudo-classes, pseudo-elements, media queries, container queries, `@supports`, `@layer`, and CSS variables.

### Next.js Version Support

| Next.js Version | Supported |
|-----------------|-----------|
| 16+ | ✅ Full support with Turbopack |
| 15.x | ✅ Supported |
| < 15.0 | ❌ Not supported |

## Installation

```bash
# npm
npm install next-style

# pnpm
pnpm add next-style

# bun
bun add next-style
```

**Peer dependencies required:**
- `next >= 15.0.0`
- `postcss >= 8.0.0`

> Most Next.js projects already include PostCSS. If you're unsure, check your `package.json` or run `npm list postcss`.

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

## Best Practices & Common Patterns

### Reusable Style Objects

Create reusable style definitions by storing them in separate files:

```tsx
// styles/components.ts
import { type CSSObject } from "next-style"

export const buttonBase: CSSObject = {
  padding: "8px 16px",
  borderRadius: "6px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.2s",
  ":active": { transform: "scale(0.98)" },
}

export const buttonPrimary: CSSObject = {
  ...buttonBase,
  backgroundColor: "#7F77DD",
  color: "white",
  ":hover": { backgroundColor: "#534AB7" },
}
```

```tsx
// components/Button.tsx
import { css } from "next-style"
import { buttonPrimary } from "@/styles/components"

export function Button({ children }: { children: React.ReactNode }) {
  return <button className={css(buttonPrimary)}>{children}</button>
}
```

### Design Tokens with CSS Variables

Centralize your design system using CSS variables:

```tsx
// app/globals.ts
import { global } from "next-style"

global({
  ":root": {
    // Colors
    "--color-primary":   "#7F77DD",
    "--color-secondary": "#534AB7",
    "--color-text":      "#1a1a1a",
    "--color-bg":        "#ffffff",
    
    // Spacing
    "--spacing-xs": "4px",
    "--spacing-sm": "8px",
    "--spacing-md": "16px",
    "--spacing-lg": "24px",
    "--spacing-xl": "32px",
    
    // Radius
    "--radius-sm": "4px",
    "--radius-md": "8px",
    "--radius-lg": "12px",
  },
  "body": {
    backgroundColor: "var(--color-bg)",
    color: "var(--color-text)",
  },
})
```

```tsx
// Use in components
const card = css({
  backgroundColor: "var(--color-bg)",
  padding: "var(--spacing-md)",
  borderRadius: "var(--radius-md)",
})
```

### Variant Patterns

Create component variants by conditionally merging styles:

```tsx
import { css, type CSSObject } from "next-style"

interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost"
  size?: "sm" | "md" | "lg"
  children: React.ReactNode
}

export function Button({ variant = "primary", size = "md", children }: ButtonProps) {
  const baseStyles: CSSObject = {
    fontWeight: 500,
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s",
  }
  
  const variantStyles: Record<string, CSSObject> = {
    primary: {
      backgroundColor: "var(--color-primary)",
      color: "white",
      ":hover": { backgroundColor: "var(--color-secondary)" },
    },
    secondary: {
      backgroundColor: "var(--color-secondary)",
      color: "white",
    },
    ghost: {
      backgroundColor: "transparent",
      color: "var(--color-primary)",
      ":hover": { backgroundColor: "rgba(127, 119, 221, 0.1)" },
    },
  }
  
  const sizeStyles: Record<string, CSSObject> = {
    sm: { padding: "4px 12px", fontSize: "14px" },
    md: { padding: "8px 16px", fontSize: "16px" },
    lg: { padding: "12px 24px", fontSize: "18px" },
  }
  
  const className = css({
    ...baseStyles,
    ...variantStyles[variant],
    ...sizeStyles[size],
  })
  
  return <button className={className}>{children}</button>
}
```

### Dark Mode Support

Use CSS variables to implement dark mode:

```tsx
// app/globals.ts
import { global } from "next-style"

global({
  ":root": {
    "--bg-primary": "#ffffff",
    "--text-primary": "#1a1a1a",
  },
  
  "[data-theme='dark']": {
    "--bg-primary": "#1a1a1a",
    "--text-primary": "#ffffff",
  },
})
```

```tsx
// components/ThemeToggle.tsx
'use client'

import { useEffect, useState } from "react"

export function ThemeToggle() {
  const [theme, setTheme] = useState("light")
  
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") || "light"
    setTheme(current)
  }, [])
  
  const toggle = () => {
    const newTheme = theme === "light" ? "dark" : "light"
    document.documentElement.setAttribute("data-theme", newTheme)
    setTheme(newTheme)
  }
  
  return <button onClick={toggle}>Toggle Theme</button>
}
```

## Troubleshooting

### Styles not appearing

1. ✅ Check that `postcss.config.js` includes `"next-style/plugin": {}`
2. ✅ Check that `@import "next-style";` is at the **top** of `globals.css` (before other styles)
3. ✅ Verify you imported `css` from the correct package:
```tsx
import { css } from "next-style"  // ✓ correct
import { css } from "next-style/plugin"  // ✗ incorrect
```
4. ✅ Restart the dev server after any PostCSS config change
5. ✅ Clear the Next.js cache: `rm -rf .next` and restart

### First cold boot shows no styles

On the very first build, no `css()` calls have been evaluated yet so the cache file doesn't exist. Starting from v2.2.4, cold builds work automatically — the PostCSS plugin scans your source files directly when the cache file is missing, so no prior dev run is required.

**For production/CI builds:** The PostCSS plugin automatically scans your source files to extract styles if the cache file is missing, so cold builds on GitHub Actions, Vercel, or other CI systems work without extra setup.

### Build errors after adding PostCSS plugins

Ensure `next-style` is listed **first** in the plugins object — it must run before other transformations:

```js
// ✓ Correct order
export default {
  plugins: {
    "next-style/plugin": {},
    autoprefixer: {},
    "postcss-preset-env": {},
  },
}

// ✗ Wrong order (next-style must be first)
export default {
  plugins: {
    autoprefixer: {},
    "next-style/plugin": {},
  },
}
```

### Styles working in dev but not in production

1. Check that the PostCSS plugin is configured in your build environment
2. Verify `NODE_ENV=production` is set during build
3. Look for CSS minification errors in the build logs

### Breakpoints not working

Ensure you're using the correct shorthand:

```tsx
// ✓ Correct
css({ "@md": { fontSize: "20px" } })

// ✗ Incorrect (use @md, not md)
css({ "md": { fontSize: "20px" } })
```

### TypeScript errors

Install type definitions (usually automatic):

```bash
npm install --save-dev @types/node
```

If types are still missing, ensure `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "types": ["node"],
    "strict": true
  }
}
```

### Performance concerns

next-style is extremely lightweight:
- **Runtime JS:** 0 bytes (all styles extracted at build time)
- **Build time:** Negligible (simple hashing and string operations)
- **CSS output:** Automatically deduplicated and minified in production

No additional optimizations are needed.

## Browser Support

**next-style** outputs standard CSS and supports all modern browsers:

| Browser | Minimum Version |
|---------|-----------------|
| Chrome / Chromium | 90+ |
| Firefox | 87+ |
| Safari | 14+ |
| Edge | 90+ |

Older browsers are supported through standard CSS features used. All advanced CSS (container queries, `@supports`, etc.) gracefully degrade in unsupported browsers.

## How It Works

### Architecture Overview

1. **Build Time (Development & Production)**
   - Your `css()` and `global()` calls are evaluated
   - Each unique style object is hashed and assigned a class name (e.g., `ns-abc123`)
   - Compiled CSS is written to `node_modules/.cache/next-style/styles.css`

2. **PostCSS Processing**
   - The PostCSS plugin reads the cache file
   - Replaces `@import "next-style"` in your `globals.css` with the collected CSS
   - Minifies CSS in production using `cssnano`

3. **Runtime (Production)**
   - Zero JavaScript overhead — styles are already in the static CSS file
   - No style injection, no hydration cost, no runtime recalculation

### Deduplication

Identical style objects always hash to the same class name:

```tsx
// These produce the same class name and CSS rule
const style1 = css({ color: "red", fontSize: "16px" })
const style2 = css({ color: "red", fontSize: "16px" })

// style1 === style2 → true
// Output: only one `.ns-xyz { color: red; font-size: 16px; }` rule
```

### File-Based Bridge

Since PostCSS runs in a separate process, next-style uses a file-based bridge:
- Every `css()` / `global()` call writes compiled CSS to a cache file
- The PostCSS plugin reads that file and injects it into your CSS
- This enables dev-server hot-reloading and zero-setup cold builds

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © [Tiwz](https://github.com/TiwPhiraphan)
