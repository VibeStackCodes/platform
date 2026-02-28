import { createFileRoute } from '@tanstack/react-router'
import { ThemeEditor } from '@/components/theme-editor'

export const Route = createFileRoute('/_authenticated/theme-editor')({
  component: ThemeEditor,
})
