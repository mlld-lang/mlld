import * as path from 'path';
import { IFileSystemService } from '@services/fs/IFileSystemService';

export interface SmartPathOptions {
  basePath?: string;
  workingDirectory?: string;
  preferRelative?: boolean;
  maxRelativeDepth?: number;
}

export interface ResolvedPath {
  display: string;
  absolute: string;
  relative?: string;
  isRelative: boolean;
  isWithinProject: boolean;
}

export class SmartPathResolver {
  private fileSystem: IFileSystemService;
  private projectRootCache = new Map<string, string | null>();

  constructor(fileSystem: IFileSystemService) {
    this.fileSystem = fileSystem;
  }

  /**
   * Resolve a file path to the most appropriate display format
   */
  async resolvePath(filePath: string, options: SmartPathOptions = {}): Promise<ResolvedPath> {
    const {
      basePath = process.cwd() as string,
      workingDirectory = process.cwd() as string,
      preferRelative = true,
      maxRelativeDepth = 3
    } = options;

    const absolutePath = path.resolve(filePath);
    
    // Find project root
    const projectRoot = await this.findProjectRoot(absolutePath, basePath);
    
    // Calculate relative path from working directory
    const relativeFromCwd = path.relative(workingDirectory, absolutePath);
    
    // Calculate relative path from project root
    const relativeFromProject = projectRoot 
      ? path.relative(projectRoot, absolutePath)
      : relativeFromCwd;

    // Determine if file is within the project
    const isWithinProject = projectRoot !== null && !relativeFromProject.startsWith('..');
    
    // Choose the best display path
    let displayPath: string;
    let isRelative = false;

    if (preferRelative && isWithinProject) {
      // Use project-relative path if within project
      const projectRelative = relativeFromProject.startsWith('./') ? relativeFromProject : `./${relativeFromProject}`;
      
      // Check if the relative path is reasonable (not too many ../ segments)
      const upLevels = (projectRelative.match(/\.\.\//g) || []).length;
      
      if (upLevels <= maxRelativeDepth) {
        displayPath = projectRelative;
        isRelative = true;
      } else {
        displayPath = absolutePath;
      }
    } else if (preferRelative && !relativeFromCwd.startsWith('..')) {
      // Use cwd-relative path if not too far up
      const upLevels = (relativeFromCwd.match(/\.\.\//g) || []).length;
      
      if (upLevels <= maxRelativeDepth) {
        displayPath = relativeFromCwd.startsWith('./') ? relativeFromCwd : `./${relativeFromCwd}`;
        isRelative = true;
      } else {
        displayPath = absolutePath;
      }
    } else {
      displayPath = absolutePath;
    }

    return {
      display: displayPath,
      absolute: absolutePath,
      relative: isWithinProject ? relativeFromProject : relativeFromCwd,
      isRelative,
      isWithinProject
    };
  }

  /**
   * Find the project root by looking for package.json, .git, or other indicators
   */
  private async findProjectRoot(startPath: string, fallbackBasePath: string): Promise<string | null> {
    const cacheKey = startPath;
    
    if (this.projectRootCache.has(cacheKey)) {
      return this.projectRootCache.get(cacheKey) || null;
    }

    let currentDir = path.dirname(startPath);
    const rootDir = path.parse(currentDir).root;

    while (currentDir !== rootDir) {
      // Check for common project root indicators
      const indicators = [
        'package.json',
        '.git',
        'pyproject.toml',
        'Cargo.toml',
        'go.mod',
        'composer.json',
        'pom.xml',
        'build.gradle',
        'Makefile',
        'README.md'
      ];

      for (const indicator of indicators) {
        const indicatorPath = path.join(currentDir, indicator);
        try {
          if (await this.fileExists(indicatorPath)) {
            this.projectRootCache.set(cacheKey, currentDir);
            return currentDir;
          }
        } catch {
          // Ignore file access errors
        }
      }

      currentDir = path.dirname(currentDir);
    }

    // If no project root found, use fallback
    this.projectRootCache.set(cacheKey, fallbackBasePath);
    return fallbackBasePath;
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await this.fileSystem.readFile(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear the project root cache
   */
  clearCache(): void {
    this.projectRootCache.clear();
  }

  /**
   * Format a file path for error display with line and column
   */
  formatPathForDisplay(resolvedPath: ResolvedPath, line?: number, column?: number): string {
    let result = resolvedPath.display;
    
    if (line !== undefined) {
      result += `:${line}`;
      
      if (column !== undefined) {
        result += `:${column}`;
      }
    }
    
    return result;
  }
}