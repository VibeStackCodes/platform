# E2E Pipeline Run — Learnings & Observations

**Date**: 2026-02-17
**Test Prompt**: Test 1 (Simple CRUD — Bookmarks Manager)
**Model**: gpt-5.2 via Helicone proxy
**Total Duration**: 614.2s
**Total Tokens**: 161647

---

## Pipeline Phases

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 29.5s | 6484 | 4 tables |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 26 files (deterministic) |
| 3 | 3. Provisioning | PASS | 118.9s | 0 | sandbox=64197ce2... supabase=lvdsyppg... |
| 4 | 4. Code Generation | PASS | 278.9s | 15046 | 11 files, 15046 tokens |
| 5 | 5. Validation | FAIL | 8.9s | 0 | manifest=true scaffold=false tsc=true build=false |
| 6 | 6. Repair #1 | DONE | 15.4s | 31777 | 31777 tokens |
| 7 | 5b. Re-Validation #1 | FAIL | 16.9s | 0 | tsc=true build=false |
| 8 | 6. Repair #2 | DONE | 80.4s | 108340 | 108340 tokens |
| 9 | 5b. Re-Validation #2 | FAIL | 9.9s | 0 | tsc=true build=false |
| 10 | 7. Code Review | SKIP | 0.0s | 0 | validation failed |
| 11 | 10. GitHub Push | PASS | 55.3s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771326168855 |

## Analysis Output

- **App Name**: BookmarkVault
- **Description**: A personal bookmarks manager where users save, tag, search, and star favorite links.
- **Tables**: users, bookmark, tag, bookmark_tag
- **Tokens**: 6484

## Blueprint Output

- **Total Files**: 26
- **LLM Slot Files**: 8
- **Layers**: 0, 1, 2, 3, 4, 5

## Provisioning Output

- **Sandbox**: 64197ce2-7a9b-4d69-8fff-9c29a668801b
- **Supabase**: lvdsyppgxxzmvdojhbhe (https://lvdsyppgxxzmvdojhbhe.supabase.co)
- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771326168855

## Code Generation Output

- **Assembled Files**: 11
- **Tokens**: 15046
- **Warnings**: 0
- **Skipped**: none

## Validation Output

- **Manifest**: PASS
- **Scaffold**: PASS
- **TypeCheck**: PASS
- **Lint**: FAIL
- **Build**: FAIL
- **Overall**: FAILED

## Code Review Output

Skipped or Failed

## Learnings

### Architecture Observations

- Blueprint generates 26 files across 6 layers
- 8 files have SLOT markers for LLM filling

### Bugs Found

(none)

### Performance Notes

- Provisioning took 118.9s (parallel: sandbox + supabase + github)
- Code gen took 278.9s for 11 assembled files

### Recommendations

(none)
