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
    return {
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
      // formattingContext: undefined, // No default formatting context
      // parserFlags: undefined, // No default parser flags

      // Implement context modification methods from the spec
      withIncreasedDepth() { 
        return { ...this, depth: this.depth + 1 }; 
      },
      withStrictMode(strict: boolean) { 
        return { ...this, strict }; 
      },
      withAllowedTypes(types: VariableType[]) { 
        return { ...this, allowedVariableTypes: types }; 
      },
      withFlags(flags: Partial<ResolutionFlags>) { 
        return { ...this, flags: { ...this.flags, ...flags } }; 
      },
      withFormattingContext(formatting: any) { // Use specific type later
        return { ...this, formattingContext: { ...(this.formattingContext || {}), ...formatting } }; 
      },
      withPathContext(pathContext: Partial<PathResolutionContext>) { 
        return { ...this, pathContext: { ...(this.pathContext || this.createDefaultPathContext(PathPurpose.READ)), ...pathContext } }; 
      },
      withParserFlags(flags: any) { // Use specific type later
        return { ...this, parserFlags: { ...(this.parserFlags || {}), ...flags } }; 
      }
    };
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