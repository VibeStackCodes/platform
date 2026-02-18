# App 1: Recipe App (ultra-vague)

**Date**: 2026-02-18
**Prompt Complexity**: Ultra-vague
**Vercel URL**: [Live](https://openpantry-mlrww2ba-r6oo3a214-vibe-stack-team.vercel.app)
**Total Duration**: 82.9s
**Total Tokens**: 6087 (~$0.0152)

---

## Prompt

```
recipe app
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 39.1s | 6087 | 4 tables | #dc2626 | Nunito |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 56 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.7s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 4.9s | 0 | 8 files |
| 5 | 5. Validation | PASS | 15.9s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 9 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 4.8s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771411839007 |
| 8 | 9. Vercel Deploy | PASS | 16.5s | 0 | https://openpantry-mlrww2ba-r6oo3a214-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: OpenPantry
- **Description**: A public recipe browsing app with searchable recipes, ingredients, and step-by-step instructions—no authentication required.
- **Primary Color**: #dc2626
- **Font**: Nunito
- **Style**: Warm, modern cookbook vibe with generous whitespace, rounded cards, big food photography, and subtle grain/background accents. UI includes a searchable recipe grid, tag chips, and a readable recipe detail page with ingredients + steps in a two-column layout on desktop.
- **Tables**: recipes, recipe_ingredients, recipe_steps, recipe_images

## Blueprint

- **Total Files**: 56
- **LLM Slot Files**: 8
- **Auth**: No

## Code Generation

- **Assembled Files**: 8
- **Tokens**: 0
- **Warnings**: 0

## Validation

- **Manifest**: PASS
- **TypeCheck**: PASS
- **Build**: PASS
- **Overall**: ✅ ALL PASSED

## Code Review

- **Passed**: true
- **Deterministic Issues**: 9
- **LLM Issues**: 0

## Provisioning

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771411839007
- **Supabase**: https://twkqyjgwdkaeltycxfqe.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 56 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.7s
