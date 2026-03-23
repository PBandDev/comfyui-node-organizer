import { describe, expect, it } from "vitest";
import {
  isWorkflowData,
  parseInstalledTemplateManifest,
} from "../e2e/installed-templates";

describe("installed template parsing", () => {
  it("parses raw ids and json paths", () => {
    const raw = JSON.stringify([
      {
        id: "api_google_gemini_image",
        path: "workflow.json",
      },
    ]);

    expect(parseInstalledTemplateManifest(raw)).toEqual([
      {
        id: "api_google_gemini_image",
        path: "workflow.json",
      },
    ]);
  });

  it("rejects an empty template manifest", () => {
    expect(() => parseInstalledTemplateManifest("[]")).toThrow(/zero templates/i);
  });

  it("recognizes workflow graph data", () => {
    expect(
      isWorkflowData({
        nodes: [],
      }),
    ).toBe(true);
  });

  it("rejects non-workflow template metadata", () => {
    expect(
      isWorkflowData({
        $schema: "https://example.com",
        title: "Schema",
      }),
    ).toBe(false);
  });
});
