// Centralized feature flags for controlled rollout

// Ambient @mx availability in ML layer and JS/Node injection
// Feature flag removed: always enabled
export const USE_AMBIENT_CTX: boolean = true;

// Enable stage-0 retry for /run with inline ExecInvocation as the source
// Feature flag removed: always enabled
export const ENABLE_RUN_STAGE0_RETRY: boolean = true;
