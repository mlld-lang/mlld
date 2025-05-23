import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.new';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.new';
import { createPathVariable } from '@core/types';
import { injectable, inject } from 'tsyringe';
import { MeldError, ErrorSeverity } from '@core/errors';

/**
 * PathDirectiveHandler using new minimal interfaces.
 * 
 * Handles @path directives with proper path resolution.
 * Supports special variables like $HOMEPATH and $PROJECTPATH.
 */
@injectable()
export class PathDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'path';
  
  constructor(
    @inject('IResolutionService') private resolution: IResolutionService
  ) {}
  
  async handle(
    directive: DirectiveNode,
    state: IStateService,
    options: {
      strict: boolean;
      filePath?: string;
    }
  ): Promise<DirectiveResult> {
    // Extract identifier from directive
    const identifier = directive.raw?.identifier;
    if (!identifier) {
      throw new MeldError('Path directive missing identifier', {
        code: 'PATH_MISSING_IDENTIFIER',
        severity: ErrorSeverity.Fatal
      });
    }
    
    // Get path value - could be string or nodes
    const pathValue = directive.values?.path || directive.values?.value;
    if (!pathValue) {
      throw new MeldError('Path directive missing path', {
        code: 'PATH_MISSING_VALUE',
        severity: ErrorSeverity.Fatal
      });
    }
    
    // Create resolution context
    const resolutionContext: ResolutionContext = {
      state: state,
      basePath: options.filePath 
        ? options.filePath.substring(0, options.filePath.lastIndexOf('/') || 0)
        : process.cwd(),
      currentFilePath: options.filePath || process.cwd()
    };
    
    // Resolve the path using new interface
    let resolvedPath: string;
    if (typeof pathValue === 'string') {
      // Simple string path
      resolvedPath = await this.resolution.resolvePath(pathValue, resolutionContext);
    } else {
      // Path with interpolation
      const pathString = await this.resolution.resolve({
        value: pathValue,
        context: resolutionContext,
        type: 'path'
      });
      resolvedPath = await this.resolution.resolvePath(pathString, resolutionContext);
    }
    
    // Create the path variable
    const variable = createPathVariable(identifier, resolvedPath);
    
    // Return state changes
    return {
      stateChanges: {
        variables: {
          [identifier]: variable
        }
      }
    };
  }
}