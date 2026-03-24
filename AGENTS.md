## Project

ComfyUI Node Organizer. Frontend-only custom node extension loaded from `dist/` through `__init__.py`.

## Start Here

Inspect `README.md`, `package.json`, `src/index.ts`, `src/adapter.ts`, and the relevant file under `src/layout/` or `tests/e2e/`.
Use `.changeset/plans/` only when prior design context is needed.

## Common Commands

```bash
pnpm install
pnpm build
pnpm build:lib
pnpm test:lib
pnpm typecheck
pnpm test
pnpm setup:e2e
pnpm test:e2e
pnpm ci:local
uv sync --locked --group dev
```

Version bumping:
- `uv run bump-my-version bump patch|minor|major`

## Repo Rules

- Build before E2E. ComfyUI loads `dist/`, not `src/`.
- Use `uv` for Python-side commands.
- Keep `.python-version` and `uv.lock` in sync with the publish workflow.
- Local `.changeset/*` files are intentionally gitignored. Do not commit them.
- Verify runtime behavior in ComfyUI before changing adapter logic or making claims about ComfyUI APIs.
- `src/core.ts` is the public library entrypoint. It must stay free of ComfyUI-specific imports such as `index.ts`, `adapter.ts`, `runtime.ts`, `settings.ts`, `debug.ts`, `bounds.ts`, or `utils.ts`.
- Library output is emitted to `lib/` by `pnpm build:lib` / `tsc -p tsconfig.lib.json`. The `prepare` script runs that build automatically on install.
- The npm package exports `"."` → `lib/core.js`. There is no `./core` subpath.

## Runtime Facts

- Ctrl+Z works after organize. ComfyUI snapshots graph state before extension mutations.
- Keybindings are managed in ComfyUI's keybinding settings, not inside this extension's settings panel.
- Graph access: `canvas.getCurrentGraph?.() ?? canvas.graph ?? app.graph`.
- Group membership is geometry-based. Use center-point containment for nodes and full-rect containment for child groups. Do not read `_children`.
- Do not call `recomputeInsideNodes()`. It reads stale coordinates after our in-place `pos[0] = x` updates and fills `_children` with wrong node IDs.
- Group layout IDs are namespaced as `group:<id>`.
- Selected-group organize re-anchors selected root groups to their original absolute positions.
- Subgraph `inputNode` and `outputNode` are first-class layout nodes.
- `isGroup()` is verified against live runtime with `constructor.name === "LGraphGroup"` and fallback `typeof type !== "string"`.

## Test Facts

- Unit: layout framework, adapter bridge, runtime helpers, property-based invariants.
- E2E: Playwright against `.test-comfy/`.
- `pnpm setup:e2e` pins ComfyUI to the revision in `e2e.config.ts` for CI parity.
- CI and publish run the full Playwright suite on Linux.
- Repo-owned fixtures live flat in `tests/fixtures/`.
- Installed `comfyui-workflow-templates` are discovered live at E2E runtime from the pinned test ComfyUI environment.
- Broad installed-template coverage asserts correctness invariants only; strict topological order remains repo-fixture-only.
- Visual regression is graph-canvas scoped and uses platform-specific `-win32` / `-linux` baselines.
- `pnpm ci:local` runs the full local CI workflow with `act`.

## Known Friction

- Some real ComfyUI workflows load with imperfect group rectangles. Verify against live runtime before changing containment behavior.
- A small number of real installed templates have topological-order violations due to complex inter-group connections. Tracked for a future minor release.
