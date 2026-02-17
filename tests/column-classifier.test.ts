import { describe, expect, it } from 'vitest'
import { classifyColumn } from '@server/lib/column-classifier'
import type { ClassificationInput } from '@server/lib/column-classifier'

// ============================================================================
// Primary key detection
// ============================================================================

describe('primary_key detection', () => {
  it('classifies uuid id column as primary_key', () => {
    const result = classifyColumn({ name: 'id', type: 'uuid' })
    expect(result.semantic).toBe('primary_key')
    expect(result.showInList).toBe(false)
    expect(result.listPriority).toBe(99)
    expect(result.isAutoManaged).toBe(true)
    expect(result.faker).toBeNull()
  })

  it('classifies integer id column as primary_key', () => {
    const result = classifyColumn({ name: 'id', type: 'integer' })
    expect(result.semantic).toBe('primary_key')
    expect(result.isAutoManaged).toBe(true)
  })

  it('does not classify text id as primary_key', () => {
    const result = classifyColumn({ name: 'id', type: 'text' })
    expect(result.semantic).not.toBe('primary_key')
  })
})

// ============================================================================
// Foreign key detection
// ============================================================================

describe('foreign_key detection', () => {
  it('classifies column with FK reference as foreign_key', () => {
    const col: ClassificationInput = {
      name: 'user_id',
      type: 'uuid',
      references: { table: 'auth.users', column: 'id' },
    }
    const result = classifyColumn(col)
    expect(result.semantic).toBe('foreign_key')
    expect(result.showInList).toBe(false)
    expect(result.isAggregatable).toBe(false)
    expect(result.aggregationFn).toBeNull()
    expect(result.faker).toBeNull()
  })

  it('marks user_id FK as auto-managed', () => {
    const col: ClassificationInput = {
      name: 'user_id',
      type: 'uuid',
      references: { table: 'auth.users', column: 'id' },
    }
    const result = classifyColumn(col)
    expect(result.isAutoManaged).toBe(true)
  })

  it('classifies non-user FK without auto-managed flag', () => {
    const col: ClassificationInput = {
      name: 'order_id',
      type: 'uuid',
      references: { table: 'orders', column: 'id' },
    }
    const result = classifyColumn(col)
    expect(result.semantic).toBe('foreign_key')
    expect(result.isAutoManaged).toBe(false)
  })
})

// ============================================================================
// Name columns
// ============================================================================

describe('name column detection', () => {
  it('classifies first_name', () => {
    const result = classifyColumn({ name: 'first_name', type: 'text' })
    expect(result.semantic).toBe('first_name')
    expect(result.showInList).toBe(true)
    expect(result.listPriority).toBe(1)
    expect(result.searchable).toBe(true)
    expect(result.faker).toBe('person.firstName')
  })

  it('classifies firstname (no underscore)', () => {
    const result = classifyColumn({ name: 'firstname', type: 'text' })
    expect(result.semantic).toBe('first_name')
  })

  it('classifies last_name', () => {
    const result = classifyColumn({ name: 'last_name', type: 'text' })
    expect(result.semantic).toBe('last_name')
    expect(result.faker).toBe('person.lastName')
  })

  it('classifies full_name', () => {
    const result = classifyColumn({ name: 'full_name', type: 'text' })
    expect(result.semantic).toBe('full_name')
    expect(result.faker).toBe('person.fullName')
  })

  it('classifies name', () => {
    const result = classifyColumn({ name: 'name', type: 'text' })
    expect(result.semantic).toBe('name')
    expect(result.showInList).toBe(true)
    expect(result.listPriority).toBe(1)
    expect(result.searchable).toBe(true)
  })

  it('classifies username', () => {
    const result = classifyColumn({ name: 'username', type: 'text' })
    expect(result.semantic).toBe('name')
  })
})

// ============================================================================
// Contact information
// ============================================================================

describe('contact column detection', () => {
  it('classifies email', () => {
    const result = classifyColumn({ name: 'email', type: 'text' })
    expect(result.semantic).toBe('email')
    expect(result.showInList).toBe(true)
    expect(result.listPriority).toBe(2)
    expect(result.displayFormat).toBe('link')
    expect(result.inputType).toBe('email')
    expect(result.searchable).toBe(true)
    expect(result.faker).toBe('internet.email')
  })

  it('classifies email_address', () => {
    const result = classifyColumn({ name: 'email_address', type: 'text' })
    expect(result.semantic).toBe('email')
  })

  it('classifies phone_number', () => {
    const result = classifyColumn({ name: 'phone_number', type: 'text' })
    expect(result.semantic).toBe('phone')
    expect(result.showInList).toBe(false)
    expect(result.faker).toBe('phone.number')
  })

  it('classifies mobile', () => {
    const result = classifyColumn({ name: 'mobile', type: 'text' })
    expect(result.semantic).toBe('phone')
  })
})

// ============================================================================
// URL / media columns
// ============================================================================

describe('url and media column detection', () => {
  it('classifies avatar_url as image_url', () => {
    const result = classifyColumn({ name: 'avatar_url', type: 'text' })
    expect(result.semantic).toBe('image_url')
    expect(result.displayFormat).toBe('link')
    expect(result.faker).toBe('image.avatar')
  })

  it('classifies profile_image as image_url', () => {
    const result = classifyColumn({ name: 'profile_image', type: 'text' })
    expect(result.semantic).toBe('image_url')
  })

  it('classifies website_url as url', () => {
    const result = classifyColumn({ name: 'website_url', type: 'text' })
    expect(result.semantic).toBe('url')
    expect(result.displayFormat).toBe('link')
    expect(result.inputType).toBe('url')
    expect(result.faker).toBe('internet.url')
  })

  it('classifies url column', () => {
    const result = classifyColumn({ name: 'url', type: 'text' })
    expect(result.semantic).toBe('url')
  })

  it('classifies link column', () => {
    const result = classifyColumn({ name: 'link', type: 'text' })
    expect(result.semantic).toBe('url')
  })
})

// ============================================================================
// Text content columns
// ============================================================================

describe('text content column detection', () => {
  it('classifies title', () => {
    const result = classifyColumn({ name: 'title', type: 'text' })
    expect(result.semantic).toBe('title')
    expect(result.showInList).toBe(true)
    expect(result.listPriority).toBe(1)
    expect(result.searchable).toBe(true)
    expect(result.faker).toBe('lorem.words(3)')
  })

  it('classifies description as textarea input', () => {
    const result = classifyColumn({ name: 'description', type: 'text' })
    expect(result.semantic).toBe('description')
    expect(result.inputType).toBe('textarea')
    expect(result.showInList).toBe(false)
    expect(result.faker).toBe('lorem.paragraph')
  })

  it('classifies summary as description', () => {
    const result = classifyColumn({ name: 'summary', type: 'text' })
    expect(result.semantic).toBe('description')
  })

  it('classifies body_content as content', () => {
    const result = classifyColumn({ name: 'body_content', type: 'text' })
    expect(result.semantic).toBe('content')
    expect(result.inputType).toBe('textarea')
    expect(result.faker).toBe('lorem.paragraphs(2)')
  })

  it('classifies comment as textarea input', () => {
    const result = classifyColumn({ name: 'comment', type: 'text' })
    expect(result.semantic).toBe('comment')
    expect(result.inputType).toBe('textarea')
    expect(result.faker).toBe('lorem.sentence')
  })

  it('classifies feedback as comment', () => {
    const result = classifyColumn({ name: 'feedback', type: 'text' })
    expect(result.semantic).toBe('comment')
  })

  it('classifies slug', () => {
    const result = classifyColumn({ name: 'slug', type: 'text' })
    expect(result.semantic).toBe('slug')
    expect(result.showInList).toBe(false)
    expect(result.faker).toBe('helpers.slugify(faker.lorem.words(2))')
  })

  it('classifies post_slug as slug', () => {
    const result = classifyColumn({ name: 'post_slug', type: 'text' })
    expect(result.semantic).toBe('slug')
  })
})

// ============================================================================
// Location columns
// ============================================================================

describe('location column detection', () => {
  it('classifies latitude', () => {
    const result = classifyColumn({ name: 'latitude', type: 'numeric' })
    expect(result.semantic).toBe('latitude')
    expect(result.showInList).toBe(false)
    expect(result.faker).toBe('location.latitude')
  })

  it('classifies lat (short form) with numeric type', () => {
    const result = classifyColumn({ name: 'lat', type: 'numeric' })
    expect(result.semantic).toBe('latitude')
  })

  it('classifies longitude', () => {
    const result = classifyColumn({ name: 'longitude', type: 'numeric' })
    expect(result.semantic).toBe('longitude')
    expect(result.faker).toBe('location.longitude')
  })

  it('classifies lng as longitude', () => {
    const result = classifyColumn({ name: 'lng', type: 'numeric' })
    expect(result.semantic).toBe('longitude')
  })

  it('classifies city', () => {
    const result = classifyColumn({ name: 'city', type: 'text' })
    expect(result.semantic).toBe('city')
    expect(result.faker).toBe('location.city')
  })

  it('classifies country', () => {
    const result = classifyColumn({ name: 'country', type: 'text' })
    expect(result.semantic).toBe('country')
    expect(result.faker).toBe('location.country')
  })

  it('classifies state', () => {
    const result = classifyColumn({ name: 'state', type: 'text' })
    expect(result.semantic).toBe('state')
    expect(result.faker).toBe('location.state')
  })

  it('classifies street_address as address', () => {
    const result = classifyColumn({ name: 'street_address', type: 'text' })
    expect(result.semantic).toBe('address')
    expect(result.faker).toBe('location.streetAddress')
  })

  it('classifies zip_code', () => {
    const result = classifyColumn({ name: 'zip_code', type: 'text' })
    expect(result.semantic).toBe('zip_code')
    expect(result.faker).toBe('location.zipCode')
  })

  it('classifies postal_code as zip_code', () => {
    const result = classifyColumn({ name: 'postal_code', type: 'text' })
    expect(result.semantic).toBe('zip_code')
  })
})

// ============================================================================
// Numeric / aggregatable columns
// ============================================================================

describe('aggregatable column detection', () => {
  it('classifies price as currency — aggregatable with sum', () => {
    const result = classifyColumn({ name: 'price', type: 'numeric' })
    expect(result.semantic).toBe('currency')
    expect(result.showInList).toBe(true)
    expect(result.listPriority).toBe(2)
    expect(result.displayFormat).toBe('currency')
    expect(result.isAggregatable).toBe(true)
    expect(result.aggregationFn).toBe('sum')
    expect(result.faker).toBe('finance.amount')
  })

  it('classifies total_amount as currency', () => {
    const result = classifyColumn({ name: 'total_amount', type: 'numeric' })
    expect(result.semantic).toBe('currency')
    expect(result.isAggregatable).toBe(true)
  })

  it('classifies order_count as quantity', () => {
    const result = classifyColumn({ name: 'order_count', type: 'integer' })
    expect(result.semantic).toBe('quantity')
    expect(result.isAggregatable).toBe(true)
    expect(result.aggregationFn).toBe('sum')
    expect(result.faker).toBe('number.int({min:1,max:100})')
  })

  it('classifies rating as score — aggregatable with avg', () => {
    const result = classifyColumn({ name: 'rating', type: 'numeric' })
    expect(result.semantic).toBe('score')
    expect(result.isAggregatable).toBe(true)
    expect(result.aggregationFn).toBe('avg')
    expect(result.faker).toBe('number.int({min:1,max:5})')
  })

  it('classifies score column as score', () => {
    const result = classifyColumn({ name: 'score', type: 'integer' })
    expect(result.semantic).toBe('score')
    expect(result.isAggregatable).toBe(true)
    expect(result.aggregationFn).toBe('avg')
  })

  it('does not classify price text column as currency', () => {
    // Price must be a numeric type to be aggregatable
    const result = classifyColumn({ name: 'price', type: 'text' })
    expect(result.semantic).not.toBe('currency')
    expect(result.isAggregatable).toBe(false)
  })
})

// ============================================================================
// Status / enum-like columns
// ============================================================================

describe('status/badge column detection', () => {
  it('classifies status column', () => {
    const result = classifyColumn({ name: 'status', type: 'text' })
    expect(result.semantic).toBe('status')
    expect(result.showInList).toBe(true)
    expect(result.listPriority).toBe(2)
    expect(result.displayFormat).toBe('badge')
    expect(result.filterable).toBe(true)
    expect(result.faker).toBe('helpers.arrayElement(["active","pending","completed"])')
  })

  it('classifies order_status as status', () => {
    const result = classifyColumn({ name: 'order_status', type: 'text' })
    expect(result.semantic).toBe('status')
  })

  it('classifies type column', () => {
    const result = classifyColumn({ name: 'type', type: 'text' })
    expect(result.semantic).toBe('type')
    expect(result.displayFormat).toBe('badge')
    expect(result.filterable).toBe(true)
  })

  it('classifies account_type as type', () => {
    const result = classifyColumn({ name: 'account_type', type: 'text' })
    expect(result.semantic).toBe('type')
  })

  it('classifies category column', () => {
    const result = classifyColumn({ name: 'category', type: 'text' })
    expect(result.semantic).toBe('category')
    expect(result.displayFormat).toBe('badge')
    expect(result.filterable).toBe(true)
  })

  it('classifies role column', () => {
    const result = classifyColumn({ name: 'role', type: 'text' })
    expect(result.semantic).toBe('role')
    expect(result.displayFormat).toBe('badge')
    expect(result.filterable).toBe(true)
  })

  it('classifies user_role as role', () => {
    const result = classifyColumn({ name: 'user_role', type: 'text' })
    expect(result.semantic).toBe('role')
  })
})

// ============================================================================
// Timestamp / date columns
// ============================================================================

describe('timestamp column detection', () => {
  it('classifies created_at', () => {
    const result = classifyColumn({ name: 'created_at', type: 'timestamptz' })
    expect(result.semantic).toBe('created_at')
    expect(result.showInList).toBe(true)
    expect(result.listPriority).toBe(4)
    expect(result.displayFormat).toBe('date')
    expect(result.isAutoManaged).toBe(true)
    expect(result.faker).toBeNull()
  })

  it('classifies updated_at', () => {
    const result = classifyColumn({ name: 'updated_at', type: 'timestamptz' })
    expect(result.semantic).toBe('updated_at')
    expect(result.showInList).toBe(false)
    expect(result.isAutoManaged).toBe(true)
  })

  it('classifies modified_at as updated_at', () => {
    const result = classifyColumn({ name: 'modified_at', type: 'timestamptz' })
    expect(result.semantic).toBe('updated_at')
    expect(result.isAutoManaged).toBe(true)
  })

  it('classifies birthday as birthdate', () => {
    const result = classifyColumn({ name: 'birthday', type: 'timestamptz' })
    expect(result.semantic).toBe('birthdate')
    expect(result.displayFormat).toBe('date')
    expect(result.inputType).toBe('date')
    expect(result.faker).toBe('date.birthdate')
  })

  it('classifies birthdate', () => {
    const result = classifyColumn({ name: 'birthdate', type: 'text' })
    expect(result.semantic).toBe('birthdate')
  })

  it('classifies unknown timestamptz as generic timestamp', () => {
    const result = classifyColumn({ name: 'published_at', type: 'timestamptz' })
    expect(result.semantic).toBe('timestamp')
    expect(result.displayFormat).toBe('date')
    expect(result.showInList).toBe(true)
    expect(result.listPriority).toBe(4)
  })
})

// ============================================================================
// Boolean and JSON types
// ============================================================================

describe('boolean and json type detection', () => {
  it('classifies boolean column', () => {
    const result = classifyColumn({ name: 'is_active', type: 'boolean' })
    expect(result.semantic).toBe('boolean')
    expect(result.showInList).toBe(true)
    expect(result.listPriority).toBe(3)
    expect(result.displayFormat).toBe('boolean')
    expect(result.inputType).toBe('checkbox')
    expect(result.filterable).toBe(true)
  })

  it('classifies jsonb column', () => {
    const result = classifyColumn({ name: 'metadata', type: 'jsonb' })
    expect(result.semantic).toBe('json')
    expect(result.showInList).toBe(false)
    expect(result.displayFormat).toBe('json')
    expect(result.faker).toBeNull()
  })
})

// ============================================================================
// Auto-managed column detection
// ============================================================================

describe('auto-managed column detection', () => {
  it('marks id as auto-managed', () => {
    const result = classifyColumn({ name: 'id', type: 'uuid' })
    expect(result.isAutoManaged).toBe(true)
  })

  it('marks created_at as auto-managed', () => {
    const result = classifyColumn({ name: 'created_at', type: 'timestamptz' })
    expect(result.isAutoManaged).toBe(true)
  })

  it('marks updated_at as auto-managed', () => {
    const result = classifyColumn({ name: 'updated_at', type: 'timestamptz' })
    expect(result.isAutoManaged).toBe(true)
  })

  it('marks user_id FK as auto-managed', () => {
    const result = classifyColumn({
      name: 'user_id',
      type: 'uuid',
      references: { table: 'auth.users', column: 'id' },
    })
    expect(result.isAutoManaged).toBe(true)
  })

  it('does not mark regular columns as auto-managed', () => {
    const result = classifyColumn({ name: 'title', type: 'text' })
    expect(result.isAutoManaged).toBe(false)
  })

  it('does not mark non-user FK as auto-managed', () => {
    const result = classifyColumn({
      name: 'category_id',
      type: 'uuid',
      references: { table: 'categories', column: 'id' },
    })
    expect(result.isAutoManaged).toBe(false)
  })
})

// ============================================================================
// Fallback behavior
// ============================================================================

describe('fallback classification', () => {
  it('falls back to generic_text for unknown text columns', () => {
    const result = classifyColumn({ name: 'custom_field_xyz', type: 'text' })
    expect(result.semantic).toBe('generic_text')
    expect(result.showInList).toBe(false)
    expect(result.inputType).toBe('text')
  })

  it('falls back to generic_number for unknown integer columns', () => {
    const result = classifyColumn({ name: 'widget_count_custom', type: 'integer' })
    expect(result.semantic).toBe('generic_number')
    expect(result.showInList).toBe(true)
    expect(result.listPriority).toBe(4)
    expect(result.inputType).toBe('number')
  })

  it('falls back to generic_number for unknown bigint columns', () => {
    const result = classifyColumn({ name: 'views_xyz', type: 'bigint' })
    expect(result.semantic).toBe('generic_number')
  })

  it('falls back to timestamp for unrecognised timestamptz columns', () => {
    const result = classifyColumn({ name: 'some_time', type: 'timestamptz' })
    expect(result.semantic).toBe('timestamp')
  })

  it('falls back to identifier for uuid columns without FK', () => {
    const result = classifyColumn({ name: 'external_ref', type: 'uuid' })
    expect(result.semantic).toBe('identifier')
    expect(result.showInList).toBe(false)
  })
})

// ============================================================================
// Searchable / filterable flags
// ============================================================================

describe('searchable and filterable flags', () => {
  it('email column is searchable', () => {
    expect(classifyColumn({ name: 'email', type: 'text' }).searchable).toBe(true)
  })

  it('status column is filterable but not searchable', () => {
    const result = classifyColumn({ name: 'status', type: 'text' })
    expect(result.filterable).toBe(true)
    expect(result.searchable).toBe(false)
  })

  it('boolean column is filterable', () => {
    expect(classifyColumn({ name: 'is_published', type: 'boolean' }).filterable).toBe(true)
  })

  it('generic_text column is not searchable', () => {
    expect(classifyColumn({ name: 'misc_field', type: 'text' }).searchable).toBe(false)
  })

  it('category column is filterable', () => {
    expect(classifyColumn({ name: 'category', type: 'text' }).filterable).toBe(true)
  })
})

// ============================================================================
// Color column
// ============================================================================

describe('color column detection', () => {
  it('classifies color column', () => {
    const result = classifyColumn({ name: 'color', type: 'text' })
    expect(result.semantic).toBe('color')
    expect(result.showInList).toBe(false)
    expect(result.faker).toBeNull()
  })

  it('classifies brand_colour as color (UK spelling)', () => {
    const result = classifyColumn({ name: 'brand_colour', type: 'text' })
    expect(result.semantic).toBe('color')
  })
})
