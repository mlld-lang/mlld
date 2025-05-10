import { TestContainerHelper } from '@tests/utils/di/TestContainerHelper';
import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem';
import { MemfsExplorer } from '../MemfsExplorer';
import type { ExplorerOptions } from '../../src/explorer';
import * as path from 'path';

/**
 * Helper class for testing the AST Explorer with memfs
 */
export class AstExplorerTestHelper {
  private memfs: MemfsTestFileSystem;
  private container: TestContainerHelper;
  
  constructor() {
    this.memfs = new MemfsTestFileSystem();
    this.memfs.initialize();
    
    this.container = TestContainerHelper.createTestContainer();
    this.container.registerMock('IFileSystem', this.memfs);
  }
  
  /**
   * Create an AST Explorer instance with memfs integration
   */
  createExplorer(options: ExplorerOptions = {}) {
    const outputDir = options.outputDir || '/test-output';
    
    // Create output directory
    this.memfs.mkdirSync(outputDir, { recursive: true });
    
    // Create Explorer with memfs
    return new MemfsExplorer(options, this.memfs);
  }
  
  /**
   * Get the memfs instance for direct manipulation
   */
  getMemfs() {
    return this.memfs;
  }
  
  /**
   * Clean up resources
   */
  async cleanup() {
    await this.memfs.cleanup();
  }
  
  /**
   * Helper to create directory structure for tests
   */
  setupDirectories(directories: string[] = []) {
    // Create default directories if none specified
    const dirs = directories.length > 0
      ? directories
      : ['./test-output', './snapshots', './fixtures', './types'];

    dirs.forEach(dir => {
      this.memfs.mkdirSync(dir, { recursive: true });
    });
  }
  
  /**
   * Helper to verify file existence and content
   */
  async verifyFile(filePath: string, contentChecks: {
    exists?: boolean;
    contains?: string[];
    notContains?: string[];
    json?: boolean;
  } = {}) {
    const exists = await this.memfs.exists(filePath);
    
    // Check existence if specified
    if (contentChecks.exists !== undefined) {
      if (contentChecks.exists !== exists) {
        throw new Error(`File ${filePath} ${contentChecks.exists ? 'does not exist' : 'exists'} but expected ${contentChecks.exists ? 'to exist' : 'not to exist'}`);
      }
    }
    
    // If file doesn't exist, return
    if (!exists) {
      return { exists: false };
    }
    
    // Read content
    const content = await this.memfs.readFile(filePath);
    const result = { exists: true, content, json: undefined };
    
    // Check content contains
    if (contentChecks.contains) {
      for (const text of contentChecks.contains) {
        if (!content.includes(text)) {
          throw new Error(`File ${filePath} does not contain "${text}"`);
        }
      }
    }
    
    // Check content not contains
    if (contentChecks.notContains) {
      for (const text of contentChecks.notContains) {
        if (content.includes(text)) {
          throw new Error(`File ${filePath} contains "${text}" but should not`);
        }
      }
    }
    
    // Parse as JSON if requested
    if (contentChecks.json) {
      try {
        result.json = JSON.parse(content);
      } catch (error) {
        throw new Error(`File ${filePath} contains invalid JSON: ${error.message}`);
      }
    }
    
    return result;
  }
}