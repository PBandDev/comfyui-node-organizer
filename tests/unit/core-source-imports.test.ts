import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sourceFiles = [
  new URL("../../src/core.ts", import.meta.url),
  new URL("../../src/group-membership.ts", import.meta.url),
  new URL("../../src/group-geometry.ts", import.meta.url),
];

describe("pure core source imports", () => {
  it("keeps relative TypeScript imports extensionless", () => {
    for (const fileUrl of sourceFiles) {
      const source = readFileSync(fileUrl, "utf-8");
      expect(source).not.toMatch(/from "\.\/.*\.js"/);
      expect(source).not.toMatch(/from "\.\.\/.*\.js"/);
    }
  });
});
