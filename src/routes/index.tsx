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
    <div className="relative min-h-screen overflow-hidden bg-[#1a0a2e]">
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
