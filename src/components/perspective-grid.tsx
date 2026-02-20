export function PerspectiveGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        background: [
          // Radial gradient: dark navy/charcoal at top-left corner (the "sun" position)
          'radial-gradient(ellipse 100% 100% at 20% 10%, rgb(15, 23, 42) 0%, transparent 50%)',
          // Deep blue core in upper left quadrant
          'radial-gradient(ellipse 120% 100% at 0% 0%, rgb(30, 58, 138) 0%, transparent 45%)',
          // Electric blue accent in upper center - bright and saturated
          'radial-gradient(ellipse 90% 80% at 35% -5%, rgb(59, 130, 246) 0%, transparent 55%)',
          // Vibrant purple transition - bridges blue to magenta
          'radial-gradient(ellipse 110% 90% at 50% 15%, rgb(147, 51, 234) 0%, transparent 50%)',
          // Hot magenta/pink - the heart of the gradient (saturated and punchy)
          'radial-gradient(ellipse 130% 120% at 55% 40%, rgb(236, 72, 153) 0%, rgb(244, 63, 94) 25%, transparent 65%)',
          // Deep red accent bleeding toward bottom-right
          'radial-gradient(ellipse 100% 110% at 75% 55%, rgb(239, 68, 68) 0%, transparent 50%)',
          // Orange/amber glow in bottom-right corner
          'radial-gradient(ellipse 80% 90% at 100% 85%, rgb(251, 146, 60) 0%, rgb(249, 115, 22) 20%, transparent 60%)',
          // Deep red/maroon base at bottom for richness
          'radial-gradient(ellipse 120% 100% at 80% 100%, rgb(127, 29, 29) 0%, transparent 50%)',
          // Dark navy sweep across bottom
          'linear-gradient(180deg, transparent 60%, rgba(15, 23, 42, 0.4) 100%)',
          // Diagonal overlay for directional flow (top-left to bottom-right)
          'linear-gradient(135deg, rgba(0, 0, 0, 0.1) 0%, transparent 50%, rgba(0, 0, 0, 0.05) 100%)',
        ].join(', '),
      }}
    >
      {/* Subtle grain texture for refinement */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' seed='42' /%3E%3C/filter%3E%3Crect width='400' height='400' fill='%23fff' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: '400px 400px',
        }}
      />
    </div>
  )
}
