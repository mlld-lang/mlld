import { ProjectBuilder, ProjectStructure } from './ProjectBuilder';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Manages loading and caching of test fixtures
 */
export class FixtureManager {
  private fixtureCache: Map<string, ProjectStructure> = new Map();

  constructor(
    private builder: ProjectBuilder,
    private fixturesDir: string = 'tests/fixtures'
  ) {}

  /**
   * Load and create a fixture in the test filesystem
   */
  async load(fixtureName: string): Promise<void> {
    const fixture = await this.getFixture(fixtureName);
    await this.builder.create(fixture);
  }

  /**
   * Get a fixture by name, using cache if available
   */
  private async getFixture(fixtureName: string): Promise<ProjectStructure> {
    // Check cache first
    const cached = this.fixtureCache.get(fixtureName);
    if (cached) {
      return cached;
    }

    // Load from file
    const filePath = path.join(this.fixturesDir, `${fixtureName}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Fixture not found: ${fixtureName}`);
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    this.validateFixture(data);

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