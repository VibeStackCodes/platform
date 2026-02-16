import { Daytona } from "@daytonaio/sdk"
const d = new Daytona()
const sb = await d.get("78e3f56f-367a-4b13-80ff-54186060b14e")

// Check if ui directory exists
const r1 = await sb.process.executeCommand("ls -la /workspace/src/components/ui/ 2>&1", "/workspace")
console.log("=== src/components/ui/ ===")
console.log(r1.result)

// Check all components
const r2 = await sb.process.executeCommand("find /workspace/src/components -type f", "/workspace")
console.log("\n=== All component files ===")
console.log(r2.result)

// Check if shadcn/ui is available via npx
const r3 = await sb.process.executeCommand("cat /workspace/package.json | grep -E 'radix|shadcn'", "/workspace")
console.log("\n=== UI deps in package.json ===")
console.log(r3.result)

// Check node_modules for radix
const r4 = await sb.process.executeCommand("ls /workspace/node_modules/@radix-ui/ 2>/dev/null | head -10 || echo 'No radix'", "/workspace")
console.log("\n=== @radix-ui packages ===")
console.log(r4.result)
