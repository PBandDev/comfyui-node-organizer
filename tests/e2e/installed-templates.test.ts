import { expect, test } from "@playwright/test";
import {
  assertCorrectnessInvariants,
  extractGraphState,
  loadWorkflow,
  triggerOrganize,
  waitForComfyUI,
} from "./helpers";
import {
  listInstalledTemplates,
  loadWorkflowData,
} from "./installed-templates";

const installedTemplates = listInstalledTemplates();

test.describe("Installed workflow template invariants", () => {
  test("discovers installed workflow templates", () => {
    expect(installedTemplates.length).toBeGreaterThan(0);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
  });

  for (const template of installedTemplates) {
    test(`${template.id}: organizes and passes correctness invariants`, async ({
      page,
    }) => {
      await loadWorkflow(page, loadWorkflowData(template.path));
      await triggerOrganize(page);

      const state = await extractGraphState(page);
      expect(state.nodes.length).toBeGreaterThan(0);
      assertCorrectnessInvariants(state);
    });
  }
});
