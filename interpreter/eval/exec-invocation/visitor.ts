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
  visitTemplate(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult>;
  visitCode(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult>;
  visitCommand(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult>;
  visitCommandRef(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult>;
  
  // Control flow
  visitWhen(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult>;
  visitFor(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult>;
  
  // Special types
  visitTransformer(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult>;
  visitSection(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult>;
  visitResolver(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult>;
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
  accept(visitor: ExecVisitor, env: Environment, context?: any): Promise<EvalResult>;
  
  /**
   * Get the underlying executable definition
   */
  getDefinition(): ExecutableDefinition;
}