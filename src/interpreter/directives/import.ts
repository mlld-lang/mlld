import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { readFile } from 'fs/promises';
import path from 'path';
import { pathService } from '../../services/path-service';

export class ImportDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'import';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === ImportDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    directiveLogger.debug('Processing import directive', {
      source: data.source,
      mode: context.mode,
      location: node.location
    });

    // Validate source parameter
    if (!data.source || typeof data.source !== 'string') {
      directiveLogger.error('Import directive missing source', {
        location: node.location,
        mode: context.mode
      });
      await throwWithContext(
        ErrorFactory.createImportError,
        'Import source is required',
        node.location,
        context
      );
    }

    // Handle path variable substitution
    let resolvedSource = data.source;
    const varRegex = /\${([^}]+)}/g;
    let match;
    while ((match = varRegex.exec(resolvedSource)) !== null) {
      const varName = match[1];
      const varValue = state.getPathVar(varName);
      if (!varValue) {
        directiveLogger.error('Import path variable not found', {
          location: node.location,
          mode: context.mode,
          variable: varName
        });
        await throwWithContext(
          ErrorFactory.createImportError,
          `Import path variable '${varName}' not found`,
          node.location,
          context
        );
        continue; // Skip this iteration after throwing
      }
      
      // Convert absolute paths to project-relative paths
      let prefixedValue = varValue;
      if (path.isAbsolute(varValue)) {
        const projectPath = context.workspaceRoot || process.cwd();
        if (varValue.startsWith(projectPath)) {
          prefixedValue = `$PROJECTPATH/${path.relative(projectPath, varValue)}`;
        }
      } else if (!varValue.startsWith('$HOMEPATH/') && 
                 !varValue.startsWith('$~/') && 
                 !varValue.startsWith('$PROJECTPATH/') && 
                 !varValue.startsWith('$./')) {
        prefixedValue = `$PROJECTPATH/${varValue}`;
      }
        
      resolvedSource = resolvedSource.replace(match[0], prefixedValue);
    }

    try {
      // Set current path for relative path resolution
      const currentPath = state.getCurrentFilePath() || context.workspaceRoot || process.cwd();
      directiveLogger.debug('Setting current path', { currentPath });
      pathService.setCurrentPath(currentPath);

      // Resolve the import path
      const importPath = await pathService.resolvePath(resolvedSource);
      directiveLogger.debug('Resolved import path', { 
        importPath,
        resolvedSource,
        currentPath,
        workspaceRoot: context.workspaceRoot
      });

      // Validate path format after variable substitution and resolution
      if (!path.isAbsolute(importPath) && 
          !resolvedSource.startsWith('$HOMEPATH/') && 
          !resolvedSource.startsWith('$~/') && 
          !resolvedSource.startsWith('$PROJECTPATH/')) {
        directiveLogger.error('Invalid import path format', {
          location: node.location,
          mode: context.mode,
          path: resolvedSource
        });
        await throwWithContext(
          ErrorFactory.createImportError,
          'Path must be absolute or start with $HOMEPATH/$~ or $PROJECTPATH/.',
          node.location,
          context
        );
      }

      // Check for circular imports
      directiveLogger.debug('Checking for circular imports', { 
        path: importPath, 
        hasImport: state.hasImport(importPath),
        allImports: Array.from(state.getImports()),
        resolvedSource: resolvedSource
      });
      if (state.hasImport(importPath)) {
        directiveLogger.error('Circular import detected', { path: importPath });
        return Promise.reject(
          ErrorFactory.createImportError('Circular import detected', node.location?.start)
        );
      }

      // Add import to state before reading file to detect circular imports
      state.addImport(importPath);

      try {
        // Read the file
        const content = await readFile(importPath, 'utf8');

        directiveLogger.info('Import successful', {
          source: resolvedSource,
          path: importPath,
          contentLength: content.length
        });

        // Parse the content based on file type and directives
        if (path.extname(importPath) === '.json') {
          try {
            const parsedContent = JSON.parse(content);
            const varName = path.basename(resolvedSource, '.json')
              .replace(/^.*[/\\]/, '') // Remove path, keep only filename
              .replace(/[^a-zA-Z0-9_]/g, '_'); // Replace invalid characters with underscore
            state.setDataVar(varName, parsedContent);
          } catch (error) {
            directiveLogger.error('Failed to parse JSON content', {
              source: resolvedSource,
              error: error instanceof Error ? error.message : String(error)
            });
            await throwWithContext(
              ErrorFactory.createImportError,
              `Failed to parse JSON content: ${error instanceof Error ? error.message : String(error)}`,
              node.location,
              context
            );
          }
        } else {
          // Parse Meld directives
          const lines = content.split('\n');
          for (const line of lines) {
            const match = line.match(/^@(text|data|path)\s+([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
            if (match) {
              const [, type, name, value] = match;
              try {
                let parsedValue;
                if (type === 'path') {
                  // For path variables, don't parse as JSON, just trim quotes if present
                  parsedValue = value.trim().replace(/^["']|["']$/g, '');
                  // Perform variable substitution on path values
                  const varRegex = /\${([^}]+)}/g;
                  let pathMatch;
                  while ((pathMatch = varRegex.exec(parsedValue)) !== null) {
                    const varName = pathMatch[1];
                    const varValue = state.getPathVar(varName);
                    if (varValue) {
                      parsedValue = parsedValue.replace(pathMatch[0], varValue);
                    }
                  }
                  // Resolve the path if it's relative or contains variables
                  if (!path.isAbsolute(parsedValue) && 
                      !parsedValue.startsWith('$HOMEPATH/') && 
                      !parsedValue.startsWith('$~/') && 
                      !parsedValue.startsWith('$PROJECTPATH/')) {
                    const currentPath = path.dirname(importPath);
                    parsedValue = path.resolve(currentPath, parsedValue);
                  }
                  // Resolve any remaining path variables
                  if (parsedValue.startsWith('$PROJECTPATH/') || 
                      parsedValue.startsWith('$HOMEPATH/') || 
                      parsedValue.startsWith('$~/')) {
                    try {
                      const resolvedPath = await pathService.resolvePath(parsedValue);
                      parsedValue = resolvedPath;
                    } catch (error) {
                      directiveLogger.error('Failed to resolve path variable', {
                        path: parsedValue,
                        error: error instanceof Error ? error.message : String(error)
                      });
                    }
                  }
                } else {
                  parsedValue = JSON.parse(value);
                  // If this is a text value, perform path variable substitution
                  if (type === 'text' && typeof parsedValue === 'string') {
                    const varRegex = /\${([^}]+)}/g;
                    let textMatch;
                    while ((textMatch = varRegex.exec(parsedValue)) !== null) {
                      const varName = textMatch[1];
                      const varValue = state.getPathVar(varName);
                      if (varValue) {
                        parsedValue = parsedValue.replace(textMatch[0], varValue);
                      }
                    }
                  }
                }

                if (type === 'text') {
                  state.setTextVar(name, String(parsedValue));
                } else if (type === 'data') {
                  state.setDataVar(name, parsedValue);
                } else if (type === 'path') {
                  state.setPathVar(name, String(parsedValue));
                }
              } catch (error) {
                directiveLogger.error('Failed to parse directive value', {
                  line,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
          }

          // If no directives found, store raw content
          if (!lines.some(line => line.match(/^@(text|data)/))) {
            const varName = path.basename(resolvedSource, path.extname(resolvedSource))
              .replace(/^.*[/\\]/, '') // Remove path, keep only filename
              .replace(/[^a-zA-Z0-9_]/g, '_'); // Replace invalid characters with underscore
            state.setTextVar(varName, content);
          }
        }
      } catch (error) {
        // Remove the import from state if reading or parsing fails
        state.removeImport(importPath);
        throw error;
      }
    } catch (error) {
      directiveLogger.error('Import failed', {
        source: resolvedSource,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Don't prefix validation errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Path must be absolute') || 
          errorMessage.includes('Path must start with')) {
        await throwWithContext(
          ErrorFactory.createImportError,
          errorMessage,
          node.location,
          context
        );
      } else {
        await throwWithContext(
          ErrorFactory.createImportError,
          `Failed to import file: ${errorMessage}`,
          node.location,
          context
        );
      }
    }
  }
}

// Export a singleton instance
export const importDirectiveHandler = new ImportDirectiveHandler(); 