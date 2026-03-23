import { spawn } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { e2eConfig } from "../../e2e.config.ts";

const isWindows = process.platform === "win32";
const projectRoot = resolve(import.meta.dirname, "..", "..");

const venvDir = resolve(projectRoot, e2eConfig.venvDir);
const comfyInstallDir = resolve(projectRoot, e2eConfig.comfyInstallDir);
const pidFile = resolve(projectRoot, e2eConfig.testComfyDir, "comfy.pid");

const comfyBin = isWindows
  ? join(venvDir, "Scripts", "comfy.exe")
  : join(venvDir, "bin", "comfy");

async function isComfyRunning(): Promise<boolean> {
  try {
    const response = await fetch(e2eConfig.comfyUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForComfy(timeoutMs: number): Promise<void> {
  const start = Date.now();
  const pollInterval = 2000;

  while (Date.now() - start < timeoutMs) {
    if (await isComfyRunning()) {
      return;
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error(
    `ComfyUI did not start within ${timeoutMs / 1000}s on ${e2eConfig.comfyUrl}`
  );
}

export default async function globalSetup(): Promise<void> {
  // Check if ComfyUI is already running
  if (await isComfyRunning()) {
    console.log(
      `[e2e] ComfyUI already running on ${e2eConfig.comfyUrl}, reusing.`
    );
    // Write PID file with "external" marker so teardown knows not to kill it
    writeFileSync(pidFile, "external", "utf-8");
    return;
  }

  // Verify comfy binary exists
  if (!existsSync(comfyBin)) {
    throw new Error(
      `comfy-cli not found at ${comfyBin}. Run \`pnpm setup:e2e\` first.`
    );
  }

  console.log(`[e2e] Starting ComfyUI on port ${e2eConfig.port}...`);

  const child = spawn(
    comfyBin,
    [
      "--skip-prompt",
      "--workspace",
      comfyInstallDir,
      "launch",
      "--",
      "--cpu",
      "--port",
      String(e2eConfig.port),
    ],
    {
      stdio: "pipe",
      detached: !isWindows,
    }
  );

  // Log stdout/stderr for debugging
  child.stdout.on("data", (data: Buffer) => {
    process.stdout.write(`[comfy] ${data.toString()}`);
  });
  child.stderr.on("data", (data: Buffer) => {
    process.stderr.write(`[comfy] ${data.toString()}`);
  });

  child.on("error", (err) => {
    console.error(`[e2e] Failed to start ComfyUI: ${err.message}`);
  });

  if (child.pid === undefined) {
    throw new Error("Failed to spawn ComfyUI process — no PID assigned.");
  }

  // Store PID for teardown
  writeFileSync(pidFile, String(child.pid), "utf-8");
  console.log(`[e2e] ComfyUI spawned with PID ${child.pid}`);

  // Detach so the process survives if this script exits
  child.unref();

  // Wait for ComfyUI to be ready
  await waitForComfy(e2eConfig.timeouts.comfyStartup);
  console.log(`[e2e] ComfyUI is ready on ${e2eConfig.comfyUrl}`);
}
