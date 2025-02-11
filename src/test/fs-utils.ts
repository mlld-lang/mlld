import fs from 'fs-extra';
import path from 'path';
import { pathService } from '../services/path-service';

const TEST_ROOT = path.resolve(process.cwd(), 'test', '_tmp');

/**
 * Test filesystem utilities for working with temporary directories
 * and path resolution in tests.
 */
export class TestFileSystem {
  private testRoot: string;
  private testHome: string;
  private testProject: string;

  constructor() {
    this.testRoot = TEST_ROOT;
    this.testHome = path.join(this.testRoot, 'home');
    this.testProject = path.join(this.testRoot, 'project');
  }

  /**
   * Initialize the test filesystem
   */
  async initialize(): Promise<void> {
    // Clean and recreate test directories
    await fs.emptyDir(this.testRoot);
    await fs.ensureDir(this.testHome);
    await fs.ensureDir(this.testProject);

    // Configure PathService to use test directories
    pathService.enableTestMode(this.testHome, this.testProject);
  }

  /**
   * Clean up the test filesystem
   */
  async cleanup(): Promise<void> {
    pathService.disableTestMode();
    await fs.emptyDir(this.testRoot);
    await fs.remove(this.testRoot);
  }

  /**
   * Write a file in the test filesystem
   * @param filePath Path relative to test root
   * @param content File content
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.testRoot, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content);
  }

  /**
   * Read a file from the test filesystem
   * @param filePath Path relative to test root
   * @returns File content
   */
  async readFile(filePath: string): Promise<string> {
    const fullPath = path.join(this.testRoot, filePath);
    return fs.readFile(fullPath, 'utf8');
  }

  /**
   * Check if a file exists in the test filesystem
   * @param filePath Path relative to test root
   * @returns Whether the file exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.testRoot, filePath);
    return fs.pathExists(fullPath);
  }

  /**
   * Get the absolute path in the test filesystem
   * @param filePath Path relative to test root
   * @returns Absolute path
   */
  getPath(filePath: string): string {
    return path.join(this.testRoot, filePath);
  }

  /**
   * Get the test home directory path
   */
  getHomePath(): string {
    return this.testHome;
  }

  /**
   * Get the test project directory path
   */
  getProjectPath(): string {
    return this.testProject;
  }
} 