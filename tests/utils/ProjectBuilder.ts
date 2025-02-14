import { MemfsTestFileSystem } from './MemfsTestFileSystem';
import * as path from 'path';

/**
 * Structure representing a test project
 */
export interface ProjectStructure {
  /**
   * Map of file paths to their contents
   */
  files: Record<string, string>;
  
  /**
   * Optional list of directories to create
   */
  dirs?: string[];

  /**
   * Optional project root path. Defaults to 'project'
   */
  projectRoot?: string;

  /**
   * Optional home path. Defaults to 'home'
   */
  homePath?: string;
}

/**
 * Builds test project structures in the in-memory filesystem
 */
export class ProjectBuilder {
  constructor(private fs: MemfsTestFileSystem) {}

  /**
   * Create a project structure in the filesystem
   */
  async create(struct: ProjectStructure): Promise<void> {
    const projectRoot = struct.projectRoot || 'project';
    const homePath = struct.homePath || 'home';

    // Create standard directories
    this.fs.mkdir(projectRoot);
    this.fs.mkdir(homePath);

    // Create any additional directories
    for (const dir of struct.dirs || []) {
      const fullPath = this.resolvePath(dir, projectRoot);
      if (!this.fs.exists(fullPath)) {
        this.fs.mkdir(fullPath);
      }
    }

    // Create all files
    for (const [filePath, content] of Object.entries(struct.files)) {
      const fullPath = this.resolvePath(filePath, projectRoot);
      const resolvedContent = this.resolveContent(content, {
        $PROJECTPATH: projectRoot,
        $HOMEPATH: homePath
      });
      this.fs.writeFile(fullPath, resolvedContent);
    }
  }

  /**
   * Create a basic project with common defaults
   */
  async createBasicProject(): Promise<void> {
    await this.create({
      dirs: ['project/src', 'project/tests', 'home/.config'],
      files: {
        'project/README.md': '# Test Project',
        'project/src/main.meld': '@text greeting = "Hello World"',
        'home/.config/settings.json': '{}'
      }
    });
  }

  /**
   * Resolve a path relative to the project root
   */
  private resolvePath(filePath: string, projectRoot: string): string {
    // If path starts with $PROJECTPATH or $HOMEPATH, leave it as is
    if (filePath.startsWith('$')) {
      return filePath;
    }
    // Otherwise resolve relative to project root
    return path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
  }

  /**
   * Replace variables in content
   */
  private resolveContent(content: string, vars: Record<string, string>): string {
    let result = content;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(key, 'g'), value);
    }
    return result;
  }
} 