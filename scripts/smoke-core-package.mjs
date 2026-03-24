import assert from "node:assert/strict";

const coreModule = await import("comfyui-node-organizer");

assert.equal(typeof coreModule.inferGroupMembership, "function");
assert.equal(typeof coreModule.normalizeWorkflowGeometry, "function");
assert.equal(typeof coreModule.DEFAULT_FRAMEWORK_CONFIG, "object");
