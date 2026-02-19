# App 1: Recipe App (ultra-vague)

**Date**: 2026-02-19
**Prompt Complexity**: Ultra-vague
**Vercel URL**: [Live](https://public-recipe-book-mltftzxs-qrah21k7e-vibe-stack-team.vercel.app)
**Total Duration**: 115.6s
**Total Tokens**: 5015 (~$0.0125)

---

## Prompt

```
recipe app
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 39.9s | 5015 | 5 tables |
| 2 | 2. Blueprint | PASS | 5.0s | 0 | 69 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.8s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 26.8s | 0 | 0 files |
| 5 | 5. Validation | PASS | 20.6s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 28 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 2.9s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771504095288 |
| 8 | 9. Vercel Deploy | PASS | 18.6s | 0 | https://public-recipe-book-mltftzxs-qrah21k7e-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: Public Recipe Book
- **Description**: A public recipe browsing app for creating, categorizing, and viewing recipes without user authentication.
- **Tables**: recipes, ingredients, recipe_ingredients, tags, recipe_tags

## Blueprint

- **Total Files**: 69
- **LLM Slot Files**: 10
- **Auth**: No

## Code Generation

- **Assembled Files**: 0
- **Tokens**: 0
- **Warnings**: 0

## Validation

- **Manifest**: PASS
- **TypeCheck**: PASS
- **Build**: PASS
- **Overall**: ✅ ALL PASSED

## Code Review

- **Passed**: true
- **Deterministic Issues**: 28
- **LLM Issues**: 0

## Provisioning

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771504095288
- **Supabase**: https://foeagwynzvlpqqhgeyfj.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 69 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.8s
