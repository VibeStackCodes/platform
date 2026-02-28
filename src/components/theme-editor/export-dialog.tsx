import { useCallback, useState } from 'react'
import { Check, Clipboard, Code } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { generateCSS, generateJSON, useEditorStore } from './theme-store'

export function ExportDialog() {
  const { theme } = useEditorStore()
  const [copied, setCopied] = useState<string | null>(null)

  const css = generateCSS(theme)
  const json = generateJSON(theme)

  const handleCopy = useCallback(
    async (text: string, type: string) => {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    },
    [],
  )

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Code className="h-4 w-4 mr-1.5" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Export Theme</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="css">
          <TabsList>
            <TabsTrigger value="css">CSS</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="css" className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7"
              onClick={() => handleCopy(css, 'css')}
            >
              {copied === 'css' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Clipboard className="h-3.5 w-3.5" />
              )}
            </Button>
            <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-auto max-h-[50vh]">
              {css}
            </pre>
          </TabsContent>
          <TabsContent value="json" className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7"
              onClick={() => handleCopy(json, 'json')}
            >
              {copied === 'json' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Clipboard className="h-3.5 w-3.5" />
              )}
            </Button>
            <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-auto max-h-[50vh]">
              {json}
            </pre>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
