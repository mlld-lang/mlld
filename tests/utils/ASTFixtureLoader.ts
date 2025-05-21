import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { parse } from '@core/ast/parser';
import { MeldNode } from '@core/ast/types';
// Import this to allow resolving the fixtures path relative to project root
import * as path from 'path';

interface ASTFixture {
  name: string;
  directiveKind: string;
  directiveSubtype: string;
  input: string;
  expected: any;
  metadata?: {
    description?: string;
    expectError?: boolean;
    skipValidation?: boolean;
  };
}

interface ParsedFixture {
  fixture: ASTFixture;
  ast: MeldNode[];
}

export class ASTFixtureLoader {
  private fixturesPath: string;
  private fixtures: Map<string, ASTFixture> = new Map();
  private parsedCache: Map<string, ParsedFixture> = new Map();

  constructor(fixturesPath?: string) {
    // If path is provided, use it; otherwise find the fixtures directory relative to project root
    if (fixturesPath) {
      this.fixturesPath = fixturesPath;
    } else {
      // Find the project root by looking for package.json
      let projectRoot = process.cwd();
      let currentDir = projectRoot;
      
      // Traverse up the directory tree until we find package.json or hit the root
      while (!readdirSync(currentDir).includes('package.json')) {
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
          // We've hit the root without finding package.json
          break;
        }
        currentDir = parentDir;
      }
      
      // Use the found directory as project root
      projectRoot = currentDir;
      this.fixturesPath = join(projectRoot, 'core', 'ast', 'fixtures');
    }
    
    this.loadFixtures();
  }

  private loadFixtures(): void {
    const files = readdirSync(this.fixturesPath).filter(f => f.endsWith('.fixture.json'));
    
    for (const file of files) {
      const fullPath = join(this.fixturesPath, file);
      const content = readFileSync(fullPath, 'utf-8');
      const fixture = JSON.parse(content) as ASTFixture;
      
      // Store by filename without extension
      const name = file.replace('.fixture.json', '');
      this.fixtures.set(name, fixture);
    }
  }

  /**
   * Get a fixture by name (without extension)
   */
  getFixture(name: string): ASTFixture | undefined {
    return this.fixtures.get(name);
  }

  /**
   * Get all fixtures of a specific directive kind
   */
  getFixturesByKind(directiveKind: string): ASTFixture[] {
    return Array.from(this.fixtures.values()).filter(
      fixture => (fixture.directiveKind === directiveKind) || (fixture.metadata?.kind === directiveKind)
    );
  }

  /**
   * Get all fixtures of a specific directive kind and subtype
   */
  getFixturesByKindAndSubtype(directiveKind: string, directiveSubtype: string): ASTFixture[] {
    return Array.from(this.fixtures.values()).filter(
      fixture => 
        ((fixture.directiveKind === directiveKind) || (fixture.metadata?.kind === directiveKind)) && 
        ((fixture.directiveSubtype === directiveSubtype) || (fixture.metadata?.subtype === directiveSubtype))
    );
  }

  /**
   * Get all fixture names
   */
  getAllFixtureNames(): string[] {
    return Array.from(this.fixtures.keys());
  }

  /**
   * Parse a fixture and return the AST
   */
  async parseFixture(name: string): Promise<ParsedFixture> {
    // Check cache first
    if (this.parsedCache.has(name)) {
      return this.parsedCache.get(name)!;
    }

    const fixture = this.fixtures.get(name);
    if (!fixture) {
      throw new Error(`Fixture not found: ${name}`);
    }

    try {
      const result = await parse(fixture.input);
      const parsed: ParsedFixture = { fixture, ast: result.ast };
      this.parsedCache.set(name, parsed);
      return parsed;
    } catch (error) {
      throw new Error(`Failed to parse fixture ${name}: ${error}`);
    }
  }

  /**
   * Parse multiple fixtures at once
   */
  async parseFixtures(names: string[]): Promise<Map<string, ParsedFixture>> {
    const results = new Map<string, ParsedFixture>();
    
    for (const name of names) {
      const parsed = await this.parseFixture(name);
      results.set(name, parsed);
    }
    
    return results;
  }

  /**
   * Parse all fixtures of a specific kind
   */
  async parseFixturesByKind(directiveKind: string): Promise<ParsedFixture[]> {
    const fixtures = this.getFixturesByKind(directiveKind);
    const results: ParsedFixture[] = [];
    
    for (const fixture of fixtures) {
      const name = this.getFixtureName(fixture);
      if (name) {
        const parsed = await this.parseFixture(name);
        results.push(parsed);
      }
    }
    
    return results;
  }

  /**
   * Parse all fixtures of a specific kind and subtype
   */
  async parseFixturesByKindAndSubtype(
    directiveKind: string, 
    directiveSubtype: string
  ): Promise<ParsedFixture[]> {
    const fixtures = this.getFixturesByKindAndSubtype(directiveKind, directiveSubtype);
    const results: ParsedFixture[] = [];
    
    for (const fixture of fixtures) {
      const name = this.getFixtureName(fixture);
      if (name) {
        const parsed = await this.parseFixture(name);
        results.push(parsed);
      }
    }
    
    return results;
  }

  /**
   * Helper to get fixture name from fixture object
   */
  private getFixtureName(fixture: ASTFixture): string | undefined {
    for (const [name, f] of this.fixtures.entries()) {
      if (f === fixture) {
        return name;
      }
    }
    return undefined;
  }

  /**
   * Clear the parsed cache
   */
  clearCache(): void {
    this.parsedCache.clear();
  }

  /**
   * Reload fixtures from disk
   */
  reload(): void {
    this.fixtures.clear();
    this.parsedCache.clear();
    this.loadFixtures();
  }

  /**
   * Get fixtures that expect errors
   */
  getErrorFixtures(): ASTFixture[] {
    return Array.from(this.fixtures.values()).filter(
      fixture => fixture.metadata?.expectError === true
    );
  }

  /**
   * Get fixtures that should skip validation
   */
  getSkipValidationFixtures(): ASTFixture[] {
    return Array.from(this.fixtures.values()).filter(
      fixture => fixture.metadata?.skipValidation === true
    );
  }

  /**
   * Compare parsed AST with expected output
   */
  compareWithExpected(parsed: ParsedFixture): boolean {
    // This is a simplified comparison - you may want to implement
    // a more sophisticated comparison based on your needs
    return JSON.stringify(parsed.ast) === JSON.stringify(parsed.fixture.expected);
  }

  /**
   * Get fixture stats
   */
  getStats(): {
    total: number;
    byKind: Record<string, number>;
    bySubtype: Record<string, number>;
    errorFixtures: number;
    skipValidation: number;
  } {
    const stats = {
      total: this.fixtures.size,
      byKind: {} as Record<string, number>,
      bySubtype: {} as Record<string, number>,
      errorFixtures: 0,
      skipValidation: 0
    };

    for (const fixture of this.fixtures.values()) {
      // Count by kind - check both directiveKind and metadata.kind
      const kind = fixture.directiveKind || fixture.metadata?.kind;
      if (kind) {
        stats.byKind[kind] = (stats.byKind[kind] || 0) + 1;
      }
      
      // Count by subtype - check both directiveSubtype and metadata.subtype
      const subtype = fixture.directiveSubtype || fixture.metadata?.subtype;
      const key = `${kind || 'unknown'}-${subtype || 'unknown'}`;
      stats.bySubtype[key] = (stats.bySubtype[key] || 0) + 1;
      
      // Count special cases
      if (fixture.metadata?.expectError) stats.errorFixtures++;
      if (fixture.metadata?.skipValidation) stats.skipValidation++;
    }

    return stats;
  }
}

// Export singleton instance for convenience - allow it to auto-detect the fixtures directory
export const astFixtureLoader = new ASTFixtureLoader();