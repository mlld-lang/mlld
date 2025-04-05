import {
  ResolutionContext, 
  ResolutionFlags, 
  PathResolutionContext, 
  PathPurpose, 
  VariableType, 
  FormattingContext
} from '@core/types';
import type { IStateService } from '@services/state/IStateService';

// Define the type for the context methods more explicitly
type ContextMethods = {
  withIncreasedDepth: () => ResolutionContext;
  withStrictMode: (strict: boolean) => ResolutionContext;
  withAllowedTypes: (types: VariableType[]) => ResolutionContext;
  withFlags: (flags: Partial<ResolutionFlags>) => ResolutionContext;
  withFormattingContext: (formatting: Partial<FormattingContext>) => ResolutionContext;
  withPathContext: (pathContext: Partial<PathResolutionContext>) => ResolutionContext;
  withParserFlags: (flags: any) => ResolutionContext; // Keeping any for now
};

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
    // Define the base properties without methods first
    const baseProps = {
      state,
      strict: false, 
      depth: 0,      
      allowedVariableTypes: [
        VariableType.TEXT,
        VariableType.DATA,
        VariableType.PATH,
        VariableType.COMMAND
      ],
      flags: this.createDefaultFlags(),
      pathContext: this.createDefaultPathContext(PathPurpose.READ, filePath),
      currentFilePath: filePath,
      formattingContext: { isBlock: false }, // Added default formatting context
      parserFlags: {}, // Added default parser flags
    };

    // Define the methods. These will close over the `methods` object itself.
    const methods: ContextMethods = {
      withIncreasedDepth: function() {
        // `this` refers to the current context object
        return { ...this, depth: this.depth + 1, ...methods }; 
      },
      withStrictMode: function(strict: boolean) {
        return { ...this, strict, ...methods };
      },
      withAllowedTypes: function(types: VariableType[]) {
        return { ...this, allowedVariableTypes: types, ...methods };
      },
      withFlags: function(flags: Partial<ResolutionFlags>) {
        return { ...this, flags: { ...this.flags, ...flags }, ...methods };
      },
      withFormattingContext: function(formatting: Partial<FormattingContext>) {
        return { ...this, formattingContext: { ...this.formattingContext, ...formatting }, ...methods };
      },
      withPathContext: function(pathContext: Partial<PathResolutionContext>) {
        return { 
          ...this, 
          pathContext: { 
            ...(this.pathContext || ResolutionContextFactory.createDefaultPathContext(PathPurpose.READ)), 
            ...pathContext 
          }, 
          ...methods 
        };
      },
      withParserFlags: function(flags: any) {
        return { ...this, parserFlags: { ...this.parserFlags, ...flags }, ...methods };
      },
    };

    // Combine base properties and methods
    return { ...baseProps, ...methods } as ResolutionContext;
  }

  /**
   * Create context for @text directives
   * Allows all variable types and nested interpolation.
   */
  static forTextDirective(state: IStateService, filePath?: string): ResolutionContext {
    const baseContext = this.create(state, filePath);
    // Use the 'with' methods to modify the base context
    return baseContext
      .withAllowedTypes([
        VariableType.TEXT,
        VariableType.DATA,
        VariableType.PATH,
        VariableType.COMMAND
      ])
      .withFlags({ isDirectiveHandler: true, processNestedVariables: true })
      .withPathContext({ purpose: PathPurpose.READ }); // Assuming paths used here are for reading
  }

  /**
   * Create context for @run directives
   * Allows text, path, command variables. Disallows data variables. No nested variables.
   */
  static forRunDirective(state: IStateService, filePath?: string): ResolutionContext {
    const baseContext = this.create(state, filePath);
    return baseContext
      .withAllowedTypes([
        VariableType.TEXT, 
        VariableType.PATH, 
        VariableType.COMMAND
      ])
      .withFlags({ isDirectiveHandler: true, processNestedVariables: false })
      .withPathContext({ purpose: PathPurpose.EXECUTE }); // Paths might be for execution
  }

  /**
   * Create context for @path directives
   * Only allows path variables. No nested variables. Paths are for read/reference.
   */
  static forPathDirective(state: IStateService, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return baseContext
       .withAllowedTypes([VariableType.PATH]) // Only path variables allowed for RHS
       .withFlags({ isDirectiveHandler: true, processNestedVariables: false })
       .withPathContext({ purpose: PathPurpose.READ }); // Defining a path is like reading/referencing
  }

  /**
   * Create context for @data directives
   * Allows all variable types for flexible data definition.
   */
  static forDataDirective(state: IStateService, filePath?: string): ResolutionContext {
    const baseContext = this.create(state, filePath);
    return baseContext
      .withAllowedTypes([
        VariableType.TEXT,
        VariableType.DATA,
        VariableType.PATH,
        VariableType.COMMAND
      ])
      .withFlags({ isDirectiveHandler: true, processNestedVariables: true })
      .withPathContext({ purpose: PathPurpose.READ }); // Paths used in data def might be for reading content
  }

  /**
   * Create context for @import directives
   * Only allows path variables for security. No nested variables.
   */
  static forImportDirective(state: IStateService, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return baseContext
       .withAllowedTypes([VariableType.PATH]) // Only path vars allowed in import path itself
       .withFlags({ 
         isDirectiveHandler: true, 
         processNestedVariables: false,
         isImportContext: true 
       })
       .withPathContext({ purpose: PathPurpose.IMPORT });
  }

  /**
   * Create context for resolving command parameters.
   * Typically allows only simple text/data resolution.
   */
  static forCommandParameters(state: IStateService, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return baseContext
       .withAllowedTypes([VariableType.TEXT, VariableType.DATA]) 
       .withFlags({ processNestedVariables: false }) // No deep nesting in params typically
       .withPathContext({ purpose: PathPurpose.READ }); // Minimal path context
  }

  /**
   * Create context specifically for resolving a path string.
   * Only allows path variables. No nesting.
   */
  static forPathResolution(state: IStateService, purpose: PathPurpose, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return baseContext
       .withAllowedTypes([VariableType.PATH, VariableType.TEXT]) // Allow text vars within paths ($project/{{sub}}/file)
       .withFlags({ processNestedVariables: false })
       .withPathContext({ purpose }); // Use the provided purpose
  }
} 