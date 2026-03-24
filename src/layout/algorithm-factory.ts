import { createHorizontalAlgorithm } from "./algorithms/horizontal.js";
import { createSugiyamaAlgorithm } from "./algorithms/sugiyama.js";
import { createVerticalAlgorithm } from "./algorithms/vertical.js";
import type { FrameworkConfig, LayoutAlgorithm } from "./types.js";

export type LayoutAlgorithmName = "sugiyama" | "horizontal" | "vertical";

export function createLayoutAlgorithm(
  algorithmName: LayoutAlgorithmName,
  config: Pick<FrameworkConfig, "horizontalGap" | "verticalGap">,
): LayoutAlgorithm {
  switch (algorithmName) {
    case "horizontal":
      return createHorizontalAlgorithm(config.horizontalGap);
    case "vertical":
      return createVerticalAlgorithm(config.verticalGap);
    case "sugiyama":
      return createSugiyamaAlgorithm({
        horizontalGap: config.horizontalGap,
        verticalGap: config.verticalGap,
      });
  }
}
