/**
 * Vercel serverless entry point.
 *
 * Re-exports the Hono handle() adapter from the server module.
 * Vercel's `functions` config requires files inside the `api/` directory.
 */
export { default } from '../server/index'
