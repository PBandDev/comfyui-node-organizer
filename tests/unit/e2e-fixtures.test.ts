import { describe, expect, it } from "vitest";
import { listRepoFixtures, loadFixture } from "../e2e/fixtures";

describe("repo fixture loader", () => {
  it("discovers flat checked-in fixtures", () => {
    expect(listRepoFixtures()).toContain("simple-dag");
    expect(listRepoFixtures()).toContain("token-testing");
  });

  it("loads a flat checked-in fixture", () => {
    const workflow = loadFixture("simple-dag");
    expect(workflow).toHaveProperty("nodes");
  });
});
