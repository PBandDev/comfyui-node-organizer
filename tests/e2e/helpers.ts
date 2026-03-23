/**
 * E2E test helpers for ComfyUI Node Organizer.
 *
 * Provides typed extraction of graph state, layout-quality invariant
 * assertions, and convenience wrappers for triggering the organizer
 * through the browser.
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { e2eConfig } from "../../e2e.config.ts";
import {
  isGroupInsideGroup,
  isNodeCenterInsideGroup,
} from "../../src/group-geometry";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedNode {
  id: number;
  type: string;
  title: string;
  pos: [number, number];
  size: [number, number];
}

export interface ExtractedLink {
  id: number;
  origin_id: number;
  origin_slot: number;
  target_id: number;
  target_slot: number;
}

export interface ExtractedGroup {
  title: string;
  pos: [number, number];
  size: [number, number];
}

export interface GraphState {
  nodes: ExtractedNode[];
  links: ExtractedLink[];
  groups: ExtractedGroup[];
}

export interface GroupMembershipSnapshot {
  title: string;
  parentTitle: string | null;
  memberNodeIds: number[];
}

export interface SpacingMeasurements {
  horizontalLayerGap: number;
  verticalSiblingGap: number;
  groupPadding: number;
  disconnectedGap: number;
}

// ── AABB helpers (no tolerance parameter to keep strict) ─────────────────────

interface BoundingBox {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** AABB overlap with configurable inset tolerance (shrinks boxes before test). */
function boxesOverlap(a: BoundingBox, b: BoundingBox, tolerance: number): boolean {
  const ax = a.x + tolerance;
  const ay = a.y + tolerance;
  const aw = a.w - tolerance * 2;
  const ah = a.h - tolerance * 2;

  const bx = b.x + tolerance;
  const by = b.y + tolerance;
  const bw = b.w - tolerance * 2;
  const bh = b.h - tolerance * 2;

  // If shrunk to zero or negative, skip
  if (aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) return false;

  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** True if `inner` is fully contained inside `outer`. */
function isInside(inner: BoundingBox, outer: BoundingBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

// ── Core helpers ─────────────────────────────────────────────────────────────

/**
 * Wait for ComfyUI app to be fully loaded.
 * Resolves once `window.app.extensionManager` is truthy.
 */
export async function waitForComfyUI(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown> | undefined;
      return !!appObj?.extensionManager;
    },
    { timeout: e2eConfig.timeouts.pageLoad },
  );
}

/**
 * Load a workflow JSON into ComfyUI via `app.loadGraphData`.
 * Waits for the graph to settle (nodes rendered with valid positions).
 */
export async function loadWorkflow(
  page: Page,
  workflow: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(async (data: Record<string, unknown>) => {
    const w = window as unknown as Record<string, unknown>;
    const appObj = w.app as Record<string, unknown>;
    // Must call as method on app to preserve `this` binding
    await (appObj.loadGraphData as (d: unknown) => Promise<void>).call(
      appObj,
      data,
    );
  }, workflow);

  // Wait for ALL nodes to have non-zero sizes
  await page.waitForFunction(
    () => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as
        | (Record<string, unknown> & {
            getCurrentGraph?: () => Record<string, unknown> | undefined;
          })
        | undefined;
      const graph = (canvas?.getCurrentGraph?.() ??
        canvas?.graph ??
        appObj.graph) as Record<string, unknown> | undefined;
      if (!graph) return false;
      const nodes = graph._nodes as Array<Record<string, unknown>> | undefined;
      if (!nodes || nodes.length === 0) return true;
      return nodes.every((n) => {
        const size = n.size as ArrayLike<number> | undefined;
        return size && Number(size[0]) > 0 && Number(size[1]) > 0;
      });
    },
    { timeout: e2eConfig.timeouts.organize },
  );

  // Wait for node sizes to stabilize (widgets/text areas may resize after render)
  await page.waitForTimeout(500);
  await page.waitForFunction(
    () => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as
        | (Record<string, unknown> & {
            getCurrentGraph?: () => Record<string, unknown> | undefined;
          })
        | undefined;
      const graph = (canvas?.getCurrentGraph?.() ??
        canvas?.graph ??
        appObj.graph) as Record<string, unknown> | undefined;
      if (!graph) return true;
      const nodes = graph._nodes as Array<Record<string, unknown>> | undefined;
      if (!nodes) return true;
      // Store sizes, wait, check again — if stable, sizes won't change
      const key = "__sizeCheck";
      const w2 = window as unknown as Record<string, unknown>;
      const prev = w2[key] as string | undefined;
      const current = JSON.stringify(
        nodes.map((n) => {
          const s = n.size as ArrayLike<number>;
          return [Number(s[0]), Number(s[1])];
        }),
      );
      w2[key] = current;
      return prev === current;
    },
    { timeout: e2eConfig.timeouts.organize, polling: 300 },
  );
}

/**
 * Trigger "Organize Workflow" via canvas right-click context menu.
 * Clicks the canvas center, opens context menu, then clicks the menu item.
 */
export async function triggerOrganize(page: Page): Promise<void> {
  // Capture positions before so we can detect when layout completes
  const beforePositions = await extractNodePositionMap(page);

  // Execute the organize command directly via ComfyUI's command API
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const appObj = w.app as Record<string, unknown>;
    const em = appObj.extensionManager as Record<string, unknown>;
    const command = em.command as { execute: (id: string) => void };
    command.execute("node-organizer.organize-workflow");
  });

  // Wait for layout to complete — positions should change (or stabilize for empty graphs)
  await waitForPositionsToChange(page, beforePositions);
}

export async function setNumericSetting(
  page: Page,
  settingId: string,
  value: number,
): Promise<void> {
  await page.evaluate(
    ({ id, nextValue }: { id: string; nextValue: number }) => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const extensionManager = appObj.extensionManager as Record<string, unknown>;
      const setting = extensionManager.setting as {
        set: (targetId: string, targetValue: number) => void;
      };
      setting.set(id, nextValue);
    },
    { id: settingId, nextValue: value },
  );
}

export async function setBooleanSetting(
  page: Page,
  settingId: string,
  value: boolean,
): Promise<void> {
  await page.evaluate(
    ({ id, nextValue }: { id: string; nextValue: boolean }) => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const extensionManager = appObj.extensionManager as Record<string, unknown>;
      const setting = extensionManager.setting as {
        set: (targetId: string, targetValue: boolean) => void;
      };
      setting.set(id, nextValue);
    },
    { id: settingId, nextValue: value },
  );
}

export async function setNumericSettingOverride(
  page: Page,
  settingId: string,
  value: number,
): Promise<void> {
  await page.evaluate(
    ({ id, nextValue }: { id: string; nextValue: number }) => {
      const overrideKey = "__nodeOrganizerSettingOverrides";
      const originalGetKey = "__nodeOrganizerOriginalSettingGet";
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const extensionManager = appObj.extensionManager as Record<string, unknown>;
      const setting = extensionManager.setting as {
        get?: <T>(targetId: string) => T | undefined;
      } & Record<string, unknown>;

      const overrides =
        (w[overrideKey] as Record<string, number> | undefined) ?? {};
      overrides[id] = nextValue;
      w[overrideKey] = overrides;

      if (typeof w[originalGetKey] !== "function") {
        w[originalGetKey] = setting.get?.bind(setting);
        setting.get = <T>(targetId: string): T | undefined => {
          const activeOverrides = w[overrideKey] as
            | Record<string, number>
            | undefined;
          if (activeOverrides && targetId in activeOverrides) {
            return activeOverrides[targetId] as T;
          }
          const originalGet = w[originalGetKey] as
            | ((settingId: string) => T | undefined)
            | undefined;
          return originalGet?.(targetId);
        };
      }
    },
    { id: settingId, nextValue: value },
  );
}

export async function clearNumericSettingOverrides(page: Page): Promise<void> {
  await page.evaluate(() => {
    const overrideKey = "__nodeOrganizerSettingOverrides";
    const originalGetKey = "__nodeOrganizerOriginalSettingGet";
    const w = window as unknown as Record<string, unknown>;
    const appObj = w.app as Record<string, unknown>;
    const extensionManager = appObj.extensionManager as Record<string, unknown>;
    const setting = extensionManager.setting as {
      get?: <T>(targetId: string) => T | undefined;
    } & Record<string, unknown>;
    const originalGet = w[originalGetKey] as
      | (<T>(settingId: string) => T | undefined)
      | undefined;

    delete w[overrideKey];
    if (originalGet) {
      setting.get = originalGet;
      delete w[originalGetKey];
    }
  });
}

/**
 * Trigger "Organize Group" for a specific group by title.
 *
 * Uses page.evaluate to programmatically select the group and invoke
 * the layout, since UI-based group selection is fragile.
 */
export async function triggerOrganizeGroup(
  page: Page,
  groupTitle: string,
): Promise<void> {
  // Select the group programmatically, then execute the organize command
  await page.evaluate((title: string) => {
    const w = window as unknown as Record<string, unknown>;
    const appObj = w.app as Record<string, unknown>;
    const canvas = appObj.canvas as Record<string, unknown> & {
      getCurrentGraph?: () => Record<string, unknown> | undefined;
    };
    const graph = (canvas.getCurrentGraph?.() ??
      canvas.graph) as Record<string, unknown>;
    const groups = graph._groups as Array<Record<string, unknown>>;

    const group = groups.find((g) => g.title === title);
    if (!group) {
      throw new Error(`Group with title "${title}" not found`);
    }

    // Select the group via canvas.selectedItems
    const selectedItems = new Set([group]);
    canvas.selectedItems = selectedItems;

    // Execute the organize groups command
    const em = appObj.extensionManager as Record<string, unknown>;
    const command = em.command as { execute: (id: string) => void };
    command.execute("node-organizer.organize-groups");
  }, groupTitle);

  // Allow layout to complete
  await page.waitForTimeout(1000);
}

/**
 * Extract the current graph state (nodes, links, groups) from the browser.
 * Converts Float64Array / typed arrays to plain JS arrays.
 */
export async function extractGraphState(page: Page): Promise<GraphState> {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const appObj = w.app as Record<string, unknown>;
    const canvas = appObj.canvas as Record<string, unknown> & {
      getCurrentGraph?: () => Record<string, unknown> | undefined;
    };
    const graph = (canvas.getCurrentGraph?.() ??
      canvas.graph ??
      appObj.graph) as Record<string, unknown>;

    // ── Nodes ──
    const packNode = (
      node: Record<string, unknown>,
      fallbackType: string,
      fallbackTitle: string,
    ) => {
      const pos = node.pos as ArrayLike<number>;
      const size = node.size as ArrayLike<number>;
      return {
        id: Number(node.id),
        type: (node.type as string) ?? fallbackType,
        title:
          (node.title as string) ??
          (node.type as string) ??
          fallbackTitle,
        pos: [Number(pos[0]), Number(pos[1])] as [number, number],
        size: [Number(size[0]), Number(size[1])] as [number, number],
      };
    };

    const rawNodes = graph._nodes as Array<Record<string, unknown>>;
    const nodes = rawNodes.map((n) => packNode(n, "Unknown", "Unknown"));
    const inputNode = graph.inputNode as Record<string, unknown> | undefined;
    const outputNode = graph.outputNode as Record<string, unknown> | undefined;
    if (inputNode) {
      nodes.push(packNode(inputNode, "SubgraphInput", "Subgraph Input"));
    }
    if (outputNode) {
      nodes.push(packNode(outputNode, "SubgraphOutput", "Subgraph Output"));
    }

    // ── Links ──
    const rawLinks = graph.links as
      | Map<number, Record<string, unknown>>
      | Record<string, Record<string, unknown>>;
    const linkEntries: Array<Record<string, unknown>> =
      rawLinks instanceof Map
        ? Array.from(rawLinks.values())
        : Object.values(rawLinks);

    const links = linkEntries
      .filter((l): l is Record<string, unknown> => l != null)
      .map((l) => ({
        id: l.id as number,
        origin_id: l.origin_id as number,
        origin_slot: l.origin_slot as number,
        target_id: l.target_id as number,
        target_slot: l.target_slot as number,
      }));

    // ── Groups ──
    const rawGroups = (graph._groups as Array<Record<string, unknown>> | undefined) ?? [];
    const groups = rawGroups.map((g) => {
      const gPos = (g._pos ?? g.pos) as ArrayLike<number>;
      const gSize = (g._size ?? g.size) as ArrayLike<number>;
      return {
        title: (g.title as string) ?? "Untitled",
        pos: [Number(gPos[0]), Number(gPos[1])] as [number, number],
        size: [Number(gSize[0]), Number(gSize[1])] as [number, number],
      };
    });

    return { nodes, links, groups };
  });
}

export async function extractGroupMemberships(
  page: Page,
): Promise<GroupMembershipSnapshot[]> {
  const graph = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const appObj = w.app as Record<string, unknown>;
    const canvas = appObj.canvas as Record<string, unknown> & {
      getCurrentGraph?: () => Record<string, unknown> | undefined;
    };
    const currentGraph = (canvas.getCurrentGraph?.() ??
      canvas.graph ??
      appObj.graph) as {
      _nodes: Array<Record<string, unknown>>;
      _groups: Array<Record<string, unknown>>;
    };

    return {
      groups: currentGraph._groups.map((group) => {
        const pos = (group._pos ?? group.pos) as ArrayLike<number>;
        const size = (group._size ?? group.size) as ArrayLike<number>;
        return {
          id: Number(group.id),
          title: String(group.title ?? "Untitled"),
          pos: [Number(pos[0]), Number(pos[1])] as [number, number],
          size: [Number(size[0]), Number(size[1])] as [number, number],
        };
      }),
      nodes: currentGraph._nodes.map((node) => {
        const pos = node.pos as ArrayLike<number>;
        const size = node.size as ArrayLike<number>;
        return {
          id: Number(node.id),
          pos: [Number(pos[0]), Number(pos[1])] as [number, number],
          size: [Number(size[0]), Number(size[1])] as [number, number],
        };
      }),
    };
  });

  return graph.groups
    .map((group) => {
      let parent: (typeof graph.groups)[number] | null = null;
      for (const candidate of graph.groups) {
        if (candidate.id === group.id) continue;
        if (!isGroupInsideGroup(group, candidate)) continue;
        if (
          !parent ||
          candidate.size[0] * candidate.size[1] < parent.size[0] * parent.size[1]
        ) {
          parent = candidate;
        }
      }

      const directChildren = graph.groups.filter((candidate) => {
        if (candidate.id === group.id) return false;
        if (!isGroupInsideGroup(candidate, group)) return false;
        let candidateParent: (typeof graph.groups)[number] | null = null;
        for (const possibleParent of graph.groups) {
          if (possibleParent.id === candidate.id) continue;
          if (!isGroupInsideGroup(candidate, possibleParent)) continue;
          if (
            !candidateParent ||
            possibleParent.size[0] * possibleParent.size[1] <
              candidateParent.size[0] * candidateParent.size[1]
          ) {
            candidateParent = possibleParent;
          }
        }
        return candidateParent?.id === group.id;
      });

      const memberNodeIds = graph.nodes
        .filter((node) => {
          if (!isNodeCenterInsideGroup(node, group)) return false;
          return !directChildren.some((child) => isNodeCenterInsideGroup(node, child));
        })
        .map((node) => node.id)
        .sort((a, b) => a - b);

      return {
        title: group.title,
        parentTitle: parent?.title ?? null,
        memberNodeIds,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function extractSpacingMeasurements(
  page: Page,
): Promise<SpacingMeasurements> {
  return page.evaluate(() => {
    type RuntimeNode = {
      title: string;
      pos: [number, number];
      size: [number, number];
    };

    type RuntimeGroup = {
      title: string;
      pos: [number, number];
      size: [number, number];
    };

    const w = window as unknown as Record<string, unknown>;
    const appObj = w.app as Record<string, unknown>;
    const canvas = appObj.canvas as Record<string, unknown> & {
      getCurrentGraph?: () => Record<string, unknown> | undefined;
    };
    const graph = (canvas.getCurrentGraph?.() ??
      canvas.graph ??
      appObj.graph) as {
      _nodes: Array<Record<string, unknown>>;
      _groups: Array<Record<string, unknown>>;
    };

    const nodes = graph._nodes.map((node) => {
      const pos = node.pos as ArrayLike<number>;
      const size = node.size as ArrayLike<number>;
      return {
        title: String(node.title ?? node.type ?? "Untitled"),
        pos: [Number(pos[0]), Number(pos[1])] as [number, number],
        size: [Number(size[0]), Number(size[1])] as [number, number],
      };
    });

    const groups = graph._groups.map((group) => {
      const pos = (group._pos ?? group.pos) as ArrayLike<number>;
      const size = (group._size ?? group.size) as ArrayLike<number>;
      return {
        title: String(group.title ?? "Untitled"),
        pos: [Number(pos[0]), Number(pos[1])] as [number, number],
        size: [Number(size[0]), Number(size[1])] as [number, number],
      };
    });

    const requireNode = (title: string): RuntimeNode => {
      const node = nodes.find((candidate) => candidate.title === title);
      if (!node) {
        throw new Error(`Missing spacing fixture node "${title}"`);
      }
      return node;
    };

    const requireGroup = (title: string): RuntimeGroup => {
      const group = groups.find((candidate) => candidate.title === title);
      if (!group) {
        throw new Error(`Missing spacing fixture group "${title}"`);
      }
      return group;
    };

    const sampler = requireNode("Sampler");
    const decode = requireNode("Decode");
    const disconnected = requireNode("Disconnected Note");
    const save = requireNode("Save");
    const rootLayerNodes = [
      requireNode("Model Loader"),
      requireNode("Latent Source"),
    ].sort((a, b) => a.pos[1] - b.pos[1]);
    const promptNodes = [
      requireNode("Positive Prompt"),
      requireNode("Negative Prompt"),
    ].sort((a, b) => a.pos[1] - b.pos[1]);
    const promptGroup = requireGroup("Prompt Cluster");

    const mainNodes = [
      rootLayerNodes[0],
      rootLayerNodes[1],
      promptNodes[0],
      promptNodes[1],
      sampler,
      decode,
      save,
    ];

    const mainLeft = Math.min(...mainNodes.map((node) => node.pos[0]));
    const mainRight = Math.max(
      ...mainNodes.map((node) => node.pos[0] + node.size[0]),
    );
    const disconnectedLeft = disconnected.pos[0];
    const disconnectedRight = disconnected.pos[0] + disconnected.size[0];

    const horizontalLayerGap = save.pos[0] - (decode.pos[0] + decode.size[0]);
    const verticalSiblingGap =
      rootLayerNodes[1].pos[1] -
      (rootLayerNodes[0].pos[1] + rootLayerNodes[0].size[1]);
    const leftmostPromptNode = Math.min(
      ...promptNodes.map((node) => node.pos[0]),
    );
    const groupPadding = leftmostPromptNode - promptGroup.pos[0];
    const disconnectedGap =
      disconnectedLeft >= mainRight
        ? disconnectedLeft - mainRight
        : mainLeft - disconnectedRight;

    return {
      horizontalLayerGap,
      verticalSiblingGap,
      groupPadding,
      disconnectedGap,
    };
  });
}

// ── Invariant assertions ─────────────────────────────────────────────────────

/**
 * Assert layout-quality invariants on an extracted graph state.
 *
 * Checks:
 * 1. No node-to-node overlaps (AABB with 2px tolerance)
 * 2. All coordinates are finite (no NaN / Infinity)
 * 3. Nodes whose center falls inside a group are fully contained
 * 4. Topological order — sources positioned left of targets in X
 */
export function assertInvariants(state: GraphState): void {
  assertCorrectnessInvariants(state);
  assertTopologicalOrder(state);
}

/**
 * Correctness-only invariants (no topological order).
 * Use for complex real-world workflows where strict edge directionality
 * cannot always be satisfied due to group containment constraints.
 */
export function assertCorrectnessInvariants(state: GraphState): void {
  assertNoNodeOverlaps(state);
  assertFiniteCoordinates(state);
  assertNodesInsideGroups(state);
  assertNoGroupOverlaps(state);
}

/** No two nodes overlap (strict AABB check). */
function assertNoNodeOverlaps(state: GraphState): void {
  const tolerance = 0;
  const boxes: BoundingBox[] = state.nodes.map((n) => ({
    label: `node_${n.id} (${n.title})`,
    x: n.pos[0],
    y: n.pos[1],
    w: n.size[0],
    h: n.size[1],
  }));

  const overlaps: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j], tolerance)) {
        overlaps.push(`${boxes[i].label} overlaps ${boxes[j].label}`);
      }
    }
  }

  expect(overlaps, `Found ${overlaps.length} node overlaps`).toEqual([]);
}

/** All node/group coordinates are finite numbers. */
function assertFiniteCoordinates(state: GraphState): void {
  const errors: string[] = [];

  for (const n of state.nodes) {
    if (!Number.isFinite(n.pos[0]) || !Number.isFinite(n.pos[1])) {
      errors.push(`Node ${n.id} (${n.title}) has non-finite pos: [${n.pos[0]}, ${n.pos[1]}]`);
    }
    if (!Number.isFinite(n.size[0]) || !Number.isFinite(n.size[1])) {
      errors.push(`Node ${n.id} (${n.title}) has non-finite size: [${n.size[0]}, ${n.size[1]}]`);
    }
  }

  for (const g of state.groups) {
    if (!Number.isFinite(g.pos[0]) || !Number.isFinite(g.pos[1])) {
      errors.push(`Group "${g.title}" has non-finite pos: [${g.pos[0]}, ${g.pos[1]}]`);
    }
    if (!Number.isFinite(g.size[0]) || !Number.isFinite(g.size[1])) {
      errors.push(`Group "${g.title}" has non-finite size: [${g.size[0]}, ${g.size[1]}]`);
    }
  }

  expect(errors, `Found ${errors.length} non-finite coordinates`).toEqual([]);
}

/** Nodes whose center is inside a group must be fully inside that group. */
function assertNodesInsideGroups(state: GraphState): void {
  const errors: string[] = [];

  for (const g of state.groups) {
    const groupBox: BoundingBox = {
      label: `group "${g.title}"`,
      x: g.pos[0],
      y: g.pos[1],
      w: g.size[0],
      h: g.size[1],
    };

    for (const n of state.nodes) {
      const nodeCenterX = n.pos[0] + n.size[0] / 2;
      const nodeCenterY = n.pos[1] + n.size[1] / 2;

      const centerInGroup =
        nodeCenterX >= groupBox.x &&
        nodeCenterX <= groupBox.x + groupBox.w &&
        nodeCenterY >= groupBox.y &&
        nodeCenterY <= groupBox.y + groupBox.h;

      if (centerInGroup) {
        const nodeBox: BoundingBox = {
          label: `node_${n.id} (${n.title})`,
          x: n.pos[0],
          y: n.pos[1],
          w: n.size[0],
          h: n.size[1],
        };

        if (!isInside(nodeBox, groupBox)) {
          errors.push(
            `Node ${n.id} (${n.title}) center inside group "${g.title}" but extends outside bounds`,
          );
        }
      }
    }
  }

  expect(errors, `Found ${errors.length} nodes extending outside their groups`).toEqual([]);
}

/**
 * Topological order: flag only true inversions where the source starts
 * entirely to the right of the target.
 * Reroute nodes are excluded.
 */
function assertTopologicalOrder(state: GraphState): void {
  const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
  const errors: string[] = [];

  for (const link of state.links) {
    const src = nodeMap.get(link.origin_id);
    const tgt = nodeMap.get(link.target_id);
    if (!src || !tgt) continue;
    // Skip reroute nodes
    if (src.type === "Reroute" || tgt.type === "Reroute") continue;

    if (src.pos[0] > tgt.pos[0] + tgt.size[0]) {
      errors.push(
        `Link ${link.id}: source ${src.id} (${src.title}) left-edge ${src.pos[0].toFixed(0)} > ` +
          `target ${tgt.id} (${tgt.title}) right-edge ${(tgt.pos[0] + tgt.size[0]).toFixed(0)}`,
      );
    }
  }

  expect(errors, `Found ${errors.length} topological order violations`).toEqual([]);
}

/** Sibling groups (neither fully contains the other) must not overlap. */
function assertNoGroupOverlaps(state: GraphState): void {
  const overlaps: string[] = [];

  for (let i = 0; i < state.groups.length; i++) {
    for (let j = i + 1; j < state.groups.length; j++) {
      const a = state.groups[i];
      const b = state.groups[j];

      const aBox: BoundingBox = {
        label: `group "${a.title}"`,
        x: a.pos[0],
        y: a.pos[1],
        w: a.size[0],
        h: a.size[1],
      };
      const bBox: BoundingBox = {
        label: `group "${b.title}"`,
        x: b.pos[0],
        y: b.pos[1],
        w: b.size[0],
        h: b.size[1],
      };

      // Skip parent-child pairs (one fully contains the other)
      if (isInside(aBox, bBox) || isInside(bBox, aBox)) continue;

      if (boxesOverlap(aBox, bBox, 0)) {
        overlaps.push(`${aBox.label} overlaps ${bBox.label}`);
      }
    }
  }

  expect(overlaps, `Found ${overlaps.length} sibling group overlaps`).toEqual([]);
}

// ── Idempotency ──────────────────────────────────────────────────────────────

/**
 * Assert the layout is idempotent: run organize twice and compare positions.
 * Must be called after the first organize has already been triggered.
 */
export async function assertIdempotent(page: Page): Promise<void> {
  const state1 = await extractGraphState(page);

  // Trigger organize again
  await triggerOrganize(page);

  const state2 = await extractGraphState(page);

  const tolerance = 0;
  const diffs: string[] = [];

  for (const n1 of state1.nodes) {
    const n2 = state2.nodes.find((n) => n.id === n1.id);
    if (!n2) {
      diffs.push(`Node ${n1.id} missing after second organize`);
      continue;
    }

    const dx = Math.abs(n1.pos[0] - n2.pos[0]);
    const dy = Math.abs(n1.pos[1] - n2.pos[1]);
    if (dx > tolerance || dy > tolerance) {
      diffs.push(
        `Node ${n1.id} (${n1.title}) moved: ` +
          `[${n1.pos[0].toFixed(3)}, ${n1.pos[1].toFixed(3)}] -> ` +
          `[${n2.pos[0].toFixed(3)}, ${n2.pos[1].toFixed(3)}]`,
      );
    }
  }

  expect(diffs, `Layout not idempotent: ${diffs.length} nodes moved`).toEqual([]);
}

// ── Screenshots ──────────────────────────────────────────────────────────────

const SCREENSHOTS_DIR = resolve(import.meta.dirname, "..", "screenshots");

/**
 * Capture a screenshot and save to tests/screenshots/<name>.png.
 * Returns the absolute file path.
 */
export async function captureScreenshot(page: Page, name: string): Promise<string> {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const filepath = resolve(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

/** Fit the current graph into view using the real canvas toolbar control. */
export async function fitGraphForSnapshot(page: Page): Promise<void> {
  const before = await extractViewportState(page);
  await page.getByRole("button", { name: /Fit View/ }).click({ force: true });
  await waitForViewportToStabilize(page, before);
}

/** Compare only the graph canvas, not the full ComfyUI shell. */
export async function expectGraphCanvasScreenshot(
  page: Page,
  name: string,
): Promise<void> {
  await fitGraphForSnapshot(page);
  const graphCanvas = page.locator("#graph-canvas");
  await expect(graphCanvas).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
}

// ── Internal utilities ───────────────────────────────────────────────────────

/** Extract a lightweight id->pos map for change detection. */
async function extractNodePositionMap(
  page: Page,
): Promise<Map<number, [number, number]>> {
  const raw = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const appObj = w.app as Record<string, unknown>;
    const canvas = appObj.canvas as Record<string, unknown> & {
      getCurrentGraph?: () => Record<string, unknown> | undefined;
    };
    const graph = (canvas.getCurrentGraph?.() ??
      canvas.graph ??
      appObj.graph) as Record<string, unknown> | undefined;
    if (!graph) return [];
    const nodes = graph._nodes as Array<Record<string, unknown>> | undefined;
    const entries: Array<Record<string, unknown>> = [...(nodes ?? [])];
    if (graph.inputNode) {
      entries.push(graph.inputNode as Record<string, unknown>);
    }
    if (graph.outputNode) {
      entries.push(graph.outputNode as Record<string, unknown>);
    }
    return entries.map((n) => {
      const pos = n.pos as ArrayLike<number>;
      return [n.id as number, Number(pos[0]), Number(pos[1])] as [number, number, number];
    });
  });

  const map = new Map<number, [number, number]>();
  for (const [id, x, y] of raw) {
    map.set(id, [x, y]);
  }
  return map;
}

/**
 * Wait until node positions differ from a baseline snapshot.
 * Times out gracefully — some graphs may already be organized.
 */
async function waitForPositionsToChange(
  page: Page,
  before: Map<number, [number, number]>,
): Promise<void> {
  const deadline = Date.now() + e2eConfig.timeouts.organize;
  const pollMs = 200;

  while (Date.now() < deadline) {
    const current = await extractNodePositionMap(page);
    let changed = false;

    for (const [id, pos] of before) {
      const cur = current.get(id);
      if (!cur) continue;
      if (Math.abs(pos[0] - cur[0]) > 1 || Math.abs(pos[1] - cur[1]) > 1) {
        changed = true;
        break;
      }
    }

    if (changed) return;
    await page.waitForTimeout(pollMs);
  }

  // Not an error — layout may be a no-op for an already-organized graph
}

interface ViewportState {
  offset: [number, number];
  scale: number;
  dirtyCanvas: boolean;
  dirtyBgCanvas: boolean;
}

async function extractViewportState(page: Page): Promise<ViewportState> {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const appObj = w.app as Record<string, unknown>;
    const canvas = appObj.canvas as {
      ds: { offset: [number, number]; scale: number };
      dirty_canvas?: boolean;
      dirty_bgcanvas?: boolean;
    };
    return {
      offset: [Number(canvas.ds.offset[0]), Number(canvas.ds.offset[1])] as [
        number,
        number,
      ],
      scale: Number(canvas.ds.scale),
      dirtyCanvas: !!canvas.dirty_canvas,
      dirtyBgCanvas: !!canvas.dirty_bgcanvas,
    };
  });
}

function isViewportEquivalent(a: ViewportState, b: ViewportState): boolean {
  return (
    Math.abs(a.offset[0] - b.offset[0]) <= 0.01 &&
    Math.abs(a.offset[1] - b.offset[1]) <= 0.01 &&
    Math.abs(a.scale - b.scale) <= 0.0001 &&
    a.dirtyCanvas === b.dirtyCanvas &&
    a.dirtyBgCanvas === b.dirtyBgCanvas
  );
}

async function waitForViewportToStabilize(
  page: Page,
  before: ViewportState,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  let previous = before;
  let changed = false;
  let stablePolls = 0;

  while (Date.now() < deadline) {
    const current = await extractViewportState(page);

    if (!changed && !isViewportEquivalent(current, before)) {
      changed = true;
    }

    const isStableFrame =
      isViewportEquivalent(current, previous) &&
      !current.dirtyCanvas &&
      !current.dirtyBgCanvas;

    stablePolls = isStableFrame ? stablePolls + 1 : 0;
    if ((changed && stablePolls >= 3) || (!changed && stablePolls >= 5)) {
      return;
    }

    previous = current;
    await page.waitForTimeout(100);
  }
}

