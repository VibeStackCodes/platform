# E2E Pipeline Run — Learnings & Observations

**Date**: 2026-02-17
**Test Prompt**: Test 1 (Simple CRUD — Bookmarks Manager)
**Model**: gpt-5.2 via Helicone proxy
**Total Duration**: 520.7s
**Total Tokens**: 123891

---

## Pipeline Phases

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 33.1s | 6493 | 4 tables |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 51 files (deterministic) |
| 3 | 3. Provisioning | PASS | 114.3s | 0 | sandbox=d7d2d31d... supabase=jyhrndzo... |
| 4 | 4. Code Generation | PASS | 12.7s | 6500 | 8 files, 6500 tokens |
| 5 | 5. Validation | FAIL | 17.0s | 0 | manifest=true scaffold=false tsc=true build=false |
| 6 | 6. Repair #1 | DONE | 39.6s | 44321 | 44321 tokens |
| 7 | 5b. Re-Validation #1 | FAIL | 17.5s | 0 | tsc=true build=false |
| 8 | 6. Repair #2 | DONE | 198.0s | 66577 | 66577 tokens |
| 9 | 5b. Re-Validation #2 | FAIL | 20.7s | 0 | tsc=true build=false |
| 10 | 7. Code Review | SKIP | 0.0s | 0 | validation failed |
| 11 | 10. GitHub Push | PASS | 67.7s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771355579888 |

## Analysis Output

- **App Name**: Bookmarked
- **Description**: A personal bookmarks manager to save, tag, search, and star favorite links.
- **Tables**: user_profile, bookmark, tag, bookmark_tag
- **Tokens**: 6493

## Blueprint Output

- **Total Files**: 51
- **LLM Slot Files**: 8
- **Layers**: 0, 1, 2, 3, 4, 5

## Provisioning Output

- **Sandbox**: d7d2d31d-a4f8-4f34-91a7-c4871057c5c4
- **Supabase**: jyhrndzoytujfghhmpxo (https://jyhrndzoytujfghhmpxo.supabase.co)
- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771355579888

## Code Generation Output

- **Assembled Files**: 8
- **Tokens**: 6500
- **Warnings**: 0
- **Skipped**: none

## Validation Output

- **Manifest**: PASS
- **Scaffold**: FAIL
- **TypeCheck**: PASS
- **Lint**: FAIL
- **Build**: FAIL
- **Overall**: FAILED

## Code Review Output

Skipped or Failed

## Learnings

### Architecture Observations

- Blueprint generates 51 files across 6 layers
- 8 files have SLOT markers for LLM filling

### Bugs Found

(none)

### Performance Notes

- Provisioning took 114.3s (parallel: sandbox + supabase + github)
- Code gen took 12.7s for 8 assembled files

### Recommendations

(none)
