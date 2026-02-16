import type { AppBlueprint } from './app-blueprint'

interface SandboxFS {
  fs: {
    uploadFile(content: Buffer, path: string): Promise<void>
  }
}

interface WriteResult {
  filesWritten: number
  errors: string[]
}

/**
 * Write all blueprint files to a Daytona sandbox, sorted by layer.
 * Layer ordering ensures dependencies are written before dependents.
 */
export async function blueprintToSandbox(
  blueprint: AppBlueprint,
  sandbox: SandboxFS,
): Promise<WriteResult> {
  const sorted = [...blueprint.fileTree].toSorted((a, b) => a.layer - b.layer)
  const errors: string[] = []
  let filesWritten = 0

  for (const file of sorted) {
    try {
      await sandbox.fs.uploadFile(
        Buffer.from(file.content),
        `/workspace/${file.path}`,
      )
      filesWritten++
    } catch (err) {
      errors.push(`Failed to write ${file.path}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { filesWritten, errors }
}
