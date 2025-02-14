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
IV. PATH HANDLING TESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1) Testing Path Resolution Flow
─────────────────────────────────────────────────────────────────────────
The path resolution flow involves multiple services working together:
1. meld-ast parses raw paths with variables
2. ResolutionService resolves ALL variables (including path variables)
3. PathService validates & normalizes resolved paths
4. FileSystemService handles actual I/O

Example test for this flow:
```typescript
describe('Path Resolution Flow', () => {
  let context: TestContext;
  let resolutionService: ResolutionService;
  let pathService: PathService;

  beforeEach(() => {
    context = new TestContext();
    context.initialize();
    
    // Setup test project structure
    context.builder.create({
      files: {
        'project/docs/example.md': 'content',
        'project/config.meld': '@path docs = $PROJECTPATH/docs'
      }
    });

    resolutionService = new ResolutionService(/* deps */);
    pathService = new PathService(/* deps */);
  });

  it('resolves and validates path with variables', async () => {
    // 1. Parse raw path with meld-ast
    const ast = context.parseMeld('@import $PROJECTPATH/${docs}/example.md');
    
    // 2. Resolve variables with ResolutionService
    const resolvedPath = await resolutionService.resolvePath(
      ast.directives[0].source,
      ResolutionContextFactory.forPathDirective()
    );
    
    // 3. Validate & normalize with PathService
    const validatedPath = await pathService.validatePath(resolvedPath);
    const normalizedPath = await pathService.normalizePath(validatedPath);
    
    // 4. Verify final path
    expect(normalizedPath).toBe('/absolute/path/to/project/docs/example.md');
  });
});
```

2) Testing PathService in Isolation
─────────────────────────────────────────────────────────────────────────
PathService tests should focus on:
• Path validation (security rules)
• Path normalization across platforms
• Test mode overrides

Example:
```typescript
describe('PathService', () => {
  let pathService: PathService;

  beforeEach(() => {
    pathService = new PathService(/* deps */);
  });

  describe('validatePath', () => {
    it('accepts valid absolute paths', async () => {
      const path = '/absolute/path/to/file.md';
      await expect(pathService.validatePath(path)).resolves.toBe(path);
    });

    it('rejects paths with suspicious patterns', async () => {
      const paths = [
        '/path/with/../escape',
        'relative/path',
        '/path/with/suspicious/../../escape'
      ];
      
      for (const path of paths) {
        await expect(pathService.validatePath(path)).rejects.toThrow();
      }
    });
  });

  describe('normalizePath', () => {
    it('normalizes paths consistently across platforms', async () => {
      const paths = {
        'C:\\Windows\\Path': '/c/Windows/Path',
        '/unix/style/path': '/unix/style/path',
        'mixed/style\\path': '/mixed/style/path'
      };
      
      for (const [input, expected] of Object.entries(paths)) {
        const result = await pathService.normalizePath(input);
        expect(result).toBe(expected);
      }
    });
  });
});
```

3) Testing ResolutionService Path Handling
─────────────────────────────────────────────────────────────────────────
ResolutionService tests should focus on:
• Resolution of path variables
• Resolution of special variables ($HOMEPATH/$~, $PROJECTPATH/$)
• Resolution of nested variables in paths

Example:
```typescript
describe('ResolutionService Path Handling', () => {
  let resolutionService: ResolutionService;

  beforeEach(() => {
    resolutionService = new ResolutionService(/* deps */);
  });

  it('resolves path variables with special variables', async () => {
    const context = ResolutionContextFactory.forPathDirective({
      projectPath: '/project',
      homePath: '/home/user'
    });

    const cases = [
      {
        input: '$PROJECTPATH/docs/file.md',
        expected: '/project/docs/file.md'
      },
      {
        input: '$HOMEPATH/meld/config.md',
        expected: '/home/user/meld/config.md'
      },
      {
        input: '$~/meld/config.md',
        expected: '/home/user/meld/config.md'
      }
    ];

    for (const { input, expected } of cases) {
      const result = await resolutionService.resolvePath(input, context);
      expect(result).toBe(expected);
    }
  });

  it('resolves nested variables in paths', async () => {
    const context = ResolutionContextFactory.forPathDirective({
      variables: {
        'docs': '$PROJECTPATH/documentation',
        'config': '${docs}/config'
      },
      projectPath: '/project'
    });

    const result = await resolutionService.resolvePath(
      '${config}/settings.md',
      context
    );
    
    expect(result).toBe('/project/documentation/config/settings.md');
  });
});
```

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