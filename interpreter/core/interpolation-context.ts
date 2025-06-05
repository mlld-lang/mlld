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
    
    // Important: We must escape backslashes first to avoid double-escaping
    let escaped = value
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/"/g, '\\"')    // Escape double quotes
      .replace(/\$/g, '\\$')   // Escape dollar signs
      .replace(/`/g, '\\`');   // Escape backticks
    
    return escaped;
  }
  
  getContext(): InterpolationContext {
    return InterpolationContext.ShellCommand;
  }
}

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
EscapingStrategyFactory.register(InterpolationContext.Template, new TemplateEscapingStrategy());
EscapingStrategyFactory.register(InterpolationContext.DataValue, new DataValueEscapingStrategy());

/**
 * Helper to determine the appropriate context based on the directive type and subtype
 */
export function getInterpolationContext(directiveType?: string, subtype?: string): InterpolationContext {
  if (!directiveType) return InterpolationContext.Default;
  
  switch (directiveType) {
    case 'run':
      if (subtype === 'runCommand' || subtype === 'runExec') {
        return InterpolationContext.ShellCommand;
      }
      if (subtype === 'runCode') {
        return InterpolationContext.ShellCode;
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