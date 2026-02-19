---
name: theme-folio
description: >
  A clean, expressive portfolio theme with geometric sans-serif typography and bold motion.
  Inspired by modern creative studios and designer portfolios with fullbleed imagery.
  Best for portfolios, creative agencies, design showcases, and personal brand sites.
  Use when app mentions: portfolio, creative, design, agency, showcase, gallery, freelance, studio, brand
category: portfolio-creative
auth-posture: public
requires: []
provides: [theme-visual-identity]
env-vars: []
---

## Visual Identity

### Typography
- **display**: Space Grotesk, sans-serif
- **body**: Inter, sans-serif
- **google-fonts-url**: https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap

### Color Palette
- **background**: #ffffff
- **foreground**: #111111
- **primary**: #6366f1
- **primary-foreground**: #ffffff
- **secondary**: #e0e7ff
- **accent**: #8b5cf6
- **muted**: #f1f5f9
- **border**: #e2e8f0

### Style
- **border-radius**: 0.5rem
- **card-style**: flat
- **nav-style**: minimal
- **hero-layout**: fullbleed
- **spacing**: airy
- **motion**: expressive
- **imagery**: photography-heavy

### Image
- **hero-query**: creative portfolio design studio

## Slots
- **hero_headline**: {{hero_headline}} — One bold sentence that captures the app's purpose
- **hero_subtext**: {{hero_subtext}} — 10-15 word supporting line
- **about_paragraph**: {{about_paragraph}} — 2-3 sentence description of the app
- **cta_label**: {{cta_label}} — Call-to-action button text (2-4 words)
- **empty_state**: {{empty_state}} — Message when a list has no items
- **footer_tagline**: {{footer_tagline}} — Short footer text

### Best For
Portfolio, Creative, Design Agency, Showcase
