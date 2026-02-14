import { describe, it, expect } from 'vitest';
import { generateShadcnManifest, type ComponentManifest } from '@/lib/shadcn-manifest';

describe('generateShadcnManifest', () => {
  it('returns a manifest with all registered components', () => {
    const manifest = generateShadcnManifest();
    expect(Object.keys(manifest).length).toBeGreaterThan(10);
    expect(manifest).toHaveProperty('button');
    expect(manifest).toHaveProperty('card');
    expect(manifest).toHaveProperty('input');
  });

  it('each component has import path, exports, and deps', () => {
    const manifest = generateShadcnManifest();
    const button = manifest['button'];
    expect(button.import).toBe('@/components/ui/button');
    expect(button.exports).toContain('Button');
    expect(button.deps).toBeDefined();
  });

  it('card has multiple exports', () => {
    const manifest = generateShadcnManifest();
    const card = manifest['card'];
    expect(card.exports).toContain('Card');
    expect(card.exports).toContain('CardHeader');
    expect(card.exports).toContain('CardTitle');
    expect(card.exports).toContain('CardContent');
  });

  it('serializes to JSON for agent context', () => {
    const manifest = generateShadcnManifest();
    const json = JSON.stringify(manifest);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('separates components from utility exports', () => {
    const manifest = generateShadcnManifest();
    const button = manifest['button'];
    expect(button.components).toContain('Button');
    expect(button.components).not.toContain('buttonVariants');
    expect(button.exports).toContain('buttonVariants'); // still in full exports
  });

  it('includes requires field for components with dependencies', () => {
    const manifest = generateShadcnManifest();
    const dialog = manifest['dialog'];
    expect(dialog.requires).toContain('button');
  });
});
