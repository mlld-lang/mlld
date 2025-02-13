import { IStateService } from '../StateService/IStateService';
import { IResolutionService, ResolutionContext, ResolutionErrorCode } from './IResolutionService';
import { ResolutionError } from './errors/ResolutionError';
import { TextResolver } from './resolvers/TextResolver';
import { DataResolver } from './resolvers/DataResolver';
import { PathResolver } from './resolvers/PathResolver';
import { CommandResolver } from './resolvers/CommandResolver';

/**
 * Service responsible for resolving variables, commands, and paths in different contexts
 */
export class ResolutionService implements IResolutionService {
  private textResolver: TextResolver;
  private dataResolver: DataResolver;
  private pathResolver: PathResolver;
  private commandResolver: CommandResolver;

  constructor(private stateService: IStateService) {
    this.textResolver = new TextResolver(stateService);
    this.dataResolver = new DataResolver(stateService);
    this.pathResolver = new PathResolver(stateService);
    this.commandResolver = new CommandResolver(stateService);
  }

  /**
   * Resolve text variables in a string
   */
  async resolveText(text: string, context: ResolutionContext): Promise<string> {
    return this.textResolver.resolve(text, context);
  }

  /**
   * Resolve data variables and fields
   */
  async resolveData(ref: string, context: ResolutionContext): Promise<any> {
    return this.dataResolver.resolve(ref, context);
  }

  /**
   * Resolve path variables
   */
  async resolvePath(path: string, context: ResolutionContext): Promise<string> {
    return this.pathResolver.resolve(path, context);
  }

  /**
   * Resolve command references
   */
  async resolveCommand(cmd: string, args: string[], context: ResolutionContext): Promise<string> {
    return this.commandResolver.resolve(cmd, args, context);
  }

  /**
   * Resolve any value based on the provided context rules
   */
  async resolveInContext(value: string, context: ResolutionContext): Promise<string> {
    // 1. Validate resolution is allowed in this context
    await this.validateResolution(value, context);

    // 2. Check for circular references
    await this.detectCircularReferences(value);

    // 3. Resolve based on content type
    let result = value;

    // Handle command references first
    if (context.allowCommands) {
      const cmdRef = this.commandResolver.parseCommandReference(result);
      if (cmdRef) {
        result = await this.resolveCommand(cmdRef.cmd, cmdRef.args, context);
      }
    }

    // Handle path variables
    if (context.allowPathVars && result.includes('$')) {
      result = await this.resolvePath(result, context);
    }

    // Handle data variables
    if (context.allowDataFields && result.includes('#{')) {
      result = await this.resolveData(result, context);
    }

    // Handle text variables
    if (result.includes('${')) {
      result = await this.resolveText(result, context);
    }

    return result;
  }

  /**
   * Validate that resolution is allowed in the given context
   */
  async validateResolution(value: string, context: ResolutionContext): Promise<void> {
    // Check for path variables
    if (!context.allowPathVars && value.includes('$')) {
      const pathRefs = this.pathResolver.extractReferences(value);
      if (pathRefs.length > 0) {
        throw new ResolutionError(
          'Path variables are not allowed in this context',
          ResolutionErrorCode.INVALID_CONTEXT,
          { value, context }
        );
      }
    }

    // Check for command references
    if (!context.allowCommands && /\$[A-Za-z_][A-Za-z0-9_]*\(/.test(value)) {
      throw new ResolutionError(
        'Command references are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value, context }
      );
    }

    // Check for data field access
    if (!context.allowDataFields && /#{[^}]+\.[^}]+}/.test(value)) {
      throw new ResolutionError(
        'Data field access is not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value, context }
      );
    }

    // Check for nested variables if not allowed
    if (!context.allowNested) {
      if (value.includes('${') && value.includes('${', value.indexOf('${') + 2)) {
        throw new ResolutionError(
          'Nested variable interpolation is not allowed in this context',
          ResolutionErrorCode.INVALID_CONTEXT,
          { value, context }
        );
      }
    }
  }

  /**
   * Check for circular variable references
   */
  async detectCircularReferences(value: string): Promise<void> {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const checkReferences = (text: string) => {
      // Get all variable references
      const textRefs = this.textResolver.extractReferences(text);
      const dataRefs = this.dataResolver.extractReferences(text);
      const pathRefs = this.pathResolver.extractReferences(text);
      const cmdRefs = this.commandResolver.extractReferences(text);

      const allRefs = [...textRefs, ...dataRefs, ...pathRefs, ...cmdRefs];

      for (const ref of allRefs) {
        if (stack.has(ref)) {
          throw new ResolutionError(
            `Circular reference detected: ${Array.from(stack).join(' -> ')} -> ${ref}`,
            ResolutionErrorCode.CIRCULAR_REFERENCE,
            { value: text }
          );
        }

        if (!visited.has(ref)) {
          visited.add(ref);
          stack.add(ref);

          // Check the value of this reference for more references
          const textValue = this.stateService.getTextVar(ref);
          if (textValue) {
            checkReferences(textValue);
          }

          const dataValue = this.stateService.getDataVar(ref);
          if (dataValue && typeof dataValue === 'string') {
            checkReferences(dataValue);
          }

          const pathValue = this.stateService.getPathVar(ref);
          if (pathValue) {
            checkReferences(pathValue);
          }

          const cmdValue = this.stateService.getCommand(ref);
          if (cmdValue) {
            checkReferences(cmdValue.command);
          }

          stack.delete(ref);
        }
      }
    };

    checkReferences(value);
  }
} 