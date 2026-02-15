import type { Config } from 'drizzle-kit'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

export default {
  schema: './server/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: DATABASE_URL },
} satisfies Config
