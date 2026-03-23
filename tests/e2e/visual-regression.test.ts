import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  waitForComfyUI,
  loadWorkflow,
  triggerOrganize,
  expectGraphCanvasScreenshot,
  setBooleanSetting,
} from "./helpers";
import { loadFixture } from "./fixtures";
import { SETTING_IDS } from "../../src/settings";

async function openFirstSubgraph(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const appObj = w.app as Record<string, unknown>;
    const canvas = appObj.canvas as {
      graph?: { _nodes?: Array<Record<string, unknown>> };
      openSubgraph: (
        subgraph: Record<string, unknown>,
        fromNode: Record<string, unknown>,
      ) => void;
    };
    const rootGraph = (canvas.graph ??
      appObj.graph) as { _nodes?: Array<Record<string, unknown>> };
    const subgraphNode = (rootGraph._nodes ?? []).find((node) => !!node.subgraph);
    if (!subgraphNode?.subgraph) {
      throw new Error("No subgraph node found in fixture");
    }
    canvas.openSubgraph(subgraphNode.subgraph as Record<string, unknown>, subgraphNode);
  });
}

test.describe("Visual Regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
    await setBooleanSetting(page, SETTING_IDS.FIT_TO_VIEW, false);
  });

  test("simple-dag graph canvas after organize", async ({ page }) => {
    await loadWorkflow(page, loadFixture("simple-dag"));
    await triggerOrganize(page);
    await expectGraphCanvasScreenshot(page, "simple-dag-organized.png");
  });

  test("nested-groups graph canvas after organize", async ({ page }) => {
    await loadWorkflow(page, loadFixture("nested-groups"));
    await triggerOrganize(page);
    await expectGraphCanvasScreenshot(page, "nested-groups-organized.png");
  });

  test("token-testing graph canvas after organize", async ({ page }) => {
    await loadWorkflow(page, loadFixture("token-testing"));
    await triggerOrganize(page);
    await expectGraphCanvasScreenshot(page, "token-testing-organized.png");
  });

  test("subgraph graph canvas after organize", async ({ page }) => {
    await loadWorkflow(page, loadFixture("subgraph-io"));
    await openFirstSubgraph(page);
    await triggerOrganize(page);
    await expectGraphCanvasScreenshot(page, "subgraph-io-organized.png");
  });
});
