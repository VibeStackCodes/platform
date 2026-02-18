# App 10: Restaurant Management System (hospitality)

**Date**: 2026-02-18
**Prompt Complexity**: Medium
**Vercel URL**: N/A
**Total Duration**: 5.2s
**Total Tokens**: 0 (~$0.0000)

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


## Design Choices (from analyst)

Failed

## Blueprint

Failed

## Code Generation

Failed

## Validation

Failed

## Code Review

Skipped

## Provisioning

Failed

## Learnings

### Architecture Observations
(none)

### Bugs Found
- Pipeline failed: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.

### Performance Notes
(none)
