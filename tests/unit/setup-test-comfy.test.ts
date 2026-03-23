import { describe, expect, it } from "vitest";
import { extractPinnedWorkflowTemplatesRequirement } from "../../scripts/setup-test-comfy-helpers";

describe("workflow template requirement parsing", () => {
  it("extracts the exact pinned requirement", () => {
    const requirements = [
      "torchsde",
      "comfyui-workflow-templates==0.9.26",
      "kornia>=0.7.1",
    ].join("\n");

    expect(extractPinnedWorkflowTemplatesRequirement(requirements)).toBe(
      "comfyui-workflow-templates==0.9.26",
    );
  });

  it("fails when the requirement is missing", () => {
    expect(() =>
      extractPinnedWorkflowTemplatesRequirement("torchsde==0.2.6"),
    ).toThrow(/comfyui-workflow-templates/i);
  });
});
