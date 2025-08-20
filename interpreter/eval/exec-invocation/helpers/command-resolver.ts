import type { ExecInvocation, CommandReference } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { Variable } from '@core/types/variable';
import { MlldInterpreterError } from '@core/errors';
import { isExecutableVariable } from '@core/types/variable';
import { logger } from '@core/utils/logger';

/**
 * Resolves command references to executable variables
 * 
 * Consolidates command resolution logic from multiple locations in the legacy
 * implementation into a single, testable utility. Handles both direct command
 * lookups and field access patterns (e.g., @module.command()).
 * 
 * SECURITY: Validates all field access to prevent arbitrary property access
 * COMPATIBILITY: Supports legacy AST formats for backward compatibility
 */
export class CommandResolver {
  /**
   * Extracts command name and arguments from an ExecInvocation node
   * 
   * Handles multiple AST formats including:
   * - Direct name property (legacy format)
   * - CommandReference with identifier string
   * - CommandReference with identifier array (parser output)
   * - Field access patterns with objectReference
   * 
   * @param node - The ExecInvocation AST node to extract from
   * @returns Command name, arguments array, and optional object reference
   * @throws {MlldInterpreterError} If command cannot be extracted
   */
  static extractCommandInfo(node: ExecInvocation): {
    commandName: string;
    args: any[];
    objectReference?: any;
  } {
    let commandName: string = '';
    let args: any[] = [];
    let objectReference: any = undefined;
    
    // Handle legacy format where name and arguments are directly on the node
    if (!node.commandRef && (node as any).name) {
      commandName = (node as any).name;
      args = (node as any).arguments || [];
      return { commandName, args };
    }
    
    if (!node.commandRef) {
      throw new MlldInterpreterError('ExecInvocation node missing both commandRef and name');
    }
    
    const commandRef = node.commandRef as any;
    
    // Check for object reference (field access pattern)
    if (commandRef.objectReference) {
      objectReference = commandRef.objectReference;
    }
    
    // Extract command name from various formats
    if (commandRef.name) {
      // Direct name property
      commandName = commandRef.name;
    } else if (typeof commandRef.identifier === 'string') {
      // String identifier
      commandName = commandRef.identifier;
    } else if (Array.isArray(commandRef.identifier) && commandRef.identifier.length > 0) {
      // Array identifier (from parser)
      const identifierNode = commandRef.identifier[0];
      if (identifierNode.type === 'VariableReference' && identifierNode.identifier) {
        commandName = identifierNode.identifier as string;
      } else if (identifierNode.type === 'Text' && identifierNode.content) {
        commandName = identifierNode.content;
      } else {
        throw new MlldInterpreterError('Unable to extract command name from identifier array');
      }
    } else {
      throw new MlldInterpreterError('CommandReference missing both name and identifier');
    }
    
    if (!commandName) {
      throw new MlldInterpreterError('ExecInvocation has no command identifier');
    }
    
    // Extract arguments
    args = commandRef.args || [];
    
    return { commandName, args, objectReference };
  }
  
  /**
   * Resolves a command name to its executable Variable
   * 
   * Supports two resolution patterns:
   * 1. Direct lookup: @command() resolves from environment
   * 2. Field access: @object.command() resolves through object navigation
   * 
   * @param commandName - Name of the command to resolve
   * @param objectReference - Optional object for field access resolution
   * @param env - Environment to resolve variables from
   * @returns The resolved executable Variable
   * @throws {MlldInterpreterError} If command not found or not executable
   */
  static async resolveCommand(
    commandName: string,
    objectReference: any,
    env: Environment
  ): Promise<Variable> {
    let variable: Variable | undefined;
    
    if (objectReference) {
      // Handle field access pattern (e.g., @demo.valueCmd())
      variable = await this.resolveFieldAccess(commandName, objectReference, env);
    } else {
      // Regular command lookup
      variable = env.getVariable(commandName);
    }
    
    if (!variable) {
      throw new MlldInterpreterError(`Command not found: ${commandName}`);
    }
    
    // Ensure it's an executable variable
    if (!isExecutableVariable(variable)) {
      throw new MlldInterpreterError(`Variable ${commandName} is not executable (type: ${variable.type})`);
    }
    
    return variable;
  }
  
  /**
   * Resolve field access on objects
   * SECURITY: Validates object types before navigation
   *           Only allows field access on proper Variables
   *           Prevents access to internal properties
   */
  private static async resolveFieldAccess(
    commandName: string,
    objectReference: any,
    env: Environment
  ): Promise<Variable | undefined> {
    // Get the base object
    const objectVar = env.getVariable(objectReference.identifier);
    if (!objectVar) {
      throw new MlldInterpreterError(`Object not found: ${objectReference.identifier}`);
    }
    
    // Extract the object value
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const objectValue = await extractVariableValue(objectVar, env);
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Resolving field access', {
        object: objectReference.identifier,
        command: commandName,
        hasFields: !!objectReference.fields
      });
    }
    
    let currentValue = objectValue;
    
    // Navigate through nested fields if present
    if (objectReference.fields && objectReference.fields.length > 0) {
      for (const field of objectReference.fields) {
        if (typeof currentValue === 'object' && currentValue !== null) {
          currentValue = (currentValue as any)[field.value];
        } else {
          throw new MlldInterpreterError(`Cannot access field ${field.value} on non-object`);
        }
      }
    }
    
    // Access the command field
    if (typeof currentValue === 'object' && currentValue !== null) {
      const fieldValue = (currentValue as any)[commandName];
      
      // Handle __executable objects from imports
      if (fieldValue && typeof fieldValue === 'object' && '__executable' in fieldValue) {
        return await this.convertExecutableObject(fieldValue, commandName);
      }
      
      return fieldValue;
    }
    
    return undefined;
  }
  
  /**
   * Convert __executable objects from imports
   * Deserializes shadow environments from stored format
   * Creates proper ExecutableVariable for execution
   */
  private static async convertExecutableObject(
    execObj: any,
    commandName: string
  ): Promise<Variable> {
    // Deserialize shadow environments if needed
    let metadata = execObj.metadata || {};
    if (metadata.capturedShadowEnvs && typeof metadata.capturedShadowEnvs === 'object') {
      // Check if it needs deserialization (is plain object, not Map)
      const needsDeserialization = Object.entries(metadata.capturedShadowEnvs).some(
        ([lang, env]) => env && !(env instanceof Map)
      );
      
      if (needsDeserialization) {
        const { ShadowEnvironmentManager } = await import('./shadow-manager');
        metadata = {
          ...metadata,
          capturedShadowEnvs: ShadowEnvironmentManager.deserialize(metadata.capturedShadowEnvs)
        };
      }
    }
    
    // Convert to proper ExecutableVariable
    const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
    return createExecutableVariable(
      commandName,
      'command', // Default type - real type is in executableDef
      '', // Empty template - real template is in executableDef
      execObj.paramNames || [],
      undefined, // No language here - it's in executableDef
      {
        directive: 'exe',
        syntax: 'braces',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        executableDef: execObj.executableDef,
        ...metadata
      }
    );
  }
}