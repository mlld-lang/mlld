// String operations are legitimate in this file for security escaping
// This file implements security-critical escaping strategies for different execution
// contexts (shell, URL, etc.). String manipulation here prevents injection attacks
// by properly escaping special characters based on the target context.

/**
 * Interpolation Context System
 * 
 * This module defines how values should be escaped/formatted based on
 * where they're being used. This ensures that:
 * - Shell commands get proper shell escaping
 * - URLs get URL encoding
 * - Templates remain literal
 * - Data values are formatted appropriately
 */

export enum InterpolationContext {
  /** Default context - no special escaping */
  Default = 'default',
  
  /** Shell command context - requires shell escaping */
  ShellCommand = 'shell-command',
  
  /** Shell code block context - different escaping rules */
  ShellCode = 'shell-code',
  
  /** URL context - requires URL encoding */
  Url = 'url',
  
  /** Template content - values remain literal */
  Template = 'template',
  
  /** Data value context - JSON-like formatting */
  DataValue = 'data-value',
  
  /** File path context - path normalization */
  FilePath = 'file-path'
}

/**
 * Escaping strategy interface
 */
export interface EscapingStrategy {
  /**
   * Escape a value for safe use in this context
   */
  escape(value: string): string;
  
  /**
   * Get the context type
   */
  getContext(): InterpolationContext;
}

/**
 * Factory for creating escaping strategies
 */
export class EscapingStrategyFactory {
  private static strategies = new Map<InterpolationContext, EscapingStrategy>();
  
  static register(context: InterpolationContext, strategy: EscapingStrategy): void {
    this.strategies.set(context, strategy);
  }
  
  static getStrategy(context: InterpolationContext): EscapingStrategy {
    const strategy = this.strategies.get(context);
    if (!strategy) {
      // Fallback to default
      return this.strategies.get(InterpolationContext.Default)!;
    }
    return strategy;
  }
}

/**
 * Default escaping - no transformation
 */
class DefaultEscapingStrategy implements EscapingStrategy {
  escape(value: string): string {
    return value;
  }
  
  getContext(): InterpolationContext {
    return InterpolationContext.Default;
  }
}

/**
 * Shell command escaping strategy
 * Properly escapes values for use in shell commands
 */
class ShellCommandEscapingStrategy implements EscapingStrategy {
  escape(value: string): string {
    if (!value) return '';
    
    // For shell commands, we need to handle the fact that the value
    // will be used within double quotes in the shell command.
    // The strategy is to escape characters that have special meaning 
    // in double-quoted strings: \ $ ` "
    // This preserves literal values when interpolating mlld variables
    
    return value
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/"/g, '\\"')    // Escape double quotes
      .replace(/\$/g, '\\$')   // Escape dollar signs to preserve literal values
      .replace(/`/g, '\\`');   // Escape backticks
  }
  
  getContext(): InterpolationContext {
    return InterpolationContext.ShellCommand;
  }
}

/**
 * Shell code escaping - preserves exact formatting for code blocks
 */
/**
 * Template escaping - values remain completely literal
 */
class TemplateEscapingStrategy implements EscapingStrategy {
  escape(value: string): string {
    // Templates should never modify the value
    return value;
  }
  
  getContext(): InterpolationContext {
    return InterpolationContext.Template;
  }
}

/**
 * Data value escaping - for use in data contexts
 */
class DataValueEscapingStrategy implements EscapingStrategy {
  escape(value: string): string {
    // For data values, we might want to ensure proper JSON escaping
    // but for now, keep it literal
    return value;
  }
  
  getContext(): InterpolationContext {
    return InterpolationContext.DataValue;
  }
}

/**
 * Initialize default strategies
 */
EscapingStrategyFactory.register(InterpolationContext.Default, new DefaultEscapingStrategy());
EscapingStrategyFactory.register(InterpolationContext.ShellCommand, new ShellCommandEscapingStrategy());
// Revert: do not register ShellCode strategy
EscapingStrategyFactory.register(InterpolationContext.Template, new TemplateEscapingStrategy());
EscapingStrategyFactory.register(InterpolationContext.DataValue, new DataValueEscapingStrategy());

/**
 * Helper to determine the appropriate context based on the directive type and subtype
 */
export function getInterpolationContext(directiveType?: string, subtype?: string): InterpolationContext {
  if (!directiveType) return InterpolationContext.Default;
  
  switch (directiveType) {
    case 'run':
      if (subtype === 'runCommand' || subtype === 'runExec' || subtype === 'runCode') {
        return InterpolationContext.ShellCommand;
      }
      break;
      
    case 'exec':
      return InterpolationContext.ShellCommand;
      
    case 'text':
      return InterpolationContext.Template;
      
    case 'data':
      return InterpolationContext.DataValue;
      
    case 'path':
      return InterpolationContext.FilePath;
      
    case 'add':
      // Add directives output literal content
      return InterpolationContext.Template;
  }
  
  return InterpolationContext.Default;
}
