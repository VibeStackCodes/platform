---
name: blog
description: >
  Blog with posts, categories, and editorial reading experience.
  Use when app mentions: blog, articles, journal, writing, newsletter,
  magazine, content, stories, editorial.
version: 1.0.0
tags:
  - content
  - editorial
  - blog
---

# Blog Capability

## Design Guidance

### Visual Identity (Editorial)
Inspired by literary magazines and long-form storytelling.

**Typography**:
- Headings: Serif display font (Newsreader, Playfair Display, or Cormorant Garamond)
- Body: Serif body font for reading comfort (Source Serif 4, Lora, or Merriweather)
- Reading line-height: 1.8, max-width: 65ch for optimal readability

**Color Palette**:
- Warm paper tones: cream/ivory background (#faf9f6 to #fdfbf7)
- Rich text: near-black (#1a1a1a)
- Accent: warm amber or terracotta for links and highlights
- Muted: warm grey for metadata and secondary text

### Blog List Page (/blog)
- **Layout**: 2-column editorial grid on desktop, single column on mobile
- **Cards**: Text-first with optional featured image. Show: title (serif, large), excerpt (2-3 lines), date, category badge, author name
- **Featured post**: First post gets larger treatment, full-width card with hero image
- **Empty state**: "No posts yet. Start writing your first article."

### Blog Detail Page (/blog/$slug)
- **Layout**: Article-style centered content (max-w-prose or max-w-3xl)
- **Header**: Title in display font (text-4xl+), author + date + category below, optional hero image (full-width above title)
- **Body**: Comfortable reading typography, serif font, 1.8 line height, generous paragraph spacing
- **Navigation**: "← Back to blog" link at top, previous/next post links at bottom
