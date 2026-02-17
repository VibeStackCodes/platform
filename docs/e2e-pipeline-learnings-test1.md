# E2E Pipeline Run — Learnings & Observations

**Date**: 2026-02-17
**Test Prompt**: Test 1 (Simple CRUD — Bookmarks Manager)
**Model**: gpt-5.2 via Helicone proxy
**Total Duration**: 130.0s
**Total Tokens**: 6650

---

## Pipeline Phases

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 34.6s | 6650 | 4 tables |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 55 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.8s | 0 | sandbox=ea254258... supabase=dimvdlgr... |
| 4 | 4. Code Generation | PASS | 8.1s | 0 | 8 files, 0 tokens |
| 5 | 5. Validation | PASS | 21.3s | 0 | manifest=true scaffold=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 9 deterministic + 0 LLM issues |
| 7 | 10. GitHub Push | PASS | 64.2s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771370658498 |

## Analysis Output

- **App Name**: MarkShelf
- **Description**: A personal bookmarks manager where users save, tag, search, and star favorite links.
- **Tables**: profile, bookmark, tag, bookmark_tag
- **Tokens**: 6650

## Blueprint Output

- **Total Files**: 55
- **LLM Slot Files**: 8
- **Layers**: 0, 1, 2, 3, 4, 5

## Provisioning Output

- **Sandbox**: ea254258-bd20-4d6b-9478-bd42f1db2e85
- **Supabase**: dimvdlgrngmybityylnt (https://dimvdlgrngmybityylnt.supabase.co)
- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771370658498

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
- **Deterministic Issues**: 9
- **LLM Issues**: 0
- **Tokens**: 0

## Learnings

### Architecture Observations

- Blueprint generates 55 files across 6 layers
- 8 files have SLOT markers for LLM filling

### Bugs Found

(none)

### Performance Notes

- Provisioning took 1.8s (parallel: sandbox + supabase + github)
- Code gen took 8.1s for 8 assembled files

### Recommendations

(none)
