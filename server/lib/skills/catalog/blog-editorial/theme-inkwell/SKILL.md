---
name: theme-inkwell
description: >
  A refined editorial theme with serif typography and warm paper tones.
  Inspired by long-form storytelling, literary magazines, and modern editorial design.
  Best for blogs, journals, newsletters, and content-heavy publications.
  Use when app mentions: blog, editorial, journal, writing, newsletter, magazine, articles, content, stories
category: blog-editorial
auth-posture: hybrid
requires: []
provides: [theme-visual-identity]
env-vars: []
---

## Visual Identity

### Typography
- **display**: Newsreader, serif
- **body**: Source Serif 4, serif
- **google-fonts-url**: https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Source+Serif+4:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap

### Color Palette
- **background**: #faf9f6
- **foreground**: #1a1a1a
- **primary**: #c2410c
- **primary-foreground**: #ffffff
- **secondary**: #fef3c7
- **accent**: #ea580c
- **muted**: #f5f0eb
- **border**: #d6cfc7

### Style
- **border-radius**: 0.375rem
- **card-style**: bordered
- **nav-style**: editorial
- **hero-layout**: split
- **spacing**: normal
- **motion**: subtle
- **imagery**: photography-heavy

### Image
- **hero-query**: editorial desk writing workspace

## Slots
- **hero_headline**: {{hero_headline}} — One bold sentence that captures the app's purpose
- **hero_subtext**: {{hero_subtext}} — 10-15 word supporting line
- **about_paragraph**: {{about_paragraph}} — 2-3 sentence description of the app
- **cta_label**: {{cta_label}} — Call-to-action button text (2-4 words)
- **empty_state**: {{empty_state}} — Message when a list has no items
- **footer_tagline**: {{footer_tagline}} — Short footer text

### Best For
Blog, Editorial, Journal, Newsletter, Magazine
