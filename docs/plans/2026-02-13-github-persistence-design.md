# GitHub Persistence Design

## Context

Generated apps live only inside ephemeral Daytona sandboxes. When a sandbox is destroyed, the code and git history are lost. Users have no way to access their source code outside the sandbox's code-server. The Vercel deploy route uploads files as blobs — no git history, no CI/CD integration.

## Decisions

- **Trigger**: Auto-push to GitHub after generation + build verification completes
- **Auth**: VibeStack-owned GitHub App (repos under `VibeStackCodes-Generated` org)
- **Repo naming**: `vibestack-{app-name}-{short-id}` (e.g. `vibestack-hospital-dashboard-a1b2c3`)
- **Deploy**: Vercel deploys from GitHub repo (replaces file-upload approach)
- **SDK**: Octokit with `@octokit/auth-app` for GitHub App authentication
- **Git**: Daytona `sandbox.git.push()` with installation token for PAT auth

## Architecture

```
verifyAndFix() completes (build passes)
  |
  v
lib/github.ts: createRepo("vibestack-{appName}-{shortId}")
  -> POST /orgs/VibeStackCodes-Generated/repos
  -> returns { cloneUrl, htmlUrl }
  |
  v
lib/sandbox.ts: runCommand("git remote add origin <cloneUrl>")
  |
  v
sandbox.git.push("/workspace", "x-access-token", installationToken)
  |
  v
projects.github_repo_url = htmlUrl
  |
  v
Deploy: Vercel createProject linked to GitHub repo
  -> auto-deploys from main branch
```

## Files to Create

### `lib/github.ts`
- Octokit instance with `createAppAuth` strategy
- `createRepo(name: string)` — creates repo in `VibeStackCodes-Generated` org, returns `{ cloneUrl, htmlUrl }`
- `getInstallationToken()` — returns short-lived token for `sandbox.git.push()` auth

## Files to Modify

### `supabase/migrations/001_init.sql`
- Add `github_repo_url TEXT` column to `projects` table

### `app/api/projects/generate/route.ts`
- Add Stage 3.5 between build verification and completion:
  - Emit checkpoint "Pushing to GitHub" (active)
  - `createRepo()` via GitHub API
  - `runCommand("git remote add origin <cloneUrl>")`
  - `sandbox.git.push("/workspace", "x-access-token", token)`
  - Store `github_repo_url` in projects table
  - Emit checkpoint "Pushing to GitHub" (complete)
- GitHub push failure is **non-fatal** — logs warning, pipeline continues

### `app/api/projects/deploy/route.ts`
- If `github_repo_url` exists: create Vercel project linked to GitHub repo
  - `framework: "vite"`, `buildCommand: "bun run build"`, `installCommand: "bun install"`, `outputDirectory: "dist"`
- If `github_repo_url` is null: fall back to current file-upload approach
- **Bug fix**: Change framework `"nextjs"` -> `"vite"`, outputDirectory `".next"` -> `"dist"`, buildCommand `"npm run build"` -> `"bun run build"`, installCommand `"npm install"` -> `"bun install"`

### `lib/sandbox.ts`
- Add `pushToGitHub(sandbox, cloneUrl, token)` helper:
  - `runCommand("git remote add origin <cloneUrl>")`
  - `sandbox.git.push("/workspace", "x-access-token", token)`

### `lib/types.ts`
- No change needed — checkpoint events already cover this generically

## Dependencies

- `octokit` (includes `@octokit/auth-app`)

## Environment Variables

- `GITHUB_APP_ID` — GitHub App ID
- `GITHUB_APP_PRIVATE_KEY` — PEM private key for JWT signing
- `GITHUB_APP_INSTALLATION_ID` — Installation ID on VibeStackCodes-Generated org
- `GITHUB_ORG` — `VibeStackCodes-Generated`

## Error Handling

- GitHub repo creation failure: non-fatal, log warning, skip push
- GitHub push failure: non-fatal, log warning, `github_repo_url` stays null
- Deploy fallback: if no `github_repo_url`, use existing file-upload deploy
- Sandbox always has full git history (scaffold commit + layer commits)

## Verification

1. `pnpm tsc --noEmit` — clean
2. `NEXT_PUBLIC_MOCK_MODE=true pnpm playwright test e2e/full-flow.spec.ts` — pass (mock mode skips GitHub)
3. Real E2E: generation completes -> repo visible at `github.com/VibeStackCodes-Generated/vibestack-{name}-{id}`
4. Deploy from GitHub repo -> Vercel project linked, auto-deploy works
