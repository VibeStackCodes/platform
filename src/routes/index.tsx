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
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Gradient mesh + perspective grid */}
      <PerspectiveGrid />

      {/* Content layer */}
      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <LandingNavbar />
        </motion.div>

        <main className="container mx-auto px-4 pt-24 sm:px-6 sm:pt-32 lg:px-8">
          <div className="flex flex-col items-center text-center">
            {/* Headline */}
            <motion.h1
              {...fadeUp}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mt-8 max-w-4xl font-display text-5xl tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-8xl"
            >
              Unleash the agents.
            </motion.h1>

            {/* Prompt bar */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.5 }}
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
