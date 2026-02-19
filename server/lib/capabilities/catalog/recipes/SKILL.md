---
name: recipes
description: >
  Recipe catalog with ingredients, cook times, and food photography.
  Use when app mentions: recipes, cooking, food, meals, ingredients,
  cookbook, culinary, restaurant, cafe, bakery, menu, kitchen, chef.
version: 1.0.0
tags:
  - content
  - food
  - recipes
---

# Recipes Capability

## Design Guidance

### Visual Identity (Warm & Inviting)
Inspired by upscale dining and food editorial photography.

**Typography**:
- Headings: Elegant serif (Cormorant Garamond, Playfair Display)
- Body: Clean sans-serif (Lato, Inter) for recipe instructions
- Recipe titles should feel warm and inviting, not clinical

**Color Palette**:
- Warm cream background (#fdfbf7 to #fffbeb)
- Deep warm brown/charcoal text (#292524)
- Accent: amber, burnt orange, or warm red (#d97706, #9a3412)
- Muted: warm sand tones for card backgrounds

### Recipe List Page (/recipes)
- **Layout**: Media-heavy card grid, 2-3 columns, large aspect-ratio images (4:3)
- **Cards**: Photo-forward with image taking 60%+ of card. Title in serif, metadata badges below (cook time, servings, difficulty). Hover: subtle scale(1.02) + shadow elevation.
- **Featured recipe**: First item gets hero treatment, full-width with dark overlay text
- **Search/filter**: By tag, difficulty, cook time

### Recipe Detail Page (/recipes/$id)
- **Layout**: Full-width hero image (max-height 60vh), recipe title in display font, structured content below
- **Metadata**: Prep time, cook time, servings, difficulty as icon+text badges in a row
- **Ingredients**: Sidebar on desktop (sticky), or collapsible section on mobile. Checklist style.
- **Instructions**: Numbered steps with generous spacing. Clean, readable.
- **Photography**: Use Unsplash food imagery. Search query: specific to the recipe type.

### Card Style
Media-heavy: image takes up most of the card. Rounded corners (0.75rem). Warm shadow on hover.
