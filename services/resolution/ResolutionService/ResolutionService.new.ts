import { injectable } from 'tsyringe';
import type { 
  IResolutionService, 
  ResolutionInput, 
  ResolutionContext,
  ResolutionServiceDependencies 
} from './IResolutionService.new';
import type { InterpolatableValue } from '@core/ast/types';
import { MeldError } from '@core/errors';

/**
 * Minimal implementation of ResolutionService.
 * 
 * Handles variable interpolation, path resolution, and command execution.
 * All directive-specific logic has been moved to handlers.
 */
@injectable()
export class ResolutionService implements IResolutionService {
  private deps?: ResolutionServiceDependencies;
  private resolving = new Set<string>(); // For circular reference detection

  initialize(deps: ResolutionServiceDependencies): void {
    this.deps = deps;
  }

  async resolve(input: ResolutionInput): Promise<string> {
    if (!this.deps) {
      throw new MeldError('ResolutionService not initialized');
    }

    // Handle string vs InterpolatableValue
    if (typeof input.value === 'string') {
      return this.resolveString(input.value, input.context);
    }

    // Handle InterpolatableValue (array of content elements)
    return this.resolveInterpolatable(input.value, input.context);
  }

  async resolvePath(path: string, context: ResolutionContext): Promise<string> {
    if (!this.deps) {
      throw new MeldError('ResolutionService not initialized');
    }

    // Resolve any variables in the path first
    const resolvedPath = await this.resolveString(path, context);

    // Handle special path variables
    let finalPath = resolvedPath
      .replace(/\$HOMEPATH/g, process.env.HOME || '~')
      .replace(/\$PROJECTPATH/g, this.deps.fileSystem.getCwd());

    // Resolve relative to base path
    if (!finalPath.startsWith('/')) {
      finalPath = this.deps.pathService.resolve(finalPath, context.basePath);
    }

    // Normalize the path to remove ./ and handle ../ etc
    return this.deps.pathService.normalize(finalPath).replace(/\/\.\//g, '/');
  }

  extractSection(content: string, section: string): string {
    // Simple section extraction - find heading and get content until next heading
    const lines = content.split('\n');
    const sectionRegex = new RegExp(`^#+\\s*${section}\\s*$`, 'i');
    
    let inSection = false;
    let sectionContent: string[] = [];
    let sectionLevel = 0;

    for (const line of lines) {
      const headingMatch = line.match(/^(#+)\s/);
      
      if (headingMatch) {
        if (inSection && headingMatch[1].length <= sectionLevel) {
          // Found next section at same or higher level
          break;
        }
        
        if (sectionRegex.test(line)) {
          inSection = true;
          sectionLevel = headingMatch[1].length;
          continue;
        }
      }
      
      if (inSection) {
        sectionContent.push(line);
      }
    }

    return sectionContent.join('\n').trim();
  }

  private async resolveString(value: string, context: ResolutionContext): Promise<string> {
    // Check for circular references
    const key = `${context.state.stateId}:${value}`;
    if (this.resolving.has(key)) {
      throw new MeldError(`Circular reference detected: ${value}`);
    }

    this.resolving.add(key);
    try {
      // Replace variable references {{var}} or {{var.field}}
      const result = await this.replaceVariables(value, context);
      
      // Replace command references $command
      return await this.replaceCommands(result, context);
    } finally {
      this.resolving.delete(key);
    }
  }

  private async resolveInterpolatable(
    value: InterpolatableValue, 
    context: ResolutionContext
  ): Promise<string> {
    const parts: string[] = [];

    for (const element of value) {
      if ('type' in element) {
        switch (element.type) {
          case 'text':
            parts.push(element.value);
            break;
            
          case 'variable':
            const varValue = this.resolveVariable(element.node.name, context);
            parts.push(String(varValue));
            break;
            
          case 'code':
            // Code blocks are passed through as-is
            parts.push(element.value);
            break;
            
          default:
            // Handle other types as text
            parts.push(String(element));
        }
      } else {
        // Fallback for non-typed elements
        parts.push(String(element));
      }
    }

    return parts.join('');
  }

  private async replaceVariables(text: string, context: ResolutionContext): Promise<string> {
    // Match {{variable}} or {{variable.field.subfield}}
    const varRegex = /\{\{([^}]+)\}\}/g;
    
    let result = text;
    let match;
    
    while ((match = varRegex.exec(text)) !== null) {
      const varPath = match[1].trim();
      const value = this.resolveVariable(varPath, context);
      result = result.replace(match[0], String(value));
    }
    
    return result;
  }

  private async replaceCommands(text: string, context: ResolutionContext): Promise<string> {
    // Match $command(args)
    const cmdRegex = /\$(\w+)(?:\(([^)]*)\))?/g;
    
    let result = text;
    let match;
    
    while ((match = cmdRegex.exec(text)) !== null) {
      const cmdName = match[1];
      const cmdVar = context.state.getVariable(cmdName);
      
      if (cmdVar && cmdVar.type === 'command') {
        const output = await this.deps!.fileSystem.executeCommand(String(cmdVar.value));
        result = result.replace(match[0], output.trim());
      }
    }
    
    return result;
  }

  private resolveVariable(path: string, context: ResolutionContext): any {
    const parts = path.split('.');
    const varName = parts[0];
    const variable = context.state.getVariable(varName);
    
    if (!variable) {
      throw new MeldError(`Variable not found: ${varName}`);
    }
    
    // Handle field access for data variables
    if (parts.length > 1 && variable.type === 'data') {
      let value = variable.value;
      
      for (let i = 1; i < parts.length; i++) {
        const field = parts[i];
        
        if (value && typeof value === 'object' && field in value) {
          value = value[field];
        } else {
          throw new MeldError(`Field not found: ${parts.slice(0, i + 1).join('.')}`);
        }
      }
      
      return value;
    }
    
    return variable.value;
  }
}