/**
 * Token parser and algorithm factory.
 *
 * Parses group titles for layout tokens like [HORIZONTAL], [2ROW], [3COL]
 * and creates the corresponding LayoutAlgorithm instances.
 */

import type { LayoutToken, LayoutAlgorithm } from "./types";
import { createHorizontalAlgorithm } from "./algorithms/horizontal";
import { createVerticalAlgorithm } from "./algorithms/vertical";
import { createGridAlgorithm } from "./algorithms/grid";

/**
 * Regex to match layout tokens in group titles.
 * Matches: [HORIZONTAL], [VERTICAL], [1-9ROW], [1-9COL]
 * Case-insensitive.
 */
const TOKEN_REGEX = /\[(HORIZONTAL|VERTICAL|([1-9])ROW|([1-9])COL)\]/i;

/**
 * Parse a group title for a layout token.
 * Returns null if no valid token is found.
 *
 * @example
 * parseLayoutToken("My Group [HORIZONTAL]") // { mode: 'horizontal' }
 * parseLayoutToken("[2ROW]")                // { mode: 'grid', count: 2, dimension: 'row' }
 * parseLayoutToken("No token")             // null
 */
export function parseLayoutToken(title: string): LayoutToken | null {
  const match = TOKEN_REGEX.exec(title);
  if (!match) return null;

  const fullMatch = match[1].toUpperCase();

  if (fullMatch === "HORIZONTAL") {
    return { mode: "horizontal" };
  }

  if (fullMatch === "VERTICAL") {
    return { mode: "vertical" };
  }

  // [N]ROW pattern
  if (match[2] !== undefined) {
    const count = parseInt(match[2], 10);
    if (count === 1) {
      return { mode: "horizontal" };
    }
    return { mode: "grid", count, dimension: "row" };
  }

  // [N]COL pattern
  if (match[3] !== undefined) {
    const count = parseInt(match[3], 10);
    if (count === 1) {
      return { mode: "vertical" };
    }
    return { mode: "grid", count, dimension: "col" };
  }

  return null;
}

/**
 * Create a LayoutAlgorithm from a LayoutToken.
 *
 * @param token - The parsed layout token
 * @param gap - Gap between nodes (default: 40)
 */
export function tokenToAlgorithm(token: LayoutToken, gap?: number): LayoutAlgorithm {
  switch (token.mode) {
    case "horizontal":
      return createHorizontalAlgorithm(gap);

    case "vertical":
      return createVerticalAlgorithm(gap);

    case "grid": {
      if (token.dimension === "row") {
        return createGridAlgorithm({ rows: token.count, gap });
      }
      return createGridAlgorithm({ columns: token.count, gap });
    }
  }
}
