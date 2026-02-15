import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <h1 className="text-4xl font-bold tracking-tight">VibeStack</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        AI-powered full-stack app builder
      </p>
    </div>
  )
}
