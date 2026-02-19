import { chromium } from 'playwright'

const PROMPT = 'Build me a simple task tracker'

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // Log network requests to /api/ and /auth/
  page.on('request', (req) => {
    if (req.url().includes('/api/') || req.url().includes('supabase')) {
      console.log(`>> ${req.method()} ${req.url().slice(0, 120)}`)
    }
  })
  page.on('response', (res) => {
    if (res.url().includes('/api/') || res.url().includes('supabase')) {
      console.log(`<< ${res.status()} ${res.url().slice(0, 120)}`)
    }
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warn') {
      console.log(`[${msg.type().toUpperCase()}] ${msg.text().slice(0, 200)}`)
    }
  })

  // Step 1: Landing page
  console.log('\n=== Step 1: Landing page ===')
  await page.goto('http://localhost:3000/')
  await page.waitForTimeout(2000)
  console.log(`URL: ${page.url()}`)

  const textarea = page.locator('textarea[name="message"]')
  if (await textarea.isVisible({ timeout: 5000 }).catch(() => false)) {
    await textarea.fill(PROMPT)
    await textarea.press('Enter')
    await page.waitForTimeout(3000)
    console.log(`URL after prompt: ${page.url()}`)
  } else {
    console.log('No textarea found, checking for redirect...')
    console.log(`URL: ${page.url()}`)
  }

  // Step 2: Sign up
  console.log('\n=== Step 2: Sign up ===')
  const signUpToggle = page.locator('button', { hasText: /^Sign Up$/ })
  if (await signUpToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signUpToggle.click()
    await page.waitForTimeout(500)
  }

  const ts = Date.now()
  const email = `e2e-debug-${ts}@test.vibestack.dev`
  console.log(`Signing up with: ${email}`)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill('TestPass123x')
  await page.locator('button[type="submit"]').click()

  console.log('Form submitted, waiting 15s for redirect...')
  // Wait and log network traffic
  await page.waitForTimeout(15000)

  console.log(`\n=== Final state ===`)
  console.log(`URL: ${page.url()}`)

  const buttonText = await page.locator('button[type="submit"]').textContent().catch(() => 'N/A')
  console.log(`Submit button text: ${buttonText}`)

  const errorEl = page.locator('.text-red-400')
  if (await errorEl.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log(`Error shown: ${await errorEl.textContent()}`)
  }

  const messageEl = page.locator('.text-green-400')
  if (await messageEl.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log(`Message shown: ${await messageEl.textContent()}`)
  }

  await page.screenshot({ path: '/tmp/debug-signup.png' })
  console.log('Screenshot: /tmp/debug-signup.png')

  await browser.close()
})()
