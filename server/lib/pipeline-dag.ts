// lib/pipeline-dag.ts

export interface Stage<TCtx> {
  name: string
  deps: string[]
  run: (ctx: TCtx) => Promise<void>
}

/**
 * Execute a DAG of stages with maximum parallelism.
 * Stages run as soon as all their dependencies complete.
 * Errors propagate immediately — remaining stages are abandoned.
 */
export async function runDAG<TCtx>(stages: Stage<TCtx>[], ctx: TCtx): Promise<void> {
  const completed = new Set<string>()
  const running = new Map<string, Promise<void>>()
  const stageMap = new Map(stages.map((s) => [s.name, s]))

  while (completed.size < stages.length) {
    // Find stages ready to run (all deps completed, not running, not completed)
    const ready = stages.filter(
      (s) =>
        !completed.has(s.name) && !running.has(s.name) && s.deps.every((d) => completed.has(d)),
    )

    if (ready.length === 0 && running.size === 0) {
      const remaining = stages.filter((s) => !completed.has(s.name)).map((s) => s.name)
      throw new Error(
        `DAG deadlock: stages [${remaining.join(', ')}] have unresolvable dependencies`,
      )
    }

    // Launch ready stages
    for (const stage of ready) {
      const promise = stage.run(ctx).then(() => {
        completed.add(stage.name)
        running.delete(stage.name)
      })
      running.set(stage.name, promise)
    }

    // Wait for any stage to complete (or fail)
    if (running.size > 0) {
      await Promise.race(running.values())
    }
  }
}
