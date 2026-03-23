# Lazy Evaluation (V3)

Use `define_schema` inputs with `lazy=True` and a classmethod `check_lazy_status` pattern.

## V3 Pattern

- Mark optional or expensive inputs as lazy: `io.MatchType.Input(..., lazy=True)`.
- Implement `check_lazy_status` as a **classmethod** in V3 nodes.
- For optional inputs, use a sentinel to distinguish "missing" from "connected but unevaluated".

Example (Switch-like pattern):
```python
MISSING = object()

@classmethod
def define_schema(cls):
    template = io.MatchType.Template("switch")
    return io.Schema(
        node_id="ComfySwitchNode",
        inputs=[
            io.Boolean.Input("switch"),
            io.MatchType.Input("on_false", template=template, lazy=True, optional=True),
            io.MatchType.Input("on_true", template=template, lazy=True, optional=True),
        ],
        outputs=[io.MatchType.Output(template=template)],
    )

@classmethod
def check_lazy_status(cls, switch, on_false=MISSING, on_true=MISSING):
    if on_false is MISSING:
        return ["on_true"]
    if on_true is MISSING:
        return ["on_false"]
    if switch and on_true is None:
        return ["on_true"]
    if not switch and on_false is None:
        return ["on_false"]

@classmethod
def execute(cls, switch, on_true=MISSING, on_false=MISSING):
    if on_true is MISSING:
        return io.NodeOutput(on_false)
    if on_false is MISSING:
        return io.NodeOutput(on_true)
    return io.NodeOutput(on_true if switch else on_false)
```

## Execution Blocking

If you must block downstream execution, return `block_execution` in `NodeOutput` or return an `ExecutionBlocker`.

Example:
```python
return io.NodeOutput(block_execution="No VAE in checkpoint")
```

## Practical Rules

- Use lazy inputs whenever a branch is unused or a mask/ratio short-circuits computation.
- Prefer lazy evaluation over execution blocking when possible.
- Treat `None` as "connected but unevaluated". Use a sentinel to detect missing inputs.
