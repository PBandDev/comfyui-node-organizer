# ComfyUI Node Organizer

Automatically organizes ComfyUI workflows with a compact group-aware layout. Created with [comfyui-custom-node-template](https://github.com/PBandDev/comfyui-custom-node-template).

### Preview of organizing a workflow

<img src="assets/preview.gif" alt="User clicking on the Organize Workflow context menu item" loop=infinite>

### Preview of organizing groups with tokens

<img src="assets/preview-tokens.gif" alt="User clicking on different groups and seeing the nodes arranged according to the tokens" loop=infinite>

## Installation

1. Open **ComfyUI**
2. Go to **Manager > Custom Node Manager**
3. Search for `Node Organizer`
4. Click **Install**

## Usage

Use any of these entry points:

- Right-click the canvas and choose **Organize Workflow**
- Select groups and choose **Organize Group**
- Click the **Organize** action-bar button
- Use `Extensions > Node Organizer`
- Press `Shift+O`

## Group Layout Tokens

Add tokens to group titles to control how nodes are arranged:

| Token | Effect |
|-------|--------|
| `[HORIZONTAL]` | Single horizontal row |
| `[VERTICAL]` | Single vertical column |
| `[2ROW]`...`[9ROW]` | Distribute into N rows |
| `[2COL]`...`[9COL]` | Distribute into N columns |

**Examples:**
- `"My Loaders [HORIZONTAL]"` - arranges all nodes in a single row
- `"Processing [3COL]"` - distributes nodes into 3 columns

- Tokens are case-insensitive (`[horizontal]` works)
- `[1ROW]` = `[HORIZONTAL]`, `[1COL]` = `[VERTICAL]`
- Nested groups each respect their own tokens
- Groups without tokens use default DAG-based layout

## Testing

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm build:lib` emits the pure library entrypoint to `lib/`
- `pnpm setup:e2e` provisions a dedicated ComfyUI instance for browser tests and installs the exact workflow-template package required by the pinned ComfyUI checkout
- `pnpm test:e2e` runs the full Playwright suite against that instance
- Broad installed-template coverage is discovered live at E2E runtime from the pinned test ComfyUI environment, with one correctness-invariant test per installed workflow template

Checked-in repo fixtures live in `tests/fixtures/`. Visual regression is graph-canvas scoped and runs as part of the normal E2E suite.
Visual regression baselines are platform-specific: committed snapshots use `-win32` and `-linux` suffixes.

## Library API

`comfyui-node-organizer/core` exposes the pure Node-safe geometry helpers for non-ComfyUI consumers. The public surface is intentionally small: `inferGroupMembership()` for spatial membership inference and `normalizeWorkflowGeometry()` for layout on plain JSON-serializable workflow data.

Build it with `pnpm build:lib`. GitHub dependency consumers receive the built `lib/` artifacts through the package `prepare` step.

### Local CI

Install [act](https://github.com/nektos/act) and Docker, then run:

- `pnpm ci:local` runs the unit-test and build workflow inside a local container

E2E tests still require the normal local ComfyUI provisioning flow and are not part of the `act` path yet.

## Release

Maintainer flow:

- Merge the release branch into `main`
- Trigger `.github/workflows/publish_action.yaml` manually from `main`

That workflow runs the full test suite, bumps versioned files with `uv run bump-my-version`, creates the tag and GitHub release, then publishes the custom node from the bumped tag ref.

### Manual browser testing

Build the extension first so ComfyUI loads the current `dist/` output:

- `pnpm build`

Launch the test ComfyUI instance on a free port:

- `.test-comfy/venv/Scripts/comfy.exe --skip-prompt --workspace .test-comfy/comfyui/ launch -- --cpu --port 65192`

If the port is already taken, either choose a different port or stop leftover test-instance processes first:

- `Get-Process | Where-Object { $_.Path -like '*comfy-node-organizer\\.test-comfy*' } | Stop-Process -Force`

## Known Limitations

Very large or unusual workflows may still expose edge cases. If you hit one, please [open a GitHub issue](https://github.com/PBandDev/comfyui-node-organizer/issues) with a minimal reproducible workflow attached.
