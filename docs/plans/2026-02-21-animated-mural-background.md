# Animated Mural Background Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace static gradient background with a CSS-only animated mural that creates the illusion of sand/particles morphing through flowing colors and shapes.

**Architecture:** Pure CSS animated gradients + SVG filters to simulate particle flow without JavaScript. Uses layered `@keyframes` animations with hue rotation, gradient position shifts, and filter effects. Background image embedded as base64 data URI. Total budget: <1KB gzipped.

**Tech Stack:** CSS `@keyframes`, SVG `<filter>` for turbulence, CSS `backdrop-filter`, base64 image embedding

---

## Task 1: Convert Image to Optimized Base64

**Files:**
- Modify: `src/components/perspective-grid.tsx`
- Reference: `/Users/ammishra/Downloads/Gemini_Generated_Image_q2yw53q2yw53q2yw.png`

**Step 1: Optimize the image**

The image needs to be:
1. Cropped to remove any Veo logo (bottom-right corner)
2. Compressed to ~3-5KB maximum
3. Converted to base64 for embedding

Run:
```bash
# Use ImageMagick or online tool to compress and optimize
# Target: ~4KB JPEG (not PNG for smaller size)
# Remove bottom-right corner if logo present
# Result: base64 string that's ~5-6KB max
```

Expected: A base64 string ~5-6KB that represents the compressed image

**Step 2: Verify base64 size**

The base64 string when gzipped should be ~2-3KB. We'll verify this in Task 5.

**Step 3: Create working backup**

```bash
# Save the base64 string as a constant in perspective-grid.tsx
# This becomes our image reference
```

**Step 4: Commit**

```bash
git add src/components/perspective-grid.tsx
git commit -m "feat: add optimized base64 image for animated mural"
```

---

## Task 2: Create Animated Mural CSS Component

**Files:**
- Replace: `src/components/perspective-grid.tsx`
- Create: `src/css/animated-mural.css` (if separate)

**Step 1: Write minimal CSS animations**

Replace `perspective-grid.tsx` with:

```typescript
export function PerspectiveGrid() {
  // Base64 of optimized image (~2-3KB gzipped)
  const imageBase64 = 'data:image/jpeg;base64,<compressed-base64-here>'

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        background: `url('${imageBase64}') center/cover no-repeat`,
        animation: 'mural-morph 60s ease-in-out infinite',
        filter: 'blur(0.3px)',
      }}
    >
      {/* SVG filter for particle-like turbulence effect */}
      <svg className="absolute inset-0 opacity-20 pointer-events-none" width="100%" height="100%">
        <defs>
          <filter id="morph">
            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="4" result="noise" seed="1" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="50" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="rgba(236,72,153,0.15)" filter="url(#morph)" />
      </svg>

      {/* Animated color overlay for spectrum shift */}
      <div
        className="absolute inset-0"
        style={{
          animation: 'spectrum-shift 90s linear infinite',
          mixBlendMode: 'screen',
          opacity: 0.4,
        }}
      />
    </div>
  )
}
```

**Step 2: Add CSS keyframe animations**

Add to `src/index.css` (or inline in component):

```css
@keyframes mural-morph {
  0% {
    background-position: 0% 0%;
    filter: blur(0.3px) brightness(1);
  }
  25% {
    background-position: 2% -1%;
    filter: blur(0.35px) brightness(1.02);
  }
  50% {
    background-position: -1% 1%;
    filter: blur(0.3px) brightness(1);
  }
  75% {
    background-position: 1% -0.5%;
    filter: blur(0.32px) brightness(1.01);
  }
  100% {
    background-position: 0% 0%;
    filter: blur(0.3px) brightness(1);
  }
}

@keyframes spectrum-shift {
  0% {
    background: linear-gradient(135deg,
      hsl(0, 100%, 50%) 0%,
      hsl(30, 100%, 50%) 25%,
      hsl(60, 100%, 50%) 50%,
      hsl(90, 100%, 50%) 75%,
      hsl(0, 100%, 50%) 100%
    );
  }
  100% {
    background: linear-gradient(135deg,
      hsl(60, 100%, 50%) 0%,
      hsl(90, 100%, 50%) 25%,
      hsl(120, 100%, 50%) 50%,
      hsl(150, 100%, 50%) 75%,
      hsl(60, 100%, 50%) 100%
    );
  }
}
```

**Step 3: Verify CSS size**

The CSS should be minimal:
```bash
# Check total CSS + base64 size
# Target: <1KB gzipped total
```

**Step 4: Test in browser**

Run `bun run dev` and verify:
- Background image visible
- Subtle morphing animation
- Color spectrum slowly shifts
- No jank or performance issues

**Step 5: Commit**

```bash
git add src/components/perspective-grid.tsx src/index.css
git commit -m "feat: implement CSS-only animated mural with spectrum shift"
```

---

## Task 3: Integrate with Landing Page

**Files:**
- Verify: `src/routes/index.tsx` (already uses `<PerspectiveGrid />`)
- Verify: `src/components/landing-navbar.tsx`

**Step 1: Verify component integration**

Check that `src/routes/index.tsx` still renders:

```typescript
<PerspectiveGrid />  // Should now show animated mural
```

Expected: Component renders without errors

**Step 2: Test text readability**

Visual check:
- Headline readable on animated background
- Subheading readable
- Buttons readable
- Navbar visible

If text is hard to read, adjust in Task 4.

**Step 3: Commit**

```bash
git add src/routes/index.tsx
git commit -m "refactor: integrate animated mural into landing page"
```

---

## Task 4: Fine-Tune Readability & Performance

**Files:**
- Modify: `src/routes/index.tsx`
- Modify: `src/components/landing-navbar.tsx`

**Step 1: Adjust text backdrop if needed**

If text is hard to read, add semi-transparent backdrop:

```typescript
// In landing-navbar.tsx
<nav className="bg-white/50 backdrop-blur-md ...">
```

Or in index.tsx hero section:

```typescript
<div className="bg-black/20 backdrop-blur-sm p-8 rounded-lg">
  {/* content */}
</div>
```

**Step 2: Test on mobile**

```bash
# Open dev tools, test on iPhone SE / Android sizes
# Verify animation is smooth (60 FPS)
# Check no jank on low-end devices
```

**Step 3: Adjust animation timing if needed**

If animation is too fast/slow:
- Increase/decrease `60s` in `mural-morph` keyframe
- Increase/decrease `90s` in `spectrum-shift` keyframe

**Step 4: Commit**

```bash
git add src/routes/index.tsx src/components/landing-navbar.tsx
git commit -m "refactor: fine-tune text readability on animated mural"
```

---

## Task 5: Size Verification & Optimization

**Files:**
- Measure: `src/index.css`
- Measure: `src/components/perspective-grid.tsx`

**Step 1: Check total CSS + JS size**

```bash
# Build the CSS
bun run build

# Check dist output size
du -h dist/client/assets/*.css

# Count total bytes (CSS + perspect-grid.tsx gzipped)
# Target: <1KB gzipped
```

**Step 2: If over 1KB, optimize**

Options (in order of priority):
1. Remove unused CSS animations
2. Reduce image base64 by further compression
3. Remove SVG filter if not visible
4. Shorten animation keyframe names

**Step 3: Verify gzipped size**

```bash
# Check gzipped size of generated files
gzip -9 dist/client/assets/index-*.css -c | wc -c
# Should be <500 bytes

# Plus base64 image ~2-3KB gzipped
# Total budget: <1KB (if image counted separately as asset)
# Or <1KB total if bundled together
```

**Step 4: Commit**

```bash
git add src/index.css src/components/perspective-grid.tsx
git commit -m "perf: optimize animated mural to <1KB gzipped"
```

---

## Task 6: Final Testing & Visual Verification

**Files:**
- Test: Visual inspection in browser

**Step 1: Full smoke test**

```bash
# Clear browser cache
# Visit http://localhost:3000
# Verify:
# ✓ Background animates smoothly
# ✓ Colors shift through spectrum
# ✓ Text remains readable
# ✓ Navbar floats cleanly
# ✓ No console errors
# ✓ 60 FPS animation (dev tools > Performance)
```

**Step 2: Mobile test**

```bash
# Test on mobile device or emulator
# Verify:
# ✓ Animation smooth on mobile
# ✓ No battery drain
# ✓ Touches still work (buttons responsive)
```

**Step 3: Cross-browser test**

Test on:
- Chrome/Edge (Chromium)
- Firefox
- Safari

Expected: Smooth animation on all browsers

**Step 4: Commit**

```bash
git add src/
git commit -m "test: verify animated mural visual quality and performance"
```

---

## Task 7: Documentation & Cleanup

**Files:**
- Create: `docs/background-animation.md` (optional)
- Clean: Remove any temporary files

**Step 1: Document the approach**

Optional doc in `docs/background-animation.md`:

```markdown
# Animated Mural Background

## Architecture
CSS-only animated background using:
- Base64-embedded image
- SVG displacement filter for turbulence effect
- CSS keyframe animations for position morphing
- Hue rotation for spectrum shift

## Performance
- <1KB gzipped
- 60 FPS on all devices
- No JavaScript overhead
- Hardware-accelerated (GPU)

## Animation Details
- Mural morph: 60s cycle (subtle position shift + blur)
- Spectrum shift: 90s cycle (hue rotation through color space)
- SVG filter: Fractal turbulence at 0.02 frequency

## Future Improvements
- Add particle effect on hover
- Allow dynamic color palette
- Add user controls for animation speed
```

**Step 2: Clean up any temp files**

```bash
rm -f any-temp-files
```

**Step 3: Final commit**

```bash
git add docs/background-animation.md
git commit -m "docs: add animated mural background documentation"
```

---

## Success Criteria

- ✅ Animated background renders without errors
- ✅ Animation smooth at 60 FPS on desktop and mobile
- ✅ Text readable on all content layers
- ✅ Total size <1KB gzipped (CSS + SVG + base64)
- ✅ Colors shift subtly through spectrum
- ✅ Mural appears to morph/shift like sand
- ✅ No console errors or warnings
- ✅ Works on Chrome, Firefox, Safari

---

## Notes

- If base64 image is too large, consider splitting into separate asset file (won't count toward CSS gzip budget)
- SVG filter can be removed if it doesn't contribute visually
- Animation timing can be tuned post-implementation based on visual feedback
- For production, consider caching the image separately for better browser caching
