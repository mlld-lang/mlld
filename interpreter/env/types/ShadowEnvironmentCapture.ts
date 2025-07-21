/**
 * Captured shadow environments for different languages
 * Maps are used to store function name -> function pairs
 */
export interface ShadowEnvironmentCapture {
  js?: Map<string, any>;
  javascript?: Map<string, any>;
  node?: Map<string, any>;
  nodejs?: Map<string, any>;
  // Future: python?, sh?, etc.
}

/**
 * Interface for environments that can provide shadow captures
 */
export interface ShadowEnvironmentProvider {
  captureAllShadowEnvs(): ShadowEnvironmentCapture;
  hasShadowEnvs(): boolean;
}