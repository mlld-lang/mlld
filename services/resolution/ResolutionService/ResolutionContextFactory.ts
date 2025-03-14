import { ResolutionContext } from './IResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';

/**
 * Factory for creating resolution contexts appropriate for different directives
 */
export class ResolutionContextFactory {
  // Special path variables as defined by meld-ast
  private static readonly SPECIAL_PATH_VARS = ['HOMEPATH', 'PROJECTPATH'];

  /**
   * Create a generic resolution context
   * Allows all variable types and nested interpolation by default
   */
  static create(filePath?: string, state?: IStateService): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      allowNested: true,
      ...(state && { state })
    };
  }

  /**
   * Create context for @text directives
   * Allows all variable types and nested interpolation
   */
  static forTextDirective(filePath?: string, state?: IStateService): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      allowNested: true,
      ...(state && { state })
    };
  }

  /**
   * Create context for @run directives
   * Allows path and text variables, but no data fields
   */
  static forRunDirective(filePath?: string, state?: IStateService): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: true,
        data: false,
        path: true,
        command: true
      },
      allowNested: false,
      ...(state && { state })
    };
  }

  /**
   * Create context for @path directives
   * Only allows path variables, requires absolute paths
   */
  static forPathDirective(filePath?: string, state?: IStateService): ResolutionContext {
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
        allowedRoots: ResolutionContextFactory.SPECIAL_PATH_VARS
      },
      ...(state && { state })
    };
  }

  /**
   * Create context for @data directives
   * Allows all variable types for flexible data definition
   */
  static forDataDirective(filePath?: string, state?: IStateService): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      allowNested: true,
      ...(state && { state })
    };
  }

  /**
   * Create context for @import directives
   * Only allows path variables for security
   */
  static forImportDirective(filePath?: string, state?: IStateService): ResolutionContext {
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
        allowedRoots: ResolutionContextFactory.SPECIAL_PATH_VARS
      },
      ...(state && { state })
    };
  }

  /**
   * Create context for command parameters
   * Only allows text variables
   */
  static forCommandParameters(filePath?: string, state?: IStateService): ResolutionContext {
    return {
      currentFilePath: filePath,
      allowedVariableTypes: {
        text: true,
        data: false,
        path: false,
        command: false
      },
      allowNested: false,
      ...(state && { state })
    };
  }

  /**
   * Create context for path resolution
   * Only allows path variables and requires absolute paths
   */
  static forPathResolution(filePath?: string, state?: IStateService): ResolutionContext {
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
        allowedRoots: ResolutionContextFactory.SPECIAL_PATH_VARS
      },
      ...(state && { state })
    };
  }
} 