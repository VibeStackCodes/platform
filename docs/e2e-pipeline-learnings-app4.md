# App 4: Personal Finance Tracker (SaaS with auth)

**Date**: 2026-02-18
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://pennypilot-mlrwyg1a-3a00li00x-vibe-stack-team.vercel.app)
**Total Duration**: 189.2s
**Total Tokens**: 5394 (~$0.0135)

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
| 1 | 1. Analysis | PASS | 24.0s | 5394 | 2 tables | #059669 | DM Sans |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 52 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.8s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 8.0s | 0 | 4 files |
| 5 | 5. Validation | PASS | 14.6s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 5 det + 0 LLM issues |
| 7 | 9. Vercel Deploy | PASS | 17.1s | 0 | https://pennypilot-mlrwyg1a-3a00li00x-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: PennyPilot
- **Description**: A personal finance tracker to log income and expenses, view category spending, cashflow trends, and running balance with filters.
- **Primary Color**: #059669
- **Font**: DM Sans
- **Style**: Modern fintech dashboard; rounded cards, subtle shadows, clear data visualization, responsive grid; light mode with optional dark mode accents.
- **Tables**: transactions, categories

## Blueprint

- **Total Files**: 52
- **LLM Slot Files**: 4
- **Auth**: No

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
- **Deterministic Issues**: 5
- **LLM Issues**: 0

## Provisioning

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771411828202
- **Supabase**: https://afvcbbupydhkejdxxywa.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 52 files across 6 layers

### Bugs Found
- GitHub push failed: Command execution failed: Operation timed out

### Performance Notes
- Provisioning: 1.8s
