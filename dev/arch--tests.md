# Testing Architecture

Below is a focused design for the Meld testing architecture that leverages core libraries (meld-ast, llmxml) and follows best practices for file system mocking. This approach ensures consistent, reliable tests across the entire codebase.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I. DIRECTORY STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Tests should be organized next to the code they test.
- System-wide integration tests go in `tests/integration`
- Tests should generally be named `*.test.ts`
- Integration tests for services should be named `*.integration.test.ts` and in these cases, the unit test should be named `*.unit.test.ts`
- Test fixtures go in `tests/fixtures`
- Mocks go in `tests/mocks` 

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
IV. LOCATION HANDLING IN TESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1) Core Location Types
─────────────────────────────────────────────────────────────────────────
We use a consistent type system for handling locations across the codebase:

```typescript
// core/types/index.ts
export interface Position {
  line: number;   // 1-based
  column: number; // 1-based
}

export interface Location {
  start: Position;
  end: Position;
  filePath?: string;
}
```

2) Test Factory Helpers
─────────────────────────────────────────────────────────────────────────
To ensure consistent location creation in tests:

```typescript
// tests/utils/testFactories.ts
export function createPosition(line: number, column: number): Position {
  return { line, column };
}

export function createLocation(
  startLine: number = 1,
  startColumn: number = 1,
  endLine?: number,
  endColumn?: number,
  filePath?: string
): Location {
  return {
    start: createPosition(startLine, startColumn),
    end: createPosition(endLine ?? startLine, endColumn ?? startColumn),
    filePath
  };
}
```

3) Location Handling in Tests
─────────────────────────────────────────────────────────────────────────
Example of testing location-aware parsing:

```typescript
describe('ParserService', () => {
  let parser: ParserService;
  let parseSpy: any;

  beforeEach(() => {
    parser = new ParserService();
    parseSpy = vi.spyOn(parser, 'parse');
  });

  it('should parse content with locations', async () => {
    const content = 'Hello world';
    const mockResult: MeldNode[] = [{
      type: 'Text',
      content: 'Hello world',
      location: createLocation(1, 1, 1, 11)
    }];

    parseSpy.mockResolvedValue(mockResult);
    const result = await parser.parse(content);
    
    expect(result[0].location).toMatchObject({
      start: { line: 1, column: 1 },
      end: { line: 1, column: 11 }
    });
  });

  it('should add filePath to locations', async () => {
    const content = '@text greeting = "Hi"';
    const location = createLocation(1, 1, 1, 20);
    const mockResult: MeldNode[] = [{
      type: 'Directive',
      directive: {
        kind: 'text',
        name: 'greeting',
        value: 'Hi'
      },
      location
    }];

    parseSpy.mockResolvedValue(mockResult);
    const result = await parser.parseWithLocations(content, 'test.meld');
    
    expect(result[0].location).toMatchObject({
      start: location.start,
      end: location.end,
      filePath: 'test.meld'
    });
  });
});
```

4) Error Location Handling
─────────────────────────────────────────────────────────────────────────
Example of testing location-aware errors:

```typescript
describe('error handling', () => {
  it('should include location in parse errors', async () => {
    const position = createPosition(1, 1);
    const error = new MeldParseError('Invalid syntax', position);

    expect(error.message).toBe('Parse error: Invalid syntax at line 1, column 1');
    expect(error.location).toMatchObject({
      start: position,
      end: position
    });
  });

  it('should preserve file paths in errors', async () => {
    const location = createLocation(1, 1, 1, 5, 'test.meld');
    const error = new MeldParseError('Invalid syntax', location);

    expect(error.message).toBe(
      'Parse error: Invalid syntax at line 1, column 1 in test.meld'
    );
    expect(error.location).toBe(location);
  });
});
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
V. PATH HANDLING IN TESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1) Testing Path Resolution
─────────────────────────────────────────────────────────────────────────
The path resolution flow now leverages meld-ast's built-in location tracking:

```typescript
describe('PathService', () => {
  let context: TestContext;
  let pathService: IPathService;

  beforeEach(() => {
    context = new TestContext();
    context.initialize();
    pathService = context.services.pathService;
  });

  afterEach(() => {
    context.cleanup();
  });

  it('resolves paths with location tracking', async () => {
    // Setup test files
    await context.builder.create({
      files: {
        'test.meld': '@import path/to/file.md'
      }
    });

    // Parse with location tracking
    const content = await context.fs.readFile('test.meld');
    const nodes = await context.parseMeldWithLocations(content, 'test.meld');
    const importNode = nodes[0];

    // Resolve path
    const resolvedPath = await pathService.resolvePath(importNode.directive.path);

    // Location should be preserved in any errors
    expect(resolvedPath).toContain('path/to/file.md');
  });

  it('handles path resolution errors with locations', async () => {
    const invalidPath = '../outside/root.md';
    const location = createLocation(1, 1, 1, 20, 'test.meld');

    await expect(
      pathService.resolvePath(invalidPath, { location })
    ).rejects.toMatchObject({
      message: expect.stringContaining('Invalid path'),
      location: expect.objectContaining({
        filePath: 'test.meld'
      })
    });
  });
});
```

2) Testing Path Validation
─────────────────────────────────────────────────────────────────────────
Path validation tests should focus on security and error handling:

```typescript
describe('path validation', () => {
  it('rejects paths with directory traversal', async () => {
    const paths = [
      '../outside.md',
      'subdir/../../../file.md',
      '/absolute/path/file.md'
    ];

    for (const path of paths) {
      const location = createLocation(1, 1, 1, path.length);
      await expect(
        pathService.resolvePath(path, { location })
      ).rejects.toMatchObject({
        message: expect.stringContaining('Invalid path'),
        location: expect.objectContaining({
          start: { line: 1, column: 1 }
        })
      });
    }
  });

  it('validates paths relative to base directory', async () => {
    await context.builder.create({
      files: {
        'base/file.md': 'content',
        'base/subdir/other.md': 'content'
      }
    });

    const validPaths = [
      'file.md',
      'subdir/other.md'
    ];

    for (const path of validPaths) {
      const resolved = await pathService.resolvePath(path, {
        baseDir: 'base'
      });
      expect(resolved).toContain(path);
    }
  });
});
```

3) Testing Path Resolution in Directives
─────────────────────────────────────────────────────────────────────────
When testing directives that use paths, leverage location tracking:

```typescript
describe('ImportDirectiveHandler', () => {
  it('handles import path errors with locations', async () => {
    const content = '@import ../invalid.md';
    const nodes = await context.parseMeldWithLocations(content, 'test.meld');
    
    await expect(
      directiveHandler.process(nodes[0])
    ).rejects.toMatchObject({
      message: expect.stringContaining('Invalid import path'),
      location: expect.objectContaining({
        filePath: 'test.meld',
        start: { line: 1, column: 1 }
      })
    });
  });

  it('resolves relative paths correctly', async () => {
    await context.builder.create({
      files: {
        'dir/main.meld': '@import ./sub/file.md',
        'dir/sub/file.md': 'Content'
      }
    });

    const content = await context.fs.readFile('dir/main.meld');
    const nodes = await context.parseMeldWithLocations(content, 'dir/main.meld');
    
    const result = await directiveHandler.process(nodes[0]);
    expect(result).toBeDefined();
  });
});
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VI. BEST PRACTICES FOR TEST ASSERTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1) Location Assertions
─────────────────────────────────────────────────────────────────────────
When testing locations, use these patterns:

```typescript
// For exact matches
expect(node.location).toMatchObject({
  start: { line: 1, column: 1 },
  end: { line: 1, column: 10 }
});

// For flexible matches (when exact positions don't matter)
expect(node.location?.start).toEqual(expect.objectContaining({
  line: expect.any(Number),
  column: expect.any(Number)
}));

// For file paths
expect(node.location?.filePath).toBe('test.meld');

// For error locations
expect(error).toMatchObject({
  message: expect.stringContaining('Invalid syntax'),
  location: {
    start: { line: 1, column: 1 },
    end: { line: 1, column: 1 }
  }
});
```

2) Async Error Assertions
─────────────────────────────────────────────────────────────────────────
When testing async functions that may throw errors:

```typescript
// For simple error type checks
await expect(parser.parse('')).rejects.toThrow(MeldParseError);

// For error message checks
await expect(parser.parse('')).rejects.toThrow(
  'Parse error: Empty content provided'
);

// For detailed error checks
await expect(parser.parse(content)).rejects.toMatchObject({
  message: expect.stringContaining('Invalid directive'),
  location: {
    start: { line: 1, column: 1 },
    end: { line: 1, column: 1 },
    filePath: 'test.meld'
  }
});
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VII. CONCLUSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

By following this testing architecture:

1. We leverage core libraries (meld-ast, llmxml) instead of custom implementations
2. We maintain consistent file system mocking across all tests
3. We keep tests focused on business logic rather than implementation details
4. We provide clear patterns for both unit and integration testing
5. We ensure maintainable, reliable test suites

This approach gives us a robust, well-organized test environment that aligns with SOLID principles and the core Meld libraries.