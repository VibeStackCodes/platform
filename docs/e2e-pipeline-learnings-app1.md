# App 1: Recipe App (ultra-vague)

**Date**: 2026-02-19
**Prompt Complexity**: Ultra-vague
**Vercel URL**: [Live](https://publicrecipebook-mlsyepqg-r9p0vduij-vibe-stack-team.vercel.app)
**Total Duration**: 120.7s
**Total Tokens**: 4169 (~$0.0104)

---

## Prompt

```
recipe app
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 34.5s | 4169 | 4 tables |
| 2 | 2. Blueprint | PASS | 4.8s | 0 | 65 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.9s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 34.5s | 0 | 0 files |
| 5 | 5. Validation | PASS | 23.8s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 25 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 2.7s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771474819111 |
| 8 | 9. Vercel Deploy | PASS | 18.6s | 0 | https://publicrecipebook-mlsyepqg-r9p0vduij-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: PublicRecipeBook
- **Description**: A public recipe browsing app for viewing and searching recipes without user authentication.
- **Tables**: recipes, recipe_ingredients, recipe_tags, recipe_tag_links

## Blueprint

- **Total Files**: 65
- **LLM Slot Files**: 8
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
- **Deterministic Issues**: 25
- **LLM Issues**: 0

## Provisioning

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771474819111
- **Supabase**: https://htkeawyplphjazjghkdt.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 65 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.9s
