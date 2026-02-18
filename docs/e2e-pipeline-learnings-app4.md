# App 4: Personal Finance Tracker (SaaS with auth)

**Date**: 2026-02-18
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://ledgerleaf-mlresg3s-f45dxekuc-vibe-stack-team.vercel.app)
**Total Duration**: 81.5s
**Total Tokens**: 6666 (~$0.0167)

---

## Prompt

```
Build a personal finance tracker. Users track income and expenses with: amount, category (Food, Transport, Entertainment, Bills, Shopping, Income, Other), date, description, and whether it's recurring.

The dashboard shows:
- Current month spending by category
- Income vs expenses for the last 6 months
- Running balance (total income - total expenses)
- Top 3 spending categories this month

Users can filter transactions by date range and category.
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 28.7s | 6666 | 2 tables | #059669 | DM Sans |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 54 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.9s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 7.9s | 0 | 4 files |
| 5 | 5. Validation | PASS | 16.2s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 7 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 4.6s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771381433607 |
| 8 | 9. Vercel Deploy | PASS | 22.3s | 0 | https://ledgerleaf-mlresg3s-f45dxekuc-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: LedgerLeaf
- **Description**: A personal finance tracker to log income and expenses, filter transactions, and view dashboards for monthly category spending, 6‑month income vs expenses, running balance, and top categories.
- **Primary Color**: #059669
- **Font**: DM Sans
- **Style**: Modern finance dashboard with calm, trustworthy look; card-based analytics, subtle gradients, and clear charts.
- **Tables**: transaction, recurring_rule

## Blueprint

- **Total Files**: 54
- **LLM Slot Files**: 4
- **Auth**: Yes

## Code Generation

- **Assembled Files**: 4
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

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771381433607
- **Supabase**: https://npnwuxrezrbduuuuoycn.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 54 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.9s
