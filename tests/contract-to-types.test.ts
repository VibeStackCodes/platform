// tests/contract-to-types.test.ts
import { describe, it, expect } from 'vitest';
import { contractToTypes } from '@/lib/contract-to-types';
import type { SchemaContract } from '@/lib/schema-contract';

describe('contractToTypes', () => {
  it('generates Supabase Database type with Row/Insert/Update', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'profiles',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'display_name', type: 'text', nullable: false },
          { name: 'bio', type: 'text' },
          { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        ],
      }],
    };
    const ts = contractToTypes(contract);

    // Row type has all columns
    expect(ts).toContain('id: string');
    expect(ts).toContain('display_name: string');
    expect(ts).toContain('bio: string | null');
    expect(ts).toContain('created_at: string');

    // Insert type: columns with defaults are optional
    expect(ts).toContain('Insert:');
    expect(ts).toContain('id?: string'); // has default

    // Update type: all optional
    expect(ts).toContain('Update:');

    // Structural checks
    expect(ts).toContain('export type Database =');
    expect(ts).toContain('Tables:');
    expect(ts).toContain('profiles:');
  });

  it('generates enum types', () => {
    const contract: SchemaContract = {
      enums: [{ name: 'status', values: ['active', 'inactive'] }],
      tables: [{
        name: 'items',
        columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
      }],
    };
    const ts = contractToTypes(contract);
    expect(ts).toContain('Enums:');
    expect(ts).toContain("status: 'active' | 'inactive'");
  });

  it('maps SQL types to TypeScript types correctly', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'test',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'count', type: 'numeric' },
          { name: 'active', type: 'boolean' },
          { name: 'data', type: 'jsonb' },
          { name: 'big', type: 'bigint' },
          { name: 'num', type: 'integer' },
        ],
      }],
    };
    const ts = contractToTypes(contract);
    expect(ts).toContain('id: string');       // uuid → string
    expect(ts).toContain('count: number | null');     // numeric → number
    expect(ts).toContain('active: boolean | null');   // boolean → boolean
    expect(ts).toContain('data: Record<string, unknown> | null'); // jsonb → Record
    expect(ts).toContain('big: number | null');       // bigint → number
    expect(ts).toContain('num: number | null');       // integer → number
  });
});
