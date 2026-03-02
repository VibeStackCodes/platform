import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { app } from './server/index'

export type { AppType } from './server/index'
export default handle(app)
