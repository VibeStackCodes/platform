---
name: theme-launchpad
description: >
  A dark, technical SaaS theme with monospace headings and glass-effect dashboard cards.
  Inspired by modern developer tools and analytics platforms with sidebar navigation.
  Best for SaaS dashboards, admin panels, developer tools, and analytics platforms.
  Use when app mentions: SaaS, dashboard, admin, analytics, metrics, developer, tool, platform, app, panel, CRM, management
category: saas-dashboard
auth-posture: private
requires: []
provides: [theme-visual-identity]
env-vars: []
---

## Visual Identity

### Typography
- **display**: JetBrains Mono, monospace
- **body**: IBM Plex Sans, sans-serif
- **google-fonts-url**: https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap

### Color Palette
- **background**: #0f172a
- **foreground**: #e2e8f0
- **primary**: #818cf8
- **primary-foreground**: #0f172a
- **secondary**: #1e293b
- **accent**: #6366f1
- **muted**: #1e293b
- **border**: #334155

### Style
- **border-radius**: 0.5rem
- **card-style**: glass
- **nav-style**: sidebar
- **hero-layout**: split
- **spacing**: compact
- **motion**: subtle
- **imagery**: icon-focused

### Image
- **hero-query**: tech dashboard analytics dark

## Slots
- **hero_headline**: {{hero_headline}} — One bold sentence that captures the app's purpose
- **hero_subtext**: {{hero_subtext}} — 10-15 word supporting line
- **about_paragraph**: {{about_paragraph}} — 2-3 sentence description of the app
- **cta_label**: {{cta_label}} — Call-to-action button text (2-4 words)
- **empty_state**: {{empty_state}} — Message when a list has no items
- **footer_tagline**: {{footer_tagline}} — Short footer text

### Best For
SaaS, Dashboard, Admin Panel, Developer Tools
