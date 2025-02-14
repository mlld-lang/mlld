import { parse as meldAstParse } from 'meld-ast';
import { convertToXml } from 'llmxml';
import { MemfsTestFileSystem } from './MemfsTestFileSystem';
import { ProjectBuilder } from './ProjectBuilder';
import { TestSnapshot } from './TestSnapshot';
import { FixtureManager } from './FixtureManager';
import * as testFactories from './testFactories';
import { ParserService } from '../../services/ParserService/ParserService';
import type { IParserService } from '../../services/ParserService/IParserService';
import * as fs from 'fs-extra';
import * as path from 'path';

interface SnapshotDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

interface TestFixtures {
  load(fixtureName: string): Promise<void>;
}

interface TestSnapshot {
  takeSnapshot(): Promise<Map<string, string>>;
  compare(before: Map<string, string>, after: Map<string, string>): SnapshotDiff;
}

/**
 * Main test context that provides access to all test utilities
 */
export class TestContext {
  public readonly fs: MemfsTestFileSystem;
  public builder: ProjectBuilder;
  public readonly fixtures: TestFixtures;
  public readonly snapshot: TestSnapshot;
  public factory: typeof testFactories;
  private parserService: IParserService;
  private fixturesDir: string;

  constructor(fixturesDir: string = 'tests/fixtures') {
    this.fs = new MemfsTestFileSystem();
    this.builder = new ProjectBuilder(this.fs);
    this.fixturesDir = fixturesDir;

    // Initialize fixtures
    this.fixtures = {
      load: async (fixtureName: string): Promise<void> => {
        const fixturePath = path.join(process.cwd(), this.fixturesDir, `${fixtureName}.json`);
        const fixtureContent = await fs.readFile(fixturePath, 'utf-8');
        const fixture = JSON.parse(fixtureContent);
        await this.fs.loadFixture(fixture);
      }
    };

    // Initialize snapshot
    this.snapshot = {
      takeSnapshot: async (): Promise<Map<string, string>> => {
        const snapshot = new Map<string, string>();
        const files = await this.fs.getAllFiles();
        
        console.log('Taking snapshot, files:', files);
        
        for (const filePath of files) {
          const content = await this.fs.readFile(filePath);
          // Convert absolute path to relative path by removing the workspace prefix
          const relativePath = filePath.replace(/^.*?\/project\//, 'project/');
          snapshot.set(relativePath, content);
        }
        
        console.log('Snapshot contents:', Object.fromEntries(snapshot));
        return snapshot;
      },

      compare: (before: Map<string, string>, after: Map<string, string>): SnapshotDiff => {
        console.log('Comparing snapshots:');
        console.log('Before:', Object.fromEntries(before));
        console.log('After:', Object.fromEntries(after));
        
        const diff: SnapshotDiff = {
          added: [],
          removed: [],
          modified: []
        };

        // Find added and modified files
        for (const [path, content] of after) {
          if (!before.has(path)) {
            diff.added.push(path);
          } else if (before.get(path) !== content) {
            diff.modified.push(path);
          }
        }

        // Find removed files
        for (const path of before.keys()) {
          if (!after.has(path)) {
            diff.removed.push(path);
          }
        }

        console.log('Diff:', diff);
        return diff;
      }
    };

    this.factory = testFactories;
    this.parserService = new ParserService();
  }

  /**
   * Initialize the test context
   */
  async initialize(): Promise<void> {
    this.fs.initialize();
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.fs.cleanup();
  }

  /**
   * Write a file to the test filesystem
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.fs.getPath(relativePath);
    this.fs.writeFile(fullPath, content);
  }

  /**
   * Parse meld content using meld-ast
   */
  parseMeld(content: string) {
    return this.parserService.parse(content);
  }

  parseMeldWithLocations(content: string, filePath?: string) {
    return this.parserService.parseWithLocations(content, filePath);
  }

  /**
   * Convert content to XML using llmxml
   */
  convertToXml(content: string) {
    return convertToXml(content);
  }

  /**
   * Create a basic test project structure
   */
  async createBasicProject(): Promise<void> {
    await this.builder.createBasicProject();
  }

  /**
   * Take a snapshot of the current filesystem state
   */
  takeSnapshot(dir?: string) {
    return this.snapshot.takeSnapshot();
  }

  /**
   * Compare two filesystem snapshots
   */
  compareSnapshots(before: Map<string, string>, after: Map<string, string>) {
    return this.snapshot.compare(before, after);
  }
} 