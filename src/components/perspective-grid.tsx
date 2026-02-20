export function PerspectiveGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        background: [
          // Far sky - soft peachy-blue at top
          'linear-gradient(180deg, oklch(0.95 0.04 40 / 80%) 0%, oklch(0.88 0.08 320 / 40%) 15%, transparent 35%)',
          // Mid-sky clouds - soft purple haze
          'radial-gradient(ellipse 120% 60% at 50% 5%, oklch(0.85 0.06 280 / 50%) 0%, transparent 50%)',
          // Left mountain pass - deep purple valley
          'radial-gradient(ellipse 80% 100% at -20% 60%, oklch(0.60 0.12 290 / 70%) 0%, oklch(0.55 0.14 310 / 50%) 30%, transparent 70%)',
          // Center valley - atmospheric perspective
          'radial-gradient(ellipse 100% 80% at 50% 70%, oklch(0.65 0.11 300 / 60%) 0%, oklch(0.58 0.13 320 / 40%) 40%, transparent 80%)',
          // Right landscape - lavender mountains
          'radial-gradient(ellipse 90% 110% at 110% 65%, oklch(0.62 0.10 310 / 65%) 0%, oklch(0.54 0.12 330 / 45%) 35%, transparent 75%)',
          // Foreground accent - warm lavender bloom
          'radial-gradient(ellipse 70% 120% at 20% 100%, oklch(0.68 0.08 310 / 40%) 0%, transparent 60%)',
          // Right foreground - soft green accent
          'radial-gradient(ellipse 60% 100% at 95% 105%, oklch(0.70 0.06 130 / 25%) 0%, transparent 55%)',
          // Soft light overlay - gradient from warm to cool
          'linear-gradient(135deg, oklch(0.96 0.01 50 / 40%) 0%, oklch(0.92 0.03 280 / 20%) 50%, oklch(0.88 0.04 310 / 30%) 100%)',
          // Base warm neutral
          'linear-gradient(to bottom, oklch(0.94 0.02 60) 0%, oklch(0.90 0.03 280) 100%)',
        ].join(', '),
      }}
    >
      {/* Subtle noise texture overlay for atmospheric depth */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' seed='2' /%3E%3C/filter%3E%3Crect width='200' height='200' fill='%23000' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
      />
    </div>
  )
}
