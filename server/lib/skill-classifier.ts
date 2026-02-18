// server/lib/skill-classifier.ts
//
// Fine-grained entity skill selection within an archetype.
// More specific than DesignSpec's coarse archetype mapping —
// checks column names for disambiguation (image cols → CardGrid vs MenuGrid).

// Inline definition so this file compiles independently while design-spec.ts
// is being authored in parallel. Update to import once design-spec.ts lands.
type LayoutArchetype =
  | 'editorial'
  | 'storefront'
  | 'dashboard'
  | 'kanban'
  | 'schedule'
  | 'portfolio'
  | 'directory'

export type { LayoutArchetype }

export interface EntityLayout {
  listSkill: string
  detailSkill: string
  hasDashboard: boolean
}

/**
 * Refine the list/detail skill selection for a specific entity.
 * Called per-entity after DesignSpec archetype is known.
 *
 * @param entityName - snake_case table name
 * @param columnNames - column names available (used for disambiguation)
 * @param archetype - from DesignSpec
 */
export function classifyEntitySkill(
  entityName: string,
  columnNames: string[],
  archetype: LayoutArchetype,
): EntityLayout {
  const lower = entityName.toLowerCase()
  const hasPrice = columnNames.some(
    (c) => c.includes('price') || c.includes('cost') || c.includes('amount') || c.includes('fee'),
  )
  const hasAmount = columnNames.some(
    (c) => c.includes('amount') || c.includes('total') || c.includes('balance'),
  )

  // ── Storefront refinement ─────────────────────────────────────────────────
  if (archetype === 'storefront') {
    // Food/menu items with prices → MenuGrid (two-column menu layout)
    const isFood = ['dish', 'item', 'menu', 'food', 'meal'].some((kw) => lower.includes(kw))
    if (isFood && hasPrice) {
      return { listSkill: 'MenuGrid', detailSkill: 'ProductDetail', hasDashboard: false }
    }
    // Products/watches/books with images → CardGrid (image-first)
    return { listSkill: 'CardGrid', detailSkill: 'ProductDetail', hasDashboard: false }
  }

  // ── Editorial refinement ──────────────────────────────────────────────────
  if (archetype === 'editorial') {
    // Authors/people → AuthorProfiles
    const isPerson = ['author', 'writer', 'person', 'contributor'].some((kw) =>
      lower.includes(kw),
    )
    if (isPerson) {
      return { listSkill: 'AuthorProfiles', detailSkill: 'ProfileCard', hasDashboard: false }
    }
    return { listSkill: 'MagazineGrid', detailSkill: 'ArticleReader', hasDashboard: false }
  }

  // ── Dashboard refinement ──────────────────────────────────────────────────
  if (archetype === 'dashboard') {
    // Finance transactions → TransactionFeed with KPI widgets
    const isTransaction = ['transaction', 'expense', 'payment', 'ledger', 'invoice'].some((kw) =>
      lower.includes(kw),
    )
    if (isTransaction && hasAmount) {
      return { listSkill: 'TransactionFeed', detailSkill: 'FormSheet', hasDashboard: true }
    }
    // Generic dashboard entity (accounts, categories)
    return { listSkill: 'DataTable', detailSkill: 'FormSheet', hasDashboard: false }
  }

  // ── Kanban refinement ─────────────────────────────────────────────────────
  if (archetype === 'kanban') {
    return { listSkill: 'CardGrid', detailSkill: 'FormSheet', hasDashboard: false }
  }

  // ── Schedule refinement ───────────────────────────────────────────────────
  if (archetype === 'schedule') {
    return { listSkill: 'CardGrid', detailSkill: 'AppointmentCard', hasDashboard: false }
  }

  // ── Portfolio ─────────────────────────────────────────────────────────────
  if (archetype === 'portfolio') {
    return { listSkill: 'CardGrid', detailSkill: 'ProductDetail', hasDashboard: false }
  }

  // ── Fallback (directory) ──────────────────────────────────────────────────
  return { listSkill: 'DataTable', detailSkill: 'FormSheet', hasDashboard: false }
}
