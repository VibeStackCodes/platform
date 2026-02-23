# VibeStack — Test Prompt Suite

> **30 user prompts across all page types.** These are what real users would type into VibeStack. Feed each one to the system prompt and evaluate output quality. Prompts are graded by specificity: 🟢 Vague, 🟡 Medium, 🔴 Extremely Detailed.

---

## LANDING PAGES

### LP-01 🟢 Vague
```
Landing page for an AI writing tool
```

### LP-02 🟢 Vague
```
I need a page for my new hot sauce brand. We just launched.
```

### LP-03 🟡 Medium
```
Build a landing page for "Kōan" — a meditation app for busy founders. It's subscription-based, $12/month. The vibe is calm but not boring. We have 14,000 users and a 4.9 star rating on the App Store. Include a hero, features section, testimonials, and pricing.
```

### LP-04 🟡 Medium
```
Landing page for a fintech startup called Vault that helps freelancers manage quarterly tax payments. Our users are designers, developers, and writers in the US. Key features: automatic income categorisation, real-time tax liability tracker, one-click estimated payment filing. We integrate with Stripe, Mercury, and QuickBooks. Need a hero, how-it-works section, integrations bar, feature deep-dive, social proof, and a waitlist CTA.
```

### LP-05 🔴 Extremely Detailed
```
Build a landing page for "Terroir" — a premium wine subscription that sources directly from small-batch European vineyards. The target audience is urban professionals aged 28-45 who care about provenance but don't want to feel intimidated by wine culture. Tone is knowledgeable but never pretentious.

Design direction: editorial magazine aesthetic inspired by Cereal Magazine and Kinfolk. Light, warm, and airy — NOT the typical dark/moody wine brand look.

Colours:
- Background: #FAF7F2 (warm off-white, like aged paper)
- Primary text: #2C2420 (dark espresso)
- Accent: #8B4513 (saddle brown, used sparingly for CTAs and highlights)
- Secondary: #C9B99A (muted gold for dividers and subtle details)
- Card backgrounds: #FFFFFF with a subtle 1px #E8E0D4 border

Typography: "Instrument Serif" for headlines (large, elegant), "Source Sans 3" for body text.

Layout: Single-column editorial scroll with generous whitespace. Full-bleed photography alternating left and right with text. No card grids anywhere.

Sections needed:
1. Hero — Full viewport. Large serif headline "Every bottle tells a story of somewhere." Subtext about the service. Single CTA "Explore this month's collection". Background: wide landscape photo of a vineyard at golden hour.
2. How it works — Three-step editorial layout (Discover → Taste → Learn). Each step gets a half-page image and a short paragraph. Vertical flow, not horizontal cards.
3. This month's selection — Showcase 3 wines with: region, grape variety, tasting notes, food pairing, and a portrait-oriented bottle/vineyard photo for each. Laid out as a magazine spread.
4. From the vintners — Two pull-quote testimonials from actual winemakers (invent realistic French/Italian names and vineyards). Include small portrait photos.
5. Membership details — $79/month for 3 bottles, $149/month for 6 bottles. Free shipping. Cancel anytime. Present as elegant typography, not a pricing card grid.
6. Footer — Minimal. "Must be 21+ to purchase. Terroir © 2025." Links to Instagram, terms, privacy.

Signature detail: As the user scrolls, each wine bottle section should have a subtle parallax effect where the image moves slightly slower than the text, creating depth. The section transitions should use a soft fade-in triggered by scroll position.

Images should feel editorial — natural light, shallow depth of field, European countryside. Never use stock-looking "wine glass on table" shots. Think vineyard landscapes, close-ups of hands harvesting grapes, a winemaker examining a barrel, a rustic stone cellar with bottles.
```

### LP-06 🔴 Extremely Detailed
```
Build a landing page for "Basecamp Zero" — a coworking space for climate tech startups in Brooklyn Navy Yard. This is not a WeWork clone. Our members are building hardware prototypes, running wet labs, and testing materials. We have workshop bays, 3D printing stations, a shared soldering lab, and traditional desk space. 80% occupied, 34 member companies, 3 companies have gone on to raise Series A.

Design direction: industrial-utilitarian meets neo-brutalist. Think exposed concrete, steel beams, raw textures. This should feel like walking into a workshop, not a SaaS website.

Colours:
- Background: #0C0C0C (near-black)
- Primary text: #E8E4DD (warm off-white)
- Accent: #FF5722 (safety orange — like warehouse floor markings)
- Secondary: #3A3A3A (dark grey for cards and sections)
- Tertiary: #FFB300 (amber, used only for status indicators and small highlights)

Typography: "Space Mono" for headlines and navigation (monospaced, industrial feel). "DM Sans" for body text (clean readability against dark backgrounds).

Layout: Asymmetric grid with deliberate alignment breaks. Some sections should feel like a pinboard or a workshop wall — slightly overlapping elements, rotated labels, raw edges.

Sections:
1. Hero — Full bleed dark background. Headline in Space Mono: "Where climate tech gets built." Below: a live-updating ticker showing "34 member companies · 3 Series A alumni · 12,000 sq ft of workshop space". CTA: "Book a tour" in safety orange. Hero image: wide-angle shot of a workshop space with tools, prototypes, and people working.
2. The space — Bento grid of 6 images showing: workshop bay, 3D printers, soldering stations, desk area, meeting room, rooftop. Each image has a small monospace label overlaid (e.g., "WORKSHOP BAY 01", "FABRICATION LAB"). Images should feel candid and real, not staged.
3. Who's here — Horizontal scrolling carousel of member company cards. Each card: company name, one-line description, and a category tag (Hardware, Biotech, Materials, Energy). Use dark cards with orange accent borders.
4. Membership tiers — "Hot Desk" $450/mo, "Dedicated Desk" $750/mo, "Workshop Bay" $1,800/mo. Present as a stark typographic comparison, not rounded pricing cards. Include what's in each tier.
5. From our members — Two testimonials. Make them sound like real founders, not marketing copy. Include their company name and what they build.
6. Location + CTA — "Brooklyn Navy Yard, Building 128" with a dark-styled map area. Final CTA: "Book a tour" with a simple form (name, email, company, what are you building).
7. Footer — Minimal. Social links (Instagram, LinkedIn). "Open Mon-Sat 7am-11pm."

Signature detail: The section headers should use a typewriter-style character reveal animation on scroll, as if being typed in real time. Each character appears sequentially over 800ms with a monospace cursor blink.
```

---

## SPA / DASHBOARD

### DASH-01 🟢 Vague
```
A project management dashboard
```

### DASH-02 🟢 Vague
```
Analytics dashboard for a podcast
```

### DASH-03 🟡 Medium
```
Build a CRM dashboard for a small recruiting agency. They manage about 200 active candidates at any time across 15-20 open roles. Needs a pipeline view (columns: sourced, screening, interview, offer, hired, rejected), candidate cards with name and current stage, a search bar, and basic stats at the top (total candidates, open roles, interviews this week, offers pending). Dark theme.
```

### DASH-04 🟡 Medium
```
SPA for a personal finance tracker. The user logs monthly income and expenses across categories (housing, food, transport, subscriptions, savings, misc). Show a monthly summary with a donut chart for spending breakdown, a line chart for income vs expenses over the past 6 months, a transaction list with category tags, and an "add transaction" modal. Pre-populate with 3 months of realistic sample data. Clean, calm aesthetic — no flashy colours.
```

### DASH-05 🔴 Extremely Detailed
```
Build an internal operations dashboard for "Meridian Logistics" — a mid-size freight company managing 85 trucks across the US Northeast corridor. This is used by dispatch managers on 24" monitors in a control room.

Design direction: dashboard-dense, inspired by Bloomberg Terminal and Linear. Information-rich but never cluttered. Every pixel should serve a purpose.

Colours:
- Background: #09090B (zinc-950)
- Surface/cards: #18181B (zinc-900)
- Borders: #27272A (zinc-800)
- Primary text: #FAFAFA (zinc-50)
- Secondary text: #A1A1AA (zinc-400)
- Status green: #22C55E (active/on-time)
- Status amber: #EAB308 (delayed/warning)
- Status red: #EF4444 (critical/breakdown)
- Accent blue: #3B82F6 (interactive elements, links)

Typography: "Geist Mono" for data values and status codes. "Geist" for labels and navigation.

Layout: Sidebar (240px, collapsible) + main content area. Sidebar has: logo, nav items (Fleet Overview, Routes, Drivers, Alerts, Reports), and a user avatar at the bottom. Main area uses a 12-column grid.

Dashboard view (default):
- Top bar: 4 metric cards in a row:
  · Trucks Active: 72/85 (with a tiny spark line showing 7-day trend)
  · On-Time Rate: 94.2% (green)
  · Deliveries Today: 148 (with completed/remaining breakdown)
  · Active Alerts: 3 (red badge if > 0)
- Middle section, left (8 cols): Fleet status table with columns: Truck ID, Driver, Route, Status (On Route/Loading/Idle/Maintenance), ETA, Last Update. 15 rows of realistic sample data. Sortable columns. Row hover highlight. Status uses coloured dot indicators.
- Middle section, right (4 cols): Alerts panel. Show 3 alerts with severity indicators:
  · "Truck MER-042 — Engine warning light, I-95 NB mile 134" (red)
  · "Route BOS-NYC delayed 45min — traffic incident" (amber)
  · "Driver J. Morrison approaching 10hr limit" (amber)
  Each alert has a timestamp and a "View" button.
- Bottom section: Area chart (recharts) showing deliveries completed per hour over the past 24 hours. X-axis: hours. Y-axis: delivery count. Gradient fill under the line.

Sidebar nav should highlight the active item with a left border accent in blue. Hovering other items shows a subtle zinc-800 background.

Signature detail: The metric cards should have a subtle count-up animation on load — numbers tick up from 0 to their final value over 1.2 seconds with an ease-out curve.
```

---

## SIMPLE APPS / TOOLS

### APP-01 🟢 Vague
```
Build me a pomodoro timer
```

### APP-02 🟢 Vague
```
A tip calculator
```

### APP-03 🟡 Medium
```
Build a colour palette generator. The user clicks a button and gets 5 random harmonious colours. Each colour shows its hex code, RGB values, and a copy-to-clipboard button. There should be a "lock" toggle on each colour so locked colours persist when regenerating. Include a colour-blind simulation toggle that shows how the palette looks under protanopia. Dark UI.
```

### APP-04 🟡 Medium
```
Build a markdown note-taking app. Left sidebar shows a list of notes with titles and last-edited dates. Main area is a split view: markdown editor on the left, live preview on the right. Include a "new note" button, the ability to delete notes, and local state management (no persistence needed, just in-memory). Pre-populate with 3 sample notes. Support headings, bold, italic, links, code blocks, and lists in the preview renderer.
```

### APP-05 🔴 Extremely Detailed
```
Build a "Contract Value Calculator" for freelance designers. The tool helps them price projects by breaking down scope into components and applying hourly rates.

The user flow:
1. Enter their hourly rate (default: $125)
2. Add line items from predefined categories:
   - Discovery & Research (default: 8 hours)
   - Wireframing (default: 12 hours)
   - Visual Design (default: 20 hours)
   - Prototyping (default: 10 hours)
   - Revisions (default: 8 hours)
   - Project Management (default: 6 hours)
   - Client Meetings (default: 4 hours)
3. Each line item has: category name, estimated hours (editable), calculated cost
4. Below the line items: subtotal, a "complexity multiplier" slider (1.0x to 2.0x with 0.1 steps, default 1.0), a "rush fee" toggle (+25%), and the final total
5. A "Generate Proposal Summary" button that produces a formatted text block they can copy

Design direction: warm-neutral, slightly playful. Inspired by Notion's aesthetic — clean but with personality. NOT corporate or finance-looking.

Colours:
- Background: #FFFBF5 (warm cream)
- Cards/surfaces: #FFFFFF with a 1px #E8DFD1 border
- Primary text: #1A1A1A
- Secondary text: #6B6560
- Accent: #E16A30 (warm terracotta orange for CTAs and active states)
- Success: #2D8A56 (the final total number)
- Subtle highlight: #FFF3E6 (light peach for hover states and selected rows)

Typography: "Cabinet Grotesk" for headings. "Source Sans 3" for body and data.

Signature detail: When the user adjusts the complexity multiplier slider, the final total should animate smoothly (number ticking up/down) and the total's font size should subtly pulse larger for 200ms to draw attention to the change.
```

---

## PORTFOLIO / PERSONAL SITE

### PORT-01 🟢 Vague
```
Portfolio site for a photographer
```

### PORT-02 🟢 Vague
```
Personal website. I'm a product designer.
```

### PORT-03 🟡 Medium
```
Build a portfolio for "Lena Vasquez" — a brand identity designer based in Mexico City. She works with independent food and beverage brands. Show 6 projects in a masonry grid layout with hover effects that reveal project names. Include a short bio section, a "selected clients" text list, and a contact section with just an email link and Instagram handle. The whole thing should feel like a curated gallery, not a resume.
```

### PORT-04 🔴 Extremely Detailed
```
Build a personal site for "Aiden Cross" — a creative technologist who works at the intersection of generative art, physical computing, and spatial design. He builds interactive installations for museums and brand experiences. Based in London. Previously at Universal Everything and teamLab.

Design direction: dark, immersive, slightly experimental. Inspired by Refik Anadol's website and Hoverstat.es showcases. The site itself should feel like a digital installation.

Colours:
- Background: #050505 (near-black)
- Primary text: #F0EDE8 (warm light)
- Accent: #00FFB2 (electric mint green — used for links, hover states, and the cursor trail)
- Secondary text: #6B6B6B
- Card hover: #111111

Typography: "Syne" for headings (bold, slightly unusual character shapes). "IBM Plex Mono" for body, captions, and metadata.

Layout: Full-screen sections, each project gets its own viewport-height panel. Vertical scroll navigation. No traditional grid — each project uses a different layout composition to feel curated.

Sections:
1. Intro — Full viewport. Just his name in large Syne type, a one-line descriptor "Creative Technologist · Interactive Installations · London", and a subtle downward scroll indicator. Background: slow-moving generative pattern (CSS animation with floating gradient orbs or a grid that subtly shifts).
2. Selected Work — 5 projects, each in a full-viewport section:
   - "Tidal Memory" — data sculpture for the V&A that visualises Thames water levels
   - "Pulse Room" — LED installation responding to visitors' heartbeats at Barbican
   - "Seed" — generative projection mapping on the facade of Kew Gardens' Palm House
   - "Haptic Frequencies" — tactile sound installation for Audi at Milan Design Week
   - "Cloud Atlas" — real-time weather data sculpture, permanent collection at Science Museum
   Each project: title, year, client/venue, one-sentence description, and a full-width atmospheric image. On hover, the image should scale up slightly (1.02x) with a slow ease.
3. About — Short paragraph bio (3-4 sentences). List of tools/technologies: TouchDesigner, openFrameworks, Arduino, Raspberry Pi, Ableton, Blender. Previous: Universal Everything, teamLab, RCA graduate.
4. Contact — Minimal. Email, Instagram, Are.na links. Rendered in monospace.

Signature detail: Custom cursor — replace the default cursor with a small mint-green (#00FFB2) dot that has a trailing glow effect (a larger, fading circle that follows with slight delay). When hovering over projects, the dot expands to a larger ring.
```

---

## E-COMMERCE

### ECOM-01 🟢 Vague
```
Online store for handmade candles
```

### ECOM-02 🟢 Vague
```
Build a product page for a pair of sneakers
```

### ECOM-03 🟡 Medium
```
E-commerce storefront for "Provisions" — a small-batch pantry goods brand. They sell 12 products: olive oils, vinegars, honey, preserved lemons, spice blends, etc. Need a product grid with photos, names, prices, and quick-add buttons. Include a filter by category (Oils, Vinegars, Preserves, Spices), a cart sidebar that slides in from the right, and a minimal header with logo, cart icon with item count badge, and a single "Our Story" link. Earthy, warm aesthetic.
```

### ECOM-04 🟡 Medium
```
Build a single product detail page for a high-end mechanical keyboard called "Ghost 75". Price: $289. Wireless, hot-swappable switches, aluminium case, per-key RGB. Available in 3 colourways: Arctic White, Gunmetal, and Midnight. Show a large product image area, colour selector with swatches, key specs in a clean layout, 3 customer reviews, and an add-to-cart button with quantity selector. The design should feel like it belongs on the Apple Store or Nothing's website.
```

### ECOM-05 🔴 Extremely Detailed
```
Build an e-commerce storefront for "Matière" — a direct-to-consumer minimalist furniture brand. Think HAY meets Muji. They sell 8 products across 3 categories: Seating (2 chairs, 1 stool), Tables (2 tables), and Lighting (2 lamps, 1 pendant).

Invent realistic product names, materials, dimensions, and prices ($200-$1,400 range). Each product should have a primary material (oak, walnut, steel, brass, linen) and a Japanese-inspired name.

Design direction: luxury minimal, heavily influenced by Aesop's website and Kinfolk magazine. Maximum whitespace. Let the products breathe.

Colours:
- Background: #FFFFFF
- Secondary background: #F5F0EB (warm stone, for alternating sections)
- Primary text: #1A1714 (near-black, warm)
- Secondary text: #8C8279 (warm grey)
- Accent: #1A1714 (black — CTAs are black buttons with white text, no colour accent)
- Hover states: underline reveals, not colour changes
- Cart badge: #C4553A (terracotta, the only spot of colour on the entire page)

Typography: "Instrument Serif" for product names and section headlines. "Outfit" for body, navigation, prices, and UI elements.

Layout: Generous whitespace everywhere. Product grid uses large images (3:4 aspect ratio) with the product name and price below in small, elegant type. Two columns on desktop, one on mobile. No borders, no shadows, no cards — just products floating on the white page.

Product grid behaviour:
- Default view: all 8 products
- Category filter as text links at the top: "All · Seating · Tables · Lighting" (underline active)
- Hover on product: image scales to 1.03x, product name underlines
- Click opens an expanded product detail inline (pushes content down, no modal) showing: larger image, full description, material, dimensions, "Add to bag" button

Cart:
- Slide-in panel from the right (320px wide)
- Shows added items with name, quantity stepper, and price
- Subtotal at bottom
- "Checkout" button (black, full width)
- "Continue shopping" text link below
- If empty: "Your bag is empty" with a "Continue shopping" link

Header: Logo ("MATIÈRE" in tracked-out Outfit caps) on the left. Nav links: "Collection", "About", "Stockists". Cart icon with terracotta badge on the right. Sticky on scroll with a 1px bottom border that appears after scrolling past the hero.

Hero: Full-width image (a styled room scene — think "minimal apartment living room scandinavian oak furniture natural light"). Overlaid text: "Designed for stillness." and a "View collection" link. No buttons — just an underlined text link.

Footer: Three columns. Col 1: "MATIÈRE" + one sentence about the brand. Col 2: links (Collection, About, Stockists, Shipping, Returns). Col 3: Newsletter signup (email input + "Subscribe" button). Below: "© 2025 Matière. All pieces ship flat-pack from Osaka."

Signature detail: When a product is added to the cart, the cart icon in the header should do a subtle bounce animation (scale 1 → 1.2 → 1, 300ms ease) and the terracotta badge count should increment with a fade-in-up micro-animation.
```

---

## EDGE CASES / CREATIVE PROMPTS

### EDGE-01 🟢 Vague — Ambiguous intent
```
Something cool for my band
```

### EDGE-02 🟡 Medium — Non-English business context
```
Landing page for "Nami Ramen" — a ramen restaurant in Melbourne, Australia. They do dine-in only, no delivery. Open Wednesday to Sunday, 11:30am-2:30pm and 5:30pm-9:30pm. Known for their tonkotsu broth. Build something that makes people hungry.
```

### EDGE-03 🟡 Medium — Abstract/artistic
```
Build an interactive digital clock that displays time in an unconventional way. Not just numbers — reimagine how time can be shown visually. Make it beautiful enough to leave running on a second monitor.
```

### EDGE-04 🔴 Extremely Detailed — Event/conference
```
Build a single-page site for "Substrate 2026" — a one-day conference on the future of physical computing, hosted in an old warehouse in Eindhoven, Netherlands. Date: September 12, 2026. Capacity: 300 people. Ticket price: €249 early bird, €349 regular.

The conference sits at the intersection of hardware engineering, interaction design, and creative coding. Speakers include people from Arduino, Teenage Engineering, MIT Media Lab, and RNDR. Invent 6 realistic speaker names with titles and talk topics.

Design direction: retro-futuristic meets industrial. Inspired by Teenage Engineering's graphic design and Dieter Rams' principles. Monochromatic with one accent colour.

Colours:
- Background: #F2F0ED (light warm grey)
- Primary text: #1C1C1C
- Accent: #FF3D00 (bright red-orange — used for CTAs, speaker time slots, and the ticket button only)
- Secondary: #9E9E9E (grey for metadata and secondary info)
- Cards: #FFFFFF with no shadow, just a 1px #DDDBD7 border

Typography: "Space Grotesk" for everything. Headings at 600 weight, body at 400. All navigation and labels in uppercase with letter-spacing: 0.1em.

Sections:
1. Hero — Conference name in very large type (80px+), date, location, and a single "Get tickets" button in accent colour. No image — just bold typography on the warm grey background. A thin horizontal rule below.
2. About — 3 sentences about the conference vision. Below: three info blocks in a row — "1 Day", "6 Talks", "300 Makers" — in large type.
3. Speakers — 6 speaker cards in a 3x2 grid. Each card: name, role/company, talk title, and a small headshot. Cards have the white background with border treatment. On hover, the accent colour underlines the talk title.
4. Schedule — Simple timeline. Show: 9:00 Registration, 9:30-10:15 Talk 1, 10:15-10:30 Break, etc. through 6 talks and a closing party at 18:00. Left-aligned, clean typographic layout. Time in accent colour. Speaker name in bold. Talk title in regular weight.
5. Venue — "Strijp-S, Eindhoven" with a brief description of the warehouse venue. Full-width atmospheric image of an industrial event space.
6. Tickets — Two options side by side: Early Bird (€249, available until June 30) and Regular (€349). Each has a "Buy ticket" button. Below: "Group discounts available for 5+ tickets — hello@substrate.events"
7. Footer — "Substrate 2026 · Eindhoven · September 12" and links to Twitter, Instagram, and email.

Signature detail: The schedule section should have a thin vertical red-orange (#FF3D00) line running down the left side connecting all time slots, with small dots at each talk start time. The line should draw itself on scroll (animating stroke-dashoffset via CSS).
```

---

## EVALUATION CRITERIA

When testing these prompts against the system prompt, score each output on:

| Criterion | What to look for | Fail signal |
|---|---|---|
| **Design coherence** | Does it look like ONE designer made it? Consistent palette, type, spacing. | Mixed aesthetics, inconsistent spacing, random colour choices |
| **Content quality** | Is the copy believable and specific? | Lorem ipsum, "[Your text here]", generic "Welcome to Our Platform" |
| **Image relevance** | Do image queries match the section context and page aesthetic? | "business team" for every section, wrong aspect ratios, missing atmosphere cues |
| **Interactivity** | Do buttons, hovers, and interactions actually work? | onClick={() => {}} empty handlers, no hover states |
| **Responsiveness** | Does it work at 375px and 1440px? | Horizontal overflow, overlapping text, broken layouts on mobile |
| **Distinctiveness** | Would you mistake this for a different generation? | Same purple gradient, Inter font, centered card grid as every other output |
| **Code quality** | Clean separation: data → state → render? No unused imports? | Mixed inline styles and Tailwind, console.logs, dead code |
| **Vague prompt handling** | For 🟢 prompts: did it invent a compelling concept? | Minimal effort output, asked clarifying questions instead of building |
| **Specification adherence** | For 🔴 prompts: did it follow the exact colours, fonts, and layout? | Ignored specified hex codes, substituted different fonts, skipped sections |
