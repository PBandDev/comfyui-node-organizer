import { describe, expect, it } from "vitest";
import {
  fromGroupLayoutId,
  fromNumericGroupLayoutId,
  toGroupLayoutId,
} from "../../src/layout/group-ids";

describe("group layout ids", () => {
  it("namespaces string and numeric ids consistently", () => {
    expect(toGroupLayoutId("abc")).toBe("group:abc");
    expect(toGroupLayoutId(42)).toBe("group:42");
  });

  it("parses raw ids back out of namespaced ids", () => {
    expect(fromGroupLayoutId("group:abc")).toBe("abc");
    expect(fromGroupLayoutId("node:abc")).toBeNull();
  });

  it("parses numeric group ids when they are valid numbers", () => {
    expect(fromNumericGroupLayoutId("group:42")).toBe(42);
    expect(fromNumericGroupLayoutId("group:abc")).toBeNull();
  });
});
