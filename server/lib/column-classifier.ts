// lib/column-classifier.ts
// Shared semantic column classifier — given a column name + SQL type + optional FK reference,
// returns classification metadata used by code-gen, seed, and UI generation.

export type SemanticType =
  | 'primary_key' | 'foreign_key' | 'identifier' | 'slug'
  | 'name' | 'first_name' | 'last_name' | 'full_name'
  | 'email' | 'phone' | 'avatar'
  | 'title' | 'description' | 'content' | 'comment' | 'notes'
  | 'address' | 'city' | 'state' | 'country' | 'zip_code'
  | 'latitude' | 'longitude'
  | 'currency' | 'price' | 'quantity' | 'score' | 'rating'
  | 'status' | 'type' | 'category' | 'role' | 'enum'
  | 'url' | 'image_url' | 'website'
  | 'created_at' | 'updated_at' | 'timestamp' | 'date' | 'birthdate'
  | 'boolean' | 'json' | 'color' | 'generic_text' | 'generic_number'

export interface ColumnClassification {
  semantic: SemanticType
  showInList: boolean
  listPriority: number         // 1=always, 5=only if space, 99=hidden
  displayFormat: 'text' | 'date' | 'badge' | 'currency' | 'link' | 'boolean' | 'json' | 'number'
  inputType: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'email' | 'url' | 'checkbox'
  isAutoManaged: boolean       // id, created_at, updated_at, user_id
  isAggregatable: boolean      // can be summed/averaged
  aggregationFn: 'sum' | 'avg' | 'count' | 'min' | 'max' | null
  searchable: boolean
  filterable: boolean
  faker: string | null         // faker method for seed generation
}

export interface ClassificationInput {
  name: string
  type: string  // SQL type: 'text', 'uuid', 'integer', 'bigint', 'numeric', 'boolean', 'timestamptz', 'jsonb', 'float'
  references?: { table: string; column: string }
}

// Helper: is the SQL type numeric (aggregatable)
function isNumericType(type: string): boolean {
  return ['numeric', 'integer', 'bigint', 'float'].includes(type)
}

function isTimestampType(type: string): boolean {
  return type === 'timestamptz'
}

function isTextType(type: string): boolean {
  return type === 'text'
}

/**
 * Classify a database column by its semantic meaning.
 * Rules are ordered by specificity — first match wins.
 */
export function classifyColumn(col: ClassificationInput): ColumnClassification {
  const { name, type, references } = col
  const n = name.toLowerCase()

  // Defaults that rules can override
  const base: ColumnClassification = {
    semantic: 'generic_text',
    showInList: false,
    listPriority: 99,
    displayFormat: 'text',
    inputType: 'text',
    isAutoManaged: false,
    isAggregatable: false,
    aggregationFn: null,
    searchable: false,
    filterable: false,
    faker: null,
  }

  // Special case: user_id is auto-managed regardless of other rules
  const isUserId = n === 'user_id'

  // ─── Rule 1: FK reference exists ──────────────────────────────────────────
  if (references?.table && references?.column) {
    return {
      ...base,
      semantic: 'foreign_key',
      showInList: false,
      listPriority: 99,
      displayFormat: 'text',
      inputType: 'text',
      isAutoManaged: isUserId,
      isAggregatable: false,
      aggregationFn: null,
      searchable: false,
      filterable: false,
      faker: null,
    }
  }

  // ─── Rule 2: primary key ───────────────────────────────────────────────────
  if (n === 'id' && (type === 'uuid' || type === 'integer')) {
    return {
      ...base,
      semantic: 'primary_key',
      showInList: false,
      listPriority: 99,
      isAutoManaged: true,
      faker: null,
    }
  }

  // ─── Rule 3: first_name ────────────────────────────────────────────────────
  if (/^first[_]?name$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'first_name',
      showInList: true,
      listPriority: 1,
      searchable: true,
      faker: 'person.firstName',
    }
  }

  // ─── Rule 4: last_name ─────────────────────────────────────────────────────
  if (/^last[_]?name$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'last_name',
      showInList: true,
      listPriority: 1,
      searchable: true,
      faker: 'person.lastName',
    }
  }

  // ─── Rule 5: full_name ─────────────────────────────────────────────────────
  if (/^full[_]?name$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'full_name',
      showInList: true,
      listPriority: 1,
      searchable: true,
      faker: 'person.fullName',
    }
  }

  // ─── Rule 6: name ──────────────────────────────────────────────────────────
  if (/^(user[_]?)?name$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'name',
      showInList: true,
      listPriority: 1,
      searchable: true,
      faker: 'person.fullName',
    }
  }

  // ─── Rule 7: email ─────────────────────────────────────────────────────────
  if (/e?mail/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'email',
      showInList: true,
      listPriority: 2,
      displayFormat: 'link',
      inputType: 'email',
      searchable: true,
      faker: 'internet.email',
    }
  }

  // ─── Rule 8: phone ─────────────────────────────────────────────────────────
  if (/phone|mobile|tel/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'phone',
      showInList: false,
      listPriority: 4,
      faker: 'phone.number',
    }
  }

  // ─── Rule 9: avatar / image ────────────────────────────────────────────────
  if (/avatar|image|photo|picture|thumbnail/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'image_url',
      showInList: false,
      listPriority: 5,
      displayFormat: 'link',
      faker: 'image.avatar',
    }
  }

  // ─── Rule 10: url / link / website ────────────────────────────────────────
  if ((/^(url|link|website)$|_url$/.test(n)) && isTextType(type)) {
    return {
      ...base,
      semantic: 'url',
      showInList: false,
      listPriority: 5,
      displayFormat: 'link',
      inputType: 'url',
      faker: 'internet.url',
    }
  }

  // ─── Rule 11: title ────────────────────────────────────────────────────────
  if (/^title$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'title',
      showInList: true,
      listPriority: 1,
      searchable: true,
      faker: 'lorem.words(3)',
    }
  }

  // ─── Rule 12: description ──────────────────────────────────────────────────
  if (/description|summary|abstract|^bio$|^about$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'description',
      showInList: false,
      inputType: 'textarea',
      faker: 'lorem.paragraph',
    }
  }

  // ─── Rule 13: content / body ───────────────────────────────────────────────
  if (/content|body|text|html|markdown/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'content',
      showInList: false,
      inputType: 'textarea',
      faker: 'lorem.paragraphs(2)',
    }
  }

  // ─── Rule 14: comment / note ───────────────────────────────────────────────
  if (/comment|note|feedback|review/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'comment',
      showInList: false,
      inputType: 'textarea',
      faker: 'lorem.sentence',
    }
  }

  // ─── Rule 15: slug ─────────────────────────────────────────────────────────
  if (/^slug$|_slug$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'slug',
      showInList: false,
      faker: 'helpers.slugify(faker.lorem.words(2))',
    }
  }

  // ─── Rule 16: latitude ─────────────────────────────────────────────────────
  if (/^lat(itude)?$|_lat/.test(n) && (type === 'numeric' || type === 'float')) {
    return {
      ...base,
      semantic: 'latitude',
      showInList: false,
      displayFormat: 'number',
      inputType: 'number',
      faker: 'location.latitude',
    }
  }

  // ─── Rule 17: longitude ────────────────────────────────────────────────────
  if (/^lon(gitude)?$|^lng$|_lon|_lng/.test(n) && (type === 'numeric' || type === 'float')) {
    return {
      ...base,
      semantic: 'longitude',
      showInList: false,
      displayFormat: 'number',
      inputType: 'number',
      faker: 'location.longitude',
    }
  }

  // ─── Rule 18: city ─────────────────────────────────────────────────────────
  if (/^city$|_city$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'city',
      showInList: false,
      faker: 'location.city',
    }
  }

  // ─── Rule 19: country ──────────────────────────────────────────────────────
  if (/^country|_country$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'country',
      showInList: false,
      faker: 'location.country',
    }
  }

  // ─── Rule 20: state / province ────────────────────────────────────────────
  if (/^state$|^province$|_state$|_province$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'state',
      showInList: false,
      faker: 'location.state',
    }
  }

  // ─── Rule 21: address / street ────────────────────────────────────────────
  if (/address|street/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'address',
      showInList: false,
      faker: 'location.streetAddress',
    }
  }

  // ─── Rule 22: zip / postal code ───────────────────────────────────────────
  if (/zip[_]?code$|postal[_]?code$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'zip_code',
      showInList: false,
      faker: 'location.zipCode',
    }
  }

  // ─── Rule 23: price / cost / amount / currency ────────────────────────────
  if (/price|cost|amount|total|fee|balance/.test(n) && isNumericType(type)) {
    return {
      ...base,
      semantic: 'currency',
      showInList: true,
      listPriority: 2,
      displayFormat: 'currency',
      inputType: 'number',
      isAggregatable: true,
      aggregationFn: 'sum',
      faker: 'finance.amount',
    }
  }

  // ─── Rule 24: quantity / count ─────────────────────────────────────────────
  if (/quantity|count$|^num_/.test(n) && (type === 'integer' || type === 'bigint')) {
    return {
      ...base,
      semantic: 'quantity',
      showInList: true,
      listPriority: 3,
      displayFormat: 'number',
      inputType: 'number',
      isAggregatable: true,
      aggregationFn: 'sum',
      faker: 'number.int({min:1,max:100})',
    }
  }

  // ─── Rule 25: score / rating ───────────────────────────────────────────────
  if (/score|rating|stars|rank/.test(n) && (type === 'numeric' || type === 'integer')) {
    return {
      ...base,
      semantic: 'score',
      showInList: true,
      listPriority: 3,
      displayFormat: 'number',
      inputType: 'number',
      isAggregatable: true,
      aggregationFn: 'avg',
      faker: 'number.int({min:1,max:5})',
    }
  }

  // ─── Rule 26: status ───────────────────────────────────────────────────────
  if (/status/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'status',
      showInList: true,
      listPriority: 2,
      displayFormat: 'badge',
      filterable: true,
      faker: 'helpers.arrayElement(["active","pending","completed"])',
    }
  }

  // ─── Rule 27: type ─────────────────────────────────────────────────────────
  if (/_type$|^type$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'type',
      showInList: true,
      listPriority: 3,
      displayFormat: 'badge',
      filterable: true,
      faker: null,
    }
  }

  // ─── Rule 28: category ─────────────────────────────────────────────────────
  if (/categor/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'category',
      showInList: true,
      listPriority: 3,
      displayFormat: 'badge',
      filterable: true,
      faker: null,
    }
  }

  // ─── Rule 29: role ─────────────────────────────────────────────────────────
  if (/^role$|_role$/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'role',
      showInList: true,
      listPriority: 3,
      displayFormat: 'badge',
      filterable: true,
      faker: null,
    }
  }

  // ─── Rule 30: color ────────────────────────────────────────────────────────
  if (/color|colour/.test(n) && isTextType(type)) {
    return {
      ...base,
      semantic: 'color',
      showInList: false,
      faker: null,
    }
  }

  // ─── Rule 31: created_at ───────────────────────────────────────────────────
  if (/^created[_]?at$|^created$|^creation[_]?date$/.test(n) && isTimestampType(type)) {
    return {
      ...base,
      semantic: 'created_at',
      showInList: true,
      listPriority: 4,
      displayFormat: 'date',
      isAutoManaged: true,
      faker: null,
    }
  }

  // ─── Rule 32: updated_at ───────────────────────────────────────────────────
  if (/^updated[_]?at$|^updated$|^modified[_]?at$/.test(n) && isTimestampType(type)) {
    return {
      ...base,
      semantic: 'updated_at',
      showInList: false,
      listPriority: 5,
      displayFormat: 'date',
      isAutoManaged: true,
      faker: null,
    }
  }

  // ─── Rule 33: birthdate ────────────────────────────────────────────────────
  if (/^birth(day|date)$/.test(n) && (isTimestampType(type) || isTextType(type))) {
    return {
      ...base,
      semantic: 'birthdate',
      showInList: false,
      displayFormat: 'date',
      inputType: 'date',
      faker: 'date.birthdate',
    }
  }

  // ─── Rule 34: boolean type ────────────────────────────────────────────────
  if (type === 'boolean') {
    return {
      ...base,
      semantic: 'boolean',
      showInList: true,
      listPriority: 3,
      displayFormat: 'boolean',
      inputType: 'checkbox',
      filterable: true,
      isAutoManaged: isUserId,
      faker: null,
    }
  }

  // ─── Rule 35: jsonb type ──────────────────────────────────────────────────
  if (type === 'jsonb') {
    return {
      ...base,
      semantic: 'json',
      showInList: false,
      displayFormat: 'json',
      faker: null,
    }
  }

  // ─── Rule 36: generic text fallback ──────────────────────────────────────
  if (isTextType(type)) {
    return {
      ...base,
      semantic: 'generic_text',
      showInList: false,
      inputType: 'text',
      isAutoManaged: isUserId,
    }
  }

  // ─── Rule 37: generic number fallback ────────────────────────────────────
  if (type === 'integer' || type === 'bigint' || type === 'numeric') {
    return {
      ...base,
      semantic: 'generic_number',
      showInList: true,
      listPriority: 4,
      displayFormat: 'number',
      inputType: 'number',
      isAutoManaged: isUserId,
    }
  }

  // ─── Rule 38: timestamptz fallback ────────────────────────────────────────
  if (isTimestampType(type)) {
    return {
      ...base,
      semantic: 'timestamp',
      showInList: true,
      listPriority: 4,
      displayFormat: 'date',
      inputType: 'date',
      isAutoManaged: isUserId,
    }
  }

  // Final fallback: uuid or unknown types
  return {
    ...base,
    semantic: 'identifier',
    showInList: false,
    listPriority: 99,
    isAutoManaged: isUserId,
  }
}

/**
 * Find the best display column in a table for FK dropdown labels.
 * Uses classifyColumn to pick semantically meaningful columns.
 * Returns the column name to use (e.g. 'name', 'title', 'email') or 'id' as fallback.
 */
export function findDisplayColumn(
  columns: Array<{ name: string; type: string; primaryKey?: boolean }>,
): string {
  // Priority: name-class semantics first (title, name, full_name, first_name), then email
  const prioritySemantics: SemanticType[] = ['title', 'name', 'full_name', 'first_name', 'email']
  for (const semantic of prioritySemantics) {
    const col = columns.find(
      (c) => !c.primaryKey && classifyColumn({ name: c.name, type: c.type }).semantic === semantic,
    )
    if (col) return col.name
  }

  // Any non-pk text column as fallback
  const textCol = columns.find(
    (c) => !c.primaryKey && (c.type === 'text' || c.type === 'varchar'),
  )
  if (textCol) return textCol.name

  return 'id'
}
