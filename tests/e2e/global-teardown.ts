import { execSync } from "node:child_process";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { e2eConfig } from "../../e2e.config.ts";

const isWindows = process.platform === "win32";
const projectRoot = resolve(import.meta.dirname, "..", "..");
const pidFile = resolve(projectRoot, e2eConfig.testComfyDir, "comfy.pid");

function killProcess(pid: number): void {
  try {
    if (isWindows) {
      // On Windows, process.kill doesn't reliably kill child trees.
      // Use taskkill /F /T to force-kill the process tree.
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      // On Unix, kill the process group (negative PID)
      process.kill(-pid, "SIGTERM");
    }
    console.log(`[e2e] Killed ComfyUI process (PID ${pid}).`);
  } catch {
    // Process may already be dead
    console.log(
      `[e2e] ComfyUI process (PID ${pid}) already exited or could not be killed.`
    );
  }
}

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(pidFile)) {
    console.log("[e2e] No PID file found, nothing to tear down.");
    return;
  }

  const content = readFileSync(pidFile, "utf-8").trim();

  if (content === "external") {
    console.log(
      "[e2e] ComfyUI was already running before tests — leaving it alone."
    );
    unlinkSync(pidFile);
    return;
  }

  const pid = parseInt(content, 10);
  if (isNaN(pid)) {
    console.log(`[e2e] Invalid PID in file: "${content}". Cleaning up.`);
    unlinkSync(pidFile);
    return;
  }

  killProcess(pid);
  unlinkSync(pidFile);
}
