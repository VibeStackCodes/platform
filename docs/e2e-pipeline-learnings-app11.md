# App 11: Recipe Website + Blog (capability composition)

**Date**: 2026-02-19
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://recipepress-mltquevv-7q99pq9x4-vibe-stack-team.vercel.app)
**Total Duration**: 201.2s
**Total Tokens**: 12143 (~$0.0304)

---

## Prompt

```
Build a recipe website with a public blog and authoring admin.
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 79.2s | 12143 | 11 tables, capabilities: public-website, auth, recipes, blog |
| 2 | 2. Blueprint | PASS | 5.1s | 0 | 96 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.8s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 66.9s | 0 | 0 files |
| 5 | 5. Validation | PASS | 27.9s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 57 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 2.8s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771522544270 |
| 8 | 9. Vercel Deploy | PASS | 17.4s | 0 | https://recipepress-mltquevv-7q99pq9x4-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: RecipePress
- **Description**: A recipe website with a public recipe catalog, a public blog, and an admin authoring area for managing recipes and posts.
- **Tables**: profiles, recipes, posts, categories, recipe_categories, recipe_category_map, recipe_ingredients, recipe_steps, blog_categories, blog_posts, blog_post_category_map

## Blueprint

- **Total Files**: 96
- **LLM Slot Files**: 22
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
- **Deterministic Issues**: 57
- **LLM Issues**: 0

## Provisioning

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771522544270
- **Supabase**: https://hmymvjjnxadhmffypmrz.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 96 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.8s
