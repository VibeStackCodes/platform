# App 7: SaaS CRM for Small Agencies (multi-entity)

**Date**: 2026-02-18
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://studiopipeline-crm-mlrx5e5y-i0gblip5a-vibe-stack-team.vercel.app)
**Total Duration**: 89.1s
**Total Tokens**: 7424 (~$0.0186)

---

## Prompt

```
Build a lightweight CRM for small creative agencies to manage their client relationships and sales pipeline.

Entities:
- Companies: name, industry, website, size (1-10/11-50/51-200/200+), country, notes
- Contacts: first name, last name, email, phone, job title, company (FK), is_primary_contact
- Deals: title, company (FK), contact (FK), value (numeric), stage (lead/proposal/negotiation/closed-won/closed-lost), probability (0-100), expected_close_date, notes
- Activities: deal (FK), contact (FK), type (call/email/meeting/demo), subject, notes, completed (boolean), activity_date

The pipeline view should default to showing deals sorted by stage then value.
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 37.0s | 7424 | 4 tables | #7C3AED | Sora |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 56 files (deterministic) |
| 3 | 3. Provisioning | PASS | 2.1s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 6.9s | 0 | 8 files |
| 5 | 5. Validation | PASS | 20.4s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 9 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 5.9s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771412265750 |
| 8 | 9. Vercel Deploy | PASS | 16.8s | 0 | https://studiopipeline-crm-mlrx5e5y-i0gblip5a-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: StudioPipeline CRM
- **Description**: Lightweight CRM for small creative agencies to track companies, contacts, deals, and activities with a visual sales pipeline.
- **Primary Color**: #7C3AED
- **Font**: Sora
- **Style**: Minimal, editorial SaaS for creative studios; lots of whitespace, rounded cards, subtle grain/gradients, kanban-style pipeline columns.
- **Tables**: companies, contacts, deals, activities

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

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771412265750
- **Supabase**: https://hsrhsgrfervmhietlsju.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 56 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 2.1s
