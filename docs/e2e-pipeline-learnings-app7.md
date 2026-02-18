# App 7: SaaS CRM for Small Agencies (multi-entity)

**Date**: 2026-02-18
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://studiopipeline-crm-mls5vo3j-mt7nel5sb-vibe-stack-team.vercel.app)
**Total Duration**: 96.5s
**Total Tokens**: 8400 (~$0.0210)

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
| 1 | 1. Analysis | PASS | 47.9s | 8400 | 4 tables | #7C3AED | DM Sans |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 56 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.7s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 5.7s | 0 | 8 files |
| 5 | 5. Validation | PASS | 16.9s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 9 det + 0 LLM issues |
| 7 | 9. Vercel Deploy | PASS | 22.5s | 0 | https://studiopipeline-crm-mls5vo3j-mt7nel5sb-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: StudioPipeline CRM
- **Description**: A lightweight CRM for small creative agencies to track companies, contacts, deals, and activities across a simple sales pipeline.
- **Primary Color**: #7C3AED
- **Font**: DM Sans
- **Style**: Modern editorial SaaS—clean cards, subtle grain, high-contrast typography; pipeline kanban columns with soft shadows and quick-add actions.
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

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771426937591
- **Supabase**: https://rrbkcfdpqfcjvsqsnsmg.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 56 files across 6 layers

### Bugs Found
- GitHub push failed: Bad credentials - https://docs.github.com/rest

### Performance Notes
- Provisioning: 1.7s
