import { injectable } from 'tsyringe';
import type { IResolutionService as IOldResolutionService } from './IResolutionService';
import type { IResolutionService as INewResolutionService } from './IResolutionService.new';
import { ResolutionService as NewResolutionService } from './ResolutionService.new';
import type { 
  ResolutionContext, 
  FormattingContext,
  MeldPath,
  PathValidationContext,
  InterpolatableValue,
  MeldNode,
  VariableReferenceNode,
  JsonValue
} from '@core/types';
import { MeldError } from '@core/errors';

/**
 * Adapter to bridge the old IResolutionService interface to the new minimal one.
 * This allows gradual migration of handlers while maintaining compatibility.
 */
@injectable()
export class ResolutionServiceAdapter implements IOldResolutionService, INewResolutionService {
  private newService: NewResolutionService;

  constructor() {
    this.newService = new NewResolutionService();
  }

  initialize(deps: any): void {
    this.newService.initialize(deps);
  }

  // New interface methods (pass through to new service)
  
  async resolve(input: any): Promise<string> {
    return this.newService.resolve(input);
  }

  async resolvePath(path: string, context: any): Promise<string> {
    return this.newService.resolvePath(path, context);
  }

  extractSection(content: string, section: string): string {
    return this.newService.extractSection(content, section);
  }

  // Old interface methods mapped to new service

  async resolveText(text: string, context: ResolutionContext): Promise<string> {
    return this.newService.resolve({
      value: text,
      context: {
        state: context.state,
        basePath: context.basePath || '.',
        currentFilePath: context.currentPath || '.'
      },
      type: 'text'
    });
  }

  async resolveData(node: VariableReferenceNode, context: ResolutionContext): Promise<JsonValue> {
    // For data resolution, we need to handle this differently
    const varName = node.identifier || node.name;
    const variable = context.state.getVariable(varName);
    
    if (!variable) {
      throw new MeldError(`Variable not found: ${varName}`);
    }
    
    if (variable.type !== 'data') {
      throw new MeldError(`Variable ${varName} is not a data variable`);
    }
    
    return variable.value;
  }

  async resolvePath(pathInput: string | any, context: ResolutionContext): Promise<MeldPath> {
    const pathString = typeof pathInput === 'string' ? pathInput : pathInput.value;
    const resolved = await this.newService.resolvePath(pathString, {
      state: context.state,
      basePath: context.basePath || '.',
      currentFilePath: context.currentPath || '.'
    });
    
    return {
      original: pathString,
      resolved,
      absolute: resolved.startsWith('/'),
      relative: !resolved.startsWith('/'),
      normalized: resolved
    };
  }

  async resolveCommand(commandName: string, args: string[], context: ResolutionContext): Promise<string> {
    // Commands are handled through variable resolution in the new system
    const cmdVar = context.state.getVariable(commandName);
    if (!cmdVar || cmdVar.type !== 'command') {
      throw new MeldError(`Command not found: ${commandName}`);
    }
    
    // For now, just return the command string
    return String(cmdVar.value);
  }

  async resolveFile(path: MeldPath): Promise<string> {
    // This should be handled by FileSystemService, not ResolutionService
    throw new MeldError('resolveFile should use FileSystemService directly');
  }

  async resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    return this.resolveNodes(nodes as any, context);
  }

  async resolveNodes(nodes: InterpolatableValue, context: ResolutionContext): Promise<string> {
    return this.newService.resolve({
      value: nodes,
      context: {
        state: context.state,
        basePath: context.basePath || '.',
        currentFilePath: context.currentPath || '.'
      },
      type: 'text'
    });
  }

  async resolveInContext(value: string | InterpolatableValue, context: ResolutionContext): Promise<string> {
    return this.newService.resolve({
      value,
      context: {
        state: context.state,
        basePath: context.basePath || '.',
        currentFilePath: context.currentPath || '.'
      },
      type: 'text'
    });
  }

  async resolveFieldAccess(
    baseValue: JsonValue,
    fields: any[],
    context?: ResolutionContext
  ): Promise<JsonValue> {
    // Field access is handled internally by the new service
    let value = baseValue;
    for (const field of fields) {
      const fieldName = typeof field === 'string' ? field : field.name;
      if (value && typeof value === 'object' && fieldName in value) {
        value = (value as any)[fieldName];
      } else {
        throw new MeldError(`Field not found: ${fieldName}`);
      }
    }
    return value;
  }

  async validateResolution(pathInput: string, validationContext: PathValidationContext): Promise<MeldPath> {
    // Validation is handled by PathService, not ResolutionService
    const resolved = await this.newService.resolvePath(pathInput, {
      state: validationContext.state,
      basePath: validationContext.basePath || '.',
      currentFilePath: validationContext.currentPath || '.'
    });
    
    return {
      original: pathInput,
      resolved,
      absolute: resolved.startsWith('/'),
      relative: !resolved.startsWith('/'),
      normalized: resolved
    };
  }

  async extractSection(content: string, sectionHeading: string, fuzzyThreshold?: number): Promise<string> {
    return this.newService.extractSection(content, sectionHeading);
  }

  async detectCircularReferences(value: string, context: ResolutionContext): Promise<void> {
    // Circular detection is handled internally by the new service
    // This is a no-op for compatibility
  }

  async convertToFormattedString(value: JsonValue, context: ResolutionContext): Promise<string> {
    // Simple JSON stringification
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value, null, 2);
  }

  enableResolutionTracking(config: any): void {
    // Tracking not implemented in minimal service
  }

  getResolutionTracker(): any {
    return undefined;
  }
}