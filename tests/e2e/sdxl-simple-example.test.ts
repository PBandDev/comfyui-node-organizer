import { test, expect } from "@playwright/test";
import {
  waitForComfyUI,
  loadWorkflow,
  extractGraphState,
  extractGroupMemberships,
  triggerOrganize,
  triggerOrganizeGroup,
  assertInvariants,
  assertIdempotent,
  expectGraphCanvasScreenshot,
  setBooleanSetting,
} from "./helpers";
import { loadFixture } from "./fixtures";
import { SETTING_IDS } from "../../src/settings";

test.describe("SDXL Simple Example", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
    await setBooleanSetting(page, SETTING_IDS.FIT_TO_VIEW, false);
  });

  test("organize workflow preserves counts and passes invariants", async ({
    page,
  }) => {
    const workflow = loadFixture("sdxl_simple_example");
    await loadWorkflow(page, workflow);

    const beforeState = await extractGraphState(page);
    expect(beforeState.nodes.length).toBe(25);
    expect(beforeState.groups.length).toBe(10);
    expect(beforeState.links.length).toBe(23);

    await triggerOrganize(page);

    const afterState = await extractGraphState(page);
    expect(afterState.nodes.length).toBe(beforeState.nodes.length);
    expect(afterState.groups.length).toBe(beforeState.groups.length);
    expect(afterState.links.length).toBe(beforeState.links.length);
    assertInvariants(afterState);
  });

  test("organize workflow preserves group hierarchy and direct memberships", async ({
    page,
  }) => {
    const workflow = loadFixture("sdxl_simple_example");
    await loadWorkflow(page, workflow);

    const beforeMemberships = await extractGroupMemberships(page);
    await triggerOrganize(page);
    const afterMemberships = await extractGroupMemberships(page);

    expect(afterMemberships).toEqual(beforeMemberships);
  });

  test("organize workflow is idempotent", async ({ page }) => {
    const workflow = loadFixture("sdxl_simple_example");
    await loadWorkflow(page, workflow);
    await triggerOrganize(page);
    await assertIdempotent(page);
  });

  test("organize top-level group preserves child group memberships and graph counts", async ({
    page,
  }) => {
    const workflow = loadFixture("sdxl_simple_example");
    await loadWorkflow(page, workflow);

    const beforeMemberships = await extractGroupMemberships(page);
    const expectedMemberships = beforeMemberships.filter(
      (group) =>
        group.title === "Base Prompt" ||
        group.title === "Load in BASE SDXL Model",
    );
    await triggerOrganizeGroup(page, "Base");

    const afterMemberships = await extractGroupMemberships(page);
    expect(
      afterMemberships.filter(
        (group) =>
          group.title === "Base Prompt" ||
          group.title === "Load in BASE SDXL Model",
      ),
    ).toEqual(expectedMemberships);

    const state = await extractGraphState(page);
    expect(state.nodes.length).toBe(25);
    expect(state.groups.length).toBe(10);
  });

  test("organize prompt group preserves its direct memberships", async ({
    page,
  }) => {
    const workflow = loadFixture("sdxl_simple_example");
    await loadWorkflow(page, workflow);

    const beforeMemberships = await extractGroupMemberships(page);
    await triggerOrganizeGroup(page, "Text Prompts");

    const afterMemberships = await extractGroupMemberships(page);
    expect(
      afterMemberships.find((group) => group.title === "Text Prompts"),
    ).toEqual(beforeMemberships.find((group) => group.title === "Text Prompts"));
  });

  test("graph canvas after organize", async ({ page }) => {
    const workflow = loadFixture("sdxl_simple_example");
    await loadWorkflow(page, workflow);
    await triggerOrganize(page);
    await expectGraphCanvasScreenshot(page, "sdxl-simple-example-organized.png");
  });
});
