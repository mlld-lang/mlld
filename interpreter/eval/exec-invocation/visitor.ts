import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';

/**
 * Visitor interface for exec-invocation evaluation
 * Each method corresponds to a different execution type in mlld
 * 
 * This enables the Visitor pattern with double dispatch:
 * 1. Nodes accept visitors
 * 2. Visitors visit specific node types
 * 3. Natural recursion for CommandRef without circular imports
 */
export interface ExecVisitor {
  // Core execution types
  visitTemplate(node: ExecutableDefinition, env: Environment): Promise<EvalResult>;
  visitCode(node: ExecutableDefinition, env: Environment): Promise<EvalResult>;
  visitCommand(node: ExecutableDefinition, env: Environment): Promise<EvalResult>;
  visitCommandRef(node: ExecutableDefinition, env: Environment): Promise<EvalResult>;
  
  // Control flow
  visitWhen(node: ExecutableDefinition, env: Environment): Promise<EvalResult>;
  visitFor(node: ExecutableDefinition, env: Environment): Promise<EvalResult>;
  
  // Special types
  visitTransformer(node: ExecutableDefinition, env: Environment): Promise<EvalResult>;
  visitSection(node: ExecutableDefinition, env: Environment): Promise<EvalResult>;
  visitResolver(node: ExecutableDefinition, env: Environment): Promise<EvalResult>;
}

/**
 * Interface for visitable executable nodes
 * Implements double dispatch pattern
 */
export interface ExecutableNode {
  /**
   * Accept a visitor for evaluation
   * @param visitor The visitor that will evaluate this node
   * @param env The environment for evaluation
   * @returns The evaluation result
   */
  accept(visitor: ExecVisitor, env: Environment): Promise<EvalResult>;
  
  /**
   * Get the underlying executable definition
   */
  getDefinition(): ExecutableDefinition;
}