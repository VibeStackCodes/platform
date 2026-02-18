# App 9: Agency Project Management (complex SaaS)

**Date**: 2026-02-18
**Prompt Complexity**: Complex
**Vercel URL**: [Live](https://studiosprint-mlrf5wto-3ejcb9aa5-vibe-stack-team.vercel.app)
**Total Duration**: 101.2s
**Total Tokens**: 10275 (~$0.0257)

---

## Prompt

```
Build a project management tool for creative agencies with the following structure:

Clients: company name, contact person, email, phone, country, contract value, status (prospect/active/paused/churned)

Projects: name, client (FK), project manager name, start_date, deadline, budget, status (briefing/production/review/delivered/invoiced), description

Deliverables: title, project (FK), type (logo/website/copy/video/photo/social/other), status (brief/in-progress/internal-review/client-review/approved/delivered), assignee_name, due_date, revision_count, notes

Time entries: project (FK), deliverable (FK), person_name, hours, billable (boolean), date, description

Dashboard defaults to showing active projects sorted by deadline (soonest first). Deliverables default to showing in-progress and review items.
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 49.4s | 10275 | 4 tables | #7C3AED | DM Sans |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 58 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.6s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 6.4s | 0 | 8 files |
| 5 | 5. Validation | PASS | 17.1s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 12 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 5.0s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771382062363 |
| 8 | 9. Vercel Deploy | PASS | 21.7s | 0 | https://studiosprint-mlrf5wto-3ejcb9aa5-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: StudioSprint
- **Description**: A project management tool for creative agencies to manage clients, projects, deliverables, and time tracking with deadline-focused dashboards.
- **Primary Color**: #7C3AED
- **Font**: DM Sans
- **Style**: Modern editorial SaaS for agencies—clean layouts, generous whitespace, subtle grain/gradient accents, card-based lists with status pills and deadline highlights.
- **Tables**: client, project, deliverable, time_entry

## Blueprint

- **Total Files**: 58
- **LLM Slot Files**: 8
- **Auth**: Yes

## Code Generation

- **Assembled Files**: 8
- **Tokens**: 0
- **Warnings**: 0

## Validation

- **Manifest**: PASS
- **TypeCheck**: PASS
- **Build**: PASS
- **Overall**: ✅ ALL PASSED

## Code Review

- **Passed**: true
- **Deterministic Issues**: 12
- **LLM Issues**: 0

## Provisioning

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771382062363
- **Supabase**: https://vbdwsfsqyzxqhzioyqpl.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 58 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.6s
