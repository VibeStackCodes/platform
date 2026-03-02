// Vercel serverless function entry point
// Re-exports the Hono app for Vercel's Node.js runtime.
// Vercel's nft traces this import to bundle server/ and its dependencies.
export { default } from '../server/index'
