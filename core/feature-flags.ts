// Centralized feature flags for controlled rollout

// Ambient @ctx availability in ML layer and JS/Node injection
export const USE_AMBIENT_CTX: boolean =
  process.env.MLLD_CTX === 'true' ||
  process.env.MLLD_UNIVERSAL_CONTEXT === 'true';

// Enable stage-0 retry for /run with inline ExecInvocation as the source
// When true, processPipeline may prepend a synthetic __source__ stage
export const ENABLE_RUN_STAGE0_RETRY: boolean =
  process.env.MLLD_RUN_STAGE0_RETRY === 'true' ||
  process.env.MLLD_PIPELINE_RETRY_SOURCE === 'true';
