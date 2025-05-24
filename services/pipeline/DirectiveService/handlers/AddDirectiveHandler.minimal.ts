import type { DirectiveNode, TextNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.new';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.new';
import { injectable, inject } from 'tsyringe';
import { MeldError, ErrorSeverity } from '@core/errors';

/**
 * AddDirectiveHandler using new minimal interfaces.
 * 
 * Handles @add directives - adds content to the document.
 * Supports variables, paths, templates, and sections.
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
    const subtype = directive.subtype;
    
    // Create resolution context
    const resolutionContext: ResolutionContext = {
      state: state,
      basePath: options.filePath 
        ? options.filePath.substring(0, options.filePath.lastIndexOf('/') || 0)
        : process.cwd(),
      currentFilePath: options.filePath || process.cwd()
    };
    
    let content = '';
    
    if (subtype === 'addVariable') {
      // Handle variable reference (e.g., @add @message)
      const varRef = directive.raw?.variable;
      if (!varRef) {
        throw new MeldError('Add variable directive missing variable reference', {
          code: 'ADD_MISSING_VARIABLE',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Remove @ prefix if present
      const varName = varRef.startsWith('@') ? varRef.slice(1) : varRef;
      
      // Get variable from state
      const variable = state.getVariable(varName);
      if (!variable) {
        throw new MeldError(`Variable not found: ${varName}`, {
          code: 'ADD_VARIABLE_NOT_FOUND',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Get the content based on variable type
      if (variable.type === 'text' || variable.type === 'path') {
        content = String(variable.value);
      } else if (variable.type === 'data') {
        content = JSON.stringify(variable.value, null, 2);
      } else {
        content = String(variable.value);
      }
      
    } else if (subtype === 'addPath') {
      // Handle path directive (e.g., @add ./template.md)
      const pathNodes = directive.values?.path;
      if (!pathNodes) {
        throw new MeldError('Add path directive missing path', {
          code: 'ADD_MISSING_PATH',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Resolve the path
      const pathString = await this.resolution.resolve({
        value: pathNodes,
        context: resolutionContext,
        type: 'path'
      });
      const resolvedPath = await this.resolution.resolvePath(pathString, resolutionContext);
      
      // Read the file content
      content = await this.fileSystem.readFile(resolvedPath);
      
    } else if (subtype === 'addPathSection') {
      // Handle section extraction (e.g., @add ./file.md#section)
      const pathNodes = directive.values?.path;
      const section = directive.raw?.section;
      
      if (!pathNodes) {
        throw new MeldError('Add section directive missing path', {
          code: 'ADD_MISSING_PATH',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Resolve the path
      const pathString = await this.resolution.resolve({
        value: pathNodes,
        context: resolutionContext,
        type: 'path'
      });
      const resolvedPath = await this.resolution.resolvePath(pathString, resolutionContext);
      
      // Read the file content
      const fileContent = await this.fileSystem.readFile(resolvedPath);
      
      // Extract the section if specified
      if (section) {
        content = this.resolution.extractSection(fileContent, section);
      } else {
        content = fileContent;
      }
      
    } else if (subtype === 'addTemplate') {
      // Handle template content (e.g., @add [[template content {{var}}]])
      const templateNodes = directive.values?.template || directive.values?.content;
      if (!templateNodes) {
        throw new MeldError('Add template directive missing content', {
          code: 'ADD_MISSING_TEMPLATE',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Resolve the template with variable interpolation
      content = await this.resolution.resolve({
        value: templateNodes,
        context: resolutionContext,
        type: 'text'
      });
      
    } else {
      throw new MeldError(`Unknown add directive subtype: ${subtype}`, {
        code: 'ADD_UNKNOWN_SUBTYPE',
        severity: ErrorSeverity.Fatal
      });
    }
    
    // Create a text node to add to the document
    const textNode: TextNode = {
      type: 'Text',
      content: content,
      nodeId: `add-${Date.now()}`
    };
    
    // Return the text node to be added
    return {
      stateChanges: {
        nodes: [textNode]
      }
    };
  }
}