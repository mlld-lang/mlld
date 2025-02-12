# Testing Architecture

Below is a focused design for the Meld testing architecture that leverages core libraries (meld-ast, llmxml) and follows best practices for file system mocking. This approach ensures consistent, reliable tests across the entire codebase.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I. DIRECTORY STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

tests/
 ├─ unit/
 │   ├─ PathService.test.ts
 │   ├─ FileSystemService.test.ts
 │   ├─ StateService.test.ts
 │   ├─ DirectiveService/
 │   │   ├─ TextDirectiveHandler.test.ts
 │   │   ├─ DataDirectiveHandler.test.ts
 │   │   ├─ ImportDirectiveHandler.test.ts
 │   │   └─ ...
 │   └─ ...
 ├─ integration/
 │   ├─ interpreter/
 │   │   ├─ interpretSimple.test.ts
 │   │   ├─ interpretEmbed.test.ts
 │   │   ├─ interpretImport.test.ts
 │   │   └─ ...
 │   ├─ sdk/
 │   │   ├─ runMeldBasics.test.ts
 │   │   ├─ runMeldComplex.test.ts
 │   │   └─ ...
 │   └─ ...
 ├─ fixtures/
 │   ├─ basicProject.json
 │   ├─ complexEmbed.json
 │   └─ ...
 └─ utils/
     ├─ index.ts                 # Re-exports below classes for convenience
     ├─ TestContext.ts           # Main test context API
     ├─ MemfsTestFileSystem.ts   # In-memory FS with memfs
     ├─ ProjectBuilder.ts        # Creates files & dirs from a simple object
     ├─ TestSnapshot.ts          # Snapshot & diff utilities
     ├─ PathUtils.ts             # Minimal path helper if needed
     ├─ FixtureManager.ts        # Load & store JSON-based project fixtures
     ├─ matchers.ts              # (Optional) Custom Vitest matchers
     └─ ...

With this arrangement:
• /unit focuses on direct, isolated service tests
• /integration focuses on multi-step flows
• /fixtures holds static JSON (or YAML) descriptions of file structures
• /utils houses all the reusable test utilities

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
II. CORE UTILITIES & THEIR RESPONSIBILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1) TestContext
─────────────────────────────────────────────────────────────────────────
• Main entry point for all tests
• Provides access to meld-ast for parsing
• Provides access to llmxml for XML conversions
• Manages MemFS and other test utilities

Example (TestContext.ts):
--------------------------------------------------------------------------------
import { parse as meldAstParse } from 'meld-ast';
import { convertToXml } from 'llmxml';
import { MemfsTestFileSystem } from './MemfsTestFileSystem';
import { ProjectBuilder } from './ProjectBuilder';
import { TestSnapshot } from './TestSnapshot';
import { FixtureManager } from './FixtureManager';

export class TestContext {
  public fs: MemfsTestFileSystem;
  public builder: ProjectBuilder;
  public snapshot: TestSnapshot;
  public fixtures: FixtureManager;

  constructor(private fixturesDir: string = 'tests/fixtures') {
    this.fs = new MemfsTestFileSystem();
    this.builder = new ProjectBuilder(this.fs);
    this.snapshot = new TestSnapshot(this.fs);
    this.fixtures = new FixtureManager(this.builder, this.fixturesDir);
  }

  initialize(): void {
    this.fs.initialize();
  }

  cleanup(): void {
    this.fs.cleanup();
  }

  // Parse using meld-ast
  parseMeld(content: string) {
    return meldAstParse(content);
  }

  // Convert to XML using llmxml
  convertToXml(content: string) {
    return convertToXml(content);
  }
}
--------------------------------------------------------------------------------

2) MemfsTestFileSystem
─────────────────────────────────────────────────────────────────────────
• Underlying in-memory file system using memfs
• Responsible for reading/writing files, verifying existence
• Never forces the test to handle real paths
• Enforces no "../" or raw path manipulation in test code

Example (MemfsTestFileSystem.ts):
--------------------------------------------------------------------------------
import { Volume } from 'memfs';

export class MemfsTestFileSystem {
  private vol: Volume;

  constructor() {
    this.vol = new Volume();
  }

  initialize(): void {
    this.vol.reset();
  }

  writeFile(filePath: string, content: string): void {
    this.ensureFileParentDirs(filePath);
    this.vol.writeFileSync(filePath, content, 'utf-8');
  }

  readFile(filePath: string): string {
    return this.vol.readFileSync(filePath, 'utf-8') as string;
  }

  exists(filePath: string): boolean {
    return this.vol.existsSync(filePath);
  }

  private ensureFileParentDirs(filePath: string) {
    // Create parent dirs if needed
  }
}
--------------------------------------------------------------------------------

3) ProjectBuilder
─────────────────────────────────────────────────────────────────────────
• A higher-level builder that creates an entire "fake project" by calling MemfsTestFileSystem behind the scenes.  
• Accepts a data structure like { files: { "some.meld": "...", "dir/sub.meld": "..." }, dirs?: [...] }  
• Auto-creates parent directories.  
• Supports advanced patterns if needed (like placeholders for $PROJECTPATH or $HOMEPATH expansions).

Example (ProjectBuilder.ts):
--------------------------------------------------------------------------------
export interface ProjectStructure {
  files: Record<string, string>;
  dirs?: string[];
}

export class ProjectBuilder {
  constructor(private fs: MemfsTestFileSystem) {}

  async create(struct: ProjectStructure): Promise<void> {
    // Create dirs first
    for (const dir of struct.dirs || []) {
      if (!this.fs.exists(dir)) {
        // We rely on fs to create recursively
        this.fs.writeFile(dir + '/.keep', '');
      }
    }
    // Create files
    for (const [path, content] of Object.entries(struct.files)) {
      this.fs.writeFile(path, content);
    }
  }
}
--------------------------------------------------------------------------------

4) TestSnapshot
─────────────────────────────────────────────────────────────────────────
• Utility to snapshot the current file system state (just a map of filePath → content).  
• Later we compare to see which files changed, were added, or removed.

Example (TestSnapshot.ts):
--------------------------------------------------------------------------------
export class TestSnapshot {
  constructor(private fs: MemfsTestFileSystem) {}

  takeSnapshot(): Map<string, string> {
    // For each file in the volume, read the content
    // Return as a map
  }

  compare(before: Map<string, string>, after: Map<string, string>) {
    const result = { added: [] as string[], removed: [] as string[], modified: [] as string[] };
    // ...
    return result;
  }
}
--------------------------------------------------------------------------------

5) FixtureManager
─────────────────────────────────────────────────────────────────────────
• Loads a JSON fixture that describes files & dirs, then calls ProjectBuilder to create them.  
• This allows tests to simply do fixtureManager.load("basicProject").

Example (FixtureManager.ts):
--------------------------------------------------------------------------------
import { ProjectBuilder } from './ProjectBuilder';
import * as path from 'path';
import * as fs from 'fs';

export class FixtureManager {
  constructor(private builder: ProjectBuilder, private fixturesDir: string) {}

  load(fixtureName: string): void {
    const filePath = path.join(this.fixturesDir, fixtureName + '.json');
    if (!fs.existsSync(filePath)) {
      throw new Error(`Fixture not found: ${fixtureName}`);
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    this.builder.create(data);
  }
}
--------------------------------------------------------------------------------

6) PathUtils (Optional)
─────────────────────────────────────────────────────────────────────────
• If we want to avoid any path string manipulation in test code, we might store standard keys for "project root" or "home root" in the Memfs.  
• Usually the approach is: we treat "project/" or "home/" as symbolic top-level dirs in the memfs.  
• E.g. context.fs.writeFile("project/test.meld", "...").

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
III. EXAMPLE TEST CODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Here's how a directive test might look using these utilities:

tests/unit/DirectiveService/TextDirectiveHandler.test.ts:
--------------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '../../utils/TestContext';

describe('TextDirectiveHandler', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    context.initialize();
  });

  afterEach(() => {
    context.cleanup();
  });

  it('processes a text directive', async () => {
    // Setup test files
    await context.builder.create({
      files: {
        'test.meld': '@text greeting = "Hello"'
      }
    });

    // Read and parse with meld-ast
    const content = context.fs.readFile('test.meld');
    const ast = context.parseMeld(content);

    // Process the directive
    const result = await processDirective(ast[0]);

    // Verify result
    expect(result).toBeDefined();
  });
});
--------------------------------------------------------------------------------

Integration test example:

--------------------------------------------------------------------------------
describe('Interpreter - @embed directive (integration)', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    context.initialize();
  });

  afterEach(() => {
    context.cleanup();
  });

  it('embeds content from an external file', async () => {
    // Setup
    await context.builder.create({
      files: {
        'doc.meld': '@embed [other.meld # Section One]',
        'other.meld': `
          # Section One
          Some embedded content
        `
      }
    });

    // Act - this will use meld-ast for parsing and llmxml for section extraction
    const result = await runMeld('doc.meld');

    // Assert: result should contain the embedded content
    expect(result).toContain('Some embedded content');
  });
});
--------------------------------------------------------------------------------

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IV. BEST PRACTICES & PATTERNS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Always Use Core Libraries
─────────────────────────────────────────────────────────────────────────
• Use meld-ast for all parsing in tests
• Use llmxml for XML/section extraction
• Never implement custom parsing logic

2. Consistent File System Mocking
─────────────────────────────────────────────────────────────────────────
• Always use MemfsTestFileSystem via TestContext
• Never manipulate real files in tests
• Use ProjectBuilder for file setup

3. Clear Separation of Unit vs Integration
─────────────────────────────────────────────────────────────────────────
• Unit tests focus on single service/component
• Integration tests verify full pipeline
• Use appropriate mocking level for each

4. Named Fixtures For Reusability
─────────────────────────────────────────────────────────────────────────
• Store common test scenarios in fixtures/
• Use JSON format for clarity
• Example:

  {
    "dirs": ["project", "home"],
    "files": {
      "project/fileA.meld": "@text a = 'A'",
      "home/config/foo.meld": "..."
    }
  }

5. Snapshot Testing For Complex Flows
─────────────────────────────────────────────────────────────────────────
• Use TestSnapshot to capture FS state
• Compare before/after states
• Example:

--------------------------------------------------------------------------------
it('creates an output file', async () => {
  const before = context.snapshot.takeSnapshot();
  await runMeld('project/source.meld');
  const after = context.snapshot.takeSnapshot();
  const diff = context.snapshot.compare(before, after);
  expect(diff.added).toContain('project/output.md');
});
--------------------------------------------------------------------------------

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
V. CONCLUSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

By following this testing architecture:

1. We leverage core libraries (meld-ast, llmxml) instead of custom implementations
2. We maintain consistent file system mocking across all tests
3. We keep tests focused on business logic rather than implementation details
4. We provide clear patterns for both unit and integration testing
5. We ensure maintainable, reliable test suites

This approach gives us a robust, well-organized test environment that aligns with SOLID principles and the core Meld libraries.