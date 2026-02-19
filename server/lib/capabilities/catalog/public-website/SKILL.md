---
name: public-website
description: >
  Landing page, about page, and site footer for public-facing web apps.
  Use when the app needs a marketing homepage and informational pages.
version: 1.0.0
tags:
  - core
  - marketing
  - landing
---

# Public Website Capability

## Design Guidance

### Landing Page (/)
- **Hero section**: Full-width, use the app's hero image. Display font for headline, body font for subtext. CTA button with primary color.
- **Featured section**: Show 3-6 items from the app's primary entity in a card grid. Use the capability's card style (media-heavy for visual content, text-first for articles).
- **Footer**: Site name, tagline, and navigation links. Subtle border-top or muted background.

### About Page (/about)
- **Layout**: Centered content, max-w-3xl, generous vertical spacing.
- **Content**: App description paragraph, optional team/mission section.
- **Style**: Reading-focused, body font, comfortable line height (1.7-1.8).

### Typography Defaults
- **Headings**: Display font, semibold to bold weight
- **Body**: Body font, regular weight, 1.6-1.8 line height
- **Navigation**: Display font, uppercase optional, tracking-wide

### Color Defaults
- Use CSS custom properties from index.css (--background, --foreground, --primary, etc.)
- Hero overlays: bg-black/40 to bg-black/60 over images
- Card backgrounds: var(--card) or white with subtle border
