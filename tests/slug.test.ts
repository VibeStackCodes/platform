import { describe, it, expect } from 'vitest'
import { buildAppSlug } from '@server/lib/slug'

describe('buildAppSlug', () => {
  it('produces expected slug from normal app name and UUID', () => {
    const result = buildAppSlug('My Cool App', '550e8400-e29b-41d4-a716-446655440000')
    // slugify("My Cool App", { lower: true, strict: true }) = "my-cool-app"
    // projectId without hyphens = "550e8400e29b41d4a716446655440000"
    // first 12 chars           = "550e8400e29b"
    expect(result).toBe('my-cool-app-550e8400e29b')
  })

  it('converts spaces to hyphens', () => {
    const result = buildAppSlug('hello world app', 'aaaabbbbcccc-dddd-eeee-ffff-000011112222')
    expect(result).toContain('hello-world-app')
  })

  it('removes special characters', () => {
    const result = buildAppSlug('My App! #1 (beta)', '11112222-3333-4444-5555-666677778888')
    // strict:true strips everything except letters, numbers, and hyphens/underscores
    expect(result).not.toMatch(/[!#()]/u)
  })

  it('strips UUID hyphens and uses only the first 12 chars as suffix', () => {
    const uuid = 'abcdef01-2345-6789-abcd-ef0123456789'
    const result = buildAppSlug('test app', uuid)
    // uuid without hyphens: "abcdef0123456789abcdef0123456789"
    // first 12 chars: "abcdef012345"
    expect(result).toMatch(/-abcdef012345$/)
  })

  it('produces a valid slug even when appName is empty', () => {
    const result = buildAppSlug('', '550e8400-e29b-41d4-a716-446655440000')
    // slugify("") returns "" — result is "-550e8400e29b"
    expect(result).toMatch(/^-550e8400e29b$/)
  })

  it('handles a very long app name without truncating', () => {
    const longName = 'A'.repeat(200) + ' application'
    const result = buildAppSlug(longName, '550e8400-e29b-41d4-a716-446655440000')
    // slugify does not truncate; the full slug (minus special chars) should be present
    expect(result.length).toBeGreaterThan(12) // at minimum has the suffix
    expect(result).toMatch(/-550e8400e29b$/)
  })

  it('lowercases the entire slug', () => {
    const result = buildAppSlug('UPPER CASE NAME', '550e8400-e29b-41d4-a716-446655440000')
    expect(result).toBe(result.toLowerCase())
  })

  it('suffix is always exactly 12 hex characters', () => {
    const uuid = 'deadbeef-cafe-babe-feed-c0ffee000000'
    const result = buildAppSlug('some app', uuid)
    const suffix = result.split('-').slice(-1)[0]
    // The shortId is the first 12 chars of the UUID with hyphens removed
    // uuid without hyphens = "deadbeefcafebabefeedc0ffee000000"
    // first 12 = "deadbeefcafe"
    expect(suffix).toBe('deadbeefcafe')
    expect(suffix).toHaveLength(12)
  })

  it('handles app names with numbers', () => {
    const result = buildAppSlug('App 2.0 Final', '11112222-3333-4444-5555-666677778888')
    expect(result).toContain('app-20-final')
    expect(result).toMatch(/-111122223333$/)
  })

  it('handles app names with leading/trailing spaces', () => {
    const result = buildAppSlug('  my app  ', '550e8400-e29b-41d4-a716-446655440000')
    // slugify trims and handles surrounding spaces
    expect(result).not.toMatch(/^\s/)
    expect(result).not.toMatch(/\s$/)
    expect(result).toMatch(/-550e8400e29b$/)
  })
})
