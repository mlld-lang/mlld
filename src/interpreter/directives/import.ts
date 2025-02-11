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
      }
      resolvedSource = resolvedSource.replace(match[0], varValue);
    }

    // Validate path format
    if (!resolvedSource.startsWith('$HOMEPATH/') && !resolvedSource.startsWith('$~/') && !resolvedSource.startsWith('$PROJECTPATH/')) {
      directiveLogger.error('Invalid import path format', {
        location: node.location,
        mode: context.mode,
        path: resolvedSource
      });
      await throwWithContext(
        ErrorFactory.createImportError,
        'Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.',
        node.location,
        context
      );
    }

    try {
      // Set current path for relative path resolution
      const currentPath = state.getCurrentFilePath() || context.workspaceRoot || process.cwd();
      pathService.setCurrentPath(currentPath);

      // Resolve the import path
      const importPath = await pathService.resolvePath(resolvedSource);

      // Check for circular imports before attempting to read the file
      if (state.hasImport(importPath)) {
        directiveLogger.error('Circular import detected', {
          source: resolvedSource,
          path: importPath
        });
        await throwWithContext(
          ErrorFactory.createImportError,
          'Circular import detected',
          node.location,
          context
        );
        return;
      }

      // Add the import to state before reading the file to detect circular imports
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
            const match = line.match(/^@(text|data)\s+([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
            if (match) {
              const [, type, name, value] = match;
              try {
                const parsedValue = JSON.parse(value);
                if (type === 'text') {
                  state.setTextVar(name, String(parsedValue));
                } else {
                  state.setDataVar(name, parsedValue);
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
      await throwWithContext(
        ErrorFactory.createImportError,
        `Failed to import file: ${error instanceof Error ? error.message : String(error)}`,
        node.location,
        context
      );
    }
  }
}

// Export a singleton instance
export const importDirectiveHandler = new ImportDirectiveHandler(); 