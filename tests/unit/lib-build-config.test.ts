import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import libConfig from "../../vite.config.lib.ts";

describe("vite library build config", () => {
  it("builds the core entrypoint in library mode", () => {
    const libBuild = libConfig.build?.lib;

    expect(libBuild).toBeDefined();
    if (!libBuild) {
      throw new Error("expected Vite library mode to be configured");
    }

    expect(libBuild.entry).toBe(
      fileURLToPath(new URL("../../src/core.ts", import.meta.url)),
    );
    expect(libConfig.build?.outDir).toBe("lib");
  });
});
