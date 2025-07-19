import type { DirectiveNode } from '@core/types';
import type { Variable, VariableSource, VariableTypeDiscriminator, ExecutableVariable } from '@core/types/variable';
import { 
  createImportedVariable, 
  createObjectVariable,
  createArrayVariable,
  createSimpleTextVariable,
  createPathVariable,
  createExecutableVariable,
  isExecutable,
  isExecutableVariable,
  getEffectiveType,
  VariableTypeGuards
} from '@core/types/variable';
import type { Environment } from '../../env/Environment';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import { MlldImportError } from '@core/errors';

export interface ModuleProcessingResult {
  moduleObject: Record<string, any>;
  frontmatter: Record<string, any> | null;
  childEnvironment: Environment;
}

/**
 * Handles variable creation, type inference, and environment merging for imports
 */
export class VariableImporter {
  constructor(private objectResolver: ObjectReferenceResolver) {}

  /**
   * Import variables from a processing result into the target environment
   */
  async importVariables(
    processingResult: ModuleProcessingResult,
    directive: DirectiveNode,
    targetEnv: Environment
  ): Promise<void> {
    const { moduleObject } = processingResult;
    
    // Handle variable merging based on import type
    await this.handleImportType(directive, moduleObject, targetEnv, processingResult.childEnvironment);
  }

  /**
   * Process module exports - either use explicit @data module or auto-generate
   */
  processModuleExports(
    childVars: Map<string, Variable>,
    parseResult: any
  ): { moduleObject: Record<string, any>, frontmatter: Record<string, any> | null } {
    // Extract frontmatter if present
    const frontmatter = parseResult.frontmatter || null;
    
    // Always start with auto-export of all top-level variables
    const moduleObject: Record<string, any> = {};
    
    // Export all top-level variables directly (except system variables)
    if (process.env.MLLD_DEBUG === 'true') {
      console.log(`[processModuleExports] childVars size: ${childVars.size}`);
      console.log(`[processModuleExports] childVars keys: ${Array.from(childVars.keys()).join(', ')}`);
    }
    
    for (const [name, variable] of childVars) {
      // Only export legitimate mlld variables - this automatically excludes
      // system variables like frontmatter (@fm) that don't have valid mlld types
      if (!this.isLegitimateVariableForExport(variable)) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.log(`[processModuleExports] Skipping non-legitimate variable '${name}' with type: ${variable.type}`);
        }
        continue;
      }
      if (process.env.DEBUG_MODULE_EXPORT || process.env.MLLD_DEBUG === 'true') {
        console.error(`[DEBUG] Exporting variable '${name}' of type '${variable.type}'`);
      }
      // For executable variables, we need to preserve the full structure
      if (variable.type === 'executable') {
        const execVar = variable as ExecutableVariable;
        // Export executable with all necessary metadata
        moduleObject[name] = {
          __executable: true,
          value: execVar.value,
          // paramNames removed - they're already in executableDef and shouldn't be exposed as imports
          executableDef: execVar.metadata?.executableDef,
          metadata: execVar.metadata
        };
      } else if (variable.type === 'object' && typeof variable.value === 'object' && variable.value !== null) {
        // For objects, resolve any variable references within the object
        moduleObject[name] = this.objectResolver.resolveObjectReferences(variable.value, childVars);
      } else {
        // For other variables, export the value directly
        moduleObject[name] = variable.value;
      }
    }
    
    return {
      moduleObject,
      frontmatter
    };
  }

  /**
   * Create a variable from an imported value, inferring the type
   */
  createVariableFromValue(
    name: string,
    value: any,
    importPath: string,
    originalName?: string
  ): Variable {
    const source: VariableSource = {
      directive: 'var',
      syntax: Array.isArray(value) ? 'array' : 
              (value && typeof value === 'object') ? 'object' : 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };
    
    const metadata = {
      isImported: true,
      importPath,
      originalName: originalName !== name ? originalName : undefined,
      definedAt: { line: 0, column: 0, filePath: importPath }
    };
    
    // Check if this is an executable export
    if (value && typeof value === 'object' && '__executable' in value && value.__executable) {
      return this.createExecutableFromImport(name, value, source, metadata);
    }
    
    // Infer the variable type from the value
    const originalType = this.inferVariableType(value);
    
    // Convert non-string primitives to strings
    let processedValue = value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      processedValue = String(value);
    }
    
    // For object types, create an ObjectVariable to preserve field access capability
    if (originalType === 'object') {
      // Check if the object contains complex AST nodes that need evaluation
      const isComplex = this.hasComplexContent(processedValue);
      
      return createObjectVariable(
        name,
        processedValue,
        isComplex, // Mark as complex if it contains AST nodes
        source,
        {
          ...metadata,
          isImported: true,
          importPath,
          originalName: originalName !== name ? originalName : undefined
        }
      );
    }
    
    // For non-objects, use createImportedVariable to preserve the original type info
    return createImportedVariable(
      name,
      processedValue,
      originalType,
      importPath,
      false,
      originalName || name,
      source,
      metadata
    );
  }

  /**
   * Create a namespace variable for imports with aliased wildcards (e.g., * as config)
   */
  createNamespaceVariable(
    alias: string, 
    moduleObject: Record<string, any>, 
    importPath: string
  ): Variable {
    const source: VariableSource = {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    };

    return createObjectVariable(
      alias,
      moduleObject,
      false, // namespace objects are not complex by default
      source,
      {
        isImported: true,
        importPath,
        isNamespace: true,
        definedAt: { line: 0, column: 0, filePath: importPath }
      }
    );
  }

  /**
   * Merge variables into the target environment based on import type
   */
  private async handleImportType(
    directive: DirectiveNode,
    moduleObject: Record<string, any>,
    targetEnv: Environment,
    childEnv: Environment
  ): Promise<void> {
    if (directive.subtype === 'importAll') {
      throw new MlldImportError(
        'Wildcard imports \'/import { * }\' are no longer supported. ' +
        'Use namespace imports instead: \'/import "file"\' or \'/import "file" as name\'',
        directive.location,
        {
          suggestion: 'Change \'/import { * } from "file"\' to \'/import "file"\''
        }
      );
    } else if (directive.subtype === 'importNamespace') {
      await this.handleNamespaceImport(directive, moduleObject, targetEnv, childEnv);
    } else if (directive.subtype === 'importSelected') {
      await this.handleSelectedImport(directive, moduleObject, targetEnv, childEnv);
    } else {
      throw new Error(`Unknown import subtype: ${directive.subtype}`);
    }
  }

  /**
   * Handle namespace imports
   */
  private async handleNamespaceImport(
    directive: DirectiveNode,
    moduleObject: Record<string, any>,
    targetEnv: Environment,
    childEnv: Environment
  ): Promise<void> {
    // For shorthand imports, namespace is stored as an array in values.namespace
    const namespaceNodes = directive.values?.namespace;
    const alias = (namespaceNodes && Array.isArray(namespaceNodes) && namespaceNodes[0]?.content) 
      ? namespaceNodes[0].content 
      : directive.values?.imports?.[0]?.alias;
    
    if (!alias) {
      throw new Error('Namespace import missing alias');
    }
    
    // Create namespace variable with the module object
    const namespaceVar = this.createNamespaceVariable(
      alias, 
      moduleObject, 
      childEnv.getCurrentFilePath() || 'unknown'
    );
    
    targetEnv.setVariable(alias, namespaceVar);
  }

  /**
   * Handle selected imports
   */
  private async handleSelectedImport(
    directive: DirectiveNode,
    moduleObject: Record<string, any>,
    targetEnv: Environment,
    childEnv: Environment
  ): Promise<void> {
    const imports = directive.values?.imports || [];
    const importPath = childEnv.getCurrentFilePath() || 'unknown';
    
    for (const importItem of imports) {
      const importName = importItem.identifier;
      const alias = importItem.alias || importName;
      
      if (!(importName in moduleObject)) {
        throw new Error(`Import '${importName}' not found in module`);
      }
      
      const importedValue = moduleObject[importName];
      const variable = this.createVariableFromValue(alias, importedValue, importPath, importName);
      
      if (process.env.DEBUG_MODULE_EXPORT) {
        console.error(`[DEBUG] Importing '${importName}' as '${alias}' with metadata:`, variable.metadata);
      }
      
      targetEnv.setVariable(alias, variable);
    }
  }

  /**
   * Create an executable variable from import metadata
   */
  private createExecutableFromImport(
    name: string,
    value: any,
    source: VariableSource,
    metadata: any
  ): ExecutableVariable {
    // This is an executable variable - reconstruct it properly
    const execValue = value.value;
    const executableDef = value.executableDef;
    // Get paramNames from executableDef where it's properly stored
    const paramNames = executableDef?.paramNames || [];
    
    // The executable definition contains all the needed information
    // We just need to create a dummy ExecutableVariable that preserves it
    // The actual execution will use the executableDef from metadata
    const execVariable = createExecutableVariable(
      name,
      'command', // Default type - the real type is in executableDef
      '', // Empty template - the real template is in executableDef
      paramNames,
      undefined, // No language here - it's in executableDef
      source,
      {
        ...metadata,
        ...value.metadata,
        executableDef // This is what actually matters for execution
      }
    );
    
    return execVariable;
  }

  /**
   * Check if a value contains complex AST nodes that need evaluation
   */
  private hasComplexContent(value: any): boolean {
    if (value === null || typeof value !== 'object') {
      return false;
    }
    
    // Check if this is an AST node with a type
    if (value.type) {
      return true;
    }
    
    // Check if it has __executable objects (from resolved executables)
    if (value.__executable) {
      return true;
    }
    
    // Recursively check arrays
    if (Array.isArray(value)) {
      return value.some(item => this.hasComplexContent(item));
    }
    
    // Recursively check object properties
    for (const prop of Object.values(value)) {
      if (this.hasComplexContent(prop)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Infer variable type from value
   */
  private inferVariableType(value: any): VariableTypeDiscriminator {
    if (Array.isArray(value)) {
      return 'array';
    } else if (value && typeof value === 'object') {
      return 'object';
    } else if (typeof value === 'string') {
      return 'simple-text';
    } else {
      // Numbers, booleans, etc. convert to text
      return 'simple-text';
    }
  }

  /**
   * Check if a variable is a legitimate mlld variable that can be exported/imported.
   * Uses the type system to ensure only valid mlld variables are shared between modules.
   * This automatically excludes system variables like frontmatter (@fm) that have invalid types.
   */
  private isLegitimateVariableForExport(variable: Variable): boolean {
    // Use our comprehensive type guard system to validate the variable
    // If the variable doesn't match any of our legitimate types, it's not exportable
    return VariableTypeGuards.isSimpleText(variable) ||
           VariableTypeGuards.isInterpolatedText(variable) ||
           VariableTypeGuards.isTemplate(variable) ||
           VariableTypeGuards.isFileContent(variable) ||
           VariableTypeGuards.isSectionContent(variable) ||
           VariableTypeGuards.isObject(variable) ||
           VariableTypeGuards.isArray(variable) ||
           VariableTypeGuards.isComputed(variable) ||
           VariableTypeGuards.isCommandResult(variable) ||
           VariableTypeGuards.isPath(variable) ||
           VariableTypeGuards.isImported(variable) ||
           VariableTypeGuards.isExecutable(variable) ||
           VariableTypeGuards.isPipelineInput(variable) ||
           VariableTypeGuards.isPrimitive(variable);
  }
}