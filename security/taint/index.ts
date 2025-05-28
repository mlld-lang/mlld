/**
 * Taint tracking module
 * Tracks data origins and trust levels throughout execution
 */

export { TaintTracker, TaintLevel, TaintedValue } from './TaintTracker';

// Re-export types
export type { TaintLevel, TaintedValue } from './TaintTracker';