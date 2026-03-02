// Minimal test — if this works, the issue is in server/ code initialization
export default function handler() {
  return new Response(JSON.stringify({ ok: true, time: Date.now() }), {
    headers: { 'content-type': 'application/json' },
  })
}
