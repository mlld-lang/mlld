/**
 * Register TypeScript path mappings for the explorer
 */
const tsConfig = {
  paths: {
    "@core/*": ["../../core/*"],
    "@grammar/*": ["../*"]
  },
  baseUrl: "."
};

require('tsconfig-paths').register({
  baseUrl: "./src",
  paths: tsConfig.paths
});