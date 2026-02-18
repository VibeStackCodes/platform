import { describe, it, expect } from 'vitest'
import { classifyEntitySkill } from '@server/lib/skill-classifier'

describe('classifyEntitySkill', () => {
  it('returns CardGrid for recipe (storefront, no food keywords)', () => {
    const result = classifyEntitySkill('recipe', ['name', 'image_url', 'description'], 'storefront')
    expect(result.listSkill).toBe('CardGrid')
    expect(result.detailSkill).toBe('ProductDetail')
  })

  it('returns MenuGrid for dish with price column', () => {
    const result = classifyEntitySkill('dish', ['name', 'description', 'price'], 'storefront')
    expect(result.listSkill).toBe('MenuGrid')
  })

  it('returns CardGrid for storefront without food keywords even with price', () => {
    const result = classifyEntitySkill('product', ['name', 'price', 'description'], 'storefront')
    expect(result.listSkill).toBe('CardGrid')
  })

  it('returns MagazineGrid for article entity', () => {
    const result = classifyEntitySkill('article', ['title', 'body', 'published_at'], 'editorial')
    expect(result.listSkill).toBe('MagazineGrid')
    expect(result.detailSkill).toBe('ArticleReader')
  })

  it('returns AuthorProfiles for author entity', () => {
    const result = classifyEntitySkill('author', ['name', 'bio', 'avatar_url'], 'editorial')
    expect(result.listSkill).toBe('AuthorProfiles')
    expect(result.detailSkill).toBe('ProfileCard')
  })

  it('returns TransactionFeed for transaction entity with amount', () => {
    const result = classifyEntitySkill('transaction', ['amount', 'category', 'date'], 'dashboard')
    expect(result.listSkill).toBe('TransactionFeed')
    expect(result.hasDashboard).toBe(true)
  })

  it('returns DataTable for dashboard entity without transaction keywords', () => {
    const result = classifyEntitySkill('account', ['name', 'balance'], 'dashboard')
    expect(result.listSkill).toBe('DataTable')
    expect(result.hasDashboard).toBe(false)
  })

  it('returns CardGrid for kanban task entity', () => {
    const result = classifyEntitySkill('task', ['title', 'status', 'due_date'], 'kanban')
    expect(result.listSkill).toBe('CardGrid')
    expect(result.detailSkill).toBe('FormSheet')
  })

  it('returns AppointmentCard for schedule entity', () => {
    const result = classifyEntitySkill('appointment', ['title', 'scheduled_at', 'status'], 'schedule')
    expect(result.detailSkill).toBe('AppointmentCard')
  })

  it('returns DataTable fallback for unknown directory entity', () => {
    const result = classifyEntitySkill('widget', ['name', 'value'], 'directory')
    expect(result.listSkill).toBe('DataTable')
    expect(result.detailSkill).toBe('FormSheet')
    expect(result.hasDashboard).toBe(false)
  })
})
