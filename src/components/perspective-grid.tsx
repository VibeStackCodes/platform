export function PerspectiveGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block"
      style={{
        background: [
          // Sky blue radial gradient at top center
          'radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.82 0.08 220 / 60%) 0%, transparent 70%)',
          // Peach/warm radial gradient at bottom-left
          'radial-gradient(ellipse 60% 50% at -10% 110%, oklch(0.88 0.09 55 / 50%) 0%, transparent 70%)',
          // Lavender/pink radial gradient at bottom-right
          'radial-gradient(ellipse 60% 50% at 110% 110%, oklch(0.82 0.1 310 / 45%) 0%, transparent 70%)',
          // Base linear gradient from light blue-white to warm cream
          'linear-gradient(160deg, oklch(0.97 0.02 220) 0%, oklch(0.99 0.005 80) 100%)',
        ].join(', '),
      }}
    >
      <div className="perspective-grid" />
    </div>
  )
}
