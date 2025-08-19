import type { ExecInvocation, CommandReference } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { Variable } from '@core/types/variable';
import { MlldInterpreterError } from '@core/errors';
import { isExecutableVariable } from '@core/types/variable';
import { logger } from '@core/utils/logger';

/**
 * Centralized command resolution logic
 * Consolidates the 3+ instances of command name extraction identified in the audit
 */
export class CommandResolver {
  /**
   * Extract command name and arguments from an ExecInvocation node
   * Handles multiple AST formats and legacy patterns
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
   * Resolve a command to its Variable definition
   * Handles regular lookup and field access patterns
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
   * Resolve field access on an object
   * Handles deep navigation like @user.profile.settings.theme()
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
   * Convert __executable objects from imports to proper Variables
   * Handles deserialization of shadow environments
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