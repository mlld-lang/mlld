import { ResolutionContext } from './IResolutionService';

/**
 * Factory for creating resolution contexts appropriate for different directives
 */
export class ResolutionContextFactory {
  /**
   * Create context for @text directives
   * Allows all variable types and nested interpolation
   */
  static forTextDirective(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowPathVars: true,
      allowCommands: true,
      allowDataFields: true,
      allowNested: true
    };
  }

  /**
   * Create context for @run directives
   * Allows path and text variables, but no data fields
   */
  static forRunDirective(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowPathVars: true,
      allowCommands: true,
      allowDataFields: false,
      allowNested: false
    };
  }

  /**
   * Create context for @path directives
   * Only allows path variables, no commands or data fields
   */
  static forPathDirective(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowPathVars: true,
      allowCommands: false,
      allowDataFields: false,
      allowNested: false
    };
  }

  /**
   * Create context for @data directives
   * Allows all variable types except commands
   */
  static forDataDirective(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowPathVars: true,
      allowCommands: false,
      allowDataFields: true,
      allowNested: true
    };
  }

  /**
   * Create context for command parameters
   * Only allows text variables
   */
  static forCommandParameters(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowPathVars: false,
      allowCommands: false,
      allowDataFields: false,
      allowNested: false
    };
  }
} 