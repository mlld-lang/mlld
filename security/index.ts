/**
 * Mlld Security Module
 * 
 * Provides comprehensive security features including:
 * - Command execution analysis and sandboxing
 * - Path access control and validation
 * - Import security and approval
 * - Taint tracking for untrusted data
 * - Security policy management
 * - Audit logging
 */

// Export all submodules
export * from './command';
export * from './import';
export * from './cache';
export * from './url';
export * from './registry';
export * from '@core/security/taint';
export * from './path';

// Export from directories that exist
// export * from './policy';
// export * from './audit';
// export * from './hooks';

// Main security facade
export { SecurityManager } from './SecurityManager';

// Temporary backward compatibility
// (These will be removed once all imports are updated)
export { ImportApproval } from './import';
export { ImmutableCache } from './cache';
export { GistTransformer } from './import';
