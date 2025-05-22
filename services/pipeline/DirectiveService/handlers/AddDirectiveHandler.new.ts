import type { DirectiveNode, TextNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { injectable, inject } from 'tsyringe';

/**
 * Minimal AddDirectiveHandler implementation.
 * 
 * Processes @add directives and returns replacement nodes.
 * Handles variable references, paths, and templates.
 */
@injectable()
export class AddDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'add';
  
  constructor(
    @inject('IResolutionService') private resolution: IResolutionService,
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
    // Create resolution context
    const resolutionContext = {
      strict: options.strict,
      currentPath: options.filePath
    };
    
    let content = '';
    
    if (directive.subtype === 'addVariable') {
      // Handle variable reference
      const varRef = directive.raw.variable;
      if (!varRef) {
        throw new Error('Add variable directive missing variable reference');
      }
      
      // Remove @ prefix if present
      const varName = varRef.startsWith('@') ? varRef.slice(1) : varRef;
      
      // Get variable from state
      const variable = state.getVariable(varName);
      if (!variable) {
        throw new Error(`Variable not found: ${varName}`);
      }
      
      // Get the content based on variable type
      if (variable.type === 'text') {
        content = variable.value;
      } else if (variable.type === 'data') {
        content = JSON.stringify(variable.value, null, 2);
      } else if (variable.type === 'path') {
        content = variable.value.resolvedPath;
      } else {
        content = String(variable.value);
      }
    } else if (directive.subtype === 'addPath') {
      // Handle path inclusion
      const pathNodes = directive.values.path;
      if (!pathNodes) {
        throw new Error('Add path directive missing path');
      }
      
      const resolvedPath = await this.resolution.resolveNodes(
        pathNodes,
        resolutionContext
      );
      
      // Read the file content
      try {
        content = await this.fileSystem.readFile(resolvedPath);
      } catch (error) {
        throw new Error(`Failed to read file: ${resolvedPath}`);
      }
    } else if (directive.subtype === 'addTemplate') {
      // Handle template
      const templateNodes = directive.values.content;
      if (!templateNodes) {
        throw new Error('Add template directive missing content');
      }
      
      content = await this.resolution.resolveNodes(
        templateNodes,
        resolutionContext
      );
    } else {
      throw new Error(`Unsupported add subtype: ${directive.subtype}`);
    }
    
    // Create replacement text node
    const replacementNode: TextNode = {
      type: 'Text',
      nodeId: `${directive.nodeId}-content`,
      content
    };
    
    // Return replacement node
    return {
      replacement: [replacementNode]
    };
  }
}