# UI Helpers (V3)

These helpers live under `comfy_api.latest._ui` and are re-exported by `ui`.

## Preview Outputs

- `ui.PreviewImage(image, animated=False, cls=None)`
- `ui.PreviewMask(mask, animated=False, cls=None)`
- `ui.PreviewAudio(audio_dict, cls=None)`
- `ui.PreviewVideo(values)`
- `ui.PreviewText(text)`

These return `_UIOutput` objects suitable for `NodeOutput(ui=...)`.

Common wrapper for saved files:

- `ui.SavedResult(filename, subfolder, io.FolderType.output | input | temp)`

Example (video preview with saved result):
```python
return io.NodeOutput(
    ui=ui.PreviewVideo([ui.SavedResult(file, subfolder, io.FolderType.output)])
)
```

## Save Helpers

- `ui.ImageSaveHelper.save_images(...)`
- `ui.ImageSaveHelper.get_save_images_ui(...)`
- `ui.ImageSaveHelper.save_animated_png(...)`
- `ui.ImageSaveHelper.get_save_animated_png_ui(...)`
- `ui.ImageSaveHelper.save_animated_webp(...)`
- `ui.ImageSaveHelper.get_save_animated_webp_ui(...)`
- `ui.AudioSaveHelper.save_audio(...)`
- `ui.AudioSaveHelper.get_save_audio_ui(...)`

These helpers handle saving and metadata, and return `SavedImages` or `SavedAudios` UI wrappers.

Example (animated PNG/WebP UI):
```python
return io.NodeOutput(
    ui=ui.ImageSaveHelper.get_save_animated_png_ui(
        images=images,
        filename_prefix=filename_prefix,
        cls=cls,
        fps=fps,
        compress_level=compress_level,
    )
)
```
