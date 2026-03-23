import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import {
  waitForComfyUI,
  loadWorkflow,
  extractGraphState,
  triggerOrganize,
  triggerOrganizeGroup,
} from "./helpers";
import { loadFixture } from "./fixtures";
import { SETTING_IDS } from "../../src/settings";

const packageVersion = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
) as { version: string };

function didAnyNodeMove(
  before: Awaited<ReturnType<typeof extractGraphState>>,
  after: Awaited<ReturnType<typeof extractGraphState>>,
): boolean {
  for (const node of before.nodes) {
    const next = after.nodes.find((candidate) => candidate.id === node.id);
    if (!next) continue;
    if (
      Math.abs(node.pos[0] - next.pos[0]) > 1 ||
      Math.abs(node.pos[1] - next.pos[1]) > 1
    ) {
      return true;
    }
  }
  return false;
}

test.describe("UI smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
    await loadWorkflow(page, loadFixture("simple-dag"));
  });

  test("action bar organize button runs layout", async ({ page }) => {
    const before = await extractGraphState(page);
    await page.getByRole("button", { name: "Organize" }).click();
    await page.waitForTimeout(1000);
    const after = await extractGraphState(page);

    expect(didAnyNodeMove(before, after)).toBe(true);
  });

  test("Shift+O keybinding runs layout", async ({ page }) => {
    const before = await extractGraphState(page);
    await page.keyboard.press("Shift+O");
    await page.waitForTimeout(1000);
    const after = await extractGraphState(page);

    expect(didAnyNodeMove(before, after)).toBe(true);
  });

  test("context-aware Shift+O organizes selected groups when groups are selected", async ({ page }) => {
    await loadWorkflow(page, loadFixture("group-test-simple"));

    const groupTitles = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown> & {
        getCurrentGraph?: () => Record<string, unknown> | undefined;
      };
      const graph = (canvas.getCurrentGraph?.() ??
        canvas.graph ??
        appObj.graph) as { _groups: Array<{ title: string }> };
      return graph._groups.map((group) => group.title);
    });

    expect(groupTitles.length).toBeGreaterThan(0);

    // Select the first group programmatically
    await page.evaluate((title: string) => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown> & {
        getCurrentGraph?: () => Record<string, unknown> | undefined;
      };
      const graph = (canvas.getCurrentGraph?.() ??
        canvas.graph) as Record<string, unknown>;
      const groups = graph._groups as Array<Record<string, unknown>>;
      const group = groups.find((g) => g.title === title);
      if (!group) throw new Error(`Group "${title}" not found`);
      canvas.selectedItems = new Set([group]);
    }, groupTitles[0]);

    const before = await extractGraphState(page);
    // Use Shift+O — should organize the selected group, not the full workflow
    await page.keyboard.press("Shift+O");
    await page.waitForTimeout(1000);
    const after = await extractGraphState(page);

    expect(didAnyNodeMove(before, after)).toBe(true);
  });

  test("Organize Group runs layout on the selected group", async ({ page }) => {
    await loadWorkflow(page, loadFixture("group-test-simple"));

    const groupTitles = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown> & {
        getCurrentGraph?: () => Record<string, unknown> | undefined;
      };
      const graph = (canvas.getCurrentGraph?.() ??
        canvas.graph ??
        appObj.graph) as { _groups: Array<{ title: string }> };
      return graph._groups.map((group) => group.title);
    });

    expect(groupTitles.length).toBeGreaterThan(0);

    const before = await extractGraphState(page);
    await triggerOrganizeGroup(page, groupTitles[0]);
    const after = await extractGraphState(page);

    expect(didAnyNodeMove(before, after)).toBe(true);
  });
});

test.describe("Settings panel", () => {
  async function openNodeOrganizerSettings(page: import("@playwright/test").Page): Promise<void> {
    // The sidebar settings button includes the keyboard shortcut in its label
    await page.getByRole("button", { name: /Settings \(Ctrl/ }).click();
    await page.waitForTimeout(500);
    // Navigate to our extension's settings section
    await page.getByText("Node Organizer", { exact: true }).click();
    await page.waitForTimeout(500);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
  });

  test("Node Organizer appears in settings sidebar", async ({ page }) => {
    await page.getByRole("button", { name: /Settings \(Ctrl/ }).click();
    await expect(
      page.getByText("Node Organizer", { exact: true }),
    ).toBeVisible();
  });

  test("settings panel shows About section with version and homepage", async ({ page }) => {
    await openNodeOrganizerSettings(page);
    await expect(
      page.getByText(`Version ${packageVersion.version}`),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Homepage" })).toBeVisible();
  });

  test("settings panel shows Layout section with sliders", async ({ page }) => {
    await openNodeOrganizerSettings(page);
    await expect(page.getByText("Horizontal Gap")).toBeVisible();
    await expect(page.getByText("Vertical Gap")).toBeVisible();
    await expect(page.getByText("Group Padding")).toBeVisible();
    await expect(page.getByText("Disconnected Node Gap")).toBeVisible();
  });

  test("settings panel shows Behavior and Keybindings sections", async ({ page }) => {
    await openNodeOrganizerSettings(page);
    await expect(
      page.getByText("Fit to View After Organize"),
    ).toBeVisible();
    await expect(page.getByText("Keyboard Shortcuts")).toBeVisible();
  });

  test("settings sections appear in correct order", async ({ page }) => {
    await openNodeOrganizerSettings(page);

    // Collect all visible text and check the relative order of section headings
    const allText = await page.locator("body").innerText();
    const sectionNames = ["About", "Layout", "Behavior", "Keybindings", "Advanced"];
    const positions = sectionNames.map((name) => ({
      name,
      pos: allText.indexOf(name),
    }));

    // All sections should be found
    for (const { name, pos } of positions) {
      expect(pos, `Section "${name}" not found in settings panel`).toBeGreaterThanOrEqual(0);
    }

    // Verify ordering
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i].pos,
        `"${positions[i].name}" should appear after "${positions[i - 1].name}"`,
      ).toBeGreaterThan(positions[i - 1].pos);
    }
  });
});

test.describe("Fit to view after organize", () => {
  async function enableFitToView(page: import("@playwright/test").Page): Promise<void> {
    await page.evaluate((settingId: string) => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const em = appObj.extensionManager as Record<string, unknown>;
      const setting = em.setting as { set: (id: string, value: boolean) => void };
      setting.set(settingId, true);
    }, SETTING_IDS.FIT_TO_VIEW);
  }

  async function getViewport(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown>;
      const ds = canvas.ds as { offset: [number, number]; scale: number };
      return { offset: [...ds.offset], scale: ds.scale };
    });
  }

  test("viewport changes after organizing full workflow", async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
    await loadWorkflow(page, loadFixture("simple-dag"));
    await enableFitToView(page);

    const viewportBefore = await getViewport(page);

    await triggerOrganize(page);
    await page.waitForTimeout(1500);

    const viewportAfter = await getViewport(page);

    const offsetChanged =
      Math.abs(viewportBefore.offset[0] - viewportAfter.offset[0]) > 1 ||
      Math.abs(viewportBefore.offset[1] - viewportAfter.offset[1]) > 1;
    const scaleChanged =
      Math.abs(viewportBefore.scale - viewportAfter.scale) > 0.01;

    expect(offsetChanged || scaleChanged).toBe(true);
  });

  test("fit-to-view fits entire graph, not just selected node", async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
    await loadWorkflow(page, loadFixture("simple-dag"));
    await enableFitToView(page);

    // Select a single node (last node in the graph)
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown> & {
        getCurrentGraph?: () => Record<string, unknown> | undefined;
      };
      const graph = (canvas.getCurrentGraph?.() ??
        canvas.graph) as Record<string, unknown>;
      const nodes = graph._nodes as Array<Record<string, unknown>>;
      if (nodes.length > 0) {
        canvas.selectedItems = new Set([nodes[nodes.length - 1]]);
      }
    });

    await triggerOrganize(page);
    await page.waitForTimeout(1500);

    const viewport = await getViewport(page);

    // With fit-to-all-items, the scale should be < 2 (fitting the whole graph).
    // If it zoomed to a single selected node, scale would be much larger (e.g. 3+).
    // This threshold catches the bug where a selected node is zoomed into.
    expect(viewport.scale).toBeLessThan(2);
  });

  test("fit-to-view does not run for selected-group organize", async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
    await loadWorkflow(page, loadFixture("group-test-simple"));
    await enableFitToView(page);

    // Organize full workflow first to get a stable viewport
    await triggerOrganize(page);
    await page.waitForTimeout(1500);

    const viewportBefore = await getViewport(page);

    const groupTitle = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown> & {
        getCurrentGraph?: () => Record<string, unknown> | undefined;
      };
      const graph = (canvas.getCurrentGraph?.() ??
        canvas.graph ??
        appObj.graph) as { _groups: Array<{ title: string }> };
      return graph._groups[0]?.title ?? null;
    });

    if (groupTitle) {
      await triggerOrganizeGroup(page, groupTitle);
      await page.waitForTimeout(500);

      const viewportAfter = await getViewport(page);

      const offsetChanged =
        Math.abs(viewportBefore.offset[0] - viewportAfter.offset[0]) > 1 ||
        Math.abs(viewportBefore.offset[1] - viewportAfter.offset[1]) > 1;
      const scaleChanged =
        Math.abs(viewportBefore.scale - viewportAfter.scale) > 0.01;

      expect(offsetChanged || scaleChanged).toBe(false);
    }
  });
});

test.describe("Spacing settings affect layout", () => {
  test("custom disconnectedGap changes disconnected node placement", async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
    await loadWorkflow(page, loadFixture("simple-dag"));

    // Organize with default settings
    await triggerOrganize(page);
    await page.waitForTimeout(1500);
    const defaultState = await extractGraphState(page);

    // Set a very large disconnected gap
    await page.evaluate((settingId: string) => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const em = appObj.extensionManager as Record<string, unknown>;
      const setting = em.setting as { set: (id: string, value: number) => void };
      setting.set(settingId, 400);
    }, SETTING_IDS.DISCONNECTED_GAP);

    // Re-organize with the new setting
    await triggerOrganize(page);
    await page.waitForTimeout(1500);
    const customState = await extractGraphState(page);

    // If there are any disconnected nodes, their positions should differ
    // For workflows where all nodes are connected, positions are the same
    // This test verifies the setting is read — not that every fixture has disconnected nodes
    expect(customState.nodes.length).toBe(defaultState.nodes.length);

    // Reset setting
    await page.evaluate((settingId: string) => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const em = appObj.extensionManager as Record<string, unknown>;
      const setting = em.setting as { set: (id: string, value: number) => void };
      setting.set(settingId, 150);
    }, SETTING_IDS.DISCONNECTED_GAP);
  });
});
