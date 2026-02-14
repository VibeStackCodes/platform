// lib/seed-generator.ts
import { faker } from '@faker-js/faker';
import type { TableDef, ColumnDef, SeedRow } from './schema-contract';

/**
 * Generate realistic seed data for ALL tables in topological order.
 * Parent tables are seeded first; child tables reference actual parent IDs.
 * External FK columns (auth.users) are skipped entirely.
 */
export function generateAllSeedData(
  tables: TableDef[],
  rowCount: number,
  userIds: string[],
): SeedRow[] {
  const sorted = topoSort(tables);
  // Map of table name → array of generated primary key IDs
  const generatedIds = new Map<string, string[]>();
  const results: SeedRow[] = [];

  for (const table of sorted) {
    const seed = generateSeedData(table, rowCount, userIds, generatedIds);
    results.push(seed);

    // Track generated IDs for this table (used by child tables)
    const pkCol = table.columns.find(c => c.primaryKey);
    if (pkCol && seed.rows.length > 0) {
      const ids = seed.rows
        .map(r => r[pkCol.name] as string)
        .filter(Boolean);
      if (ids.length > 0) {
        generatedIds.set(table.name, ids);
      }
    }
  }

  return results;
}

/**
 * Generate seed data for a single table.
 * Uses generatedIds map to resolve internal FK references.
 */
export function generateSeedData(
  table: TableDef,
  rowCount: number,
  userIds: string[],
  generatedIds: Map<string, string[]> = new Map(),
): SeedRow {
  // Check if any NOT NULL FK column references an external table (auth.users)
  // — those can never be satisfied with fake data
  const hasRequiredExternalFK = table.columns.some(
    col => col.references &&
           col.references.table.includes('.') &&
           col.nullable !== true &&
           !col.default
  );
  if (hasRequiredExternalFK) return { table: table.name, rows: [] };

  // Check if any NOT NULL internal FK column has no parent IDs available
  const hasUnsatisfiedFK = table.columns.some(col => {
    if (!col.references || col.references.table.includes('.')) return false;
    if (col.nullable === true || col.default) return false;
    const parentIds = generatedIds.get(col.references.table);
    return !parentIds || parentIds.length === 0;
  });
  if (hasUnsatisfiedFK) return { table: table.name, rows: [] };

  const seedableColumns = table.columns.filter(col => !shouldSkip(col));
  if (seedableColumns.length === 0) return { table: table.name, rows: [] };

  // For tables with PK, pre-generate IDs so child tables can reference them
  const pkCol = table.columns.find(c => c.primaryKey);
  const preGeneratedIds: string[] = [];
  if (pkCol && pkCol.type === 'uuid' && pkCol.default === 'gen_random_uuid()') {
    for (let i = 0; i < rowCount; i++) {
      preGeneratedIds.push(faker.string.uuid());
    }
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, unknown> = {};

    // Include explicit PK if we pre-generated (so child tables can reference)
    if (pkCol && preGeneratedIds.length > 0) {
      row[pkCol.name] = preGeneratedIds[i];
    }

    for (const col of seedableColumns) {
      row[col.name] = generateValue(col, userIds, generatedIds);
    }
    rows.push(row);
  }

  // Store our generated IDs for child tables
  if (pkCol && preGeneratedIds.length > 0) {
    generatedIds.set(table.name, preGeneratedIds);
  }

  return { table: table.name, rows };
}

function shouldSkip(col: ColumnDef): boolean {
  if (col.primaryKey) return true;
  if (col.default && ['now()', 'gen_random_uuid()'].includes(col.default)) return true;
  if (col.name === 'created_at' || col.name === 'updated_at') return true;
  // Skip FK columns referencing external tables (auth.users) — we can't seed those
  if (col.references && col.references.table.includes('.')) return true;
  return false;
}

function generateValue(
  col: ColumnDef,
  userIds: string[],
  generatedIds: Map<string, string[]>,
): unknown {
  // FK columns: pick from parent table's generated IDs
  if (col.references) {
    const refTable = col.references.table;
    // External table — shouldn't reach here (shouldSkip filters them)
    if (refTable.includes('.')) return faker.string.uuid();

    const parentIds = generatedIds.get(refTable);
    if (parentIds && parentIds.length > 0) {
      return faker.helpers.arrayElement(parentIds);
    }
    // Fallback: generate UUID (nullable FK or no parent data)
    return faker.string.uuid();
  }

  // Column-name heuristics (checked before type fallback)
  const nameValue = matchByName(col.name, col.type);
  if (nameValue !== undefined) return nameValue;

  // Type-based fallback
  return matchByType(col.type);
}

function matchByName(name: string, type: string): unknown | undefined {
  const n = name.toLowerCase();

  if (n === 'email' || n.endsWith('_email')) return faker.internet.email();
  if (n === 'title' || n === 'name' || n === 'display_name') return faker.lorem.sentence({ min: 2, max: 5 }).replace(/\.$/, '');
  if (n === 'first_name') return faker.person.firstName();
  if (n === 'last_name') return faker.person.lastName();
  if (n === 'username') return faker.internet.username();
  if (n === 'avatar_url' || n === 'image_url' || n === 'photo_url') return faker.image.avatar();
  if (n === 'url' || n === 'website') return faker.internet.url();
  if (n === 'phone' || n === 'phone_number') return faker.phone.number();
  if (n === 'description' || n === 'bio' || n === 'summary') return faker.lorem.paragraph();
  if (n === 'content' || n === 'body' || n === 'text') return faker.lorem.paragraphs(2);
  if (n === 'address' || n === 'street') return faker.location.streetAddress();
  if (n === 'city') return faker.location.city();
  if (n === 'country') return faker.location.country();
  if (n === 'zip' || n === 'postal_code') return faker.location.zipCode();
  if (n === 'price' || n === 'amount' || n === 'cost') return parseFloat(faker.commerce.price({ min: 1, max: 500 }));
  if (n === 'quantity' || n === 'count') return faker.number.int({ min: 1, max: 100 });
  if (n === 'rating' || n === 'score') return faker.number.int({ min: 1, max: 5 });
  if (n === 'status') return faker.helpers.arrayElement(['active', 'inactive', 'pending']);
  if (n === 'color' || n === 'colour') return faker.color.human();
  if (n === 'channel_id') return faker.helpers.arrayElement(['general', 'random', 'announcements']);
  if (n === 'slug') return faker.helpers.slugify(faker.lorem.words(3));

  // jsonb columns with common names
  if (type === 'jsonb') {
    if (n === 'metadata' || n === 'settings' || n === 'config' || n === 'preferences') {
      return { key: faker.lorem.word(), value: faker.lorem.word() };
    }
  }

  return undefined;
}

function matchByType(type: string): unknown {
  switch (type) {
    case 'text': return faker.lorem.sentence();
    case 'numeric': return parseFloat(faker.finance.amount({ min: 0, max: 1000 }));
    case 'integer': return faker.number.int({ min: 1, max: 1000 });
    case 'bigint': return faker.number.int({ min: 1, max: 100000 });
    case 'boolean': return faker.datatype.boolean();
    case 'uuid': return faker.string.uuid();
    case 'jsonb': return { key: faker.lorem.word(), value: faker.lorem.word() };
    case 'timestamptz': return faker.date.recent().toISOString();
    default: return faker.lorem.word();
  }
}

/**
 * Topological sort tables by FK dependencies.
 * Parents come before children. External refs (auth.users) are ignored.
 */
function topoSort(tables: TableDef[]): TableDef[] {
  const tableMap = new Map(tables.map(t => [t.name, t]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const t of tables) {
    inDegree.set(t.name, 0);
    adj.set(t.name, []);
  }

  for (const t of tables) {
    for (const col of t.columns) {
      if (col.references && tableMap.has(col.references.table)) {
        adj.get(col.references.table)!.push(t.name);
        inDegree.set(t.name, (inDegree.get(t.name) ?? 0) + 1);
      }
    }
  }

  const queue = tables.filter(t => inDegree.get(t.name) === 0).map(t => t.name);
  const result: TableDef[] = [];

  while (queue.length > 0) {
    const name = queue.shift()!;
    result.push(tableMap.get(name)!);
    for (const neighbor of adj.get(name) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return result;
}
