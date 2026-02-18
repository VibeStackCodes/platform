# App 3: Remote Developer Job Board (public catalog)

**Date**: 2026-02-18
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://remotedevboard-mlresg26-ovdlymk81-vibe-stack-team.vercel.app)
**Total Duration**: 77.3s
**Total Tokens**: 6888 (~$0.0172)

---

## Prompt

```
Build a remote job board for developer positions. Companies can post jobs with title, company name, location (remote/hybrid/onsite), job type (full-time/contract/freelance), tech stack required, salary range, and description. Job seekers can browse and filter by job type, tech stack, and location. No user authentication needed — anyone can view listings.
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 30.3s | 6888 | 3 tables | #7c3aed | Outfit |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 54 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.8s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 6.5s | 0 | 6 files |
| 5 | 5. Validation | PASS | 16.7s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 7 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 4.8s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771381433926 |
| 8 | 9. Vercel Deploy | PASS | 17.1s | 0 | https://remotedevboard-mlresg26-ovdlymk81-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: RemoteDevBoard
- **Description**: A public remote developer job board where companies can post listings and candidates can browse and filter by location, job type, and tech stack.
- **Primary Color**: #7c3aed
- **Font**: Outfit
- **Style**: Modern SaaS/job board with clean cards, pill filters, and editorial typography; subtle gradients and soft shadows.
- **Tables**: job, tech_tag, job_tech_tag

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

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771381433926
- **Supabase**: https://rtkjkthdoaidghzoktfs.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 54 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.8s
