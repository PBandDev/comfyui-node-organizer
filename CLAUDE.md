# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ComfyUI custom node extension that organizes nodes. Frontend-only extension (no Python backend nodes) that uses TypeScript/Vite for the UI.

## Commands

```bash
pnpm install       # install deps
pnpm dev           # dev server
pnpm build         # typecheck + build to dist/
pnpm watch         # build with watch mode
pnpm typecheck     # tsc --noEmit
```

Version bumping: `uv run bump-my-version bump patch|minor|major`

## Architecture

**Dual-stack extension**: Python entrypoint + TypeScript frontend

- `__init__.py` - ComfyUI entrypoint, points `WEB_DIRECTORY` to `./dist`
- `src/index.ts` - Extension entry, registers via `app.registerExtension()`
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

**Configuration** in `types.ts`:
- `maxColumns`: 0=auto, 1=vertical stack, 2+=fixed columns
- `collapseReroutes`: true to collapse reroute chains
- `disconnectedGap`: gap between disconnected zone and DAG

**Key design decisions**:
- `compactVertically` excludes groups from max height (prevents Y explosion)
- `positionGroupContents` uses translation (preserves relative positions)
- Group height uses bounding box (not sum of heights)
- `resolveGroupOverlaps` detects and shifts overlapping groups using minimal direction (up/down/right)
- `assignNodeYPositions` tracks reserved Y regions to prevent node/group overlap within layers

## CI/CD

`.github/workflows/publish_action.yaml` - Manual dispatch workflow that:
1. Bumps version via bump-my-version
2. Creates GitHub release
3. Builds and publishes to Comfy registry
