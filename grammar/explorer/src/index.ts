/**
 * Meld AST Explorer
 * A tool for exploring and analyzing the Abstract Syntax Tree (AST) produced by Meld's grammar parser.
 */

// Core parsing functionality
export { 
  parseDirective, 
  parseFile,
  normalizeNode 
} from './parse';

// Analysis utilities
export {
  analyzeStructure,
  inferType,
  diffNodes
} from './analyze';

// Generation utilities
export { 
  generateTypeInterface,
  generateBaseTypeInterface,
  generateTypeFile
} from './generate/types';

export { 
  generateTestFixture,
  writeTestFixture
} from './generate/fixtures';

export { 
  generateSnapshot,
  compareWithSnapshot,
  generateSnapshotDiff
} from './generate/snapshots';

export {
  generateDocumentation
} from './generate/docs';

// Batch processing
export {
  processBatch,
  loadExamples,
  processDirectory,
  processSnapshots,
  type Example
} from './batch';

// Export the main Explorer class
export { Explorer, type ExplorerOptions } from './explorer';

// Re-export types for convenience
export type { 
  DirectiveNode,
  TypedDirectiveNode
} from '@grammar/types/base';

export type {
  NodeAnalysis,
  NodeDiff,
  ObjectDiff
} from './analyze';

export type {
  SnapshotDiff,
  DiffItem
} from './generate/snapshots';

export type {
  NormalizedNode
} from './parse';