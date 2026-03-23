import { test, expect } from "@playwright/test";
import { SETTING_IDS } from "../../src/settings";
import { DEFAULT_FRAMEWORK_CONFIG } from "../../src/layout/types";
import { loadFixture } from "./fixtures";
import {
  waitForComfyUI,
  loadWorkflow,
  triggerOrganize,
  setNumericSettingOverride,
  clearNumericSettingOverrides,
  extractSpacingMeasurements,
} from "./helpers";

test.describe("Spacing settings", () => {
  async function applyDefaultSpacingOverrides(
    page: import("@playwright/test").Page,
  ): Promise<void> {
    await setNumericSettingOverride(
      page,
      SETTING_IDS.HORIZONTAL_GAP,
      DEFAULT_FRAMEWORK_CONFIG.horizontalGap,
    );
    await setNumericSettingOverride(
      page,
      SETTING_IDS.VERTICAL_GAP,
      DEFAULT_FRAMEWORK_CONFIG.verticalGap,
    );
    await setNumericSettingOverride(
      page,
      SETTING_IDS.GROUP_PADDING,
      DEFAULT_FRAMEWORK_CONFIG.groupPadding,
    );
    await setNumericSettingOverride(
      page,
      SETTING_IDS.DISCONNECTED_GAP,
      DEFAULT_FRAMEWORK_CONFIG.disconnectedGap,
    );
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
    await clearNumericSettingOverrides(page);
    await applyDefaultSpacingOverrides(page);
    await loadWorkflow(page, loadFixture("spacing-settings"));
  });

  test.afterEach(async ({ page }) => {
    await clearNumericSettingOverrides(page);
  });

  test("horizontal gap setting increases consecutive layer spacing", async ({
    page,
  }) => {
    await setNumericSettingOverride(page, SETTING_IDS.HORIZONTAL_GAP, 40);
    await triggerOrganize(page);
    const compact = await extractSpacingMeasurements(page);

    await setNumericSettingOverride(page, SETTING_IDS.HORIZONTAL_GAP, 220);
    await triggerOrganize(page);
    const wide = await extractSpacingMeasurements(page);

    expect(wide.horizontalLayerGap).toBeGreaterThan(compact.horizontalLayerGap);
  });

  test("vertical gap setting increases main-layer sibling spacing", async ({
    page,
  }) => {
    await setNumericSettingOverride(page, SETTING_IDS.VERTICAL_GAP, 20);
    await triggerOrganize(page);
    const compact = await extractSpacingMeasurements(page);

    await setNumericSettingOverride(page, SETTING_IDS.VERTICAL_GAP, 180);
    await triggerOrganize(page);
    const roomy = await extractSpacingMeasurements(page);

    expect(roomy.verticalSiblingGap).toBeGreaterThan(compact.verticalSiblingGap);
  });

  test("group padding setting increases inner group margin", async ({ page }) => {
    await setNumericSettingOverride(page, SETTING_IDS.GROUP_PADDING, 10);
    await triggerOrganize(page);
    const compact = await extractSpacingMeasurements(page);

    await setNumericSettingOverride(page, SETTING_IDS.GROUP_PADDING, 120);
    await triggerOrganize(page);
    const roomy = await extractSpacingMeasurements(page);

    expect(roomy.groupPadding).toBeGreaterThan(compact.groupPadding);
  });

  test("disconnected gap setting increases distance to disconnected node", async ({
    page,
  }) => {
    await setNumericSettingOverride(page, SETTING_IDS.DISCONNECTED_GAP, 40);
    await triggerOrganize(page);
    const compact = await extractSpacingMeasurements(page);

    await setNumericSettingOverride(page, SETTING_IDS.DISCONNECTED_GAP, 320);
    await triggerOrganize(page);
    const roomy = await extractSpacingMeasurements(page);

    expect(roomy.disconnectedGap).toBeGreaterThan(compact.disconnectedGap);
  });
});
