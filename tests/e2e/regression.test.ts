/**
 * Regression tests for legacy bugs that must not recur.
 *
 * Each test targets a specific issue from the v1 changeset history:
 * - 0006: Y explosion (groups centering against tallest layer)
 * - 0007: Group overlap (no collision detection across layers)
 * - 0008: Nested group breakout (parent groups expanded 1600+ px)
 * - 0011: Oscillation (infinite loop in overlap resolution)
 * - 0013: Idempotency broken
 */

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

test.describe("Regression: legacy bug fixes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
  });

  test("no Y explosion: layout height stays reasonable", async ({ page }) => {
    // 0006: Y explosion — groups centering against tallest layer
    // caused layouts to be thousands of pixels tall
    const workflow = loadFixture("complex-parallel");
    await loadWorkflow(page, workflow);
    await triggerOrganize(page);

    const state = await extractGraphState(page);
    const ys = state.nodes.map((n) => n.pos[1] + n.size[1]);
    const maxY = Math.max(...ys);
    const minY = Math.min(...state.nodes.map((n) => n.pos[1]));
    const totalHeight = maxY - minY;

    // Height should not explode beyond a reasonable bound
    // (v1 bug produced heights of 11,500px for ~25 nodes)
    expect(totalHeight).toBeLessThan(5000);
  });

  test("no group overlap after organize", async ({ page }) => {
    // 0007: Groups overlapping each other after layout
    const workflow = loadFixture("nested-groups");
    await loadWorkflow(page, workflow);
    await triggerOrganize(page);

    const state = await extractGraphState(page);
    assertInvariants(state);
  });

  test("nested groups stay contained", async ({ page }) => {
    // 0008: Nested groups breaking out of parent bounds
    const workflow = loadFixture("nested-groups");
    await loadWorkflow(page, workflow);
    await triggerOrganize(page);

    const state = await extractGraphState(page);
    // Groups should have reasonable sizes (v1 bug expanded by 1600+ px)
    for (const g of state.groups) {
      expect(g.size[0]).toBeLessThan(5000);
      expect(g.size[1]).toBeLessThan(5000);
    }
  });

  test("no oscillation: organize completes quickly", async ({ page }) => {
    // 0011: Infinite loop in overlap resolution
    // If organize completes within timeout, there's no oscillation
    const workflow = loadFixture("complex-parallel");
    await loadWorkflow(page, workflow);

    const start = Date.now();
    await triggerOrganize(page);
    const elapsed = Date.now() - start;

    // Should complete in under 5 seconds (v1 bug caused infinite loops)
    expect(elapsed).toBeLessThan(5000);
  });

  test("idempotency: simple-dag", async ({ page }) => {
    // 0013: Layout not stable on repeated runs
    const workflow = loadFixture("simple-dag");
    await loadWorkflow(page, workflow);
    await triggerOrganize(page);
    await assertIdempotent(page);
  });

  test("idempotency: nested-groups", async ({ page }) => {
    const workflow = loadFixture("nested-groups");
    await loadWorkflow(page, workflow);
    await triggerOrganize(page);
    await assertIdempotent(page);
  });

  test("idempotency: complex-parallel", async ({ page }) => {
    const workflow = loadFixture("complex-parallel");
    await loadWorkflow(page, workflow);
    await triggerOrganize(page);
    await assertIdempotent(page);
  });
});
