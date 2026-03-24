export const EXTENSION_NAME = "comfy-node-organizer";
export const SETTINGS_PREFIX = "Node Organizer";
export const REPOSITORY_URL =
  "https://github.com/PBandDev/comfyui-node-organizer";
export const CURRENT_VERSION = "2.1.1";

export const DEFAULT_ALGORITHM_OPTIONS = [
  "sugiyama",
  "horizontal",
  "vertical",
] as const;

export type DefaultAlgorithmName =
  (typeof DEFAULT_ALGORITHM_OPTIONS)[number];

export const SETTING_IDS = {
  VERSION: `${SETTINGS_PREFIX}.About`,
  KEYBINDINGS: `${SETTINGS_PREFIX}.Keybindings`,
  DEFAULT_ALGORITHM: `${SETTINGS_PREFIX}.Default Algorithm`,
  HORIZONTAL_GAP: `${SETTINGS_PREFIX}.Horizontal Gap`,
  VERTICAL_GAP: `${SETTINGS_PREFIX}.Vertical Gap`,
  GROUP_PADDING: `${SETTINGS_PREFIX}.Group Padding`,
  DISCONNECTED_GAP: `${SETTINGS_PREFIX}.Disconnected Gap`,
  FIT_TO_VIEW: `${SETTINGS_PREFIX}.Fit to View`,
  DEBUG_LOGGING: `${SETTINGS_PREFIX}.Debug Logging`,
} as const;
