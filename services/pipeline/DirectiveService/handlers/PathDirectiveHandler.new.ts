import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { createPathVariable, PathContentType } from '@core/types';
import { injectable, inject } from 'tsyringe';

/**
 * Minimal PathDirectiveHandler implementation.
 * 
 * Processes @path directives and returns state changes.
 * Handles path resolution and validation.
 */
@injectable()
export class PathDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'path';
  
  constructor(
    @inject('IResolutionService') private resolution: IResolutionService,
    @inject('IPathService') private pathService: IPathService,
    @inject('IFileSystemService') private fileSystem: IFileSystemService
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
    const identifier = directive.raw.identifier;
    if (!identifier) {
      throw new Error('Path directive missing identifier');
    }
    
    // Get path nodes
    const pathNodes = directive.values.path;
    if (!pathNodes) {
      throw new Error('Path directive missing path');
    }
    
    // Create resolution context
    const resolutionContext = {
      strict: options.strict,
      currentPath: options.filePath
    };
    
    // Resolve the path
    const resolvedPath = await this.resolution.resolveNodes(
      pathNodes,
      resolutionContext
    );
    
    // Resolve the path to absolute
    const absolutePath = this.pathService.resolvePath(resolvedPath, options.filePath);
    
    // Check if path exists and determine content type
    const exists = await this.fileSystem.exists(absolutePath);
    let contentType = PathContentType.UNKNOWN;
    
    if (exists) {
      const stats = await this.fileSystem.stat(absolutePath);
      if (stats.isDirectory()) {
        contentType = PathContentType.DIRECTORY;
      } else if (stats.isFile()) {
        contentType = PathContentType.FILE;
      }
    }
    
    // Create the path variable with state
    const pathState = {
      exists,
      contentType,
      resolvedPath: absolutePath,
      originalValue: resolvedPath
    };
    
    const variable = createPathVariable(identifier, pathState);
    
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