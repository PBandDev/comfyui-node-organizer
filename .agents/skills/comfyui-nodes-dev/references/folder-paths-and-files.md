# folder_paths and File IO Patterns (V3)

## Common Helpers

- `folder_paths.get_output_directory()`
- `folder_paths.get_input_directory()`
- `folder_paths.get_save_image_path(filename_prefix, output_dir, width=None, height=None)`
- `folder_paths.get_annotated_filepath(file)`
- `folder_paths.exists_annotated_filepath(file)`
- `folder_paths.filter_files_content_types(files, ["image" | "video" | "audio"])`

## Save Node Pattern

- Use `get_save_image_path(...)` to resolve output folder, filename, counter, subfolder, and cleaned `filename_prefix`.
- Create the full filename with the counter suffix: `f"{filename}_{counter:05}_.ext"`.
- Return `ui.SavedResult(file, subfolder, io.FolderType.output)` inside a preview helper.

Example (abbreviated):
```python
full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(
    filename_prefix, folder_paths.get_output_directory(), width, height
)
file = f"{filename}_{counter:05}_.webm"
return io.NodeOutput(ui=ui.PreviewVideo([ui.SavedResult(file, subfolder, io.FolderType.output)]))
```

## Metadata on Save

- For output nodes, include `hidden=[io.Hidden.prompt, io.Hidden.extra_pnginfo]` in the schema.
- Use those fields to embed metadata when saving (e.g., video container metadata or SVG metadata). 

Example (abbreviated):
```python
if cls.hidden.prompt is not None:
    container.metadata["prompt"] = json.dumps(cls.hidden.prompt)
```

## Load Node Pattern

- Populate file lists from `input` directory and filter by content type.
- Use `upload=io.UploadType.video` (or image/audio) on combo inputs for file uploads.
- Validate file existence in `validate_inputs`.

Example (abbreviated):
```python
input_dir = folder_paths.get_input_directory()
files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
files = folder_paths.filter_files_content_types(files, ["video"])
```

## Validation and Fingerprints

- `validate_inputs` returns `True` or a user-facing error string.
- `fingerprint_inputs` can return `os.path.getmtime(path)` to avoid hashing large files.
