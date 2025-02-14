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
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
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
      allowedVariableTypes: {
        text: true,
        data: false,
        path: true,
        command: true
      },
      allowNested: false
    };
  }

  /**
   * Create context for @path directives
   * Only allows path variables, requires absolute paths
   */
  static forPathDirective(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: false,
        data: false,
        path: true,
        command: false
      },
      allowNested: false,
      pathValidation: {
        requireAbsolute: true,
        allowedRoots: ['HOMEPATH', 'PROJECTPATH']
      }
    };
  }

  /**
   * Create context for @data directives
   * Allows all variable types except commands
   */
  static forDataDirective(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: false
      },
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
      allowedVariableTypes: {
        text: true,
        data: false,
        path: false,
        command: false
      },
      allowNested: false
    };
  }

  /**
   * Create context for path resolution
   * Only allows path variables and requires absolute paths
   */
  static forPathResolution(filePath?: string): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: false,
        data: false,
        path: true,
        command: false
      },
      allowNested: false,
      pathValidation: {
        requireAbsolute: true,
        allowedRoots: ['HOMEPATH', 'PROJECTPATH']
      }
    };
  }
} 