# Security Audit Report — VibeStack Platform

**Date:** 2026-02-13
**Auditor:** Security Auditor Agent
**Scope:** Full codebase security assessment (`/Users/ammishra/VibeStack/platform`)
**Framework:** OWASP Top 10, CWE, NIST

---

## Executive Summary

The VibeStack platform has **3 Critical**, **5 High**, **6 Medium**, and **5 Low** severity findings. The most urgent issue is **live API keys and an RSA private key stored in `.env.local`** — while gitignored, these are plaintext secrets on disk and appear to be real production/staging credentials. The platform also lacks rate limiting on all API routes, has SQL injection vectors in the Supabase management module, and has an auth bypass mechanism that could be exploited if the `MOCK_MODE` environment variable is manipulated.

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High     | 5 |
| Medium   | 6 |
| Low      | 5 |
| Info     | 4 |

---

## Critical Findings

### C1. Real API Keys, Secrets, and RSA Private Key in `.env.local`

**Severity:** Critical
**Location:** `.env.local`
**CWE:** CWE-798 (Use of Hard-Coded Credentials), CWE-312 (Cleartext Storage of Sensitive Information)

The `.env.local` file contains **real, live credentials** including:
- Anthropic API key
- OpenAI API key
- Supabase access token
- Stripe secret key
- Daytona API key
- Vercel token
- **Full RSA Private Key** for the GitHub App

While `.env*` is in `.gitignore` and the file was never committed, this represents a significant risk:
- Any process or agent with filesystem access can read these credentials
- Developer machines are a common exfiltration target
- If the `.gitignore` rule is accidentally modified, all keys would be committed

**Remediation:**
1. **Immediately rotate ALL exposed keys** — Anthropic, OpenAI, Supabase, Stripe, Daytona, Vercel, and the GitHub App private key
2. Use a secrets manager (e.g., Vercel environment variables, AWS Secrets Manager, 1Password CLI)
3. Add a pre-commit hook that blocks any file containing key patterns (`sk-ant-`, `sk-proj-`, `sk_test_`, etc.)
4. Consider using `.env.local.example` (already exists) as the only checked-in reference

---

### C2. Authentication Bypass via `MOCK_MODE` Environment Variable

**Severity:** Critical
**Location:** `middleware.ts:11`, `app/api/chat/route.ts:21`, `app/api/chat/messages/route.ts:12`, `app/api/projects/generate/route.ts:41`, `lib/supabase-server.ts:27`
**CWE:** CWE-287 (Improper Authentication)

When `NEXT_PUBLIC_MOCK_MODE=true`, **all authentication is bypassed** across the entire application:
- Middleware returns `NextResponse.next()` without any auth check
- API routes skip `getUser()` and return mock data
- `getUser()` returns a hardcoded `MOCK_USER` with a zeroed UUID

The variable is `NEXT_PUBLIC_*` prefixed, meaning it's exposed to the browser client. If this variable is accidentally set in a production deployment, the entire application becomes unauthenticated.

**Remediation:**
1. Remove `NEXT_PUBLIC_` prefix — mock mode should never be client-visible
2. Add a build-time check that prevents `MOCK_MODE=true` in production builds
3. Gate mock mode behind `NODE_ENV !== 'production'` as an additional safeguard
4. Consider removing mock mode from middleware entirely and only applying it to individual test routes

---

### C3. SQL Injection in Supabase Management Module

**Severity:** Critical
**Location:** `lib/supabase-mgmt.ts:314-367`
**CWE:** CWE-89 (SQL Injection)

The `setupSchema()` function for the `DatabaseSchema` path constructs SQL via string interpolation **without input validation**:

```typescript
// Line 324 — table.name and column definitions are interpolated directly
const createTableSql = `CREATE TABLE IF NOT EXISTS ${table.name} (${columns});`;

// Line 330 — table.name in ALTER TABLE
const rlsSql = `ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`;

// Line 337 — policy.definition is raw SQL executed directly
const policyResult = await runMigration(projectId, policy.definition);

// Line 347 — func.sql is raw SQL executed directly
const result = await runMigration(projectId, func.sql);

// Line 359 — table.name in ALTER PUBLICATION
// ALTER PUBLICATION supabase_realtime ADD TABLE ${table.name};
```

While the `SupabaseSchema` path has validation for table/bucket names (line 284), the `DatabaseSchema` path has **zero validation** for `table.name`, `col.name`, `col.type`, `col.default`, `policy.definition`, `func.sql`, or `schema.seed`.

If an LLM generates a malicious plan (via prompt injection in user input), it could produce table/column names containing SQL injection payloads that execute arbitrary SQL against the user's Supabase project.

**Remediation:**
1. Validate all identifiers against `/^[a-z][a-z0-9_]*$/` before interpolation
2. Use parameterized queries where possible
3. Sanitize or reject `policy.definition` and `func.sql` — these accept raw SQL by design but should be sandboxed
4. Consider using Supabase's migration API rather than raw SQL execution

---

## High Findings

### H1. No Rate Limiting on Any API Route

**Severity:** High
**Location:** All `app/api/**` routes
**CWE:** CWE-770 (Allocation of Resources Without Limits)

None of the API routes implement rate limiting:
- `/api/chat` — streams LLM responses (expensive: $0.01-0.10 per request)
- `/api/projects/generate` — creates sandboxes and Supabase projects (expensive: real infrastructure)
- `/api/projects/deploy` — triggers Vercel deployments
- `/api/projects/edit` — calls Anthropic API
- `/api/stripe/checkout` — creates Stripe sessions

An authenticated attacker could:
- Drain LLM API budgets by spamming `/api/chat`
- Create hundreds of sandboxes via `/api/projects/generate`
- Trigger mass Vercel deployments via `/api/projects/deploy`

**Remediation:**
1. Implement rate limiting middleware (e.g., `@upstash/ratelimit` with Redis, or Vercel's built-in rate limiting)
2. Apply per-user limits: e.g., 10 generations/hour, 50 chat messages/minute
3. Add cost-based quotas tied to the user's plan (free vs. pro)

---

### H2. No CORS Configuration

**Severity:** High
**Location:** `next.config.ts`, all API routes
**CWE:** CWE-942 (Permissive Cross-domain Policy)

The Next.js config is empty — no CORS headers are configured. Next.js API routes default to allowing requests from any origin. This means:
- Any website can make authenticated requests to the API if the user has a session cookie
- CSRF attacks are possible against state-changing endpoints

**Remediation:**
1. Configure CORS in `next.config.ts` or middleware to allow only the production domain
2. Add CSRF protection tokens for state-changing API routes
3. Set `SameSite=Strict` or `SameSite=Lax` on session cookies

---

### H3. Stripe Webhook Secret Not Set (Empty in `.env.local`)

**Severity:** High
**Location:** `app/api/stripe/webhook/route.ts:15`, `.env.local:24`
**CWE:** CWE-345 (Insufficient Verification of Data Authenticity)

`STRIPE_WEBHOOK_SECRET` is empty in `.env.local`. The webhook handler uses `stripe.webhooks.constructEvent(body, signature, webhookSecret)` with this empty value. Stripe's SDK behavior with an empty/undefined secret may allow **forged webhook events** to bypass signature verification, enabling:
- Unauthorized plan upgrades (`checkout.session.completed`)
- Fake subscription cancellations

**Remediation:**
1. Set the webhook secret immediately from the Stripe dashboard
2. Add a startup check that fails if `STRIPE_WEBHOOK_SECRET` is empty in production
3. Use the non-null assertion `!` only after runtime validation

---

### H4. Unsafe use of `dangerouslySetInnerHTML` with Partially Controlled Input

**Severity:** High
**Location:** `components/ai-elements/schema-display.tsx:180`
**CWE:** CWE-79 (Cross-site Scripting)

The component renders raw HTML via `dangerouslySetInnerHTML` where the `children` prop can be passed by parent components. While `highlightedPath` applies a regex to wrap `{...}` in span tags, if `path` contains user-controlled content (e.g., from API schema data), it could inject arbitrary HTML/JavaScript.

**Remediation:**
1. Use DOMPurify to sanitize HTML before rendering
2. Or render the highlighting using React elements instead of raw HTML string interpolation

---

### H5. Open Redirect in Auth Callback

**Severity:** High
**Location:** `app/auth/callback/route.ts:22`
**CWE:** CWE-601 (URL Redirection to Untrusted Site)

```typescript
return NextResponse.redirect(`${origin}/?error=${error.message}`);
```

The `error.message` from Supabase is interpolated directly into the redirect URL without encoding. This could be exploited for reflected XSS via crafted error messages or URL parameter injection.

**Remediation:**
1. URL-encode the error message: `encodeURIComponent(error.message)`
2. Use a generic error code instead of forwarding raw error messages
3. Validate redirect URLs against an allowlist

---

## Medium Findings

### M1. `SUPABASE_SERVICE_ROLE_KEY` Used with Cookie-Based Client

**Severity:** Medium
**Location:** `lib/supabase-server.ts:66-89`
**CWE:** CWE-269 (Improper Privilege Management)

`createServiceClient()` creates a Supabase client with the service role key (bypasses RLS) but still uses cookie-based auth. This is unusual — service role clients typically don't need cookies. If a cookie is malformed or manipulated, behavior could be unpredictable. Currently only used by the Stripe webhook handler.

**Remediation:**
1. Create a separate service client that doesn't use cookies (use `createClient()` from `@supabase/supabase-js` directly)
2. Audit all usages to ensure service role is only used for server-to-server operations

---

### M2. Insecure Random for Database Password Generation

**Severity:** Medium
**Location:** `lib/supabase-mgmt.ts:122-128`
**CWE:** CWE-338 (Use of Cryptographically Weak PRNG)

```typescript
Math.floor(Math.random() * 68)
```

`Math.random()` is not cryptographically secure. Database passwords should use `crypto.getRandomValues()` or `crypto.randomBytes()`.

**Remediation:**
```typescript
import { randomBytes } from 'crypto';
const password = randomBytes(24).toString('base64url');
```

---

### M3. Error Messages Leak Internal Details

**Severity:** Medium
**Location:** `app/api/projects/deploy/route.ts:135`, `app/api/projects/edit/route.ts:215`
**CWE:** CWE-209 (Information Exposure Through an Error Message)

API error responses include raw `error.message` strings which can leak internal stack traces, file paths, API error details, and third-party service information to clients.

**Remediation:**
1. Log detailed errors server-side
2. Return generic error messages to clients
3. Use error codes for client-side handling

---

### M4. Unvalidated `model` Parameter in API Routes

**Severity:** Medium
**Location:** `app/api/chat/route.ts:35`, `app/api/projects/generate/route.ts:31`, `app/api/projects/edit/route.ts:25`
**CWE:** CWE-20 (Improper Input Validation)

The `model` parameter from request bodies is passed directly to `resolveModel()` without validation. The fallback passes unknown strings directly to `anthropic(modelId)`. An attacker could pass arbitrary model IDs, potentially causing unexpected API calls or triggering errors that leak information.

**Remediation:**
1. Validate `model` against `AVAILABLE_MODELS` list
2. Return 400 for unknown model IDs

---

### M5. iframe Sandbox Allows `allow-same-origin`

**Severity:** Medium
**Location:** `components/ai-elements/web-preview.tsx:203`
**CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers)

```typescript
sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
```

The combination of `allow-scripts` and `allow-same-origin` effectively negates the iframe sandbox — the embedded content can access the parent page's cookies and storage, and escape the sandbox entirely.

**Remediation:**
1. Remove `allow-same-origin` — the preview content should be isolated
2. Serve preview content from a different domain/subdomain to enforce origin isolation

---

### M6. `/api/projects/generate` Missing Auth Check Before Body Parsing

**Severity:** Medium
**Location:** `app/api/projects/generate/route.ts:30-55`
**CWE:** CWE-862 (Missing Authorization)

The route parses the request body and checks for `chatPlan` **before** checking authentication. Unauthenticated users can send large payloads that get parsed before rejection, enabling resource exhaustion.

**Remediation:**
1. Move authentication check before body parsing
2. Add request body size limits

---

## Low Findings

### L1. Verbose Console Logging in Production

**Severity:** Low
**Location:** Multiple files (`lib/sandbox.ts`, `lib/supabase-mgmt.ts`, `app/api/projects/deploy/route.ts`, etc.)
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)

Extensive `console.log` statements output sandbox IDs, deployment URLs, project IDs, and operation details. In production, these logs could be harvested from observability tools.

**Remediation:** Use a structured logger with log levels; disable debug logging in production.

---

### L2. No Content Security Policy (CSP) Headers

**Severity:** Low
**Location:** `next.config.ts`
**CWE:** CWE-1021

No CSP headers are configured, allowing inline scripts, external resources, and other potentially dangerous content.

**Remediation:** Add CSP headers in `next.config.ts` or middleware.

---

### L3. Cookie Security Settings Not Explicitly Set

**Severity:** Low
**Location:** `middleware.ts`, `lib/supabase-server.ts`
**CWE:** CWE-614 (Sensitive Cookie in HTTPS Session Without 'Secure' Attribute)

Cookie options are delegated to Supabase SSR defaults. There's no explicit enforcement of `Secure`, `HttpOnly`, or `SameSite` attributes.

**Remediation:** Explicitly set cookie security attributes in the Supabase client configuration.

---

### L4. `NEXT_PUBLIC_SUPABASE_ANON_KEY` Uses Non-Standard Prefix

**Severity:** Low
**Location:** `.env.local:6`

The anon key value uses a non-standard prefix (`sb_publishable_` instead of the standard `eyJ...` JWT format). This may indicate a misconfiguration. If RLS policies are not properly configured, this could grant broader access than intended.

**Remediation:** Verify this is a valid Supabase anon key and that RLS policies are properly enforced.

---

### L5. GitHub Repos Created as Public by Default

**Severity:** Low
**Location:** `lib/github.ts:54`
**CWE:** CWE-732 (Incorrect Permission Assignment)

```typescript
private: false,  // Repos are public
```

All generated user app repos are created as **public**. Users may not expect their generated code (which could contain business logic) to be publicly visible.

**Remediation:**
1. Default to private repos
2. Let users choose visibility
3. At minimum, clearly inform users that repos will be public

---

## Informational Findings

### I1. No Request Body Size Limits

All API routes accept unlimited request body sizes. Consider adding body size limits via middleware.

### I2. No Audit Logging

There is no audit trail for security-relevant events (logins, project creation, deployments, plan changes). Consider implementing structured audit logging.

### I3. No Input Sanitization on `chatPlan.appName`

The `appName` flows into slug generation, repo names, and domain names. While `buildAppSlug()` sanitizes via regex, the raw value is stored in the database and used in logs without sanitization.

### I4. Dependency Versions Not Pinned

`package.json` uses caret (`^`) version ranges for all dependencies. For security-critical applications, consider using exact versions and a lockfile review process.

---

## Dependency Security Summary

Key dependencies and their security posture:
- `next@16.1.6` — Recent version, check for latest CVEs
- `@supabase/ssr@^0.8.0` — Ensure latest patches
- `stripe@^20.3.1` — Actively maintained
- `handlebars@^4.7.8` — Historical prototype pollution CVEs; verify version
- `react-jsx-parser@^2.4.1` — Parses JSX strings; potential XSS if used with user input

**Recommendation:** Run `pnpm audit` regularly and integrate into CI/CD.

---

## Remediation Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | C1: Rotate all exposed secrets | Immediate |
| 2 | C2: Fix mock mode auth bypass | 1 hour |
| 3 | C3: Fix SQL injection in supabase-mgmt | 2-4 hours |
| 4 | H3: Set Stripe webhook secret | 10 minutes |
| 5 | H1: Add rate limiting | 4-8 hours |
| 6 | H2: Configure CORS | 1-2 hours |
| 7 | H4: Sanitize innerHTML usage | 1 hour |
| 8 | H5: Fix open redirect | 30 minutes |
| 9 | M2: Use crypto-secure random | 15 minutes |
| 10 | M4: Validate model parameter | 30 minutes |
| 11 | M5: Fix iframe sandbox | 30 minutes |
| 12 | M6: Reorder auth check | 15 minutes |
| 13 | M1/M3: Service client and error messages | 1-2 hours |
| 14 | Low/Info findings | 4-8 hours |
