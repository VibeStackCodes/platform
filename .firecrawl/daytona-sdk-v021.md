JUN 11 2025 // 3 min read

Share

- Copy link
- [Share on Twitter](https://twitter.com/intent/tweet?url=https://www.daytona.io/dotfiles/updates/daytona-sdk-v0-21-0-breaking-changes-migration-guide&text=Daytona%20SDK%20v0.21.0:%20Breaking%20Changes%20&%20Migration%20Guide&via=Daytona)
- [Share on Facebook](https://www.facebook.com/sharer/sharer.php?u=https://www.daytona.io/dotfiles/updates/daytona-sdk-v0-21-0-breaking-changes-migration-guide)
- [Share on Linkedin](https://www.linkedin.com/sharing/share-offsite/?url=https://www.daytona.io/dotfiles/updates/daytona-sdk-v0-21-0-breaking-changes-migration-guide)

Link copied successfully!

# Daytona SDK v0.21.0: Breaking Changes & Migration Guide

##### Tags

- sdk
- breaking changes
- typescript
- python
- api
- migration
- release notes
- snapshots

> A major upgrade to the Daytona SDK is coming this Sunday, with breaking changes that simplify sandbox creation, standardize resource management, and lay the foundation for a more powerful snapshot-based workflow.

## Why This Matters

In v0.21.0, we’re introducing a more robust architecture centered around **snapshots**, replacing the legacy pre-built image flow. This refactor enables better caching, more declarative sandbox provisioning, and consistent behavior across TypeScript and Python implementations.

This upcoming release includes **breaking changes**, which means if you're using v0.20.2 or earlier, you’ll need to update your integration to keep things working as expected, especially if you rely on the declarative image builder.

## Migration Timeline

- **Old version:** v0.20.2

- **New version:** v0.21.0

- **Compatibility:** The refactored backend is temporarily backward-compatible, but **declarative image builder support will break** for v0.20.2.

- **Recommended action:** Upgrade to v0.21.0 now to access new features and ensure continued support.


## **🛠 Maintenance Notice**

To support this SDK upgrade, **scheduled downtime will occur on Sunday, June 15th, from 03:00 to 03:30 Pacific Time**. Services may be temporarily unavailable during this window.

## 🔄 Key Changes Overview

01. **Image creation → Snapshot creation**

    A more powerful snapshot abstraction replaces pre-built images.

02. **New parameter types for sandbox creation**

    `CreateSandboxParams` is now split into more explicit types.

03. **New**`Resources` **object**

    Resource configuration is standardized and explicit.

04. **Renamed callback parameters**

    All callback-related options now reflect the snapshot-based flow.

05. **New Snapshot Service**

    Easily list, create, delete, and inspect snapshots from your SDK.

06. **Removed** **`SandboxTargetRegion`** **enum**

    Define target region using a plain string value.

07. **Reduced verbosity of method for retrieving a single Sandbox**

    A more concise `get` method is now available on the `Daytona` object.

08. **Removed deprecated aliases for Sandbox methods**

    Using deprecated workspace methods is no longer supported.

09. **Flattened Sandbox instance information**

    Sandbox details are now only available as top-level properties.

10. **Removed legacy Sandbox properties**

    Name and class are no longer present on the Sandbox object.

11. **Improved functionality for refreshing Sandbox information**

    The new method updates the Sandbox object properties directly.

12. **Removed deprecated method for Sandbox removal in the TypeScript SDK**

    Using `daytona.remove(sandbox)` is no longer supported.


## 1\. Images → Snapshots

Snapshots now power sandbox creation. Here’s how the change looks in practice:

#### **TypeScript**

**Before:**

Code copied successfully!

```
1// Creating a pre-built image
2const imageName = `example:${Date.now()}`;
3await daytona.createImage(imageName, image, { onLogs: console.log });
4// Using the pre-built image
5const sandbox = await daytona.create(
6  { image: imageName }
7);
```

**After:**

Code copied successfully!

```
1// Creating a snapshot
2const snapshotName = `example:${Date.now()}`;
3await daytona.snapshot.create(
4  {
5    name: snapshotName,
6    image,
7    resources: {
8      cpu: 1,
9      memory: 1,
10      disk: 3,
11    },
12  },
13  { onLogs: console.log }
14);
15// Using the snapshot
16const sandbox = await daytona.create({
17  snapshot: snapshotName,
18});
```

#### **Python**

**Before:**

Code copied successfully!

```
1# Creating a pre-built image
2image_name = f"python-example:{int(time.time())}"
3daytona.create_image(image_name, image, on_logs=print)
4# Using the pre-built image
5sandbox = daytona.create(
6    CreateSandboxParams(image=image_name),
7)
```

**After:**

Code copied successfully!

```
1# Creating a snapshot
2snapshot_name = f"python-example:{int(time.time())}"
3daytona.snapshot.create(
4    CreateSnapshotParams(
5        name=snapshot_name,
6        image=image,
7        resources=Resources(
8            cpu=1,
9            memory=1,
10            disk=3,
11        ),
12    ),
13    on_logs=print,
14)
15# Using the snapshot
16sandbox = daytona.create(
17  CreateSandboxFromSnapshotParams(snapshot=snapshot_name)
18)
```

* * *

## 2\. New Parameter Types for Sandbox Creation

We’ve replaced the all-in-one `CreateSandboxParams` with more specific options, depending on whether you’re creating from an image or a snapshot.

#### TypeScript

🧩 Old SDK – Single Parameter Class

Code copied successfully!

```
1// Basic creation
2const sandbox = await daytona.create({
3  language: "typescript",
4});
5

6// With image and callback
7const sandbox = await daytona.create(
8  {
9    image: Image.debianSlim("3.12"),
10    resources: {
11      cpu: 2,
12      memory: 4,
13      disk: 20,
14    },
15  },
16  { onImageBuildLogs: console.log }
17);
18

19// With language and resources
20const sandbox = await daytona.create({
21  language: "typescript",
22  resources: {
23    cpu: 2,
24    memory: 4,
25  },
26});
```

**🚀 New SDK – Specific Parameter Classes**

Code copied successfully!

```
1// Basic creation (unchanged for simple use cases)
2const sandbox = await daytona.create({
3  language: "typescript",
4});
5

6// Creating from image. A dynamic snapshot will be created and used to initialize the sandbox.
7const sandbox = await daytona.create(
8  {
9    image: Image.debianSlim("3.12"),
10    resources: {
11      cpu: 2,
12      memory: 4,
13      disk: 20,
14    },
15  },
16  {
17    onSnapshotCreateLogs: console.log, // renamed from onImageBuildLogs
18  }
19);
20

21// Creating from snapshot
22const sandbox = await daytona.create({
23  snapshot: "my-snapshot-name",
24});
```

#### Python

**🧩 Old SDK – Single Parameter Class**

Code copied successfully!

```
1# Basic creation
2params = CreateSandboxParams(language="python")
3sandbox = daytona.create(params)
4

5# With image
6params = CreateSandboxParams(
7    language="python",
8    image=Image.debian_slim("3.12")
9)
10sandbox = daytona.create(params, on_image_build_logs=print)
11

12# With language and resources
13params = CreateSandboxParams(
14    language="python",
15    resources=SandboxResources(
16        cpu=1,
17        memory=1,
18        disk=3,
19    ),
20)
21sandbox = daytona.create(params)
```

**🚀 New SDK – Specific Parameter Classes**

Code copied successfully!

```
1# Basic creation (unchanged for simple cases)
2params = CreateSandboxFromSnapshotParams(language="python")
3sandbox = daytona.create(params)
4

5# Creating from image. A dynamic snapshot will be created and used to initialize the sandbox.
6params = CreateSandboxFromImageParams(
7    image=Image.debian_slim("3.12"),
8    language="python",
9    resources=Resources(
10        cpu=1,
11        memory=1,
12        disk=3,
13    ),
14)
15sandbox = daytona.create(params, timeout=150, on_snapshot_create_logs=print)
16

17# Creating from snapshot
18params = CreateSandboxFromSnapshotParams(
19    snapshot="my-snapshot-name",
20    language="python",
21)
22sandbox = daytona.create(params)
```

* * *

## 3\. Standardized Resource Configuration

We've unified resource definitions under a single `Resources` object across SDKs.

| Old | New |
| --- | --- |
| SandboxResources | Resources |

This improves clarity and aligns with our declarative execution model.

* * *

## 4\. Updated Callback Names

To reflect the shift to snapshots:

| Old | New |
| --- | --- |
| onImageBuildLogs | onSnapshotCreateLogs |

* * *

## 5\. New Snapshot Service

You can now manage snapshots directly via a dedicated SDK interface.

#### **TypeScript**

Code copied successfully!

```
1// Access snapshot operations
2await daytona.snapshot.create(params);
3await daytona.snapshot.list();
4await daytona.snapshot.get(snapshotName);
5await daytona.snapshot.delete(snapshot);
```

#### **Python**

Code copied successfully!

```
1# Access snapshot operations
2daytona.snapshot.create(params)
3daytona.snapshot.list()
4daytona.snapshot.get(snapshot_name)
5daytona.snapshot.delete(snapshot)
```

* * *

## 6\. **Removed SandboxTargetRegion Enum**

Target region has to be specified using a simple string value instead of an enum. Here’s how the change looks in practice:

#### **TypeScript**

**Before:**

Code copied successfully!

```
1const daytona: Daytona = new Daytona({
2    target: SandboxTargetRegion.US
3});
```

**After:**

Code copied successfully!

```
1const daytona: Daytona = new Daytona({
2    target: "us"
3});
```

#### **Python**

**Before:**

Code copied successfully!

```
1config = DaytonaConfig(
2    target=SandboxTargetRegion.EU
3)
4

5daytona = Daytona(config)
```

**After:**

Code copied successfully!

```
1config = DaytonaConfig(
2    target="eu"
3)
4

5daytona = Daytona(config)
```

* * *

## 7\. **Reduced Verbosity of Method for Retrieving a Single Sandbox**

A more concise `get` method is now available on the `Daytona` object. Here’s how the change looks in practice:

#### **TypeScript**

**Before:**

Code copied successfully!

```
1// Get sandbox by id
2const sandbox = daytona.getCurrentSandbox(id)
```

**After:**

Code copied successfully!

```
1// Get sandbox by id
2const sandbox = daytona.get(id)
```

#### **Python**

**Before:**

Code copied successfully!

```
1# Get sandbox by id
2sandbox = daytona.get_current_sandbox(id)
```

**After:**

Code copied successfully!

```
1# Get sandbox by id
2sandbox = daytona.get(id)
```

* * *

## 8\. **Removed Deprecated Aliases for Sandbox Methods**

Using deprecated workspace methods is no longer supported. Here’s how the change looks in practice:

#### **TypeScript**

**Before:**

Code copied successfully!

```
1// Get workspace by id
2const workspace = daytona.getCurrentWorkspace(id)
3

4// Get the root directory path
5const dir = workspace.getWorkspaceRootDir()
6

7// Search for all symbols containing "TODO"
8const lsp = await workspace.createLspServer('typescript', 'workspace/project')
9const symbols = await lsp.workspaceSymbols('TODO');
10

11// Convert an API workspace instance to a WorkspaceInfo object
12const info = Workspace.toWorkspaceInfo(apiWorkspace)
```

**After:**

Code copied successfully!

```
1// Get sandbox by id
2const sandbox = daytona.get(id)
3

4// Get the root directory path
5const dir = sandbox.getUserRootDir()
6

7// Search for all symbols containing "TODO"
8const lsp = await sandbox.createLspServer('typescript', 'workspace/project')
9const symbols = await lsp.sandboxSymbols('TODO');
10

11// Convert an API sandbox instance to a SandboxInfo object
12const info = Sandbox.toSandboxInfo(apiSandbox)
```

#### **Python**

**Before:**

Code copied successfully!

```
1# Get workspace by id
2workspace = daytona.get_current_workspace(id)
3

4# Get the root directory path
5dir = workspace.get_workspace_root_dir()
6

7# Search for all symbols containing "TODO"
8lsp = workspace.create_lsp_server("python", "workspace/project")
9symbols = lsp.workspace_symbols("TODO")
10

11# Wait for workspace to reach "started" state
12workspace.wait_for_workspace_start()
13

14# Wait for workspace to reach "stopped" state
15workspace.wait_for_workspace_stop()
```

**After:**

Code copied successfully!

```
1# Get sandbox by id
2sandbox = daytona.get(id)
3

4# Get the root directory path
5sandbox.get_user_root_dir()
6

7# Search for all symbols containing "TODO"
8lsp = sandbox.create_lsp_server("python", "workspace/project")
9symbols = lsp.sandbox_symbols("TODO")
10

11# Wait for sandbox to reach "started" state
12sandbox.wait_for_sandbox_start()
13

14# Wait for sandbox to reach "stopped" state
15sandbox.wait_for_sandox_stop()
```

* * *

## 9\. **Flattened Sandbox Instance Information**

Sandbox details are now available only as top-level properties. Here’s how the change looks in practice:

#### **TypeScript**

**Before:**

Code copied successfully!

```
1const state = sandbox.instance.state
2const autoStopInterval = sandbox.instance.autoStopInterval
3const domain = sandbox.instance.info?.nodeDomain
```

**After:**

Code copied successfully!

```
1const state = sandbox.state;
2const autoStopInterval = sandbox.autoStopInterval
3const domain = sandbox.runnerDomain
```

#### **Python**

**Before:**

Code copied successfully!

```
1state = sandbox.instance.state
2auto_stop_interval = sandbox.instance.auto_stop_interval
3domain = sandbox.instance.info.node_domain
```

**After:**

Code copied successfully!

```
1state = sandbox.state
2auto_stop_interval = sandbox.auto_stop_interval
3domain = sandbox.runner_domain
```

* * *

## 10\. **Removed Legacy Sandbox Properties**

Name and class are no longer present on the Sandbox object. Here’s how the change looks in practice:

#### **TypeScript**

**Before:**

Code copied successfully!

```
1// Valid
2const sandboxName = sandbox.instance.name
3const sandboxClass = sandbox.instance.info?.class
```

**After:**

Code copied successfully!

```
1// Invalid
2const sandboxName = sandbox.name;
3const sandboxClass = sandbox.class
```

#### **Python**

**Before:**

Code copied successfully!

```
1# Valid
2name = workspace.instance.name
3class_name = workspace.instance.info.class_name
```

**After:**

Code copied successfully!

```
1# Invalid
2name = workspace.name
3class_name = workspace.class_name
```

* * *

## 11\. **Improved Functionality for Refreshing Sandbox Information**

The new method updates the Sandbox object properties directly. Here’s how the change looks in practice for some of the Sandbox properties:

#### **TypeScript**

**Before:**

Code copied successfully!

```
1// Get up-to-date sandbox info
2const info = await sandbox.info()
```

**After:**

Code copied successfully!

```
1// Update sandbox with up-to-date info
2await sandbox.refreshData()
```

#### **Python**

**Before:**

Code copied successfully!

```
1# Get up-to-date sandbox info
2info = sandbox.info()
```

**After:**

Code copied successfully!

```
1# Update sandbox with up-to-date info
2sandbox.refresh_data()
```

* * *

## 12\. **Removed Deprecated Method for Sandbox Removal in the TypeScript SDK**

Using `daytona.remove(sandbox)` is no longer supported. Here’s how the change looks in practice:

#### **TypeScript**

**Before:**

Code copied successfully!

```
1// Deprecated
2await daytona.remove(sandbox)
```

**After:**

Code copied successfully!

```
1// Option 1
2await sandbox.delete()
3

4// Option 2
5await daytona.delete(sandbox)
```

* * *

## ✅ Migration Checklist

#### For TypeScript Users

- Replace all `daytona.createImage()` calls with `daytona.snapshot.create()`

- Use `CreateSandboxFromImageParams` or `CreateSandboxFromSnapshotParams` when creating sandboxes

- Replace all instances of `SandboxResources` with `Resources`

- Rename `onImageBuildLogs` callbacks to `onSnapshotCreateLogs`

- Replace `SandboxTargetRegion` enum with plain string values (e.g., `"us"`, `"eu"`)

- Replace retrieving a single Sandbox using `daytona.getCurrentSandbox(id)` to `daytona.get(id)`

- Replace deprecated `daytona.getCurrentWorkspace(id)` with `daytona.get(id)`

- Replace deprecated `workspace.getWorkspaceRootDir()` with `sandbox.getUserRootDir()`

- Replace deprecated `lspServer.workspaceSymbols(query)` with `lspServer.sandboxSymbols(query)`

- Replace deprecated `Workspace.toWorkspaceInfo(apiWorkspace)` with `Sandbox.toSandboxInfo(apiSandbox)`

- Update reading Sandbox details to use top-level properties instead of reading from `sandbox.instance`

- Remove references to legacy sandbox properties (`name`, `class`)

- Replace using `sandbox.info()` to get up-to-date Sandbox info with `sandbox.refreshData()` to update the Sandbox properties directly

- Replace using `daytona.remove(sandbox)` with `sandbox.delete()` or `daytona.delete(sandbox)`


* * *

#### For Python Users

- Replace all `daytona.create_image()` calls with `daytona.snapshot.create()`

- Import and use: `CreateSnapshotParams`, `CreateSandboxFromImageParams`, `CreateSandboxFromSnapshotParams`, and `Resources`

- Replace all usage of `CreateSandboxParams` with the appropriate class (`CreateSandboxFromImageParams` or `CreateSandboxFromSnapshotParams`)

- Replace all usage of `SandboxResources` with `Resources`

- Rename `on_image_build_logs` callbacks to `on_snapshot_create_logs`

- Replace `SandboxTargetRegion` enum with plain string values (e.g., `"us"`, `"eu"`)

- Replace retrieving a single Sandbox using `daytona.get_current_sandbox(id)` to `daytona.get(id)`

- Replace deprecated `daytona.get_current_workspace(id)` with `daytona.get(id)`

- Replace deprecated `workspace.get_workspace_root_dir()` with `sandbox.get_user_root_dir()`

- Replace deprecated `lsp_server.workspace_symbols(query)` with `lsp_server.sandbox_symbols(query)`

- Replace using deprecated methods `workspace.wait_for_workspace_start()` and `workspace.wait_for_workspace_stop()` with `sandbox.wait_for_sandbox_start()` and `sandbox.wait_for_sandbox_stop()`

- Update reading Sandbox details to use top-level properties instead of reading from `sandbox.instance`

- Remove references to legacy sandbox properties (`name`, `class_name`)

- Replace using `sandbox.info()` to get up-to-date Sandbox info with `sandbox.refresh_data()` to update the Sandbox properties directly


## Final Notes

This release unlocks a more powerful and flexible infrastructure model across all SDKs.

If you're using Cursor, you can find an example [here](https://github.com/daytonaio/gists/blob/main/gists/cursor/rules/daytona-sdk-v-0-21-migration.mdc) that you can add to your Project Rules to help with the migration.

If you need help migrating or want to discuss your use case, reach out via:

- In-app support widget

- [Slack](https://go.daytona.io/slack)

- Email: [support@daytona.io](mailto:support@daytona.io)


We’re excited to see what you build with it.

📚 You can also find full API and SDK reference at [daytona.io/docs](https://www.daytona.io/docs).

## other updates

- [**What's New at Daytona: January 2026** JAN 30 2026](https://www.daytona.io/dotfiles/updates/what-s-new-at-daytona-january-2026)
- [**Daytona Community Hours \#8** AUG 14 2024](https://www.daytona.io/dotfiles/updates/daytona-community-hours-8)
- [**Daytona Community Hours \#7** SEP 08 2024](https://www.daytona.io/dotfiles/updates/daytona-community-hours-7)
- [**Community Hours \#24: Logs, Git Updates, and Automation** DEC 24 2024](https://www.daytona.io/dotfiles/updates/community-hours-24-logs-git-updates-and-automation)

## Newsletter

**Subscribe to DotFiles Insider,** a weekly newsletter for developers covering stories, techniques, guides and
the latest product innovations coming.

Enter your email