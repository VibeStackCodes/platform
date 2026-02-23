/**
 * Image URL builder for the img.vibestack.codes resolver.
 * Returns a static URL string (for use in IMAGES data layer).
 */
export function imageSrc(query: string, w: number, h: number, crop?: string): string {
  const encoded = encodeURIComponent(query)
  const base = `https://img.vibestack.codes/s/${encoded}/${w}/${h}`
  return crop ? `${base}?crop=${crop}` : base
}

/**
 * JSX <img> tag builder with onError fallback to CSS gradient.
 * Returns a JSX string for use in section renderers.
 */
export function imageTag(opts: {
  src: string
  alt: string
  loading?: 'lazy' | 'eager'
  className?: string
  width?: number
  height?: number
}): string {
  const loading = opts.loading ?? 'lazy'
  const classAttr = opts.className ? ` className="${opts.className}"` : ''
  const sizeAttrs = [
    opts.width ? ` width={${opts.width}}` : '',
    opts.height ? ` height={${opts.height}}` : '',
  ].join('')

  return `<img
    src={${opts.src}}
    alt="${opts.alt}"
    loading="${loading}"${classAttr}${sizeAttrs}
    style={{ objectFit: 'cover' }}
    onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.style.background = 'linear-gradient(135deg, #1a1a2e, #16213e)'; }}
  />`
}
