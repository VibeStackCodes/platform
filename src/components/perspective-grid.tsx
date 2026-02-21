export function PerspectiveGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Base image layer */}
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
      {/* Color spectrum shift overlay */}
      <div
        className="absolute inset-0"
        style={{
          animation: 'spectrum-wave 70s linear infinite',
          mixBlendMode: 'color',
          opacity: 0.25,
        }}
      />
      {/* SVG turbulence displacement for sand/particle effect */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ mixBlendMode: 'overlay', opacity: 0.08 }}
      >
        <defs>
          <filter id="sand">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="3"
              seed="15"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="8"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="rgba(180,60,180,0.4)" filter="url(#sand)" />
      </svg>
    </div>
  )
}
