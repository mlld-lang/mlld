import { homedir } from 'os';
import * as pathModule from 'path';
import { interpreterLogger } from '../utils/logger';

export interface PathServiceDependencies {
  homedir: () => string;
  pathModule: typeof pathModule;
}

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
  private defaultProjectPath: string;
  private deps: PathServiceDependencies;

  constructor(deps?: Partial<PathServiceDependencies>) {
    this.testMode = false;
    this.testHomePath = null;
    this.testProjectPath = null;
    this.currentPath = null;
    this.pathVariables = new Map();
    this.defaultProjectPath = process.cwd();
    this.deps = {
      homedir,
      pathModule,
      ...deps
    };
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
    return this.testMode && this.testHomePath ? this.testHomePath : this.deps.homedir();
  }

  /**
   * Set the default project path (used when not in test mode)
   */
  setDefaultProjectPath(path: string): void {
    this.defaultProjectPath = path;
  }

  /**
   * Get the project root path
   */
  getProjectPath(): string {
    return this.testMode && this.testProjectPath ? this.testProjectPath : this.defaultProjectPath;
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
        
        // If the value contains variables, resolve them recursively
        if (value.includes('${') || value.startsWith('$HOMEPATH/') || value.startsWith('$~/') || value.startsWith('$PROJECTPATH/')) {
          return this.replaceSpecialVariables(value);
        }
        
        // If the value is a full path, make it relative to the appropriate root
        if (value.startsWith('/')) {
          const homePath = this.getHomePath();
          const projectPath = this.getProjectPath();
          if (value.startsWith(homePath)) {
            return `$HOMEPATH/${this.deps.pathModule.relative(homePath, value)}`;
          } else if (value.startsWith(projectPath)) {
            return `$PROJECTPATH/${this.deps.pathModule.relative(projectPath, value)}`;
          }
        }
        
        // Return the value as is if it's already a relative path
        return value;
      });
    }

    // Then normalize special variables
    currentPath = currentPath.replace(/\$HOMEPATH|\$~/g, '$HOMEPATH');
    currentPath = currentPath.replace(/\$PROJECTPATH|\$\./g, '$PROJECTPATH');

    return currentPath;
  }

  /**
   * Resolve a path, handling special variables and relative paths
   */
  async resolvePath(inputPath: string): Promise<string> {
    // Handle undefined or empty paths
    if (!inputPath) {
      throw new Error('Path cannot be empty');
    }

    // Validate path format
    if (!inputPath.startsWith('$HOMEPATH/') && !inputPath.startsWith('$~/') && !inputPath.startsWith('$PROJECTPATH/') && !inputPath.startsWith('$./')) {
      throw new Error('Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.');
    }

    // Check for path traversal attempts before replacing special variables
    if (inputPath.includes('../') || inputPath.includes('/..')) {
      throw new Error('Relative navigation (..) is not allowed in paths');
    }

    // Replace special variables with actual paths
    inputPath = inputPath.replace(/^\$HOMEPATH\/|\$~\//g, `${this.getHomePath()}/`);
    inputPath = inputPath.replace(/^\$PROJECTPATH\/|\$\.\//g, `${this.getProjectPath()}/`);

    // Handle relative paths
    if (!this.deps.pathModule.isAbsolute(inputPath) && this.currentPath) {
      inputPath = this.deps.pathModule.join(this.deps.pathModule.dirname(this.currentPath), inputPath);
    }

    // Normalize the path
    inputPath = this.deps.pathModule.normalize(inputPath);

    // Check for path traversal attempts by comparing with root paths
    const homePath = this.getHomePath();
    const projectPath = this.getProjectPath();
    const isUnderHome = inputPath.startsWith(homePath + this.deps.pathModule.sep) || inputPath === homePath;
    const isUnderProject = inputPath.startsWith(projectPath + this.deps.pathModule.sep) || inputPath === projectPath;

    if (!isUnderHome && !isUnderProject) {
      throw new Error('Relative navigation (..) is not allowed in paths');
    }

    return inputPath;
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
    let joinedPath = this.deps.pathModule.join(...resolvedPaths);

    // Normalize the final path
    joinedPath = this.deps.pathModule.normalize(joinedPath);

    return joinedPath;
  }
}

// Export both the class and a singleton instance
export const pathService = new PathService(); 