import { createHorizontalAlgorithm } from "./algorithms/horizontal";
import { createSugiyamaAlgorithm } from "./algorithms/sugiyama";
import { createVerticalAlgorithm } from "./algorithms/vertical";
import type { FrameworkConfig, LayoutAlgorithm } from "./types";

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
