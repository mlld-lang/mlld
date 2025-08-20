import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { ExecVisitor, ExecutableNode } from '../visitor';

/**
 * Base class for executable nodes
 * Provides common functionality for all visitable nodes
 */
abstract class BaseExecutableNode implements ExecutableNode {
  constructor(protected readonly definition: ExecutableDefinition) {}
  
  abstract accept(visitor: ExecVisitor, env: Environment): Promise<EvalResult>;
  
  getDefinition(): ExecutableDefinition {
    return this.definition;
  }
}

/**
 * Template executable node - String interpolation
 */
export class TemplateExecutableNode extends BaseExecutableNode {
  accept(visitor: ExecVisitor, env: Environment): Promise<EvalResult> {
    return visitor.visitTemplate(this.definition, env);
  }
}

/**
 * Code executable node - JS/Python/Bash execution
 */
export class CodeExecutableNode extends BaseExecutableNode {
  accept(visitor: ExecVisitor, env: Environment): Promise<EvalResult> {
    return visitor.visitCode(this.definition, env);
  }
}

/**
 * Command executable node - Shell command execution
 */
export class CommandExecutableNode extends BaseExecutableNode {
  accept(visitor: ExecVisitor, env: Environment): Promise<EvalResult> {
    return visitor.visitCommand(this.definition, env);
  }
}

/**
 * CommandRef executable node - Recursive exec invocation
 * THE KEY NODE: Enables natural recursion through visitor pattern
 */
export class CommandRefExecutableNode extends BaseExecutableNode {
  accept(visitor: ExecVisitor, env: Environment): Promise<EvalResult> {
    return visitor.visitCommandRef(this.definition, env);
  }
}

/**
 * When executable node - Conditional control flow
 */
export class WhenExecutableNode extends BaseExecutableNode {
  accept(visitor: ExecVisitor, env: Environment): Promise<EvalResult> {
    return visitor.visitWhen(this.definition, env);
  }
}

/**
 * For executable node - Iteration with shadow environments
 */
export class ForExecutableNode extends BaseExecutableNode {
  accept(visitor: ExecVisitor, env: Environment): Promise<EvalResult> {
    return visitor.visitFor(this.definition, env);
  }
}

/**
 * Transformer executable node - Built-in pure functions
 */
export class TransformerExecutableNode extends BaseExecutableNode {
  accept(visitor: ExecVisitor, env: Environment): Promise<EvalResult> {
    return visitor.visitTransformer(this.definition, env);
  }
}

/**
 * Section executable node - File section extraction
 */
export class SectionExecutableNode extends BaseExecutableNode {
  accept(visitor: ExecVisitor, env: Environment): Promise<EvalResult> {
    return visitor.visitSection(this.definition, env);
  }
}

/**
 * Resolver executable node - Module resolution
 */
export class ResolverExecutableNode extends BaseExecutableNode {
  accept(visitor: ExecVisitor, env: Environment): Promise<EvalResult> {
    return visitor.visitResolver(this.definition, env);
  }
}

/**
 * Factory function to create executable nodes from definitions
 * Maps ExecutableDefinition types to their corresponding node wrappers
 */
export function createExecutableNode(definition: ExecutableDefinition): ExecutableNode {
  const type = definition.type;
  
  // Check for special mlld-when and mlld-for types
  if (type === 'code' && definition.language === 'mlld-when') {
    return new WhenExecutableNode(definition);
  }
  
  if (type === 'code' && definition.language === 'mlld-for') {
    return new ForExecutableNode(definition);
  }
  
  // Check for transformer type
  if ((definition as any).isBuiltinTransformer) {
    return new TransformerExecutableNode(definition);
  }
  
  // Map standard types
  switch (type) {
    case 'template':
      return new TemplateExecutableNode(definition);
    
    case 'code':
      return new CodeExecutableNode(definition);
    
    case 'command':
      return new CommandExecutableNode(definition);
    
    case 'commandRef':
      return new CommandRefExecutableNode(definition);
    
    case 'section':
      return new SectionExecutableNode(definition);
    
    case 'resolver':
      return new ResolverExecutableNode(definition);
    
    default:
      // Check for when/for expressions stored directly
      if ((definition as any).whenExpression) {
        return new WhenExecutableNode(definition);
      }
      if ((definition as any).forExpression) {
        return new ForExecutableNode(definition);
      }
      
      throw new Error(`Unknown executable type: ${type}`);
  }
}