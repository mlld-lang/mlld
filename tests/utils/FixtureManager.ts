import * as path from 'path';
import fs from 'fs';

export interface ProjectStructure {
  files: { [key: string]: string };
  dirs?: string[];
}

export interface FileSystem {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: string) => string;
}

/**
 * Manages loading and caching of test fixtures
 */
export class FixtureManager {
  private fixtureCache: Map<string, ProjectStructure> = new Map();
  private fs: FileSystem;
  private resolvedFixturesDir: string;

  constructor(
    fixturesDir: string = 'tests/fixtures',
    fileSystem: FileSystem = fs
  ) {
    this.fs = fileSystem;
    // Resolve relative paths to absolute paths
    this.resolvedFixturesDir = path.isAbsolute(fixturesDir) 
      ? fixturesDir 
      : path.join(process.cwd(), fixturesDir);
  }

  /**
   * Load a fixture by name
   */
  async load(fixtureName: string): Promise<ProjectStructure> {
    return this.getFixture(fixtureName);
  }

  /**
   * Get a fixture by name, using cache if available
   */
  private getFixture(fixtureName: string): ProjectStructure {
    // Check cache first
    const cached = this.fixtureCache.get(fixtureName);
    if (cached) {
      return cached;
    }

    // Load from file
    const filePath = path.join(this.resolvedFixturesDir, `${fixtureName}.json`);
    if (!this.fs.existsSync(filePath)) {
      throw new Error(`Fixture not found: ${fixtureName}`);
    }

    let data: any;
    try {
      const fileContent = this.fs.readFileSync(filePath, 'utf-8');
      data = JSON.parse(fileContent);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`Invalid JSON in fixture ${fixtureName}: ${err.message}`);
      }
      throw err;
    }

    try {
      this.validateFixture(data);
    } catch (err) {
      throw new Error(`Invalid fixture structure: ${err.message}`);
    }

    // Cache for future use
    this.fixtureCache.set(fixtureName, data);
    return data;
  }

  /**
   * Validate that a fixture has the required structure
   */
  private validateFixture(data: any): asserts data is ProjectStructure {
    if (!data || typeof data !== 'object') {
      throw new Error('Fixture must be an object');
    }

    if (!data.files || typeof data.files !== 'object') {
      throw new Error('Fixture must have a files object');
    }

    // Validate files
    for (const [key, value] of Object.entries(data.files)) {
      if (typeof key !== 'string') {
        throw new Error('File paths must be strings');
      }
      if (typeof value !== 'string') {
        throw new Error('File contents must be strings');
      }
    }

    // Validate dirs if present
    if (data.dirs !== undefined) {
      if (!Array.isArray(data.dirs)) {
        throw new Error('dirs must be an array if present');
      }
      for (const dir of data.dirs) {
        if (typeof dir !== 'string') {
          throw new Error('Directory paths must be strings');
        }
      }
    }
  }

  /**
   * Clear the fixture cache
   */
  clearCache(): void {
    this.fixtureCache.clear();
  }
} 