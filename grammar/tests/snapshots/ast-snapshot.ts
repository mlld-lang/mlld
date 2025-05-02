/**
 * Utility for capturing and comparing AST snapshots
 * This helps ensure parsing is stable during refactoring
 */
import { parse } from '@core/ast';
import type { DirectiveNode, MeldNode } from '@core/ast/types';

/**
 * Captures an AST snapshot for later comparison
 */
export async function captureASTSnapshot(input: string): Promise<{
  ast: MeldNode[];
  firstNode?: DirectiveNode;
}> {
  const { ast } = await parse(input);
  
  let firstNode: DirectiveNode | undefined = undefined;
  if (ast.length > 0 && ast[0].type === 'Directive') {
    firstNode = ast[0] as DirectiveNode;
  }
  
  return { ast, firstNode };
}

/**
 * Type for custom comparer functions
 */
type CompareFunc = (oldValue: any, newValue: any) => boolean;

/**
 * Options for AST comparison
 */
interface CompareOptions {
  /**
   * Properties to ignore during comparison
   */
  ignoreProps?: string[];
  
  /**
   * Custom property comparers
   */
  customComparers?: Record<string, CompareFunc>;
  
  /**
   * Whether to ignore differences in node IDs
   */
  ignoreNodeIds?: boolean;
  
  /**
   * Whether to ignore differences in source locations
   */
  ignoreLocations?: boolean;
}

/**
 * Compare two AST snapshots and return differences
 * Used when refactoring to ensure behavior doesn't change
 */
export function compareASTSnapshots(
  oldSnapshot: { ast: MeldNode[]; firstNode?: DirectiveNode },
  newSnapshot: { ast: MeldNode[]; firstNode?: DirectiveNode },
  options: CompareOptions = {}
): {
  differences: string[];
  match: boolean;
} {
  const differences: string[] = [];
  
  // Compare node counts
  if (oldSnapshot.ast.length !== newSnapshot.ast.length) {
    differences.push(`AST node count mismatch: ${oldSnapshot.ast.length} vs ${newSnapshot.ast.length}`);
  }
  
  // Compare directive nodes
  if (oldSnapshot.firstNode && newSnapshot.firstNode) {
    // For now, we just do a basic comparison
    if (oldSnapshot.firstNode.type !== newSnapshot.firstNode.type) {
      differences.push(`First node type mismatch: ${oldSnapshot.firstNode.type} vs ${newSnapshot.firstNode.type}`);
    }
    
    // Handle old "directive" structure to new "kind/values" structure during transition
    const oldKind = oldSnapshot.firstNode.directive?.kind ?? oldSnapshot.firstNode.kind;
    const newKind = newSnapshot.firstNode.kind;
    
    if (oldKind !== newKind) {
      differences.push(`Directive kind mismatch: ${oldKind} vs ${newKind}`);
    }
  }
  
  return {
    differences,
    match: differences.length === 0
  };
}