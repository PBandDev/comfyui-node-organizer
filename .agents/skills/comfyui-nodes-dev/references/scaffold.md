# Scaffold Workflow

## Scaffold Command

Use the CLI to scaffold a nodepack:

```
comfy node scaffold <nodepack-name>
```

This creates a folder under `custom_nodes/<nodepack-name>`.

## V3 Defaults

Default to V3 patterns when scaffolding:

- Use `ComfyExtension` + `comfy_entrypoint()` for registration.
- Implement `io.ComfyNode.define_schema()` and `execute()`.
- Use `io.Schema`, `io.NodeOutput`, and `ui.Preview*` helpers.

Auto check and migrate legacy scaffold to V3 patterns after scaffolding:

- Replace class mappings with `ComfyExtension.get_node_list()`.
- Move UI outputs into `NodeOutput(ui=...)`.
- Swap `INPUT_TYPES` for `define_schema()` and typed inputs.

