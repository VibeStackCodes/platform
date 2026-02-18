# App 9: Agency Project Management (complex SaaS)

**Date**: 2026-02-18
**Prompt Complexity**: Complex
**Vercel URL**: [Live](https://studiosprint-mlsa3u61-1h6fog8ie-vibe-stack-team.vercel.app)
**Total Duration**: 142.2s
**Total Tokens**: 7782 (~$0.0195)

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
| 1 | 1. Analysis | PASS | 39.6s | 7782 | 4 tables | #7C3AED | DM Sans |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 56 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.9s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 62.8s | 0 | 8 files |
| 5 | 5. Validation | PASS | 18.8s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 9 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 2.8s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771433977411 |
| 8 | 9. Vercel Deploy | PASS | 16.4s | 0 | https://studiosprint-mlsa3u61-1h6fog8ie-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: StudioSprint
- **Description**: Project management and delivery tracking for creative agencies—clients, projects, deliverables, and time entries with deadline-focused dashboards.
- **Primary Color**: #7C3AED
- **Font**: DM Sans
- **Style**: Modern editorial SaaS for creative studios: roomy layouts, subtle grain/gradient accents, rounded cards, clear typography, and strong status chips.
- **Tables**: clients, projects, deliverables, time_entries

## Blueprint

- **Total Files**: 56
- **LLM Slot Files**: 8
- **Auth**: No

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
- **Deterministic Issues**: 9
- **LLM Issues**: 0

## Provisioning

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771433977411
- **Supabase**: https://medrpdfavzndyqgwvuqg.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 56 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.9s
