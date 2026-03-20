# Schema and NodeOutput

## Schema (V3)

`io.Schema` describes a V3 node. Common fields:

- `node_id`, `display_name`, `category`, `description`
- `inputs`: list of `io.*.Input` instances
- `outputs`: list of `io.*.Output` instances

Common schema patterns:

- Use `search_aliases` to improve discoverability.
- Use `hidden=[io.Hidden.prompt, io.Hidden.extra_pnginfo]` for output nodes that save files or need metadata.
- Use `is_output_node=True` for nodes that write files or should appear as outputs.
- Use `optional=True` on inputs that may be omitted (e.g., optional second image, audio, or source).
- Use `tooltip=` on inputs to document important behavior (e.g., filename prefix, codec, indices).

Common flags:

- `is_output_node`
- `is_api_node`
- `is_deprecated`
- `is_experimental`
- `is_dev_only`
- `is_input_list`
- `not_idempotent`
- `accept_all_inputs`
- `enable_expand`

Optional metadata:

- `search_aliases`
- `price_badge`

Hidden fields for output nodes:

- `hidden=[io.Hidden.prompt, io.Hidden.extra_pnginfo]` to access workflow metadata.
- `hidden=[io.Hidden.unique_id]` when you need to send progress text to a specific node.

### Schema.finalize()

- Adds hidden fields required for API/output nodes.
- Assigns default output IDs if missing.

### Schema.validate()

- Ensures unique input/output IDs.
- Validates all inputs/outputs (and optional price badge).

## NodeOutput

`io.NodeOutput` is the standardized return type for V3 execution.

Common patterns:

- `return io.NodeOutput(result1, result2)`
- `return (result1, result2)`
- `return {"result": (result1, result2), "ui": ui_output}`

Supported fields:

- `result`: the output tuple
- `ui`: UI output (e.g., `ui.PreviewImage(...)`)
- `expand`: expansion dict for expandable nodes
- `block_execution`: block with a message
- `ExecutionBlocker` can be returned to block execution; it is normalized into `block_execution`.
