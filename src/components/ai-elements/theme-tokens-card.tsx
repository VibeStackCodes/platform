import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface ThemeColors {
  background: string
  foreground: string
  primary: string
  primaryForeground: string
  secondary: string
  accent: string
  muted: string
  border: string
}

interface ThemeFonts {
  display: string
  body: string
  googleFontsUrl: string
}

interface ThemeStyle {
  borderRadius: string
  cardStyle: 'bordered' | 'elevated' | 'flat'
  navStyle: 'top-bar' | 'sidebar' | 'minimal'
  heroLayout: 'fullbleed' | 'split' | 'centered'
  spacing: 'compact' | 'normal' | 'loose'
  motion: 'none' | 'subtle' | 'expressive'
  imagery: 'photography-heavy' | 'illustration' | 'minimal' | 'icon-driven'
}

interface ThemeTokens {
  name: string
  colors: ThemeColors
  fonts: ThemeFonts
  style: ThemeStyle
  authPosture: 'public' | 'authenticated' | 'mixed'
  textSlots: Record<string, string>
  aestheticDirection?: string
  layoutStrategy?: string
  signatureDetail?: string
}

interface ThemeTokensCardProps {
  tokens: ThemeTokens
}

const COLOR_KEYS: Array<keyof ThemeColors> = [
  'background',
  'foreground',
  'primary',
  'primaryForeground',
  'secondary',
  'accent',
  'muted',
  'border',
]

const STYLE_KEYS: Array<keyof Omit<ThemeStyle, 'borderRadius'>> = [
  'cardStyle',
  'navStyle',
  'heroLayout',
  'spacing',
  'motion',
  'imagery',
]

function ThemeTokensCard({ tokens }: ThemeTokensCardProps) {
  const { colors, fonts, style } = tokens

  return (
    <Card className="gap-4 shadow-none">
      <style>{`@import url(${fonts.googleFontsUrl})`}</style>

      <CardContent className="flex flex-col gap-5">
        {/* Colors */}
        <section>
          <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
            Colors
          </p>
          <div className="flex flex-wrap gap-2">
            {COLOR_KEYS.map((key) => (
              <div key={key} className="flex flex-col items-center gap-1">
                <div
                  data-testid={`swatch-${key}`}
                  className="h-8 w-8 rounded-md border border-black/10"
                  style={{ backgroundColor: colors[key] }}
                />
                <span className="text-muted-foreground max-w-[40px] truncate text-center text-[9px] leading-tight">
                  {key}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Fonts */}
        <section>
          <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
            Fonts
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground w-12 shrink-0 text-xs">Display</span>
              <span className="text-sm" style={{ fontFamily: fonts.display }}>
                {fonts.display}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground w-12 shrink-0 text-xs">Body</span>
              <span className="text-sm" style={{ fontFamily: fonts.body }}>
                {fonts.body}
              </span>
            </div>
          </div>
        </section>

        {/* Style chips */}
        <section>
          <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
            Style
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_KEYS.map((key) => (
              <Badge key={key} variant="secondary">
                {style[key]}
              </Badge>
            ))}
          </div>
        </section>

        {/* Design Decisions */}
        {(tokens.aestheticDirection || tokens.layoutStrategy || tokens.signatureDetail) && (
          <section>
            <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
              Design Decisions
            </p>
            <div className="flex flex-col gap-1">
              {tokens.aestheticDirection && (
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground w-20 shrink-0 text-xs">Aesthetic</span>
                  <span className="text-sm">{tokens.aestheticDirection}</span>
                </div>
              )}
              {tokens.layoutStrategy && (
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground w-20 shrink-0 text-xs">Layout</span>
                  <span className="text-sm">{tokens.layoutStrategy}</span>
                </div>
              )}
              {tokens.signatureDetail && (
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground w-20 shrink-0 text-xs">Signature</span>
                  <span className="text-sm">{tokens.signatureDetail}</span>
                </div>
              )}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

export { ThemeTokensCard }
export type { ThemeTokens, ThemeTokensCardProps }
