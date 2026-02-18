---
name: layout-saas-dashboard
description: >
  High-productivity dashboard layout with dense analytics and sidebar navigation.
  Use when app mentions: SaaS, dashboard, admin, analytics, CRM, 
  management, reports, kpi, or data-heavy applications.
requires: [authentication]
provides: [sidebar-nav, kpi-cards, dashboard-layout, analytics-ui]
schema-contributions:
  - Adds metrics(id, name, value, trend, updated_at) table for KPI tracking
env-vars: []
---

## What this skill adds

### Typography & Colors (Modern SaaS)
- **Heading**: "Geist" or "Inter" (Clean, high-legibility Sans)
- **Colors**: Dark mode primary, Slate/Indigo palette, high-contrast borders.

### Components
- **Sidebar**: Collapsible navigation with secondary actions.
- **KPI Grid**: 4-column row of metrics with trend indicators.
- **Data Table (Enriched)**: Filterable, sortable, with inline actions.
- **Activity Feed**: Real-time list of events/changes.

### Layout
- **Fixed Sidebar** — Maximize screen real estate for data.
- **Bento Grid** — Grouping related metrics into clean boxes.

### Notes
Focuses on efficiency and clarity over "glamor." 
Ideal for business tools and internal platforms.
