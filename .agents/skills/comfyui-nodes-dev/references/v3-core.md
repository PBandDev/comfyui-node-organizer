# V3 Core API

## API Versions

- `comfy_api.latest` provides the newest API surface.
- `comfy_api.v0_0_2` is an adapter that re-exports `latest` and provides a stable import path.
- `comfy_api.v0_0_1` exists for older compatibility.

Recommended default for custom nodes: `comfy_api.v0_0_2`.

## Key Imports

Typical imports for nodepacks:

- `from comfy_api.v0_0_2 import io, ui, ComfyExtension`
- `from comfy_api.v0_0_2 import ComfyAPI, ComfyAPISync, Input, InputImpl, Types`

`ComfyExtension` is the extension entrypoint class. `io` and `ui` expose V3 node and UI helpers.

## ComfyExtension Lifecycle

- Implement `ComfyExtension.get_node_list()` (async) and return `list[type[io.ComfyNode]]`.
- Use `comfy_entrypoint()` to return an instance of your extension.

## Progress Reporting

`ComfyAPI.execution.set_progress(...)` updates the UI progress bar during execution.

Signature (latest):

- `set_progress(value: float, max_value: float, node_id: str | None = None, preview_image: Image | ImageInput | None = None, ignore_size_limit: bool = False)`

If `node_id` is omitted, ComfyUI will try to infer it from the executing context.

## PromptServer Text Updates

Use `PromptServer.instance.send_progress_text(text, node_id)` to display transient text on a node (e.g., image size readouts).

## Node Classmethods

Required:

- `define_schema(...)`: return `io.Schema`.
- `execute(...)`: perform the node action (can be `async`).

Optional:

- `validate_inputs(...)`: validate inputs and return `True` or a string error.
- `fingerprint_inputs(...)`: return a cheap fingerprint for caching.
- `check_lazy_status(...)`: return a list of lazy input names to evaluate.

References:

- `references/validation-and-caching.md` for `validate_inputs` and `fingerprint_inputs`.
- `references/lazy-evaluation.md` for `check_lazy_status`.

## Schema Flags With Behavior Impact

- `accept_all_inputs=True` allows frontend-defined widgets to skip strict validation.
