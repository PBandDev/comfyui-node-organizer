import { test, expect } from "@playwright/test";
import {
  waitForComfyUI,
  loadWorkflow,
  triggerOrganize,
  extractGraphState,
} from "./helpers";
import { loadFixture } from "./fixtures";
import { SETTING_IDS } from "../../src/settings";

test.describe("Subgraph layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForComfyUI(page);
  });

  test("organize keeps subgraph boundary nodes at the execution graph edges", async ({
    page,
  }) => {
    await loadWorkflow(page, loadFixture("subgraph-io"));

    const state = await page.evaluate(async () => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as {
        graph?: {
          _nodes?: Array<Record<string, unknown>>;
        };
        getCurrentGraph?: () => {
          _nodes?: Array<Record<string, unknown>>;
          inputNode?: Record<string, unknown>;
          outputNode?: Record<string, unknown>;
          links?:
            | Map<number, Record<string, unknown>>
            | Record<string, Record<string, unknown>>;
        };
        openSubgraph: (
          subgraph: Record<string, unknown>,
          fromNode: Record<string, unknown>,
        ) => void;
      };
      const rootGraph = (canvas.graph ??
        appObj.graph) as { _nodes?: Array<Record<string, unknown>> };
      const rootNodes = rootGraph._nodes ?? [];
      const subgraphNode = rootNodes.find((n) => !!n.subgraph);
      if (!subgraphNode?.subgraph) {
        throw new Error("No subgraph node found in fixture");
      }

      canvas.openSubgraph(subgraphNode.subgraph as Record<string, unknown>, subgraphNode);
      const currentGraph = (canvas.getCurrentGraph?.() ??
        canvas.graph) as {
        _nodes: Array<Record<string, unknown>>;
        inputNode: Record<string, unknown>;
        outputNode: Record<string, unknown>;
        links:
          | Map<number, Record<string, unknown>>
          | Record<string, Record<string, unknown>>;
      };

      return {
        rootNodeIds: rootNodes.map((n) => n.id as number),
        subgraphNodeCount: currentGraph._nodes.length,
        beforeInputX: Number((currentGraph.inputNode.pos as ArrayLike<number>)[0]),
        beforeOutputX: Number((currentGraph.outputNode.pos as ArrayLike<number>)[0]),
      };
    });

    expect(state.subgraphNodeCount).toBeGreaterThan(0);
    await triggerOrganize(page);

    const after = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as {
        graph?: {
          _nodes?: Array<Record<string, unknown>>;
        };
        getCurrentGraph?: () => {
          _nodes?: Array<Record<string, unknown>>;
          inputNode?: Record<string, unknown>;
          outputNode?: Record<string, unknown>;
          links?:
            | Map<number, Record<string, unknown>>
            | Record<string, Record<string, unknown>>;
        };
      };
      const currentGraph = (canvas.getCurrentGraph?.() ??
        canvas.graph) as {
        _nodes: Array<Record<string, unknown>>;
        inputNode: Record<string, unknown>;
        outputNode: Record<string, unknown>;
        links:
          | Map<number, Record<string, unknown>>
          | Record<string, Record<string, unknown>>;
      };

      const pack = (node: Record<string, unknown>) => {
        const pos = node.pos as ArrayLike<number>;
        const size = node.size as ArrayLike<number>;
        return {
          id: node.id as number,
          x: Number(pos[0]),
          y: Number(pos[1]),
          width: Number(size[0]),
          height: Number(size[1]),
        };
      };

      return {
        inputNode: pack(currentGraph.inputNode),
        outputNode: pack(currentGraph.outputNode),
        nodes: currentGraph._nodes.map(pack),
        links:
          currentGraph.links instanceof Map
            ? Array.from(currentGraph.links.values()).map((link) => ({
                origin_id: link.origin_id as number,
                target_id: link.target_id as number,
              }))
            : Object.values(
                currentGraph.links as Record<string, Record<string, unknown>>,
              ).map((link) => ({
                origin_id: link.origin_id as number,
                target_id: link.target_id as number,
              })),
      };
    });

    const connectedNodeIds = new Set<number>();
    for (const link of after.links) {
      if (link.origin_id > 0) connectedNodeIds.add(link.origin_id);
      if (link.target_id > 0) connectedNodeIds.add(link.target_id);
    }
    const connectedNodes = after.nodes.filter((node) =>
      connectedNodeIds.has(node.id),
    );
    const leftmostNodeX = Math.min(...connectedNodes.map((node) => node.x));
    const rightmostNodeEdge = Math.max(
      ...connectedNodes.map((node) => node.x + node.width),
    );

    expect(after.inputNode.x).toBeLessThanOrEqual(leftmostNodeX);
    expect(after.outputNode.x + after.outputNode.width).toBeGreaterThanOrEqual(
      rightmostNodeEdge,
    );
  });

  test("fit-to-view inside subgraph includes boundary nodes in bounds", async ({
    page,
  }) => {
    await loadWorkflow(page, loadFixture("subgraph-io"));

    // Enable fit-to-view
    await page.evaluate((settingId: string) => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const em = appObj.extensionManager as Record<string, unknown>;
      const setting = em.setting as { set: (id: string, value: boolean) => void };
      setting.set(settingId, true);
    }, SETTING_IDS.FIT_TO_VIEW);

    // Navigate into the subgraph
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as {
        graph?: { _nodes?: Array<Record<string, unknown>> };
        openSubgraph: (
          subgraph: Record<string, unknown>,
          fromNode: Record<string, unknown>,
        ) => void;
      };
      const rootGraph = (canvas.graph ??
        appObj.graph) as { _nodes?: Array<Record<string, unknown>> };
      const subgraphNode = (rootGraph._nodes ?? []).find((n) => !!n.subgraph);
      if (!subgraphNode?.subgraph) {
        throw new Error("No subgraph node found in fixture");
      }
      canvas.openSubgraph(subgraphNode.subgraph as Record<string, unknown>, subgraphNode);
    });

    // Organize inside the subgraph with fit-to-view enabled
    await triggerOrganize(page);
    await page.waitForTimeout(1500);

    // Get viewport scale and the actual node/boundary bounds
    const result = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as Record<string, unknown> & {
        getCurrentGraph?: () => Record<string, unknown>;
        ds: { scale: number };
      };
      const graph = (canvas.getCurrentGraph?.() ??
        canvas.graph) as {
        _nodes: Array<Record<string, unknown>>;
        inputNode?: Record<string, unknown>;
        outputNode?: Record<string, unknown>;
      };

      const bounds = { minX: Infinity, maxX: -Infinity };
      for (const node of graph._nodes) {
        const pos = node.pos as ArrayLike<number>;
        const size = node.size as ArrayLike<number>;
        const x = Number(pos[0]);
        const right = x + Number(size[0]);
        if (x < bounds.minX) bounds.minX = x;
        if (right > bounds.maxX) bounds.maxX = right;
      }
      if (graph.inputNode) {
        const pos = graph.inputNode.pos as ArrayLike<number>;
        const size = graph.inputNode.size as ArrayLike<number>;
        const x = Number(pos[0]);
        const right = x + Number(size[0]);
        if (x < bounds.minX) bounds.minX = x;
        if (right > bounds.maxX) bounds.maxX = right;
      }
      if (graph.outputNode) {
        const pos = graph.outputNode.pos as ArrayLike<number>;
        const size = graph.outputNode.size as ArrayLike<number>;
        const x = Number(pos[0]);
        const right = x + Number(size[0]);
        if (x < bounds.minX) bounds.minX = x;
        if (right > bounds.maxX) bounds.maxX = right;
      }

      return {
        scale: canvas.ds.scale,
        totalWidth: bounds.maxX - bounds.minX,
        hasInputNode: !!graph.inputNode,
        hasOutputNode: !!graph.outputNode,
      };
    });

    expect(result.hasInputNode).toBe(true);
    expect(result.hasOutputNode).toBe(true);
    // If boundary nodes are included in bounds, scale should be reasonable (< 2).
    // Without them, the bounds are too small and scale is too high.
    expect(result.scale).toBeLessThan(2);
  });

  test("extractGraphState includes subgraph boundary nodes", async ({ page }) => {
    await loadWorkflow(page, loadFixture("subgraph-io"));

    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const appObj = w.app as Record<string, unknown>;
      const canvas = appObj.canvas as {
        graph?: {
          _nodes?: Array<Record<string, unknown>>;
        };
        getCurrentGraph?: () => unknown;
        openSubgraph: (
          subgraph: Record<string, unknown>,
          fromNode: Record<string, unknown>,
        ) => void;
      };
      const rootGraph = (canvas.graph ??
        appObj.graph) as { _nodes?: Array<Record<string, unknown>> };
      const subgraphNode = (rootGraph._nodes ?? []).find((n) => !!n.subgraph);
      if (!subgraphNode?.subgraph) {
        throw new Error("No subgraph node found in fixture");
      }
      canvas.openSubgraph(subgraphNode.subgraph as Record<string, unknown>, subgraphNode);
    });

    const state = await extractGraphState(page);
    const nodeIds = state.nodes.map((node) => node.id);

    expect(nodeIds).toContain(-10);
    expect(nodeIds).toContain(-20);
  });
});
