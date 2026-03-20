# IO Types (V3)

This reference summarizes the V3 IO classes exposed in `comfy_api.latest._io` (and re-exported by `v0_0_2`).

## Core Scalar Types

- `io.Boolean`
- `io.Int`
- `io.Float`
- `io.String`
- `io.Combo` (dropdown)
- `io.MultiCombo` (multiselect dropdown)

Each scalar has an `Input` class for widgets. Example:

- `io.Int.Input(id, min=0, max=100, step=1, display_mode=NumberDisplay.slider)`
- `io.String.Input(id, multiline=True, placeholder="...")`

## Common Comfy Types

- `io.Image`, `io.Mask`, `io.Latent`, `io.Conditioning`
- `io.Model`, `io.Vae`, `io.Clip`, `io.ControlNet`
- `io.Audio`, `io.Video`, `io.SVG`
- Additional specialized types exist (see `_io.py` for full list).

## Advanced Type Patterns

- `io.MatchType` for polymorphic inputs/outputs with templates.
- `io.DynamicCombo` for branch-specific input groups.
- `_io.Autogrow` for expandable lists of inputs.
- `io.MultiType` for bounded unions (e.g., image or mask).
- `io.LatentOperation` for passing latent ops as callables.
- `io.AnyType` for opaque passthrough outputs.

## Custom Types

Use one of these patterns:

- Decorator:
  - `@io.comfytype(io_type="MY_TYPE")`
- Factory:
  - `io.Custom("MY_TYPE")`

Custom types can define nested `Input` and `Output` classes.

## Inputs and Widgets

- `io.Input` is the base input class (no widget).
- `io.WidgetInput` is the base for widget inputs.

Notable widget options:

- `remote=io.RemoteOptions(route, refresh_button=True, timeout=..., max_retries=..., refresh=...)`
- `upload=io.UploadType.image | audio | video | model`
- `image_folder=io.FolderType.input | output | temp`
- `socketless`, `force_input`, `advanced`
