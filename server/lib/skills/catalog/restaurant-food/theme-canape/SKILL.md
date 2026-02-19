---
name: theme-canape
description: >
  A fine dining WordPress-inspired theme with upscale aesthetic and complete restaurant feature set.
  Features elegant typography, premium card styling, and routes for menu browsing, reservations, and news.
  Includes 9-table base schema with menu items, reservations, testimonials, and more.
  Best for restaurants, fine dining establishments, and upscale food venues.
  Use when app mentions: restaurant, fine dining, upscale menu, reservations, bistro, gastronomic
category: restaurant-food
auth-posture: public
requires: []
provides: [theme-visual-identity]
env-vars: []
---

## Visual Identity

### Typography
- **display**: Playfair Display, serif
- **body**: Lato, sans-serif
- **google-fonts-url**: https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Lato:wght@400;500;700&display=swap

### Color Palette
- **background**: #fdfbf7
- **foreground**: #1a1410
- **primary**: #8b4513
- **primary-foreground**: #ffffff
- **secondary**: #d4a574
- **accent**: #c67c4e
- **muted**: #f5ede0
- **border**: #d4c5b0

### Style
- **border-radius**: 0.375rem
- **card-style**: elevated
- **nav-style**: centered
- **hero-layout**: editorial
- **spacing**: normal
- **motion**: subtle
- **imagery**: photography-heavy

### Image
- **hero-query**: luxury restaurant fine dining experience

## Routes

### Public Routes (7)
- **Homepage** (`/`) — Featured items, testimonials, services carousel
- **Menu Archive** (`/menu/`) — All menu items, category filtering
- **Menu Category** (`/menu/:category/`) — Items in selected category
- **News Archive** (`/news/`) — Blog posts and restaurant news
- **Single Post** (`/news/:slug/`) — Full post with comments
- **Static Pages** (`/:slug/`) — About, Contact, etc.
- **Reservations** (`/reservations/`) — Form to submit dinner reservations

### Admin Routes (2)
- **Manage Featured Items** (`/_authenticated/admin/entities/`) — CRUD for homepage entities
- **Manage Menu Items** (`/_authenticated/admin/menu-items/`) — CRUD for menu items with categories and pricing

## Base Schema (9 Tables)

| Table | Columns | Purpose |
|-------|---------|---------|
| **entities** | id, name, slug, description, image_url, created_at | Featured items on homepage |
| **menu_items** | id, name, description, category, price, created_at | Restaurant menu items |
| **posts** | id, title, slug, content, excerpt, featured_image, featured, published_at, comment_count, created_at | Blog/news articles |
| **comments** | id, post_id (FK), author_name, author_email, content, created_at | Post comments |
| **testimonials** | id, quote, author_name, created_at | Customer testimonials carousel |
| **services_page** | id, name, url, order_index, created_at | Services section items |
| **pages** | id, title, slug, content, created_at | Static pages |
| **site_settings** | id, contact_email, phone, address, hours_*, dinner_*, created_at | Global configuration |
| **reservations** | id, name, email, phone, party_size, date, time, requests, created_at | Dinner reservations |

## Slots
- **hero_headline**: {{hero_headline}} — One bold sentence that captures the restaurant's essence
- **hero_subtext**: {{hero_subtext}} — 10-15 word supporting line (e.g., "Experience culinary excellence")
- **about_paragraph**: {{about_paragraph}} — 2-3 sentence description of the restaurant
- **cta_label**: {{cta_label}} — Call-to-action button text (e.g., "Reserve a Table")
- **empty_state**: {{empty_state}} — Message when a list has no items
- **footer_tagline**: {{footer_tagline}} — Short footer text (e.g., restaurant tagline)

### Best For
Restaurant, Fine Dining, Menu Management, Reservations, Food & Beverage
