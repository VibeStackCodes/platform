# App 3: Remote Developer Job Board (public catalog)

**Date**: 2026-02-18
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://devremote-board-mlsb10km-4x4nxar2o-vibe-stack-team.vercel.app)
**Total Duration**: 117.6s
**Total Tokens**: 5997 (~$0.0150)

---

## Prompt

```
Build a remote job board for developer positions. Companies can post jobs with title, company name, location (remote/hybrid/onsite), job type (full-time/contract/freelance), tech stack required, salary range, and description. Job seekers can browse and filter by job type, tech stack, and location. No user authentication needed — anyone can view listings.
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 31.5s | 5997 | 3 tables | #7c3aed | Outfit |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 54 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.9s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 43.4s | 0 | 6 files |
| 5 | 5. Validation | PASS | 19.6s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 7 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 2.8s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771435543203 |
| 8 | 9. Vercel Deploy | PASS | 18.3s | 0 | https://devremote-board-mlsb10km-4x4nxar2o-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: DevRemote Board
- **Description**: A public remote-focused developer job board where companies post listings and job seekers browse and filter by location, job type, and tech stack.
- **Primary Color**: #7c3aed
- **Font**: Outfit
- **Style**: Modern SaaS editorial hybrid with card-based listings, strong typography, and subtle gradients; tag chips for tech stack; compact filter sidebar on desktop and drawer on mobile.
- **Tables**: jobs, tech_tags, job_tech_tags

## Blueprint

- **Total Files**: 54
- **LLM Slot Files**: 6
- **Auth**: No

## Code Generation

- **Assembled Files**: 6
- **Tokens**: 0
- **Warnings**: 0

## Validation

- **Manifest**: PASS
- **TypeCheck**: PASS
- **Build**: PASS
- **Overall**: ✅ ALL PASSED

## Code Review

- **Passed**: true
- **Deterministic Issues**: 7
- **LLM Issues**: 0

## Provisioning

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771435543203
- **Supabase**: https://ceuzlkbuljcaxyjnuopv.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 54 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.9s
