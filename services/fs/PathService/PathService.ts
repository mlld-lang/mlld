import { IPathService, PathOptions } from './IPathService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { PathValidationError, PathErrorCode } from './errors/PathValidationError.js';
import { ProjectPathResolver } from '../ProjectPathResolver.js';
import type { Location } from '@core/types/index.js';
import type { StructuredPath } from 'meld-spec';
import * as path from 'path';
import * as os from 'os';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';

/**
 * Service for validating and normalizing paths
 */
export class PathService implements IPathService {
  private fs!: IFileSystemService;
  private parser!: IParserService;
  private testMode: boolean = false;
  private homePath: string;
  private projectPath: string;
  private projectPathResolver: ProjectPathResolver;
  private projectPathResolved: boolean = false;

  constructor() {
    const homeEnv = process.env.HOME || process.env.USERPROFILE;
    if (!homeEnv && !this.testMode) {
      throw new Error('Unable to determine home directory: HOME or USERPROFILE environment variables are not set');
    }
    this.homePath = homeEnv || '';
    this.projectPath = process.cwd();
    this.projectPathResolver = new ProjectPathResolver();
  }

  /**
   * Initialize the path service with a file system service
   */
  initialize(fileSystem: IFileSystemService, parser?: IParserService): void {
    this.fs = fileSystem;
    
    // Store parser service if provided
    if (parser) {
      this.parser = parser;
    }
  }

  /**
   * Enable test mode for path operations
   */
  enableTestMode(): void {
    this.testMode = true;
    // Set a default test home path if none is set
    if (!this.homePath) {
      this.homePath = '/home/test';
    }
  }

  /**
   * Disable test mode for path operations
   */
  disableTestMode(): void {
    this.testMode = false;
  }

  /**
   * Check if test mode is enabled
   */
  isTestMode(): boolean {
    return this.testMode;
  }

  /**
   * Set home path for testing
   */
  setHomePath(path: string): void {
    if (!path) {
      throw new Error('Home path cannot be empty');
    }
    this.homePath = path;
  }

  /**
   * Set project path for testing
   */
  setProjectPath(path: string): void {
    this.projectPath = path;
    this.projectPathResolved = true;
  }

  /**
   * Get the home path
   */
  getHomePath(): string {
    return this.homePath;
  }

  /**
   * Get the project path
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Resolve the project path using the ProjectPathResolver
   */
  async resolveProjectPath(): Promise<string> {
    // If we're in test mode or the path has already been set, use the current value
    if (this.testMode || this.projectPathResolved) {
      return this.projectPath;
    }

    // Use the resolver to find the project path
    const cwd = this.fs ? this.fs.getCwd() : process.cwd();
    const resolvedPath = await this.projectPathResolver.resolveProjectRoot(cwd);
    this.projectPath = resolvedPath;
    this.projectPathResolved = true;
    
    return this.projectPath;
  }

  /**
   * Get a structured path from a string path by parsing it with the parser service
   * @private
   */
  private async getStructuredPath(pathStr: string): Promise<StructuredPath> {
    if (!this.parser) {
      // If parser is not available, create a basic structured path
      // This is a fallback for backward compatibility
      return {
        raw: pathStr,
        structured: {
          segments: pathStr.split('/').filter(Boolean),
          variables: {
            special: [],
            path: []
          }
        }
      };
    }

    try {
      // Parse the path string to get AST nodes
      const nodes = await this.parser.parse(pathStr);
      
      // Find the path node (should be the first node or a single node)
      const pathNode = nodes[0];
      
      if (pathNode && pathNode.type === 'PathVar') {
        // Return the structured path property from the node
        // Use proper type assertion with 'as any' first to handle the value property
        return (pathNode as any).value as StructuredPath;
      } else {
        // If not a path node, create a basic structured path for backward compatibility
        return {
          raw: pathStr,
          structured: {
            segments: pathStr.split('/').filter(Boolean),
            cwd: !pathStr.startsWith('$')
          }
        };
      }
    } catch (error) {
      // If parsing fails, create a basic structured path
      return {
        raw: pathStr,
        structured: {
          segments: pathStr.split('/').filter(Boolean),
          cwd: !pathStr.startsWith('$')
        }
      };
    }
  }

  /**
   * Validate a path according to Meld's strict path rules
   */
  private async validateMeldPath(filePath: string | StructuredPath, location?: Location): Promise<void> {
    let pathToValidate: StructuredPath;
    
    // Convert string paths to structured paths
    if (typeof filePath === 'string') {
      pathToValidate = await this.getStructuredPath(filePath);
    } else {
      pathToValidate = filePath;
    }

    // Use structured path validation
    await this.validateStructuredPath(pathToValidate, location);
  }

  /**
   * Validate a structured path object
   */
  private async validateStructuredPath(pathObj: StructuredPath, location?: Location): Promise<void> {
    const { structured, raw } = pathObj;

    // Check if this is a simple path with no slashes
    if (!structured.segments || structured.segments.length === 0) {
      return; // Simple filename with no path segments is always valid
    }

    // Check for special variables
    const hasSpecialVar = structured.variables?.special?.some(
      v => v === 'HOMEPATH' || v === 'PROJECTPATH'
    );

    // Check for path with slashes
    const hasSlashes = raw.includes('/');
    
    // If path has slashes but no special variables, it's invalid
    if (hasSlashes && !hasSpecialVar && !structured.cwd) {
      throw new PathValidationError(
        'Paths with slashes must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
        PathErrorCode.INVALID_PATH_FORMAT,
        location
      );
    }

    // Check for dot segments in any part of the path
    if (structured.segments.some(segment => segment === '.' || segment === '..')) {
      throw new PathValidationError(
        'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
        PathErrorCode.CONTAINS_DOT_SEGMENTS,
        location
      );
    }

    // Check for raw absolute paths
    if (path.isAbsolute(raw)) {
      throw new PathValidationError(
        'Raw absolute paths are not allowed - use $. for project-relative paths and $~ for home-relative paths',
        PathErrorCode.RAW_ABSOLUTE_PATH,
        location
      );
    }
  }

  /**
   * Resolve a path to its absolute form, handling special variables
   */
  resolvePath(filePath: string | StructuredPath, baseDir?: string): string {
    // Convert to synchronous to match interface
    let structuredPath: StructuredPath;
    
    // If string, create a basic structured path
    if (typeof filePath === 'string') {
      structuredPath = {
        raw: filePath,
        structured: {
          segments: filePath.split('/').filter(Boolean),
          variables: {
            special: [],
            path: []
          },
          cwd: !filePath.startsWith('$')
        }
      };
      
      // Handle special path variables for string paths
      if (filePath.startsWith('$HOMEPATH/') || filePath.startsWith('$~/')) {
        structuredPath.structured.variables.special = ['HOMEPATH'];
      } else if (filePath.startsWith('$PROJECTPATH/') || filePath.startsWith('$./')) {
        structuredPath.structured.variables.special = ['PROJECTPATH'];
      }
    } else {
      structuredPath = filePath;
    }
    
    // Validate the path synchronously
    this.validateStructuredPathSync(structuredPath);
    
    // Now resolve the path
    return this.resolveStructuredPath(structuredPath, baseDir);
  }
  
  /**
   * Synchronous version of validateStructuredPath for backward compatibility
   */
  private validateStructuredPathSync(pathObj: StructuredPath, location?: Location): void {
    const { structured, raw } = pathObj;

    // Check if this is a simple path with no slashes
    if (!structured.segments || structured.segments.length === 0) {
      return; // Simple filename with no path segments is always valid
    }

    // Check for special variables
    const hasSpecialVar = structured.variables?.special?.some(
      v => v === 'HOMEPATH' || v === 'PROJECTPATH'
    );

    // Check for path with slashes
    const hasSlashes = raw.includes('/');
    
    // If path has slashes but no special variables, it's invalid
    if (hasSlashes && !hasSpecialVar && !structured.cwd) {
      throw new PathValidationError(
        'Paths with slashes must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths',
        PathErrorCode.INVALID_PATH_FORMAT,
        location
      );
    }

    // Check for dot segments in any part of the path
    if (structured.segments.some(segment => segment === '.' || segment === '..')) {
      throw new PathValidationError(
        'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
        PathErrorCode.CONTAINS_DOT_SEGMENTS,
        location
      );
    }

    // Check for raw absolute paths
    if (path.isAbsolute(raw)) {
      throw new PathValidationError(
        'Raw absolute paths are not allowed - use $. for project-relative paths and $~ for home-relative paths',
        PathErrorCode.RAW_ABSOLUTE_PATH,
        location
      );
    }
  }

  /**
   * Async version of resolvePath that uses the parser service
   * This is used internally for validatePath
   */
  private async resolvePathAsync(filePath: string | StructuredPath, baseDir?: string): Promise<string> {
    // First validate the path according to Meld rules
    await this.validateMeldPath(filePath);

    // Convert string paths to structured paths if needed
    if (typeof filePath === 'string') {
      filePath = await this.getStructuredPath(filePath);
    }
    
    // Now use the structured path for resolution
    return this.resolveStructuredPath(filePath, baseDir);
  }

  /**
   * Resolve a structured path object to an absolute path
   */
  private resolveStructuredPath(pathObj: StructuredPath, baseDir?: string): string {
    const { structured, raw } = pathObj;

    // If there are no segments, it's a simple filename
    if (!structured.segments || structured.segments.length === 0) {
      return path.normalize(path.join(baseDir || process.cwd(), raw));
    }

    // Check for special variables
    if (structured.variables?.special?.includes('HOMEPATH')) {
      return path.normalize(path.join(this.homePath, ...structured.segments));
    }
    
    if (structured.variables?.special?.includes('PROJECTPATH')) {
      return path.normalize(path.join(this.projectPath, ...structured.segments));
    }

    // If it's a current working directory path
    if (structured.cwd) {
      return path.normalize(path.join(baseDir || process.cwd(), ...structured.segments));
    }

    // Handle string path format for backward compatibility
    if (raw.startsWith('$HOMEPATH/') || raw.startsWith('$~/')) {
      return path.normalize(path.join(this.homePath, raw.substring(raw.indexOf('/') + 1)));
    }
    if (raw.startsWith('$PROJECTPATH/') || raw.startsWith('$./')) {
      return path.normalize(path.join(this.projectPath, raw.substring(raw.indexOf('/') + 1)));
    }

    // If path has no slashes, treat as relative to current directory
    if (!raw.includes('/')) {
      return path.normalize(path.join(baseDir || process.cwd(), raw));
    }

    // At this point, any other path format is invalid
    throw new PathValidationError(
      'Invalid path format - paths must either be simple filenames or start with $. or $~',
      PathErrorCode.INVALID_PATH_FORMAT
    );
  }

  /**
   * Validate a path according to the specified options
   */
  async validatePath(filePath: string | StructuredPath, options: PathOptions = {}): Promise<string> {
    // Basic validation
    if (!filePath) {
      throw new PathValidationError(
        'Path cannot be empty',
        PathErrorCode.INVALID_PATH,
        options.location
      );
    }

    const pathStr = typeof filePath === 'string' ? filePath : filePath.raw;
    if (pathStr.includes('\0')) {
      throw new PathValidationError(
        'Path cannot contain null bytes',
        PathErrorCode.NULL_BYTE,
        options.location
      );
    }

    // Skip validation in test mode unless explicitly required
    if (this.testMode && !options.mustExist) {
      return typeof filePath === 'string' ? filePath : filePath.raw;
    }

    // Handle special path variables and validate Meld path rules
    let resolvedPath = await this.resolvePathAsync(filePath, options.baseDir);

    // Check if path is within base directory when required
    if (options.allowOutsideBaseDir === false) {
      const baseDir = options.baseDir || this.projectPath;
      const normalizedPath = path.normalize(resolvedPath);
      const normalizedBase = path.normalize(baseDir);
      
      // Make sure the path starts with the base directory followed by path separator or is exactly equal
      const isWithinBase = normalizedPath === normalizedBase || 
        normalizedPath.startsWith(normalizedBase + path.sep);
      
      if (!isWithinBase) {
        throw new PathValidationError(
          `Path must be within base directory: ${baseDir}`,
          PathErrorCode.OUTSIDE_BASE_DIR,
          options.location
        );
      }
    }

    // Check existence if required
    if (options.mustExist || options.mustBeFile || options.mustBeDirectory) {
      const exists = await this.fs.exists(resolvedPath);
      if (!exists) {
        throw new PathValidationError(
          `Path does not exist: ${resolvedPath}`,
          PathErrorCode.PATH_NOT_FOUND,
          options.location
        );
      }

      // Check file type if specified
      if (options.mustBeFile) {
        const isFile = await this.fs.isFile(resolvedPath);
        if (!isFile) {
          throw new PathValidationError(
            `Path must be a file: ${resolvedPath}`,
            PathErrorCode.NOT_A_FILE,
            options.location
          );
        }
      }

      if (options.mustBeDirectory) {
        const isDirectory = await this.fs.isDirectory(resolvedPath);
        if (!isDirectory) {
          throw new PathValidationError(
            `Path must be a directory: ${resolvedPath}`,
            PathErrorCode.NOT_A_DIRECTORY,
            options.location
          );
        }
      }
    }

    return resolvedPath;
  }

  /**
   * Normalize a path by resolving '..' and '.' segments
   */
  normalizePath(filePath: string): string {
    return path.normalize(filePath);
  }

  /**
   * Join multiple path segments together
   */
  join(...paths: string[]): string {
    return path.join(...paths);
  }

  /**
   * Get the directory name of a path
   */
  dirname(pathStr: string): string {
    return path.dirname(pathStr);
  }

  /**
   * Get the base name of a path
   */
  basename(pathStr: string): string {
    return path.basename(pathStr);
  }
} 