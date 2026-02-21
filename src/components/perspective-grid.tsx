import { useEffect, useRef } from 'react'

// Internal render resolution — upscaled by CSS to fill viewport.
// Low res = larger apparent particles (more "sand grain" visible), less CPU.
const W = 640, H = 360
// Particle grid: samples source image at this resolution
const COLS = 56, ROWS = 32
// Light lavender-white background — particles appear as bright colored specks
const BG = [248, 245, 255] as const

export function PerspectiveGrid() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    canvas.width = W
    canvas.height = H

    let raf = 0
    let t = 0

    // Particle: [baseX, baseY, r, g, b, phase]
    type Particle = [number, number, number, number, number, number]
    const particles: Particle[] = []

    // Reusable ImageData buffer — avoids allocation every frame
    const frame = ctx.createImageData(W, H)
    const buf = frame.data

    // Pre-fill with background color
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = BG[0]; buf[i + 1] = BG[1]; buf[i + 2] = BG[2]; buf[i + 3] = 255
    }

    // Write a 2×2 sand speck into the pixel buffer
    const putDot = (x: number, y: number, r: number, g: number, b: number) => {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((y + dy) * W + x + dx) * 4
          buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255
        }
      }
    }

    // Erase a 2×2 speck back to background
    const eraseDot = (x: number, y: number) =>
      putDot(x, y, BG[0], BG[1], BG[2])

    // Track previous particle screen positions for dirty-rect erase
    const prev: [number, number][] = []

    const img = new Image()
    img.src = '/mural-bg.jpg'
    img.onload = () => {
      // Sample image at low resolution to get particle colors
      const sample = Object.assign(document.createElement('canvas'), {
        width: COLS,
        height: ROWS,
      })
      sample.getContext('2d')!.drawImage(img, 0, 0, COLS, ROWS)
      const px = sample.getContext('2d')!.getImageData(0, 0, COLS, ROWS).data

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const n = (row * COLS + col) * 4
          const bx = col / COLS
          const by = row / ROWS
          particles.push([bx, by, px[n], px[n + 1], px[n + 2], Math.random() * Math.PI * 2])
          prev.push([Math.floor(bx * W), Math.floor(by * H)])
        }
      }

      const draw = () => {
        raf = requestAnimationFrame(draw)
        // Very slow drift — t increments ~0.0003 per frame at 60fps = full cycle ~35s
        t += 0.0003

        for (let k = 0; k < particles.length; k++) {
          const [bx, by, r, g, b, phase] = particles[k]

          // Erase previous position
          const [px2, py2] = prev[k]
          if (px2 >= 0 && px2 < W - 1 && py2 >= 0 && py2 < H - 1) {
            eraseDot(px2, py2)
          }

          // Compute new drifted position — each particle has unique phase
          // so they move independently (no uniform flow)
          const drift = 0.009
          const nx = bx + Math.sin(t + phase) * drift
          const ny = by + Math.cos(t * 0.8 + phase * 1.3) * drift
          const sx = Math.floor(nx * W)
          const sy = Math.floor(ny * H)

          prev[k][0] = sx
          prev[k][1] = sy

          if (sx >= 0 && sx < W - 1 && sy >= 0 && sy < H - 1) {
            putDot(sx, sy, r, g, b)
          }
        }

        ctx.putImageData(frame, 0, 0)
      }

      draw()
    }

    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 w-full h-full"
    />
  )
}
