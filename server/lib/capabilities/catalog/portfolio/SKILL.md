---
name: portfolio
description: >
  Portfolio showcase with projects, skills, and testimonials.
  Use when app mentions: portfolio, projects, work, showcase, gallery,
  photography, art, creative, freelancer, agency.
version: 1.0.0
tags:
  - creative
  - portfolio
  - gallery
---

# Portfolio Capability

## Design Guidance

### Visual Identity (Gallery / Dramatic)
Inspired by fine art galleries and photographer portfolios.

**Typography**:
- Headings: Bold sans-serif (Syne, Space Grotesk, or Inter Tight), all caps optional for nav
- Body: Clean sans-serif (Work Sans, Inter), minimal and image-forward
- Keep text minimal, this is a visual-first layout

**Color Palette**:
- Option A (Dark): Near-black background (#111111), white text (#fafafa), minimal accent
- Option B (Light): Clean white background, dark text, high-contrast images
- Let photography provide the color, keep UI chrome minimal
- Borders: subtle or none, use spacing to separate elements

### Project List Page (/work)
- **Layout**: Full-bleed image grid, minimal chrome. Masonry or uniform grid (columns-2 md:columns-3).
- **Cards**: Image-only with hover overlay revealing title + category. No card borders or shadows.
- **Interaction**: Hover reveals text on semi-transparent dark overlay (bg-black/60, text-white). Smooth transition.
- **Search**: Minimal or hidden, category filter tabs preferred.

### Project Detail Page (/work/$id)
- **Layout**: Full-width hero image (100vh or 70vh), project title below, description in clean sans-serif, optional image gallery
- **Metadata**: Minimal, project type, year, technologies used. Displayed as subtle tags.
- **Navigation**: Back arrow or "All Projects" link. Previous/next project navigation at bottom.

### Testimonials
- **Style**: Large quote text in italic display font. Author name + title below. Clean card with generous padding.
- **Layout**: Single column, centered, or 2-column grid on desktop.
