import { homedir } from 'os';
import { join, isAbsolute, normalize, relative, sep, dirname } from 'path';
import { interpreterLogger } from '../utils/logger';

/**
 * Service for resolving and validating paths in the Meld interpreter.
 * Handles special variables like $HOMEPATH and $PROJECTPATH.
 * Provides test mode for overriding paths during testing.
 */
export class PathService {
  private testMode: boolean;
  private testHomePath: string | null;
  private testProjectPath: string | null;
  private currentPath: string | null;
  private pathVariables: Map<string, string>;

  constructor() {
    this.testMode = false;
    this.testHomePath = null;
    this.testProjectPath = null;
    this.currentPath = null;
    this.pathVariables = new Map();
  }

  /**
   * Enable test mode with specified test paths
   */
  enableTestMode(homePath: string, projectPath: string): void {
    interpreterLogger.debug('Enabling test mode', { homePath, projectPath });
    this.testMode = true;
    this.testHomePath = homePath;
    this.testProjectPath = projectPath;
  }

  /**
   * Disable test mode
   */
  disableTestMode(): void {
    interpreterLogger.debug('Disabling test mode');
    this.testMode = false;
    this.testHomePath = null;
    this.testProjectPath = null;
  }

  /**
   * Set the current file path for relative path resolution
   */
  setCurrentPath(path: string): void {
    this.currentPath = path;
  }

  /**
   * Get the current file path
   */
  getCurrentPath(): string | null {
    return this.currentPath;
  }

  /**
   * Get the home directory path
   */
  getHomePath(): string {
    return this.testMode && this.testHomePath ? this.testHomePath : homedir();
  }

  /**
   * Get the project root path
   */
  getProjectPath(): string {
    return this.testMode && this.testProjectPath ? this.testProjectPath : process.cwd();
  }

  /**
   * Set a path variable
   */
  setPathVariable(name: string, value: string): void {
    this.pathVariables.set(name, value);
  }

  /**
   * Get a path variable
   */
  getPathVariable(name: string): string | undefined {
    return this.pathVariables.get(name);
  }

  /**
   * Resolve a path, handling special variables and relative paths
   */
  async resolvePath(path: string): Promise<string> {
    interpreterLogger.debug('Resolving path', { path });

    // Replace special variables
    path = this.replaceSpecialVariables(path);

    // Validate path format
    if (!path.startsWith('$HOMEPATH/') && !path.startsWith('$~/') && !path.startsWith('$PROJECTPATH/')) {
      throw new Error('Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.');
    }

    // Replace special variables with actual paths
    path = path.replace(/^\$HOMEPATH\/|\$~\//g, `${this.getHomePath()}/`);
    path = path.replace(/^\$PROJECTPATH\//g, `${this.getProjectPath()}/`);

    // Handle relative paths
    if (!isAbsolute(path) && this.currentPath) {
      path = join(dirname(this.currentPath), path);
    }

    // Normalize the path
    path = normalize(path);

    // Check for path traversal attempts
    const pathParts = path.split(sep);
    let depth = 0;
    
    for (const part of pathParts) {
      if (part === '..') {
        depth--;
        if (depth < 0) {
          throw new Error('Path traversal above root directory is not allowed');
        }
      } else if (part !== '.' && part !== '') {
        depth++;
      }
    }

    return path;
  }

  /**
   * Replace special variables in a path
   */
  private replaceSpecialVariables(path: string): string {
    // First replace any custom path variables
    const varRegex = /\${([^}]+)}/g;
    let lastPath = '';
    let currentPath = path;

    // Keep replacing variables until no more changes occur
    while (lastPath !== currentPath) {
      lastPath = currentPath;
      currentPath = currentPath.replace(varRegex, (match, varName) => {
        const value = this.pathVariables.get(varName);
        if (!value) {
          throw new Error(`Path variable '${varName}' not found`);
        }
        // If the value contains a path variable, resolve it recursively
        if (value.includes('${')) {
          try {
            return this.replaceSpecialVariables(value);
          } catch (error) {
            throw new Error(`Failed to resolve nested path variable '${varName}': ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        return value;
      });
    }

    // Then normalize special variables
    currentPath = currentPath.replace(/\$HOMEPATH|\$~/g, '$HOMEPATH');
    currentPath = currentPath.replace(/\$PROJECTPATH/g, '$PROJECTPATH');

    return currentPath;
  }

  /**
   * Join path segments, handling special variables and normalization
   */
  async joinPaths(...paths: string[]): Promise<string> {
    // First resolve any variables in each path segment
    const resolvedPaths = await Promise.all(paths.map(async (path) => {
      try {
        return await this.resolvePath(path);
      } catch (error) {
        // If the path segment doesn't start with a special variable, treat it as a relative path
        if (!path.startsWith('$')) {
          return path;
        }
        throw error;
      }
    }));

    // Join the resolved paths
    let joinedPath = join(...resolvedPaths);

    // Normalize the final path
    joinedPath = normalize(joinedPath);

    return joinedPath;
  }
}

// Export a singleton instance
export const pathService = new PathService(); 