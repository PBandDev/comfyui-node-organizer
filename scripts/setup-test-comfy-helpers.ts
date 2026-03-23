export function extractPinnedWorkflowTemplatesRequirement(
  requirementsText: string,
): string {
  const requirement = requirementsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("comfyui-workflow-templates=="));

  if (!requirement) {
    throw new Error(
      "Pinned ComfyUI checkout does not declare comfyui-workflow-templates",
    );
  }

  return requirement;
}
