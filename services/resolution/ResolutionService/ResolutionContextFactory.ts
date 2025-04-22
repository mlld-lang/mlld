import {
  ResolutionContext, 
  ResolutionFlags, 
  PathResolutionContext, 
  FormattingContext,
} from '@core/types/resolution';
import { PathPurpose } from '@core/types/paths';
import { VariableType } from '@core/types/variables';
import type { ParserFlags } from '@core/types/resolution';
import { StringLiteralType } from '@core/types/common';
import type { IStateService } from '@services/state/StateService/IStateService';
import { logger } from '@core/utils/logger.js';
import { Service } from '@core/ServiceProvider.js';

// Define the type for the context object without the methods
type ResolutionContextBase = Omit<ResolutionContext, 
  'withIncreasedDepth' | 'withStrictMode' | 'withAllowedTypes' | 'withFlags' | 'withFormattingContext' | 'withPathContext' | 'withParserFlags'
>;

/**
 * Factory for creating resolution contexts appropriate for different directives
 */
@Service()
export class ResolutionContextFactory {

  // --- Private Static Helper Methods for building new contexts --- 

  private static _withIncreasedDepth(currentContext: ResolutionContext): ResolutionContext {
    const base = currentContext as ResolutionContextBase;
    const nextContextBase: ResolutionContextBase = { ...base, depth: base.depth + 1 };
    return ResolutionContextFactory.rebuildContext(nextContextBase); 
  }
  private static _withStrictMode(currentContext: ResolutionContext, strict: boolean): ResolutionContext {
    const base = currentContext as ResolutionContextBase;
    const nextContextBase: ResolutionContextBase = { ...base, strict };
    return ResolutionContextFactory.rebuildContext(nextContextBase);
  }
  private static _withAllowedTypes(currentContext: ResolutionContext, types: VariableType[]): ResolutionContext {
    const base = currentContext as ResolutionContextBase;
    const nextContextBase: ResolutionContextBase = { ...base, allowedVariableTypes: types };
    return ResolutionContextFactory.rebuildContext(nextContextBase);
  }
  private static _withFlags(currentContext: ResolutionContext, flags: Partial<ResolutionFlags>): ResolutionContext {
    const base = currentContext as ResolutionContextBase;
    const nextContextBase: ResolutionContextBase = { ...base, flags: { ...base.flags, ...flags } };
    return ResolutionContextFactory.rebuildContext(nextContextBase);
  }
  private static _withFormattingContext(currentContext: ResolutionContext, formatting: Partial<FormattingContext>): ResolutionContext {
    const base = currentContext as ResolutionContextBase;
    // Ensure defaults merge correctly
    const currentFormatting = base.formattingContext || { isBlock: false }; // Ensure currentFormatting is not null/undefined
    const nextFormatting = { ...currentFormatting, ...formatting };
    // Ensure isBlock is explicitly boolean if needed by the type (adjust if type allows undefined)
    if (nextFormatting.isBlock === undefined) {
       nextFormatting.isBlock = false; // Or handle as per actual type definition
    }
    const nextContextBase: ResolutionContextBase = { ...base, formattingContext: nextFormatting as FormattingContext };
    return ResolutionContextFactory.rebuildContext(nextContextBase);
  }
  private static _withPathContext(currentContext: ResolutionContext, pathContext: Partial<PathResolutionContext>): ResolutionContext {
    const base = currentContext as ResolutionContextBase;
    const currentPath = base.pathContext || ResolutionContextFactory.createDefaultPathContext(PathPurpose.READ); // Use static helper
    const nextPathContext = { ...currentPath, ...pathContext };
    const nextContextBase: ResolutionContextBase = { ...base, pathContext: nextPathContext };
    return ResolutionContextFactory.rebuildContext(nextContextBase);
  }
  private static _withParserFlags(currentContext: ResolutionContext, flags: any): ResolutionContext {
    const base = currentContext as ResolutionContextBase;
    const nextContextBase: ResolutionContextBase = { ...base, parserFlags: { ...base.parserFlags, ...flags } };
    return ResolutionContextFactory.rebuildContext(nextContextBase);
  }

  // --- Public Static Helpers --- 

  // Helper to create a default PathResolutionContext
  private static createDefaultPathContext(purpose: PathPurpose, baseDir?: string): PathResolutionContext {
    return {
      baseDir: baseDir || '.',
      allowTraversal: false,
      purpose: purpose,
    };
  }
  
  // Helper to create default ResolutionFlags
  private static createDefaultFlags(): ResolutionFlags {
     return {
        isVariableEmbed: false,
        isTransformation: false,
        allowRawContentResolution: false,
        isDirectiveHandler: false,
        isImportContext: false,
        processNestedVariables: true,
        preserveUnresolved: false
     };
  }

  // Helper to create default ParserFlags
  private static createDefaultParserFlags(): ParserFlags {
      return {
          parseInRawContent: false,
          parseInCodeBlocks: true,
          resolveVariablesDuringParsing: false,
          parseLiteralTypes: [StringLiteralType.DOUBLE_QUOTED, StringLiteralType.SINGLE_QUOTED, StringLiteralType.BACKTICK]
      };
  }

  // Helper to create default FormattingContext
  private static createDefaultFormattingContext(): FormattingContext {
      return {
          isBlock: false,
          preserveLiteralFormatting: false,
          preserveWhitespace: false,
      };
  }

  /**
   * Rebuilds the full ResolutionContext object with methods from a base object.
   * This is used by the private static _withX helpers.
   */
  private static rebuildContext(base: ResolutionContextBase): ResolutionContext {
      let fullContext: ResolutionContext;
      // Define the methods as closures referencing 'fullContext'
      const methods = {
          withIncreasedDepth: () => ResolutionContextFactory._withIncreasedDepth(fullContext),
          withStrictMode: (strict: boolean) => ResolutionContextFactory._withStrictMode(fullContext, strict),
          withAllowedTypes: (types: VariableType[]) => ResolutionContextFactory._withAllowedTypes(fullContext, types),
          withFlags: (flags: Partial<ResolutionFlags>) => ResolutionContextFactory._withFlags(fullContext, flags),
          withFormattingContext: (formatting: Partial<FormattingContext>) => ResolutionContextFactory._withFormattingContext(fullContext, formatting),
          withPathContext: (pathContext: Partial<PathResolutionContext>) => ResolutionContextFactory._withPathContext(fullContext, pathContext),
          withParserFlags: (flags: any) => ResolutionContextFactory._withParserFlags(fullContext, flags),
      };
      fullContext = { ...base, ...methods };
      return fullContext;
  }

  // --- Public Static Factory Methods --- 

  /**
   * Create a generic resolution context.
   */
  static create(state: IStateService, filePath?: string): ResolutionContext {
    // +++ USE process.stdout.write +++
    try {
      const stateId = state?.getStateId ? state.getStateId() : 'UNKNOWN_OR_MISSING_STATE';
      // logger.debug(`[ResolutionContextFactory.create ENTRY]`, { stateId, filePath });
      process.stdout.write(`DEBUG: [ResolutionContextFactory.create ENTRY] StateID=${stateId}, FilePath=${filePath ?? 'N/A'}\n`);
    } catch (logError) {
      console.error('Error logging in ResolutionContextFactory.create:', logError);
    }
    // +++ END LOGGING +++
    
    const baseProps: ResolutionContextBase = {
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
      formattingContext: this.createDefaultFormattingContext(),
      parserFlags: this.createDefaultParserFlags(),
    };

    // Use the rebuild helper to construct the final object with methods
    return ResolutionContextFactory.rebuildContext(baseProps);
  }

  /**
   * Create context for @text directives
   */
  static forTextDirective(state: IStateService, filePath?: string): ResolutionContext {
    const baseContext = this.create(state, filePath); 
    // Call the methods on the created object
    return baseContext
      .withAllowedTypes([ 
        VariableType.TEXT,
        VariableType.DATA,
        VariableType.PATH,
        VariableType.COMMAND
      ])
      .withFlags({ isDirectiveHandler: true, processNestedVariables: true })
      .withPathContext({ purpose: PathPurpose.READ });
  }

  /**
   * Create context for @run directives
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
      .withPathContext({ purpose: PathPurpose.EXECUTE });
  }

  /**
   * Create context for @path directives
   */
  static forPathDirective(state: IStateService, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return baseContext
       .withAllowedTypes([VariableType.PATH])
       .withFlags({ isDirectiveHandler: true, processNestedVariables: false })
       .withPathContext({ purpose: PathPurpose.READ });
  }

  /**
   * Create context for @data directives
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
      .withPathContext({ purpose: PathPurpose.READ });
  }

  /**
   * Create context for @import directives
   */
  static forImportDirective(state: IStateService, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return baseContext
       .withAllowedTypes([VariableType.PATH])
       .withFlags({ 
         isDirectiveHandler: true, 
         processNestedVariables: false,
         isImportContext: true 
       })
       .withPathContext({ purpose: PathPurpose.IMPORT });
  }

  /**
   * Create context for resolving command parameters.
   */
  static forCommandParameters(state: IStateService, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return baseContext
       .withAllowedTypes([VariableType.TEXT, VariableType.DATA]) 
       .withFlags({ processNestedVariables: false })
       .withPathContext({ purpose: PathPurpose.READ });
  }

  /**
   * Create context specifically for resolving a path string.
   */
  static forPathResolution(state: IStateService, purpose: PathPurpose, filePath?: string): ResolutionContext {
     const baseContext = this.create(state, filePath);
     return baseContext
       .withAllowedTypes([VariableType.PATH, VariableType.TEXT])
       .withFlags({ processNestedVariables: false })
       .withPathContext({ purpose });
  }
} 