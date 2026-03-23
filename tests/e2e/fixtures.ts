import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesRoot = resolve(
  fileURLToPath(new URL("../fixtures/", import.meta.url)),
);

export function loadWorkflowData(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

export function listRepoFixtures(): string[] {
  return readdirSync(fixturesRoot)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.replace(/\.json$/, ""))
    .sort((a, b) => a.localeCompare(b));
}

export function loadFixture(name: string): Record<string, unknown> {
  return loadWorkflowData(resolve(fixturesRoot, `${name}.json`));
}
