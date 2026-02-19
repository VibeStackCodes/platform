---
name: auth
description: >
  Authentication and user profiles using Supabase Auth.
  Provides login, signup, and profile management.
version: 1.0.0
tags:
  - core
  - authentication
---

# Auth Capability

## Design Guidance

Auth pages use Supabase Auth UI components. The polish agent should NOT rewrite auth pages.

### Profile Page
If a profile page exists, style it with:
- Centered card layout (max-w-md mx-auto)
- Avatar circle at top
- Display name in heading font
- Clean form for profile editing
