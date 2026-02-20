import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { HeroPrompt } from '@/components/hero-prompt'
import { LandingNavbar } from '@/components/landing-navbar'
import { PerspectiveGrid } from '@/components/perspective-grid'

export const Route = createFileRoute('/')(  {
  component: LandingPage,
})

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
}

function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      {/* Gradient background */}
      <PerspectiveGrid />

      {/* Radial overlay for depth and readability */}
      <div className="pointer-events-none absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/20" />

      {/* Content layer */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <LandingNavbar />
        </motion.div>

        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto py-12">
            {/* Preheading - bright accent */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mb-6"
            >
              <span className="inline-block text-xs sm:text-sm font-medium tracking-widest uppercase text-white/70 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/20">
                AI Agent Platform
              </span>
            </motion.div>

            {/* Headline - bold white */}
            <motion.h1
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-4 max-w-5xl font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-tight text-white drop-shadow-lg"
            >
              Unleash the agents.
            </motion.h1>

            {/* Subheading */}
            <motion.p
              {...fadeUp}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="mt-6 max-w-2xl text-lg sm:text-xl text-white/80 leading-relaxed"
            >
              Build AI-powered apps by describing what you want. Watch agents handle the design, development, and deployment — all in real time.
            </motion.p>

            {/* Prompt bar */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mt-10 w-full max-w-2xl"
            >
              <HeroPrompt />
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  )
}
