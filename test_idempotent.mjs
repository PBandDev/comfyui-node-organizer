import { readFileSync } from 'fs';

// Load fixture
const fixtureData = JSON.parse(readFileSync('./tests/fixtures/complex-parallel.json', 'utf-8'));

// Convert to LGraph format
const nodes = fixtureData.nodes.map((n) => ({
  id: n.id,
  type: n.type,
  title: n.title ?? n.type,
  pos: [...n.pos],
  size: [...n.size],
  inputs: n.inputs?.map((i) => ({ name: i.name, type: i.type, link: i.link })) ?? [],
  outputs: n.outputs?.map((o) => ({ name: o.name, type: o.type, links: o.links ? [...o.links] : null })) ?? [],
  flags: n.flags ? { ...n.flags } : undefined,
  locked: n.locked,
  order: n.order,
}));

const links = new Map();
for (const [linkId, originId, originSlot, targetId, targetSlot, type] of fixtureData.links) {
  links.set(linkId, {
    id: linkId,
    origin_id: originId,
    origin_slot: originSlot,
    target_id: targetId,
    target_slot: targetSlot,
    type,
  });
}

const groups = (fixtureData.groups ?? []).map((g, idx) => ({
  id: g.id ?? idx,
  title: g.title,
  pos: [g.bounding[0], g.bounding[1]],
  size: [g.bounding[2], g.bounding[3]],
}));

const graph = { _nodes: nodes, _groups: groups, links };

// Import the layout function from dist
const layoutModule = await import('./dist/index.js');

// Get the layoutGraph function - it's exported with a different name since it's minified
// But we can see from the HTML that the export is Re
console.log('Module exports:', Object.keys(layoutModule));

