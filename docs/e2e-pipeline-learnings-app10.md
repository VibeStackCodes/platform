# App 10: Restaurant Management System (hospitality)

**Date**: 2026-02-19
**Prompt Complexity**: Medium
**Vercel URL**: [Live](https://la-piazza-manager-mltdfgx0-o847japsp-vibe-stack-team.vercel.app)
**Total Duration**: 157.7s
**Total Tokens**: 8123 (~$0.0203)

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
| 1 | 1. Analysis | PASS | 49.5s | 8123 | 6 tables |
| 2 | 2. Blueprint | PASS | 4.4s | 0 | 101 files (deterministic) |
| 3 | 3. Provisioning | PASS | 2.0s | 0 | sandbox + supabase + github |
| 4 | 4. Code Generation | PASS | 51.0s | 0 | 0 files |
| 5 | 5. Validation | PASS | 29.8s | 0 | manifest=true tsc=true build=true |
| 6 | 7. Code Review | PASS | 0.0s | 0 | 60 det + 0 LLM issues |
| 7 | 8. GitHub Push | PASS | 2.7s | 0 | https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771500024970 |
| 8 | 9. Vercel Deploy | PASS | 18.2s | 0 | https://la-piazza-manager-mltdfgx0-o847japsp-vibe-stack-team.vercel.app |

## Design Choices (from analyst)

- **App Name**: La Piazza Manager
- **Description**: Restaurant management system for La Piazza to manage menu, tables, reservations, and orders with staff authentication.
- **Tables**: menu_categories, menu_items, restaurant_tables, reservations, orders, order_items

## Blueprint

- **Total Files**: 101
- **LLM Slot Files**: 26
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
- **Deterministic Issues**: 60
- **LLM Issues**: 0

## Provisioning

- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771500024970
- **Supabase**: https://scyjebeowwnyqhoafgey.supabase.co

## Learnings

### Architecture Observations
- Blueprint generates 101 files across 6 layers

### Bugs Found
(none)

### Performance Notes
- Provisioning: 2.0s
