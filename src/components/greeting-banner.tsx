import { useState } from 'react'
import { useAuth } from '@/lib/auth'

type TimeBucket = 'morning' | 'afternoon' | 'evening' | 'night'

const GREETINGS: Record<TimeBucket, string[]> = {
  morning: [
    'Rise and build, {name}',
    'Fresh morning, fresh code',
    'Morning — what are we making?',
    'Good morning, {name}',
    'New day, new feature',
  ],
  afternoon: [
    'Afternoon, {name} — let\u2019s ship something',
    'The afternoon build window is open',
    'Good afternoon, {name}',
    'Afternoon — ready when you are',
    'Let\u2019s build something, {name}',
  ],
  evening: [
    'Evening mode: activated',
    'Good evening, {name}',
    'Evening — time to create',
    'The evening session begins',
    'Good evening — what\u2019s the plan?',
  ],
  night: [
    'Late builds hit different',
    'Night owl mode',
    'The best code is written at night',
    'Midnight, {name} — let\u2019s go',
    'Late night, {name}',
  ],
}

function getTimeBucket(hour: number): TimeBucket {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

function pickGreeting(name: string): string {
  const bucket = getTimeBucket(new Date().getHours())
  const pool = GREETINGS[bucket]
  const message = pool[Math.floor(Math.random() * pool.length)]
  return message.replace('{name}', name)
}

export function GreetingBanner({ className }: { className?: string }) {
  const { user } = useAuth()
  const name = user?.user_metadata?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? ''

  // Pick once on mount — stable across re-renders
  const [greeting] = useState(() => pickGreeting(name))

  return (
    <h1
      className={className ?? 'text-center text-3xl font-medium text-muted-foreground md:text-4xl'}
    >
      {greeting}
    </h1>
  )
}
