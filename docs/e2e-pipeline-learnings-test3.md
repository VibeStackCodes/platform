# E2E Pipeline Run — Learnings & Observations

**Date**: 2026-02-17
**Test Prompt**: Test 3 (Complex App — Personal Finance Tracker)
**Model**: gpt-5.2 via Helicone proxy
**Total Duration**: 108.7s
**Total Tokens**: 4871

---

## Pipeline Phases

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 19.4s | 4871 | 2 tables |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 51 files (deterministic) |
| 3 | 3. Provisioning | PASS | 2.0s | 0 | sandbox=ad5c3ba9... supabase=wrplclcs... |
| 4 | 4. Code Generation | PASS | 8.8s | 0 | 4 files, 0 tokens |
| 5 | 5. Validation | PASS | 18.9s | 0 | manifest=true scaffold=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 6 deterministic + 0 LLM issues |
| 7 | 10. GitHub Push | PASS | 59.7s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771371038575 |

## Analysis Output

- **App Name**: PennyPulse
- **Description**: Personal finance tracker to log income and expenses, view dashboard insights, filter transactions, and export to CSV.
- **Tables**: category, transaction
- **Tokens**: 4871

## Blueprint Output

- **Total Files**: 51
- **LLM Slot Files**: 4
- **Layers**: 0, 1, 2, 3, 4, 5

## Provisioning Output

- **Sandbox**: ad5c3ba9-ccd9-4270-ade1-5b4700921516
- **Supabase**: wrplclcsznsztriqinzi (https://wrplclcsznsztriqinzi.supabase.co)
- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771371038575

## Code Generation Output

- **Assembled Files**: 4
- **Tokens**: 0
- **Warnings**: 0
- **Skipped**: none

## Validation Output

- **Manifest**: PASS
- **Scaffold**: PASS
- **TypeCheck**: PASS
- **Lint**: PASS
- **Build**: PASS
- **Overall**: ALL PASSED

## Code Review Output

- **Passed**: true
- **Deterministic Issues**: 6
- **LLM Issues**: 0
- **Tokens**: 0

## Learnings

### Architecture Observations

- Blueprint generates 51 files across 6 layers
- 4 files have SLOT markers for LLM filling

### Bugs Found

(none)

### Performance Notes

- Provisioning took 2.0s (parallel: sandbox + supabase + github)
- Code gen took 8.8s for 4 assembled files

### Recommendations

(none)
