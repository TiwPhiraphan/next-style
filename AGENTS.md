# AGENTS.md - next-style

> gh:TiwPhiraphan/next-style

** ใช้ bun ในการดำเนินการเป็นหลัก **

## โครงการ
**next-style** — Zero-Runtime CSS-in-JS สำหรับ Next.js + Turbopack

### เป้าหมายหลัก
สร้าง library ที่เขียนสไตล์ด้วย `css({})` แล้ว extract ออกมาเป็นไฟล์ CSS ไฟล์เดียว โดยใช้งานง่ายเหมือน Tailwind v4

### วิธีใช้งานที่ต้องการ

**postcss.config.js**
```js
export default {
  plugins: {
    "next-style/plugin": {}
  }
}
```

**globals.css**
```css
@import "next-style";
```

**Component**
```tsx
import { css } from "next-style";

const title = css({
  fontSize: "32px",
  fontWeight: 700,
  '@sm': { fontSize: "40px" },
  ':hover': { backgroundColor: "#2563eb" }
});
```

---

## สิ่งสำคัญที่ต้องทำ (Priority)

1. **Turbopack First** — ต้องทำงานดีโดยไม่ต้อง config เพิ่ม
2. **Zero Runtime** — ไม่มี JS สร้าง style ที่ client
3. **Static Extraction** — ใช้ SWC Plugin / Transformer แปลง `css({})` เป็น className
4. **PostCSS Plugin** — รับ `@import "next-style"` แล้ว inject CSS ทั้งหมด
5. **Deduplication** — Rule เดียวกันต้องใช้ class เดียวกัน
6. **รองรับ** Media Query, Pseudo Class, Nesting, CSS Variable

---

## โครงสร้างโปรเจกต์หลัก

```
next-style/
├── src/
│   ├── runtime/          # css() function + TypeScript types
│   ├── postcss-plugin/   # PostCSS Plugin หลัก
│   ├── compiler/         # SWC Plugin + Style Collector
│   └── utils/
├── package.json
└── tsconfig.json
```

---

## งานแรกที่ต้องทำ

1. ตั้งค่า package + PostCSS Plugin พื้นฐาน
2. สร้าง SWC Transformer สำหรับแปลง `css({})` และ `global(...)` และอื่นๆ
3. ทำ Global Style Collector
4. รองรับ Media Query และ Pseudo
5. Test กับ Next.js + Turbopack

---

**คำสั่งสำหรับ AI:**
พัฒนาโปรเจกต์นี้โดยเน้น **Turbopack compatibility** เป็นอันดับแรก และทำให้ใช้งานได้ด้วย PostCSS + `@import` เท่านั้น
