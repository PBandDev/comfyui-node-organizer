# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ComfyUI custom node extension that organizes nodes. Frontend-only extension (no Python backend nodes) that uses TypeScript/Vite for the UI.

## Commands

```bash
pnpm install        # install deps
pnpm dev            # dev server
pnpm build          # typecheck + build to dist/
pnpm watch          # build with watch mode
pnpm typecheck      # tsc --noEmit
pnpm test           # run tests
pnpm test:watch     # run tests in watch mode
pnpm test:coverage  # run tests with coverage report
```

Version bumping: `uv run bump-my-version bump patch|minor|major`

## Architecture

**Dual-stack extension**: Python entrypoint + TypeScript frontend

- `__init__.py` - ComfyUI entrypoint, points `WEB_DIRECTORY` to `./dist`
- `src/index.ts` - Extension entry, registers via `app.registerExtension()`
- `src/debug.ts` - Debug logging utilities (separated for testability)
- `dist/` - Built JS output, loaded by ComfyUI frontend

**Build system**: Vite with custom plugin that injects `import { app } from "/scripts/app.js"` at build time. ComfyUI scripts are external (not bundled).

**Types**: `@comfyorg/comfyui-frontend-types` provides ComfyApp interface. Global `app` declared for runtime access.

## ComfyUI Extension Pattern

Extensions register hooks via `app.registerExtension({ name, setup?, ... })`. The `app` object provides access to:
- Graph/canvas manipulation
- Node lifecycle hooks
- UI customization APIs

Use docs-mcp server for ComfyUI API reference.

## Layout Algorithm

**Hybrid Sugiyama + Bin Packing** in `src/layout/`:

1. `node-classifier.ts` - Classify nodes (connected/disconnected/reroutes)
2. `reroute-collapse.ts` - Collapse reroute chains into virtual edges
3. `graph-builder.ts` - Build DAG from connected nodes only
4. `layer-assign.ts` - Longest-path layer assignment
5. `ordering.ts` - Size-aware barycenter crossing minimization
6. `bin-pack.ts` - FFDH algorithm for multi-column packing
7. `positioning.ts` - Assign coordinates, place disconnected nodes, restore reroutes
8. `groups.ts` - Resize groups to fit members
9. `layout-utils.ts` - Shared functions for internal edge detection and member layer assignment
10. `selected-groups.ts` - Organize only selected groups independently

**Configuration** in `types.ts`:
- `maxColumns`: 0=auto, 1=vertical stack, 2+=fixed columns
- `collapseReroutes`: true to collapse reroute chains
- `disconnectedGap`: gap between disconnected zone and DAG

**Key design decisions**:
- `compactVertically` excludes groups from max height (prevents Y explosion)
- `positionGroupContents` uses translation (preserves relative positions)
- Group dimensions are layer-aware: width = sum of layer widths, height = max of layer heights (for groups with internal connections)
- `resolveGroupOverlaps` detects and shifts overlapping groups using minimal direction (up/down/right)
- `assignNodeYPositions` tracks reserved Y regions to prevent node/group overlap within layers
- **Idempotency**: Layout is a pure function of topology + sizes; overlap resolution decoupled from node.pos writes

## Selected Groups Layout

`layoutSelectedGroups(graph, selectedGroupIds, config?)` in `src/layout/selected-groups.ts`:

**Context menu items** (in `src/index.ts`):
- "Organize Group" - when single group selected
- "Organize N Groups" - when multiple groups selected

**Behavior**:
- Uses internal connections only (ignores external edges)
- Disconnected nodes within group stacked vertically
- Nested groups auto-included when parent selected
- External overlaps acceptable (no resolution with non-selected nodes)
- Groups resized to fit organized contents

**Selection detection**:
- Uses `app.canvas.selectedItems` (Set of Positionable)
- Duck-typing via `isLGraphGroup()` checks for pos/size/title/id
- Handles Float64Array (ComfyUI runtime uses typed arrays for pos/size)

## Testing

**Vitest-based regression testing** in `tests/`:

- `tests/fixtures/` - 4 workflow JSONs (nested-groups, complex-parallel, simple-dag, nested-wrapper)
- `tests/helpers.ts` - Fixture loader, workflow→LGraph converter, cloneGraph
- `tests/invariants.ts` - 6 reusable assertions:
  - `assertNoOverlaps` - AABB collision detection
  - `assertNodesInsideGroups` - nodes stay in groups
  - `assertFiniteCoordinates` - no NaN/Infinity
  - `assertTopologicalOrder` - DAG order preserved
  - `assertIdempotent` - stable after multiple runs
  - `assertGroupMembershipPreserved` - nodes originally in groups remain in groups
- `tests/integration/layout.test.ts` - Main regression tests
- `tests/integration/selected-groups.test.ts` - Selected groups layout tests (17 cases)

**Coverage**: 70% line threshold, excludes `src/index.ts` (ComfyUI runtime) and `src/layout/reroute-collapse.ts` (no fixtures)

All fixtures pass all invariants including idempotency. 50 total tests.

## CI/CD

`.github/workflows/publish_action.yaml` - Manual dispatch workflow that:
1. Runs tests
2. Bumps version via bump-my-version
3. Creates GitHub release
4. Builds and publishes to Comfy registry
