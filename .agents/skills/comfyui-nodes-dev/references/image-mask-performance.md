# Image/Mask Performance Notes (V3)

## Shapes and Conversions

- Image: `torch.Tensor` with shape `[B, H, W, C]`.
- Mask: `torch.Tensor` with shape `[B, H, W]`.
- Latent: `dict` with `samples` shape `[B, C, H, W]`.
- Convert to channel-first for many ops: `image.movedim(-1, 1)`.
- Convert back to channel-last: `.movedim(1, -1)`.

## Resizing and Batch Alignment

- Use `comfy.utils.common_upscale(tensor, width, height, method, crop)`.
- Use `comfy.utils.repeat_to_batch_size(tensor, target_batch)` to align batches.
- Use `node_helpers.image_alpha_fix(image1, image2)` before compositing to align channels.

## Device Management

- Use `comfy.model_management.get_torch_device()` for compute.
- Move outputs to `comfy.model_management.intermediate_device()` when appropriate.

Example (abbreviated):
```python
image = image.to(comfy.model_management.get_torch_device())
# compute
return io.NodeOutput(result.to(comfy.model_management.intermediate_device()))
```

## Mask and Image Compositing

- For masks, reshape and interpolate to match source size.
- For image compositing, use channel-first for math, then move back.

Example (abbreviated):
```python
mask = torch.nn.functional.interpolate(mask.reshape((-1, 1, h, w)), size=(source_h, source_w), mode="bilinear")
```

## Batching Utilities

Patterns from `nodes_post_processing.py`:

- Pad channels to match before batching images.
- Resize all inputs to the first input size.
- `torch.cat` along batch dimension.

Example (abbreviated):
```python
resized = comfy.utils.common_upscale(img.movedim(-1,1), target_w, target_h, "bilinear", "center").movedim(1,-1)
batched = torch.cat(resized_images, dim=0)
```

## Performance Tips

- Prefer tensor ops over Python loops when possible.
- When loops are required (e.g., per-image quantize), keep tensors on CPU and minimize conversions.
- Avoid repeated resizing by computing target size once and reusing it for all inputs.
