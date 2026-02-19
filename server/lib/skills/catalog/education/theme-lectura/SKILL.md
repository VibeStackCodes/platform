---
name: theme-lectura
description: >
  A warm educational theme with readable serif headings and amber-toned accents.
  Inspired by modern learning platforms with centered layouts and illustrative imagery.
  Best for education, courses, tutorials, knowledge bases, and academic platforms.
  Use when app mentions: education, learning, course, tutorial, school, university, student, teacher, class, lesson, training
category: education
auth-posture: hybrid
requires: []
provides: [theme-visual-identity]
env-vars: []
---

## Visual Identity

### Typography
- **display**: Merriweather, serif
- **body**: Open Sans, sans-serif
- **google-fonts-url**: https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;1,400&family=Open+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap

### Color Palette
- **background**: #fffbeb
- **foreground**: #1c1917
- **primary**: #b45309
- **primary-foreground**: #ffffff
- **secondary**: #fef3c7
- **accent**: #f59e0b
- **muted**: #fef9ee
- **border**: #e7d5b2

### Style
- **border-radius**: 0.75rem
- **card-style**: elevated
- **nav-style**: top-bar
- **hero-layout**: centered
- **spacing**: normal
- **motion**: subtle
- **imagery**: illustration

### Image
- **hero-query**: education learning books classroom

## Slots
- **hero_headline**: {{hero_headline}} — One bold sentence that captures the app's purpose
- **hero_subtext**: {{hero_subtext}} — 10-15 word supporting line
- **about_paragraph**: {{about_paragraph}} — 2-3 sentence description of the app
- **cta_label**: {{cta_label}} — Call-to-action button text (2-4 words)
- **empty_state**: {{empty_state}} — Message when a list has no items
- **footer_tagline**: {{footer_tagline}} — Short footer text

### Best For
Education, Courses, Learning, Tutorials
