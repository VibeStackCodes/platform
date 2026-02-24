import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { AppSidebar } from '@/components/app-sidebar'
import { HeroPrompt } from '@/components/hero-prompt'
import { LandingNavbar } from '@/components/landing-navbar'
import { PerspectiveGrid } from '@/components/perspective-grid'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return <AuthenticatedHome />
  }

  return <PublicLanding />
}

function AuthenticatedHome() {
  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <SidebarInset>
        <div className="relative flex flex-1 flex-col overflow-hidden bg-[#1a0a2e]">
          <PerspectiveGrid />
          <div className="pointer-events-none absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/20" />
          <main className="relative z-10 flex flex-1 items-center justify-center px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-3xl"
            >
              <HeroPrompt />
            </motion.div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function PublicLanding() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#1a0a2e]">
      <PerspectiveGrid />
      <div className="pointer-events-none absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/20" />
      <div className="relative z-10 flex flex-col min-h-screen">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <LandingNavbar />
        </motion.div>
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="w-full max-w-3xl"
          >
            <HeroPrompt />
          </motion.div>
        </main>
      </div>
    </div>
  )
}
