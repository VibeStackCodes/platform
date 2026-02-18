# App 6: Medical Clinic Scheduling (healthcare)

**Date**: 2026-02-18
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://clinicsched-mlrgh1jf-cpg4mpxwp-vibe-stack-team.vercel.app)
**Total Duration**: 97.6s
**Total Tokens**: 8629 (~$0.0216)

---

## Prompt

```
Build a patient appointment management system for a small family medical clinic. The system needs to track:
- Patients: first name, last name, date of birth, phone, email, medical record number, insurance provider
- Doctors: first name, last name, specialization, license number, active status
- Appointments: patient (FK), doctor (FK), appointment date/time, type (new patient / follow-up / urgent), status (scheduled/confirmed/completed/cancelled/no-show), chief complaint, duration in minutes, notes

Receptionists can view all appointments, create new ones, and update statuses. The appointment list should show today's schedule first.
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 38.1s | 8629 | 4 tables | #0d9488 | Nunito |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 56 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.8s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 11.8s | 0 | 8 files |
| 5 | 5. Validation | PASS | 23.0s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 9 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 5.3s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771384248474 |
| 8 | 9. Vercel Deploy | PASS | 17.7s | 0 | https://clinicsched-mlrgh1jf-cpg4mpxwp-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: ClinicSched
- **Description**: Patient, doctor, and appointment management for a small family medical clinic with receptionist-friendly scheduling and status tracking.
- **Primary Color**: #0d9488
- **Font**: Nunito
- **Style**: Calm, clinical, and highly legible UI with card-based schedule views, subtle dividers, and clear status chips for appointments.
- **Tables**: patients, doctors, appointments, profiles

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

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771384248474
- **Supabase**: https://tlnwjezsbxbcvuuvejnr.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 56 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.8s
