import { Moon, Redo2, Sun, Undo2 } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ColorPicker } from './color-picker'
import { SliderInput } from './slider-input'
import { type ThemeColorKey, useEditorStore } from './theme-store'

const COLOR_SECTIONS: { title: string; keys: { key: ThemeColorKey; label: string }[] }[] = [
  {
    title: 'Base',
    keys: [
      { key: 'background', label: 'Background' },
      { key: 'foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Primary',
    keys: [
      { key: 'primary', label: 'Primary' },
      { key: 'primary-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Secondary',
    keys: [
      { key: 'secondary', label: 'Secondary' },
      { key: 'secondary-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Muted',
    keys: [
      { key: 'muted', label: 'Muted' },
      { key: 'muted-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Accent',
    keys: [
      { key: 'accent', label: 'Accent' },
      { key: 'accent-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Card',
    keys: [
      { key: 'card', label: 'Card' },
      { key: 'card-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Popover',
    keys: [
      { key: 'popover', label: 'Popover' },
      { key: 'popover-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Destructive',
    keys: [{ key: 'destructive', label: 'Destructive' }],
  },
  {
    title: 'Border / Input / Ring',
    keys: [
      { key: 'border', label: 'Border' },
      { key: 'input', label: 'Input' },
      { key: 'ring', label: 'Ring' },
    ],
  },
  {
    title: 'Charts',
    keys: [
      { key: 'chart-1', label: 'Chart 1' },
      { key: 'chart-2', label: 'Chart 2' },
      { key: 'chart-3', label: 'Chart 3' },
      { key: 'chart-4', label: 'Chart 4' },
      { key: 'chart-5', label: 'Chart 5' },
    ],
  },
  {
    title: 'Sidebar',
    keys: [
      { key: 'sidebar', label: 'Sidebar' },
      { key: 'sidebar-foreground', label: 'Foreground' },
      { key: 'sidebar-primary', label: 'Primary' },
      { key: 'sidebar-primary-foreground', label: 'Primary FG' },
      { key: 'sidebar-accent', label: 'Accent' },
      { key: 'sidebar-accent-foreground', label: 'Accent FG' },
      { key: 'sidebar-border', label: 'Border' },
      { key: 'sidebar-ring', label: 'Ring' },
    ],
  },
]

const SYSTEM_FONTS = [
  { value: '"DM Sans", -apple-system, system-ui, sans-serif', label: 'DM Sans' },
  { value: '-apple-system, system-ui, sans-serif', label: 'System Sans' },
  { value: '"Inter", -apple-system, system-ui, sans-serif', label: 'Inter' },
  { value: '"Geist", -apple-system, system-ui, sans-serif', label: 'Geist' },
]

const DISPLAY_FONTS = [
  { value: '"DM Serif Display", Georgia, serif', label: 'DM Serif Display' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Playfair Display", Georgia, serif', label: 'Playfair Display' },
]

const MONO_FONTS = [
  { value: '"JetBrains Mono", ui-monospace, monospace', label: 'JetBrains Mono' },
  { value: 'ui-monospace, monospace', label: 'System Mono' },
  { value: '"Fira Code", ui-monospace, monospace', label: 'Fira Code' },
]

export function ControlsPanel() {
  const {
    theme, isDark, preset,
    setColor, setRadius, setFont,
    toggleDark, loadPreset,
    undo, redo, history, future,
  } = useEditorStore()

  const currentColors = isDark ? theme.dark : theme.light

  return (
    <div className="flex h-full w-80 flex-col border-r border-border bg-background overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Select value={preset} onValueChange={loadPreset}>
            <SelectTrigger className="flex-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="terracotta">Terracotta</SelectItem>
              <SelectItem value="ocean">Ocean</SelectItem>
              <SelectItem value="forest">Forest</SelectItem>
              <SelectItem value="amethyst">Amethyst</SelectItem>
              {preset === 'custom' && <SelectItem value="custom">Custom</SelectItem>}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleDark}>
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={history.length === 0} onClick={undo}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={future.length === 0} onClick={redo}>
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Color sections */}
      <Accordion type="multiple" defaultValue={['Base', 'Primary', 'Secondary']} className="px-4">
        {COLOR_SECTIONS.map((section) => (
          <AccordionItem key={section.title} value={section.title}>
            <AccordionTrigger className="text-sm py-2">{section.title}</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-2 pb-2">
                {section.keys.map(({ key, label }) => (
                  <ColorPicker
                    key={key}
                    label={label}
                    value={currentColors[key]}
                    onChange={(v) => setColor(key, v)}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}

        <AccordionItem value="typography">
          <AccordionTrigger className="text-sm py-2">Typography</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-3 pb-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Sans</label>
                <Select value={theme.fontSans} onValueChange={(v) => setFont('fontSans', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SYSTEM_FONTS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Display</label>
                <Select value={theme.fontDisplay} onValueChange={(v) => setFont('fontDisplay', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DISPLAY_FONTS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Mono</label>
                <Select value={theme.fontMono} onValueChange={(v) => setFont('fontMono', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONO_FONTS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="radius">
          <AccordionTrigger className="text-sm py-2">Radius</AccordionTrigger>
          <AccordionContent>
            <SliderInput
              label="Border Radius"
              value={theme.radius}
              onChange={setRadius}
              min={0}
              max={1.5}
              step={0.125}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
