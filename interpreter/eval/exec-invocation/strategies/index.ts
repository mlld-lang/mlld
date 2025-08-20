export { ExecutionStrategy, BaseExecutionStrategy } from './base';
export { TemplateExecutionStrategy } from './template';
export { CommandExecutionStrategy } from './command';
export { CodeExecutionStrategy } from './code';
export { WhenExecutionStrategy } from './when';
export { ForExecutionStrategy } from './for';
export { TransformerExecutionStrategy } from './transformer';
export { SectionExecutionStrategy } from './section';
export { ResolverExecutionStrategy } from './resolver';

import { TemplateExecutionStrategy } from './template';
import { CommandExecutionStrategy } from './command';
import { CodeExecutionStrategy } from './code';
import { WhenExecutionStrategy } from './when';
import { ForExecutionStrategy } from './for';
import { TransformerExecutionStrategy } from './transformer';
import { SectionExecutionStrategy } from './section';
import { ResolverExecutionStrategy } from './resolver';

/**
 * Create execution strategies in priority order
 * GOTCHA: First matching strategy wins
 *         WhenExecutionStrategy must precede CodeExecutionStrategy
 *         TemplateExecutionStrategy is catch-all (goes last)
 */
export function createStandardStrategies(): ExecutionStrategy[] {
  return [
    // Special mlld constructs first
    new WhenExecutionStrategy(),
    new ForExecutionStrategy(),
    
    // Built-in transformers
    new TransformerExecutionStrategy(),
    
    // Code execution
    new CodeExecutionStrategy(),
    
    // Command execution
    new CommandExecutionStrategy(),
    
    // Section extraction
    new SectionExecutionStrategy(),
    
    // Module resolution
    new ResolverExecutionStrategy(),
    
    // Template execution (catch-all for simple templates)
    new TemplateExecutionStrategy()
  ];
}