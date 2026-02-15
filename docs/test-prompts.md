# Agent E2E Test Prompts (Mastra Studio)

Test the full generation pipeline via **Mastra Studio** (`bun run mastra:dev` -> Agents -> Supervisor).

Each test prompt exercises the full agent network. Verify expected behaviors using the checklist after each run.

---

## How to Run

```bash
bun run mastra:dev
# Open http://localhost:4111 (or 4112)
# Navigate to: Agents -> Supervisor -> Chat
# Paste a test prompt below
# Watch the Traces tab for agent delegation
```

## Required Env Vars

All vars in `.env.local` must be set (OPENAI_API_KEY, DAYTONA_API_KEY, SUPABASE_ACCESS_TOKEN, GITHUB_APP_*, VERCEL_TOKEN, etc.)

---

## Test 1: Simple CRUD App (Smoke Test)

**Complexity:** Low | **Expected duration:** 2-4 min | **Exercises:** All 9 agents

### Prompt

```
Build a personal bookmarks manager. Users can save URLs with a title, description,
and tags. They can search bookmarks by title or tag, and star their favorites.
```

### Expected Agent Delegation (Traces tab)

| Phase | Agent | Expected Behavior |
|-------|-------|-------------------|
| 1 | Analyst | Extracts: bookmark entity (url, title, description, tags[], is_starred), auth requirement. May ask clarifying questions via structured UI. |
| 2a | Infra Engineer | Creates Daytona sandbox, Supabase project, GitHub repo. All 3 succeed. |
| 2b | Database Admin | Generates SQL with `bookmark` table, RLS policies for `auth.uid() = user_id`, validates via PGlite, runs migration. |
| 3a | Backend Engineer | Generates `src/lib/types.ts`, `src/lib/supabase.ts`, `src/hooks/use-bookmark.ts` with TanStack Query. |
| 3b | Frontend Engineer | Generates routes, bookmark list/create/edit components, search UI, star toggle. Uses shadcn/ui. |
| 4a | Code Reviewer | Reviews code, reports issues (if any). |
| 4b | QA Engineer | Runs `tsc --noEmit`, `biome check`, `bun run build`. All pass (or fixes are applied). |
| 5 | DevOps Engineer | Git commit + push to GitHub + Vercel deploy. Returns URLs. |

### Pass Criteria

- [ ] All 9 agents were invoked (check Traces)
- [ ] Sandbox was created (sandboxId in tool output)
- [ ] Supabase project created and migration ran
- [ ] GitHub repo created with code pushed
- [ ] Vercel deployment URL returned
- [ ] `bun run build` passed (QA agent)
- [ ] RLS policies present in SQL migration
- [ ] No unresolved errors in the trace

---

## Test 2: Multi-Role App (Auth + Realtime)

**Complexity:** Medium | **Expected duration:** 3-6 min | **Exercises:** Clarification questions, complex schema, multi-page routing

### Prompt

```
Build a team task board with 2 roles: Admin and Member. Admins can create projects,
invite members, and see all tasks across projects. Members can only see tasks in
projects they belong to. Tasks have status (todo, in-progress, done), priority
(low, medium, high), and assignee. Include a real-time activity feed that shows
when tasks are moved between columns.
```

### Expected Agent Delegation

| Phase | Agent | Expected Behavior |
|-------|-------|-------------------|
| 1 | Analyst | May ask clarification via `ask-clarifying-questions` tool (e.g., "Should admins be able to delete projects?"). Extracts entities: project, task, membership, activity_log. |
| 2b | Database Admin | Multi-table schema: project, task, project_member, activity_log. RLS with role-based policies (admin vs member). Foreign keys between all tables. |
| 3a | Backend Engineer | Types for all entities, role-based hooks, Supabase realtime subscription for activity feed. |
| 3b | Frontend Engineer | Multi-page app: project list, kanban board (3 columns), activity feed sidebar. Drag-and-drop or click-to-move for task status. |
| 4b | QA Engineer | Build must pass with multi-file, multi-route app. |

### Pass Criteria

- [ ] Analyst asked clarifying questions (or skipped with clear requirements)
- [ ] 4+ database tables with correct foreign keys
- [ ] RLS distinguishes admin vs member access
- [ ] Realtime/activity_log table exists
- [ ] Frontend has 2+ routes (project list, board view)
- [ ] Build passes (`bun run build`)
- [ ] Deployed to Vercel successfully

---

## Test 3: Complex App (Dashboard + Analytics)

**Complexity:** High | **Expected duration:** 5-10 min | **Exercises:** Many entities, computed views, charts, complex UI

### Prompt

```
Build a personal finance tracker. Users log income and expenses with category, amount,
date, and notes. Categories include: Food, Transport, Entertainment, Bills, Shopping,
Income, and Other.

The dashboard shows:
- Monthly spending breakdown as a pie chart
- Income vs expenses trend as a line chart (last 6 months)
- Top 5 spending categories this month
- Running balance

Users can filter transactions by date range and category, and export to CSV.
```

### Expected Agent Delegation

| Phase | Agent | Expected Behavior |
|-------|-------|-------------------|
| 1 | Analyst | Extracts: transaction entity (amount, category, type, date, notes), category enum, dashboard requirements. |
| 2b | Database Admin | Transaction table with category enum, indexes on date + category for query performance, possibly a `monthly_summary` view. |
| 3a | Backend Engineer | Hooks for CRUD + aggregation queries (monthly totals, category breakdown). CSV export utility. |
| 3b | Frontend Engineer | Dashboard with chart components (recharts or similar), transaction list with filters, date range picker. |
| 4b | QA Engineer | Charts and date pickers add complexity — verify build handles all dependencies. |

### Pass Criteria

- [ ] Transaction table with proper category enum/check constraint
- [ ] Dashboard route with chart data hooks
- [ ] Filter/search functionality for transactions
- [ ] CSV export utility generated
- [ ] Build passes with chart library dependencies
- [ ] Deployed successfully

---

## Test 4: Edge Case - Vague Prompt (Clarification Flow)

**Complexity:** Low | **Expected duration:** 1-2 min | **Exercises:** Clarification questions UI

### Prompt

```
Build me an app for my business.
```

### Expected Behavior

- [ ] Analyst triggers `ask-clarifying-questions` tool
- [ ] Questions appear as structured options in the trace (question + selectionMode + options)
- [ ] Agent waits for user input before proceeding
- [ ] After receiving answers, analyst produces structured requirements

### Note

In Studio, the clarification questions will appear as tool output in the trace. In the real app, they render as interactive cards via the SSE bridge.

---

## Verification Checklist (All Tests)

After each test, verify in the **Traces** tab:

### Agent Orchestration
- [ ] Supervisor delegated to agents in the expected order
- [ ] No agent was called unnecessarily (e.g., devops before QA passes)
- [ ] Fix loop occurred if QA found issues (max 3 iterations)

### Tool Execution
- [ ] `create-sandbox` returned a sandboxId
- [ ] `create-supabase-project` returned project details
- [ ] `create-github-repo` returned clone URL
- [ ] `validate-sql` was called before `run-migration`
- [ ] `run-build` (bun run build) exited with code 0
- [ ] `deploy-to-vercel` returned deployment URL

### Generated App Quality
- [ ] Visit the Vercel URL — does the app load?
- [ ] Check GitHub repo — does the code look reasonable?
- [ ] Check Supabase dashboard — are tables and RLS policies created?

### Error Handling
- [ ] If any agent failed, supervisor reported it (not silently swallowed)
- [ ] If build failed, QA routed errors back to the right agent

---

## Known Limitations

- **Token cost:** Each full E2E test costs ~$0.50-2.00 in OpenAI tokens (gpt-4o orchestrator + gpt-4o-mini validator)
- **Duration:** Full pipeline takes 2-10 minutes depending on complexity
- **Flakiness:** LLM outputs are non-deterministic — the same prompt may produce slightly different results each run
- **Daytona quotas:** Sandbox creation has rate limits; clean up old sandboxes between test runs
- **Supabase free tier:** Limited to 2 active projects; pause/delete test projects after verification

---

## TODO: Mastra Scorers (Automated Evaluation)

Future improvement: add Mastra Scorers to automatically evaluate agent output quality.

Potential scorers:
- **SQL Quality Scorer:** Validates generated SQL has RLS, proper types, foreign keys
- **Build Success Scorer:** Binary pass/fail on `bun run build` exit code
- **Requirements Coverage Scorer:** Checks if all user-requested features appear in generated code
- **Code Quality Scorer:** Runs static analysis on generated TypeScript
- **Deployment Scorer:** Verifies Vercel URL returns 200

These would be registered on the Mastra instance via `scorers: { ... }` and visible in Studio's Scorers tab.
