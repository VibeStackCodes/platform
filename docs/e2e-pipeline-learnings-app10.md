# App 10: Restaurant Management System (hospitality)

**Date**: 2026-02-18
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://la-piazza-manager-mlrx9o01-4q19qpxqn-vibe-stack-team.vercel.app)
**Total Duration**: 95.6s
**Total Tokens**: 9828 (~$0.0246)

---

## Prompt

```
Build a restaurant management system for "La Piazza" an Italian restaurant.

Menu categories: name, description, display_order, active (boolean)
Menu items: name, category (FK), description, price, dietary_tags (text, comma-separated like "vegetarian,gluten-free"), available (boolean), preparation_time_minutes, image_url, calories
Tables: table_number (integer), capacity, location (indoor/outdoor/bar/private), status (available/occupied/reserved/closed)
Reservations: guest_name, guest_email, guest_phone, table (FK), party_size, reservation_date, reservation_time, status (pending/confirmed/seated/completed/cancelled/no-show), special_requests
Orders: table (FK), reservation (FK, optional), status (open/in-progress/ready/served/paid/cancelled), total_amount, notes, ordered_at
Order items: order (FK), menu_item (FK), quantity, unit_price, special_instructions, status (pending/cooking/ready/served)

Staff sign in to manage reservations and orders. The reservation list defaults to today's date.
```

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | 1. Analysis | PASS | 50.5s | 9828 | 6 tables | #C2410C | Nunito |
| 2 | 2. Blueprint | PASS | 0.0s | 0 | 60 files (deterministic) |
| 3 | 3. Provisioning | PASS | 1.7s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 5.3s | 0 | 12 files |
| 5 | 5. Validation | PASS | 16.4s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 13 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 5.4s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771412472453 |
| 8 | 9. Vercel Deploy | PASS | 16.3s | 0 | https://la-piazza-manager-mlrx9o01-4q19qpxqn-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: La Piazza Manager
- **Description**: Back-office restaurant management system for La Piazza to manage menu, tables, reservations, and orders with staff sign-in.
- **Primary Color**: #C2410C
- **Font**: Nunito
- **Style**: Warm, modern trattoria dashboard with subtle paper texture, rounded cards, and rich food photography accents.
- **Tables**: menu_categories, menu_items, restaurant_tables, reservations, orders, order_items

## Blueprint

- **Total Files**: 60
- **LLM Slot Files**: 12
- **Auth**: No

## Code Generation

- **Assembled Files**: 12
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

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771412472453
- **Supabase**: https://flqlosfupjbqnufyumtd.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 60 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 1.7s
