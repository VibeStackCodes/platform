# Security Audit Report

**Date**: 2026-02-16
**Component**: SchemaContract Validation & Code Generation Pipeline
**Test Coverage**: 64 comprehensive security tests
**Status**: 64/64 passing (100%)

## Executive Summary

Comprehensive security testing of the VibeStack SchemaContract validation and code generation pipeline reveals **strong overall security posture** with **2 identified gaps** requiring attention.

### Strengths

✅ **SQL Injection Protection**: Robust validation against:
- SQL injection in table/column names (semicolons, spaces, special chars)
- SQL reserved words as identifiers
- Malicious enum values
- SQL comment injection attempts

✅ **Identifier Validation**: Strict enforcement of:
- PostgreSQL snake_case naming convention (`/^[a-z_][a-z0-9_]*$/`)
- 63-character identifier length limit
- Reserved word blacklist (40+ SQL keywords)

✅ **Safe SQL Generation**: The `contractToSQL()` function:
- Validates all identifiers before generating SQL
- Quotes policy names to allow spaces
- Escapes single quotes in enum values (`'` → `''`)
- Wraps `auth.uid()` calls in subselects for performance

✅ **Input Normalization**: Zod preprocessors handle LLM quirks:
- Null to undefined conversion
- String FK references parsed to objects
- Numeric/boolean defaults coerced to strings
- Empty objects normalized

✅ **Structural Validation**: Contract validation detects:
- Duplicate column names
- Circular FK dependencies
- References to non-existent tables

## Security Gaps Identified

### 1. JavaScript Prototype Pollution Risk ⚠️

**Severity**: Medium
**Status**: UNMITIGATED

**Issue**: The schema currently allows `__proto__`, `constructor`, and other dangerous JavaScript identifiers as table/column names.

**Attack Vector**:
```typescript
// Malicious contract
{
  tables: [{
    name: '__proto__',
    columns: [{ name: '__proto__', type: 'text' }]
  }]
}
```

**Impact**: While safe in PostgreSQL, generated TypeScript code could enable prototype pollution if identifiers are used unsafely in object contexts.

**Recommendation**:
```typescript
// Add to schema-contract.ts
const DANGEROUS_JS_IDENTIFIERS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
])

// In ColumnDefSchema and TableDefSchema
.refine((name) => !DANGEROUS_JS_IDENTIFIERS.has(name), {
  message: 'Identifier conflicts with JavaScript built-in property',
})
```

**Tests**:
- `tests/security-audit.test.ts:374` - `__proto__` as table name
- `tests/security-audit.test.ts:385` - `__proto__` as column name

### 2. Qualified Table Name Parsing Bug 🐛

**Severity**: Low (Functional bug, not security)
**Status**: DOCUMENTED

**Issue**: The FK reference preprocessor incorrectly parses qualified table names like `'auth.users'`.

**Behavior**:
```typescript
// Input
references: 'auth.users'

// Current: parsed as { table: 'auth', column: 'users' }
// Expected: { table: 'auth.users', column: 'id' }

// Generated SQL
REFERENCES auth(users)  // Wrong
// Should be:
REFERENCES auth.users(id)
```

**Impact**: Generates invalid SQL for schema-qualified table references.

**Recommendation**: Fix the regex in `FKReferenceSchema` preprocessor:
```typescript
// Current regex matches 'auth.users' and splits on the dot
const dotMatch = val.match(/^([^.(]+)\.([^.(]+)$/)

// Should detect schema-qualified names and default to 'id' column
if (dotMatch && !dotMatch[2].includes('_')) {
  // If second part looks like a table name (no underscores), assume it's a schema-qualified table
  return { table: dotMatch[0], column: 'id' }
}
```

**Tests**:
- `tests/security-audit.test.ts:544` - Dot notation FK references

## Test Coverage Summary

### Test Suites (11 suites, 64 tests)

1. **SQL Injection Prevention - Table Names** (7 tests)
   - Rejects: SQL commands, spaces, numbers-first, uppercase, hyphens
   - Accepts: Valid snake_case, numbers after first char

2. **SQL Injection Prevention - Column Names** (4 tests)
   - Rejects: SQL injection, special chars, spaces
   - Accepts: Valid snake_case

3. **SQL Reserved Words Protection** (11 tests)
   - Tests: user, order, select, group, table (as table/column names)
   - Allows: Reserved words as part of longer identifiers

4. **Enum Value Sanitization** (8 tests)
   - Rejects: SQL injection, special chars, spaces, quotes
   - Accepts: Hyphens, underscores, numbers, uppercase

5. **Identifier Length Limits** (5 tests)
   - Tests: 63-char limit for tables, columns, enums, policies
   - Accepts: Exactly 63 characters

6. **Code Injection Prevention** (4 tests)
   - **GAP**: `__proto__` allowed (2 tests)
   - Accepts: `constructor` (valid in Postgres)

7. **Default Value Safety** (4 tests)
   - Tests: SQL expressions, numeric/boolean coercion, null handling

8. **Foreign Key Reference Safety** (6 tests)
   - Tests: Dot/paren notation parsing, null/empty normalization
   - Validates: FK target existence, allows `auth.users`

9. **RLS Policy Expression Safety** (4 tests)
   - Allows: Valid expressions, spaces in names, withCheck
   - Normalizes: Null fields

10. **Valid Contracts** (3 tests)
    - End-to-end validation with multiple tables, enums, RLS
    - All data types, FK dependencies, topological sorting

11. **Edge Cases** (8 tests)
    - Empty/missing/null enums, duplicate columns, circular FKs

## Attack Surface Analysis

### ✅ Protected Against

- **SQL Injection**: All user-supplied identifiers validated against strict regex
- **Command Injection**: No shell execution in generation pipeline
- **Path Traversal**: No file paths in SchemaContract
- **Code Injection (SQL)**: Enum values escaped, identifiers quoted where needed
- **DoS (length)**: 63-character limit enforced
- **Reserved Word Conflicts**: 40+ SQL keywords blacklisted

### ⚠️ Partial Protection

- **Code Injection (TypeScript)**: `__proto__` and similar identifiers allowed
- **Schema Pollution**: No validation of semantic naming (e.g., `id` must be UUID)

### ✅ Out of Scope (Handled Elsewhere)

- **Authentication**: Handled by Supabase Auth + middleware
- **Authorization**: RLS policies generated, enforced by Postgres
- **Rate Limiting**: Handled by credit system
- **Input Size**: LLM token limits prevent excessively large schemas

## Recommendations

### Immediate (High Priority)

1. **Add JavaScript identifier blacklist** to prevent `__proto__` and similar
2. **Fix qualified table name parsing** for `auth.users` references

### Near-term (Medium Priority)

3. **Add semantic validation**:
   - Require at least one table
   - Require at least one column per table
   - Warn if no primary key defined

4. **Add generation-time safety checks**:
   - Verify generated TypeScript compiles (already done by QA agent)
   - Lint generated code for dangerous patterns

5. **Consider allow-list approach** for extra safety:
   - Limit column types to known-safe set (already done)
   - Restrict RLS expressions to allow-list of functions

### Long-term (Low Priority)

6. **Add fuzz testing**: Random schema generation to find edge cases
7. **Add mutation testing**: Verify validators actually prevent bad inputs
8. **Security scanning**: Integrate Snyk/Semgrep on generated code

## Test Execution

```bash
bun run test tests/security-audit.test.ts
# ✓ 64 tests passed in 8ms
```

**Files**:
- Tests: `/Users/ammishra/VibeStack/platform/tests/security-audit.test.ts`
- Schema: `/Users/ammishra/VibeStack/platform/server/lib/schema-contract.ts`
- SQL Gen: `/Users/ammishra/VibeStack/platform/server/lib/contract-to-sql.ts`
- tRPC Gen: `/Users/ammishra/VibeStack/platform/server/lib/contract-to-trpc.ts`
- Page Gen: `/Users/ammishra/VibeStack/platform/server/lib/contract-to-pages.ts`

## Conclusion

The VibeStack schema validation and code generation pipeline demonstrates **strong security fundamentals** with comprehensive protection against SQL injection and most common attack vectors. The two identified gaps are:

1. **JavaScript prototype pollution** (Medium severity, unmitigated)
2. **Qualified table name parsing** (Low severity, functional bug)

Both gaps are well-documented with tests and recommended fixes. The 64-test security suite provides ongoing regression protection and can be extended as new attack vectors are discovered.

**Overall Security Rating**: B+ (Strong, with known gaps documented)
