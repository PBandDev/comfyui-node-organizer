import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { e2eConfig } from "../../e2e.config";
import { loadWorkflowData } from "./fixtures";

export interface InstalledTemplateEntry {
  id: string;
  path: string;
}

export function isWorkflowData(value: Record<string, unknown>): boolean {
  return Array.isArray(value.nodes);
}

function isInstalledTemplateEntry(
  value: unknown,
): value is InstalledTemplateEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.path === "string" &&
    candidate.path.length > 0
  );
}

export function parseInstalledTemplateManifest(
  stdout: string,
): InstalledTemplateEntry[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed) || !parsed.every(isInstalledTemplateEntry)) {
    throw new Error("Installed template discovery returned an invalid manifest");
  }
  if (parsed.length === 0) {
    throw new Error("Installed template discovery returned zero templates");
  }

  return parsed;
}

function getTestVenvPythonPath(): string {
  const venvRoot = resolve(e2eConfig.venvDir);
  return process.platform === "win32"
    ? join(venvRoot, "Scripts", "python.exe")
    : join(venvRoot, "bin", "python");
}

export function listInstalledTemplates(): InstalledTemplateEntry[] {
  const script = [
    "import json",
    "from comfyui_workflow_templates import get_asset_path, iter_templates",
    "entries = []",
    "for template in iter_templates():",
    "    json_assets = [asset for asset in template.assets if asset.filename.endswith('.json')]",
    "    if len(json_assets) != 1:",
    "        raise RuntimeError(f'Template {template.template_id} expected exactly one JSON asset, found {len(json_assets)}')",
    "    entries.append({'id': template.template_id, 'path': get_asset_path(template.template_id, json_assets[0].filename)})",
    "print(json.dumps(sorted(entries, key=lambda entry: entry['id'])))",
  ].join("\n");

  const stdout = execFileSync(getTestVenvPythonPath(), ["-c", script], {
    encoding: "utf-8",
  });

  const workflowEntries = parseInstalledTemplateManifest(stdout).filter((entry) =>
    isWorkflowData(loadWorkflowData(entry.path)),
  );

  if (workflowEntries.length === 0) {
    throw new Error("Installed template discovery returned zero workflow templates");
  }

  return workflowEntries;
}

export { loadWorkflowData };
