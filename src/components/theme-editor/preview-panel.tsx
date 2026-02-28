import { buildStyles, useEditorStore } from './theme-store'
import { BuilderInput } from './compositions/builder-input'
import { CodeFiles } from './compositions/code-files'
import { ConversationThread } from './compositions/conversation-thread'
import { DashboardCards } from './compositions/dashboard-cards'
import { DataDisplay } from './compositions/data-display'
import { UIPrimitives } from './compositions/ui-primitives'

export function PreviewPanel() {
  const { theme, isDark } = useEditorStore()

  const colors = isDark ? theme.dark : theme.light
  const styles = buildStyles(colors, theme.radius, {
    sans: theme.fontSans,
    display: theme.fontDisplay,
    mono: theme.fontMono,
  })

  return (
    <div
      className="flex-1 overflow-y-auto bg-background text-foreground"
      style={styles}
    >
      <div className="mx-auto max-w-4xl space-y-8 p-6">
        <section>
          <h2 className="text-lg font-semibold mb-4">Dashboard Cards</h2>
          <DashboardCards />
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-4">Conversation</h2>
          <ConversationThread />
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-4">Builder Input</h2>
          <BuilderInput />
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-4">Code & Files</h2>
          <CodeFiles />
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-4">UI Primitives</h2>
          <UIPrimitives />
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-4">Data Display</h2>
          <DataDisplay />
        </section>
      </div>
    </div>
  )
}
