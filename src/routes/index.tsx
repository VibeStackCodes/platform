import { createFileRoute } from '@tanstack/react-router'
import { Eye, Rocket, Sparkles } from 'lucide-react'
import { HeroPrompt } from '@/components/hero-prompt'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-zinc-900">
      <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            Build apps with AI
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-zinc-400 sm:text-xl">
            Transform your ideas into production-ready applications. Generate, preview, and
            deploy—all powered by artificial intelligence.
          </p>

          <HeroPrompt />
        </div>

        <div className="mt-24 grid gap-8 md:grid-cols-3">
          <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
            <CardHeader>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </div>
              <CardTitle className="text-white">AI Generation</CardTitle>
              <CardDescription className="text-zinc-400">
                Describe your app in plain English and watch AI build it for you. From concept to
                code in minutes.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
            <CardHeader>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-primary/10">
                <Eye className="size-6 text-primary" />
              </div>
              <CardTitle className="text-white">Live Preview</CardTitle>
              <CardDescription className="text-zinc-400">
                See your application come to life in real-time. Make changes and watch them update
                instantly.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
            <CardHeader>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-primary/10">
                <Rocket className="size-6 text-primary" />
              </div>
              <CardTitle className="text-white">One-Click Deploy</CardTitle>
              <CardDescription className="text-zinc-400">
                Go from idea to production in seconds. Deploy your app with a single click, no
                DevOps required.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  )
}
