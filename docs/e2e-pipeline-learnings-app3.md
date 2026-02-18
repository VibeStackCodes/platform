# App 3: Remote Developer Job Board (public catalog)

**Date**: 2026-02-18
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://devremote-board-mlrwvqdp-k7fpp25td-vibe-stack-team.vercel.app)
**Total Duration**: 65.7s
**Total Tokens**: 4827 (~$0.0121)

---

## Prompt

```
Build a remote job board for developer positions. Companies can post jobs with title, company name, location (remote/hybrid/onsite), job type (full-time/contract/freelance), tech stack required, salary range, and description. Job seekers can browse and filter by job type, tech stack, and location. No user authentication needed — anyone can view listings.
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 21.7s | 4827 | 2 tables | #7C3AED | Sora |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 52 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.7s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 6.8s | 0 | 4 files |
| 5 | 5. Validation | PASS | 14.4s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 5 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 4.5s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771411823637 |
| 8 | 9. Vercel Deploy | PASS | 16.5s | 0 | https://devremote-board-mlrwvqdp-k7fpp25td-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: DevRemote Board
- **Description**: A public job board for developer roles where companies post listings and seekers browse and filter by location, job type, and tech stack.
- **Primary Color**: #7C3AED
- **Font**: Sora
- **Style**: Modern, developer-centric dark mode with neon accents; card-based listings, clear filter chips, and strong typography.
- **Tables**: jobs, job_tags

## Blueprint

- **Total Files**: 52
- **LLM Slot Files**: 4
- **Auth**: No

## Code Generation

- **Assembled Files**: 4
- **Tokens**: 0
- **Warnings**: 0

## Validation

- **Manifest**: PASS
- **TypeCheck**: PASS
- **Build**: PASS
- **Overall**: ✅ ALL PASSED

## Code Review

- **Passed**: true
- **Deterministic Issues**: 5
- **LLM Issues**: 0

## Provisioning

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771411823637
- **Supabase**: https://hnldmupxtvwcquahhbwp.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 52 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.7s
