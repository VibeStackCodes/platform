export const typescriptSample = `import { useState, useEffect } from 'react'

interface User {
  id: string
  name: string
  email: string
  createdAt: Date
}

function useUser(userId: string): { user: User | null; loading: boolean; error: Error | null } {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchUser() {
      try {
        const response = await fetch(\`/api/users/\${userId}\`)
        if (!response.ok) throw new Error(\`HTTP \${response.status}\`)
        const data = await response.json()
        if (!cancelled) {
          setUser(data)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error)
          setLoading(false)
        }
      }
    }

    fetchUser()
    return () => { cancelled = true }
  }, [userId])

  return { user, loading, error }
}`

export const pythonSample = `from dataclasses import dataclass
from typing import Optional
import asyncio
import aiohttp


@dataclass
class APIResponse:
    status: int
    data: dict
    error: Optional[str] = None


async def fetch_data(url: str, timeout: int = 30) -> APIResponse:
    """Fetch data from a remote API endpoint asynchronously."""
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return APIResponse(status=resp.status, data=data)
                return APIResponse(
                    status=resp.status,
                    data={},
                    error=f"HTTP error {resp.status}"
                )
        except asyncio.TimeoutError:
            return APIResponse(status=0, data={}, error="Request timed out")
        except Exception as e:
            return APIResponse(status=0, data={}, error=str(e))`

export const jsonSample = `{
  "name": "vibestack-platform",
  "version": "1.0.0",
  "description": "AI-powered app builder platform",
  "scripts": {
    "dev": "concurrently \\"vite\\" \\"bun run server\\"",
    "build": "vite build && tsc --noEmit",
    "test": "vitest",
    "lint": "oxlint src"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-router": "^1.0.0",
    "tailwindcss": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^7.0.0",
    "vitest": "^2.0.0"
  }
}`
