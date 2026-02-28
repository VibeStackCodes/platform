export const typicalTypeError = `TypeError: Cannot read properties of undefined (reading 'map')
    at TodoList (src/components/todo-list.tsx:24:18)
    at renderWithHooks (node_modules/react-dom/cjs/react-dom.development.js:14985:18)
    at mountIndeterminateComponent (node_modules/react-dom/cjs/react-dom.development.js:17811:13)
    at beginWork (node_modules/react-dom/cjs/react-dom.development.js:19049:16)
    at HTMLUnknownElement.callCallback (node_modules/react-dom/cjs/react-dom.development.js:3991:14)
    at Object.invokeGuardedCallbackDev (node_modules/react-dom/cjs/react-dom.development.js:4040:16)
    at invokeGuardedCallback (node_modules/react-dom/cjs/react-dom.development.js:4094:31)
    at beginWork$1 (node_modules/react-dom/cjs/react-dom.development.js:23914:7)
    at performUnitOfWork (node_modules/react-dom/cjs/react-dom.development.js:22780:12)
    at workLoopSync (node_modules/react-dom/cjs/react-dom.development.js:22707:5)`

export const buildError = `Error: Build failed with 3 errors
    at runBuild (src/tools/build.ts:45:11)
    at async Agent.execute (src/lib/agents/orchestrator.ts:234:18)
    at async streamSSE (src/lib/sse.ts:78:5)
    at async route (server/routes/agent.ts:92:3)`

export const networkError = `NetworkError: Failed to fetch resource from /api/projects
    at apiFetch (src/lib/utils.ts:87:9)
    at fetchProjects (src/lib/queries.ts:34:16)
    at QueryClient._fetchQuery (node_modules/@tanstack/query-core/build/lib/queryClient.js:227:18)
    at Query.fetch (node_modules/@tanstack/query-core/build/lib/query.js:399:27)
    at node:internal/process/task_queues:140:5`
