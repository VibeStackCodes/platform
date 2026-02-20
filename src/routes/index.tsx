import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { Sparkles } from 'lucide-react'
import { HeroPrompt } from '@/components/hero-prompt'
import { LandingNavbar } from '@/components/landing-navbar'
import { PerspectiveGrid } from '@/components/perspective-grid'
import { Badge } from '@/components/ui/badge'

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
            {/* Badge pill */}
            <motion.div
              {...fadeUp}
              transition={{ duration: 0.35, delay: 0.1 }}
            >
              <Badge
                variant="secondary"
                className="gap-1.5 border border-border/60 bg-background/80 px-3 py-1 text-sm font-medium backdrop-blur"
              >
                <Sparkles className="size-3.5 text-primary" />
                AI-powered app builder
              </Badge>
            </motion.div>

            {/* Headline */}
            <motion.h1
              {...fadeUp}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mt-8 max-w-4xl font-display text-5xl tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-8xl"
            >
              Build Smart.
              <br />
              Design Fast.
              <br />
              Launch Beautifully.
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              {...fadeUp}
              transition={{ duration: 0.35, delay: 0.35 }}
              className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl"
            >
              Describe your app in plain English. Watch AI build, preview, and deploy it — all in
              one place.
            </motion.p>

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
