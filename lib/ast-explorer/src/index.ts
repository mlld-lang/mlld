/**
 * Meld AST Explorer
 * A tool for exploring and analyzing the Abstract Syntax Tree (AST) produced by Meld's grammar parser.
 */

// Core parsing functionality
export { 
  parseDirective, 
  parseFile,
  normalizeNode 
} from './parse.js';

// Analysis utilities
export {
  analyzeStructure,
  inferType,
  diffNodes
} from './analyze.js';

// Generation utilities
export { 
  generateTypeInterface,
  generateBaseTypeInterface,
  generateTypeFile
} from './generate/types.js';

export { 
  generateTestFixture,
  writeTestFixture
} from './generate/fixtures.js';

export { 
  generateSnapshot,
  compareWithSnapshot,
  generateSnapshotDiff
} from './generate/snapshots.js';

export {
  generateDocumentation
} from './generate/docs.js';

// Batch processing
export {
  processBatch,
  loadExamples,
  processExampleDirs,
  processSnapshots,
  type Example
} from './batch.js';

// Export the main Explorer class
export { Explorer, type ExplorerOptions } from './explorer.js';

// Re-export types for convenience
export type {
  DirectiveNode
} from './parse.js';

export type {
  NodeAnalysis,
  NodeDiff,
  ObjectDiff
} from './analyze.js';

export type {
  SnapshotDiff,
  DiffItem
} from './generate/snapshots.js';

export type {
  NormalizedNode
} from './parse.js';