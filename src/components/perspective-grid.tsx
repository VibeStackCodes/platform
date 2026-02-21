// Sand grain: a tiling noise texture that slowly translates — creates
// the illusion of millions of tiny specks shifting across the mural.
const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='1' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

export function PerspectiveGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Base image — slow drift gives depth */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'url(/mural-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          animation: 'mural-drift 40s ease-in-out infinite',
          willChange: 'transform',
        }}
      />

      {/* Sand grain layer — tiling noise texture that slides slowly.
          High baseFrequency (0.82) = fine specks you can actually see.
          screen blend = grain picks up the image colors underneath. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: GRAIN_SVG,
          backgroundSize: '180px 180px',
          backgroundRepeat: 'repeat',
          mixBlendMode: 'screen',
          opacity: 0.35,
          animation: 'sand-drift 22s linear infinite',
          willChange: 'background-position',
        }}
      />

    </div>
  )
}
