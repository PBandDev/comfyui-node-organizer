import { test, expect } from "@playwright/test";
import {
  waitForComfyUI,
  loadWorkflow,
  extractGraphState,
  triggerOrganize,
  assertInvariants,
  assertIdempotent,
} from "./helpers";
import { loadFixture } from "./fixtures";

test.describe("Smoke tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
  });

  test("ComfyUI loads with extension commands registered", async ({
    page,
  }) => {
    const extensionState = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const em = appObj.extensionManager as Record<string, unknown>;
      const command = em.command as Record<string, unknown>;
      const commands = command.commands as Array<{ id: string }>;
      const setting = em.setting as {
        get: <T>(id: string) => T | undefined;
      };
      return {
        hasOrganizeWorkflow: commands.some(
          (c) => c.id === "node-organizer.organize-workflow",
        ),
        hasOrganizeGroups: commands.some(
          (c) => c.id === "node-organizer.organize-groups",
        ),
        defaultAlgorithm: setting.get<string>("Node Organizer.Default Algorithm"),
      };
    });
    expect(extensionState.hasOrganizeWorkflow).toBe(true);
    expect(extensionState.hasOrganizeGroups).toBe(true);
    expect(extensionState.defaultAlgorithm).toBe("sugiyama");
  });

  test("default workflow has nodes", async ({ page }) => {
    const state = await extractGraphState(page);
    expect(state.nodes.length).toBeGreaterThan(0);
    expect(state.links.length).toBeGreaterThan(0);
  });

  test("Organize Workflow runs without error", async ({ page }) => {
    await triggerOrganize(page);
    const state = await extractGraphState(page);

    for (const node of state.nodes) {
      expect(Number.isFinite(node.pos[0])).toBe(true);
      expect(Number.isFinite(node.pos[1])).toBe(true);
    }
  });

  test("Organize Workflow produces valid layout", async ({ page }) => {
    await triggerOrganize(page);
    const state = await extractGraphState(page);
    assertInvariants(state);
  });

  test("Organize Workflow is idempotent", async ({ page }) => {
    await triggerOrganize(page);
    await assertIdempotent(page);
  });

  test("isGroup discriminator matches runtime default workflow", async ({
    page,
  }) => {
    const { groups, nodes } = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown> & {
        getCurrentGraph?: () => Record<string, unknown> | undefined;
      };
      const graph = (canvas.getCurrentGraph?.() ??
        canvas.graph ??
        appObj.graph) as Record<string, unknown>;

      const extractInfo = (item: Record<string, unknown>) => ({
        id: item.id as number | string,
        constructorName: (item.constructor as { name?: string } | undefined)
          ?.name,
        typeofType: typeof item.type,
        hasStringTitle: typeof item.title === "string",
      });

      const rawGroups =
        (graph._groups as Array<Record<string, unknown>> | undefined) ?? [];
      const rawNodes =
        (graph._nodes as Array<Record<string, unknown>> | undefined) ?? [];

      return {
        groups: rawGroups.map(extractInfo),
        nodes: rawNodes.map(extractInfo),
      };
    });

    // Every group must be identifiable by isGroup logic
    for (const g of groups) {
      const identifiable =
        g.constructorName === "LGraphGroup" ||
        (g.hasStringTitle && g.typeofType !== "string");
      expect(
        identifiable,
        `Group ${String(g.id)} not identifiable: constructor=${g.constructorName}, typeofType=${g.typeofType}, hasStringTitle=${g.hasStringTitle}`,
      ).toBe(true);
    }

    // No node should be a false positive (matches duck-typing but is not a group)
    for (const n of nodes) {
      const falsePositive =
        n.hasStringTitle &&
        n.typeofType !== "string" &&
        n.constructorName !== "LGraphGroup";
      expect(
        falsePositive,
        `Node ${String(n.id)} is a false positive: constructor=${n.constructorName}, typeofType=${n.typeofType}, hasStringTitle=${n.hasStringTitle}`,
      ).toBe(false);
    }
  });

  test("isGroup discriminator matches runtime grouped workflow", async ({
    page,
  }) => {
    const workflow = loadFixture("group-test");
    await loadWorkflow(page, workflow);

    const { groups, nodes } = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown> & {
        getCurrentGraph?: () => Record<string, unknown> | undefined;
      };
      const graph = (canvas.getCurrentGraph?.() ??
        canvas.graph ??
        appObj.graph) as Record<string, unknown>;

      const extractInfo = (item: Record<string, unknown>) => ({
        id: item.id as number | string,
        constructorName: (item.constructor as { name?: string } | undefined)
          ?.name,
        typeofType: typeof item.type,
        hasStringTitle: typeof item.title === "string",
      });

      const rawGroups =
        (graph._groups as Array<Record<string, unknown>> | undefined) ?? [];
      const rawNodes =
        (graph._nodes as Array<Record<string, unknown>> | undefined) ?? [];

      return {
        groups: rawGroups.map(extractInfo),
        nodes: rawNodes.map(extractInfo),
      };
    });

    // Must have groups in this fixture
    expect(groups.length).toBeGreaterThan(0);

    // Every group must be identifiable by isGroup logic
    for (const g of groups) {
      const identifiable =
        g.constructorName === "LGraphGroup" ||
        (g.hasStringTitle && g.typeofType !== "string");
      expect(
        identifiable,
        `Group ${String(g.id)} not identifiable: constructor=${g.constructorName}, typeofType=${g.typeofType}, hasStringTitle=${g.hasStringTitle}`,
      ).toBe(true);
    }

    // No node should be a false positive
    for (const n of nodes) {
      const falsePositive =
        n.hasStringTitle &&
        n.typeofType !== "string" &&
        n.constructorName !== "LGraphGroup";
      expect(
        falsePositive,
        `Node ${String(n.id)} is a false positive: constructor=${n.constructorName}, typeofType=${n.typeofType}, hasStringTitle=${n.hasStringTitle}`,
      ).toBe(false);
    }
  });
});
