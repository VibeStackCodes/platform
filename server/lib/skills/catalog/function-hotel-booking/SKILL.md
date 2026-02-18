---
name: function-hotel-booking
description: >
  Full-fledged room booking system for hotels, rentals, or travel sites.
  Adds rooms, availability management, search, and reservation workflows.
  Use when app mentions: hotel, resort, booking, reservation, rooms, stay, 
  travel agency, or property rental.
requires: [authentication]
provides: [booking-logic, availability-schema, room-ui]
schema-contributions:
  - Adds rooms(id, name, type, base_price, capacity, description, image_url) table
  - Adds bookings(id, room_id, user_id, check_in, check_out, total_price, status) table
  - Adds room_availability(id, room_id, date, is_booked) table for fast lookups
env-vars: []
---

## What this skill adds

### Database (Booking Engine)
- `rooms` — Catalog of available accommodations.
- `bookings` — Reservation records linked to users.
- `room_availability` — Date-indexed availability for fast search.

### Pages & Components (GoTrek Inspired)
- **Room Search** — Date-range picker with availability filtering.
- **Room Detail** — High-end editorial page with amenities and booking form.
- **My Reservations** — Dashboard for guests to manage their stays.

### Pricing Logic
- Dynamic total price calculation (Base Price x Nights).
- Support for seasonal rate adjustments (Phase 2).

### Notes
This skill provides the core logic and UI for any "Stay" based application.
Requires the 'authentication' skill to associate bookings with users.
