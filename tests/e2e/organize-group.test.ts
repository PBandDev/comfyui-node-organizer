import { test, expect } from "@playwright/test";
import {
  waitForComfyUI,
  loadWorkflow,
  extractGraphState,
  triggerOrganizeGroup,
} from "./helpers";
import { loadFixture } from "./fixtures";

test.describe("Organize Group", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
  });

  test("group-test-simple: organizes a single group", async ({ page }) => {
    const workflow = loadFixture("group-test-simple");
    await loadWorkflow(page, workflow);

    // Get group titles from the workflow
    const groupTitles = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown>;
      const graph = canvas.graph as Record<string, unknown>;
      const groups = graph._groups as Array<{ title: string }>;
      return groups.map((g) => g.title);
    });

    if (groupTitles.length > 0) {
      await triggerOrganizeGroup(page, groupTitles[0]);

      const state = await extractGraphState(page);
      // All coordinates should be finite after organize
      for (const node of state.nodes) {
        expect(Number.isFinite(node.pos[0])).toBe(true);
        expect(Number.isFinite(node.pos[1])).toBe(true);
      }
    }
  });

  test("group-test: organizes groups with nested structure", async ({
    page,
  }) => {
    const workflow = loadFixture("group-test");
    await loadWorkflow(page, workflow);

    const groupTitles = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown>;
      const graph = canvas.graph as Record<string, unknown>;
      const groups = graph._groups as Array<{ title: string }>;
      return groups.map((g) => g.title);
    });

    // Organize each group
    for (const title of groupTitles) {
      await triggerOrganizeGroup(page, title);
    }

    const state = await extractGraphState(page);
    // Basic sanity: all coordinates finite
    for (const node of state.nodes) {
      expect(Number.isFinite(node.pos[0])).toBe(true);
      expect(Number.isFinite(node.pos[1])).toBe(true);
    }
  });

  test("nested-groups: organize group preserves other groups", async ({
    page,
  }) => {
    const workflow = loadFixture("nested-groups");
    await loadWorkflow(page, workflow);

    const beforeState = await extractGraphState(page);

    const groupTitles = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown>;
      const graph = canvas.graph as Record<string, unknown>;
      const groups = graph._groups as Array<{ title: string }>;
      return groups.map((g) => g.title);
    });

    if (groupTitles.length > 0) {
      await triggerOrganizeGroup(page, groupTitles[0]);

      const afterState = await extractGraphState(page);

      // Total node count should be the same
      expect(afterState.nodes.length).toBe(beforeState.nodes.length);
      // Total group count should be the same
      expect(afterState.groups.length).toBe(beforeState.groups.length);
    }
  });
});
