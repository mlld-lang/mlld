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

  constructor() {
    this.testMode = false;
    this.testHomePath = null;
    this.testProjectPath = null;
    this.currentPath = null;
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
   * Resolve a path, handling special variables and relative paths
   */
  async resolvePath(path: string): Promise<string> {
    interpreterLogger.debug('Resolving path', { path });

    // Extract and validate special variables
    path = this.replaceSpecialVariables(path);

    // Handle relative paths
    if (!isAbsolute(path) && this.currentPath) {
      path = join(dirname(this.currentPath), path);
    }

    // Normalize and validate the path
    path = normalize(path);
    this.validatePath(path);

    return path;
  }

  /**
   * Replace special variables in a path
   */
  private replaceSpecialVariables(path: string): string {
    // Replace $HOMEPATH and $~ with home directory
    path = path.replace(/\$HOMEPATH|\$~/g, this.getHomePath());

    // Replace $PROJECTPATH with project root
    path = path.replace(/\$PROJECTPATH/g, this.getProjectPath());

    return path;
  }

  /**
   * Validate a path
   */
  private validatePath(path: string): void {
    // Check for relative navigation
    if (path.split(sep).some(part => part === '..')) {
      throw new Error('Relative navigation (..) is not allowed in paths');
    }
  }
}

// Export a singleton instance
export const pathService = new PathService(); 