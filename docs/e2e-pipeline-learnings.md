# E2E Pipeline Run — Learnings & Observations

**Date**: 2026-02-17
**Test Prompt**: Test 1 (Simple CRUD — Bookmarks Manager)
**Model**: gpt-5.2 via Helicone proxy
**Total Duration**: 127.6s
**Total Tokens**: 6763

---

## Pipeline Phases

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 35.0s | 6763 | 4 tables |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 53 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.7s | 0 | sandbox=ab7139b7... supabase=wxhjueox... |
| 4 | 4. Code Generation | PASS | 7.7s | 0 | 8 files, 0 tokens |
| 5 | 5. Validation | PASS | 19.1s | 0 | manifest=true scaffold=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 8 deterministic + 0 LLM issues |
| 7 | 10. GitHub Push | PASS | 63.9s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771368967084 |

## Analysis Output

- **App Name**: MarkNest
- **Description**: Personal bookmarks manager where users save, tag, search, and star favorite links.
- **Tables**: user_profile, bookmark, tag, bookmark_tag
- **Tokens**: 6763

## Blueprint Output

- **Total Files**: 53
- **LLM Slot Files**: 8
- **Layers**: 0, 1, 2, 3, 4, 5

## Provisioning Output

- **Sandbox**: ab7139b7-ca47-427b-a511-a2c4c7731c7d
- **Supabase**: wxhjueoxwkfcbhbvivik (https://wxhjueoxwkfcbhbvivik.supabase.co)
- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771368967084

## Code Generation Output

- **Assembled Files**: 8
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
- **Deterministic Issues**: 8
- **LLM Issues**: 0
- **Tokens**: 0

## Learnings

### Architecture Observations

- Blueprint generates 53 files across 6 layers
- 8 files have SLOT markers for LLM filling

### Bugs Found

(none)

### Performance Notes

- Provisioning took 1.7s (parallel: sandbox + supabase + github)
- Code gen took 7.7s for 8 assembled files

### Recommendations

(none)
