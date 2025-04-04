import {
  ResolutionContext, 
  ResolutionFlags, 
  PathResolutionContext, 
  PathPurpose, 
  VariableType 
} from '@core/types'; // CORRECTED PATH
import type { IStateService } from '@services/state/IStateService'; // Use the actual IStateService type

/**
 * Factory for creating resolution contexts appropriate for different directives
 */
export class ResolutionContextFactory {

  // Helper to create a default PathResolutionContext
  private static createDefaultPathContext(purpose: PathPurpose, baseDir?: string): PathResolutionContext {
    return {
      baseDir: baseDir || '.', // Default to current directory if not provided
      allowTraversal: false,    // Default to secure settings
      purpose: purpose,
      // constraints: undefined // No default constraints initially
    };
  }
  
  // Helper to create default ResolutionFlags
  private static createDefaultFlags(): ResolutionFlags {
     return {
        isVariableEmbed: false,
        isTransformation: false,
        allowRawContentResolution: false,
        isDirectiveHandler: false, // Default to false, set true specifically if needed
        isImportContext: false,
        processNestedVariables: true // Default to true
     };
  }

  /**
   * Create a generic resolution context.
   * Allows all variable types and nested interpolation by default.
   * Assumes a generic read purpose for paths if not specified.
   */
  static create(state: IStateService, filePath?: string): ResolutionContext {
    const baseContext = {
      state,
      strict: false, // Default strictness
      depth: 0,      // Initial depth
      allowedVariableTypes: [
        VariableType.TEXT,
        VariableType.DATA,
        VariableType.PATH,
        VariableType.COMMAND
      ],
      flags: this.createDefaultFlags(),
      pathContext: this.createDefaultPathContext(PathPurpose.READ, filePath), // Generic read purpose
      currentFilePath: filePath, // Store the initial file path
    };

    // Add helper methods dynamically
    return {
      ...baseContext,
      withIncreasedDepth: () => ({ 
        ...baseContext, 
        depth: baseContext.depth + 1, 
        // Re-attach methods to the new object
        withIncreasedDepth: (baseContext as any).withIncreasedDepth,
        withStrictMode: (baseContext as any).withStrictMode,
        withAllowedTypes: (baseContext as any).withAllowedTypes,
        withFlags: (baseContext as any).withFlags,
        withFormattingContext: (baseContext as any).withFormattingContext,
        withPathContext: (baseContext as any).withPathContext,
        withParserFlags: (baseContext as any).withParserFlags,
      }),
      withStrictMode: (strict: boolean) => ({ 
         ...(baseContext as ResolutionContext), // Cast needed initially
         strict, 
         // Re-attach methods 
         withIncreasedDepth: (baseContext as any).withIncreasedDepth,
         withStrictMode: (baseContext as any).withStrictMode,
         withAllowedTypes: (baseContext as any).withAllowedTypes,
         withFlags: (baseContext as any).withFlags,
         withFormattingContext: (baseContext as any).withFormattingContext,
         withPathContext: (baseContext as any).withPathContext,
         withParserFlags: (baseContext as any).withParserFlags,
      }),
      withAllowedTypes: (types: VariableType[]) => ({ 
         ...(baseContext as ResolutionContext), 
         allowedVariableTypes: types, 
         // Re-attach methods 
         withIncreasedDepth: (baseContext as any).withIncreasedDepth,
         withStrictMode: (baseContext as any).withStrictMode,
         withAllowedTypes: (baseContext as any).withAllowedTypes,
         withFlags: (baseContext as any).withFlags,
         withFormattingContext: (baseContext as any).withFormattingContext,
         withPathContext: (baseContext as any).withPathContext,
         withParserFlags: (baseContext as any).withParserFlags,
      }),
       withFlags: (flags: Partial<ResolutionFlags>) => ({ 
         ...(baseContext as ResolutionContext), 
         flags: { ...baseContext.flags, ...flags },
         // Re-attach methods 
         withIncreasedDepth: (baseContext as any).withIncreasedDepth,
         withStrictMode: (baseContext as any).withStrictMode,
         withAllowedTypes: (baseContext as any).withAllowedTypes,
         withFlags: (baseContext as any).withFlags,
         withFormattingContext: (baseContext as any).withFormattingContext,
         withPathContext: (baseContext as any).withPathContext,
         withParserFlags: (baseContext as any).withParserFlags,
      }),
       withFormattingContext: (formatting: any) => ({ 
         ...(baseContext as ResolutionContext), 
         formattingContext: { ...(baseContext.formattingContext || {}), ...formatting },
         // Re-attach methods 
         withIncreasedDepth: (baseContext as any).withIncreasedDepth,
         withStrictMode: (baseContext as any).withStrictMode,
         withAllowedTypes: (baseContext as any).withAllowedTypes,
         withFlags: (baseContext as any).withFlags,
         withFormattingContext: (baseContext as any).withFormattingContext,
         withPathContext: (baseContext as any).withPathContext,
         withParserFlags: (baseContext as any).withParserFlags,
       }),
       withPathContext: (pathContext: Partial<PathResolutionContext>) => ({ 
         ...(baseContext as ResolutionContext), 
         pathContext: { ...(baseContext.pathContext || this.createDefaultPathContext(PathPurpose.READ)), ...pathContext },
         // Re-attach methods 
         withIncreasedDepth: (baseContext as any).withIncreasedDepth,
         withStrictMode: (baseContext as any).withStrictMode,
         withAllowedTypes: (baseContext as any).withAllowedTypes,
         withFlags: (baseContext as any).withFlags,
         withFormattingContext: (baseContext as any).withFormattingContext,
         withPathContext: (baseContext as any).withPathContext,
         withParserFlags: (baseContext as any).withParserFlags,
       }),
       withParserFlags: (flags: any) => ({ 
         ...(baseContext as ResolutionContext), 
         parserFlags: { ...(baseContext.parserFlags || {}), ...flags },
          // Re-attach methods 
         withIncreasedDepth: (baseContext as any).withIncreasedDepth,
         withStrictMode: (baseContext as any).withStrictMode,
         withAllowedTypes: (baseContext as any).withAllowedTypes,
         withFlags: (baseContext as any).withFlags,
         withFormattingContext: (baseContext as any).withFormattingContext,
         withPathContext: (baseContext as any).withPathContext,
         withParserFlags: (baseContext as any).withParserFlags,
       }),
    } as ResolutionContext; // Assert final type
  }

  /**
   * Create context for @text directives
   * Allows all variable types and nested interpolation.
   */
  static forTextDirective(state: IStateService, filePath?: string): ResolutionContext {
    const baseContext = this.create(state, filePath);
    return {
      ...baseContext,
      // Text directives are generally flexible
      allowedVariableTypes: [
        VariableType.TEXT,
        VariableType.DATA,
        VariableType.PATH,
        VariableType.COMMAND
      ],
      flags: { ...baseContext.flags, isDirectiveHandler: true, processNestedVariables: true },
      pathContext: this.createDefaultPathContext(PathPurpose.READ, filePath) // Assuming paths used here are for reading
    };
  }

  /**
   * Create context for @run directives
   * Allows text, path, command variables. Disallows data variables. No nested variables.
   */
  static forRunDirective(state: IStateService, filePath?: string): ResolutionContext {
    const baseContext = this.create(state, filePath);
    return {
      ...baseContext,
      allowedVariableTypes: [
        VariableType.TEXT, 
        // VariableType.DATA, // Data vars typically not used directly in command strings
        VariableType.PATH, 
        VariableType.COMMAND
      ],
      flags: { ...baseContext.flags, isDirectiveHandler: true, processNestedVariables: false },
      pathContext: this.createDefaultPathContext(PathPurpose.EXECUTE, filePath) // Paths might be for execution
    };
  }

  /**
   * Create context for @path directives
   * Only allows path variables. No nested variables. Paths are for read/reference.
   */
  static forPathDirective(state: IStateService, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return {
       ...baseContext,
       allowedVariableTypes: [VariableType.PATH], // Only path variables allowed for RHS
       flags: { ...baseContext.flags, isDirectiveHandler: true, processNestedVariables: false },
       pathContext: this.createDefaultPathContext(PathPurpose.READ, filePath), // Defining a path is like reading/referencing
       // pathContext.constraints could potentially be added here if paths need to exist
     };
  }

  /**
   * Create context for @data directives
   * Allows all variable types for flexible data definition.
   */
  static forDataDirective(state: IStateService, filePath?: string): ResolutionContext {
    const baseContext = this.create(state, filePath);
    return {
      ...baseContext,
      allowedVariableTypes: [
        VariableType.TEXT,
        VariableType.DATA,
        VariableType.PATH,
        VariableType.COMMAND
      ],
      flags: { ...baseContext.flags, isDirectiveHandler: true, processNestedVariables: true },
      // Paths used in data def might be for reading content
      pathContext: this.createDefaultPathContext(PathPurpose.READ, filePath) 
    };
  }

  /**
   * Create context for @import directives
   * Only allows path variables for security. No nested variables.
   */
  static forImportDirective(state: IStateService, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return {
       ...baseContext,
       allowedVariableTypes: [VariableType.PATH], // Only path vars allowed in import path itself
       flags: { 
         ...baseContext.flags, 
         isDirectiveHandler: true, 
         processNestedVariables: false,
         isImportContext: true 
       },
       pathContext: this.createDefaultPathContext(PathPurpose.IMPORT, filePath),
       // Consider adding constraints: allowedRoots based on project structure?
     };
  }

  /**
   * Create context for resolving command parameters.
   * Typically allows only simple text/data resolution.
   */
  static forCommandParameters(state: IStateService, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return {
       ...baseContext,
       // Parameters are usually simple values
       allowedVariableTypes: [VariableType.TEXT, VariableType.DATA], 
       flags: { ...baseContext.flags, processNestedVariables: false }, // No deep nesting in params typically
       pathContext: this.createDefaultPathContext(PathPurpose.READ, filePath) // Minimal path context
     };
  }

  /**
   * Create context specifically for resolving a path string.
   * Only allows path variables. No nesting.
   */
  static forPathResolution(state: IStateService, purpose: PathPurpose, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return {
       ...baseContext,
       allowedVariableTypes: [VariableType.PATH, VariableType.TEXT], // Allow text vars within paths ($project/{{sub}}/file)
       flags: { ...baseContext.flags, processNestedVariables: false },
       pathContext: this.createDefaultPathContext(purpose, filePath)
     };
  }
} 