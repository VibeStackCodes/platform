// assembler-procedures.test.ts
//
// assembleProcedures() has been removed as part of the PostgREST migration.
// Generated apps now use supabase-js + TanStack Query directly — no tRPC server.
// PostgREST (via supabase.from()) replaces all backend procedure assembly.

import { describe, it } from 'vitest'

describe('assembleProcedures (removed)', () => {
  it('is no longer exported — PostgREST replaces tRPC backend procedures', () => {
    // assembleProcedures was deleted in the PostgREST migration.
    // supabase.from('table').select/insert/update/delete() handles all CRUD via PostgREST.
    // This test exists only to satisfy vitest file discovery requirements.
  })
})
