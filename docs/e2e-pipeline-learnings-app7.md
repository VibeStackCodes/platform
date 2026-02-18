# App 7: SaaS CRM for Small Agencies (multi-entity)

**Date**: 2026-02-18
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://studiopulse-crm-mlrf5qm6-nq650z0e4-vibe-stack-team.vercel.app)
**Total Duration**: 91.4s
**Total Tokens**: 9827 (~$0.0246)

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
| 1 | 1. Analysis | PASS | 43.9s | 9827 | 4 tables | #7C3AED | DM Sans |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 58 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.6s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 6.3s | 0 | 8 files |
| 5 | 5. Validation | PASS | 17.0s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 13 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 4.9s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771382054043 |
| 8 | 9. Vercel Deploy | PASS | 17.7s | 0 | https://studiopulse-crm-mlrf5qm6-nq650z0e4-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: StudioPulse CRM
- **Description**: A lightweight CRM for small creative agencies to manage companies, contacts, deals, and activity tracking across a simple sales pipeline.
- **Primary Color**: #7C3AED
- **Font**: DM Sans
- **Style**: Minimal editorial SaaS for creative agencies; clean cards, subtle grain/gradients, strong typography, kanban-like pipeline columns.
- **Tables**: company, contact, deal, activity

## Blueprint

- **Total Files**: 58
- **LLM Slot Files**: 8
- **Auth**: Yes

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
- **Deterministic Issues**: 13
- **LLM Issues**: 0

## Provisioning

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771382054043
- **Supabase**: https://apbgruejkjniepxityex.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 58 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.6s
