"""
ComfyUI V3 custom node template.
"""

# Prefer v0_0_2 for stability. Switch to comfy_api.latest if you need newest APIs.
from comfy_api.v0_0_2 import io, ui, ComfyExtension


class PassThroughImage(io.ComfyNode):
    """Return the input image unchanged."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PassThroughImage",
            display_name="Pass Through Image",
            category="Custom/Examples",
            description="Return the input image unchanged.",
            inputs=[
                io.Image.Input("image"),
            ],
            outputs=[
                io.Image.Output("image"),
            ],
        )

    @classmethod
    def execute(cls, image: io.Image.Type) -> io.NodeOutput:
        return io.NodeOutput(
            image,
            ui=ui.PreviewImage(image, cls=cls),
        )


class ExampleExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [PassThroughImage]


def comfy_entrypoint():
    return ExampleExtension()
