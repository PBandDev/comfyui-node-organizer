import { test, expect } from "@playwright/test";
import {
  waitForComfyUI,
  loadWorkflow,
  extractGraphState,
  extractGroupMemberships,
  triggerOrganize,
} from "./helpers";
import { loadFixture } from "./fixtures";

test.describe("Token Layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
  });

  test("token-testing: organizes and all coordinates finite", async ({
    page,
  }) => {
    const workflow = loadFixture("token-testing");
    await loadWorkflow(page, workflow);
    await triggerOrganize(page);

    const state = await extractGraphState(page);
    for (const node of state.nodes) {
      expect(Number.isFinite(node.pos[0])).toBe(true);
      expect(Number.isFinite(node.pos[1])).toBe(true);
    }
  });

  test("token-testing: groups sized to fit after organize", async ({
    page,
  }) => {
    const workflow = loadFixture("token-testing");
    await loadWorkflow(page, workflow);
    await triggerOrganize(page);

    const state = await extractGraphState(page);
    // All groups should have positive dimensions
    for (const g of state.groups) {
      expect(g.size[0]).toBeGreaterThan(0);
      expect(g.size[1]).toBeGreaterThan(0);
    }
  });

  test("token-testing: idempotent", async ({ page }) => {
    const workflow = loadFixture("token-testing");
    await loadWorkflow(page, workflow);
    await triggerOrganize(page);

    const state1 = await extractGraphState(page);

    // Organize again via command
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const em = appObj.extensionManager as Record<string, unknown>;
      const command = em.command as { execute: (id: string) => void };
      command.execute("node-organizer.organize-workflow");
    });
    await page.waitForTimeout(1000);

    const state2 = await extractGraphState(page);

    // Positions should be identical within tolerance
    for (const n1 of state1.nodes) {
      const n2 = state2.nodes.find((n) => n.id === n1.id);
      expect(n2).toBeDefined();
      if (n2) {
        expect(Math.abs(n1.pos[0] - n2.pos[0])).toBeLessThan(2);
        expect(Math.abs(n1.pos[1] - n2.pos[1])).toBeLessThan(2);
      }
    }
  });

  test("token-testing: preserves group hierarchy and direct memberships", async ({
    page,
  }) => {
    const workflow = loadFixture("token-testing");
    await loadWorkflow(page, workflow);

    const beforeMemberships = await extractGroupMemberships(page);
    await triggerOrganize(page);
    const afterMemberships = await extractGroupMemberships(page);

    expect(afterMemberships).toEqual(beforeMemberships);
  });
});
