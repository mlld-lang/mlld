# PathService and FileSystemService 

Below is a focused design for the PathService and FileSystemService that aligns with meld-spec's path handling requirements. These services handle path validation, normalization and file I/O while working in conjunction with the ResolutionService.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I. OVERVIEW & GOALS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Provide a single, well-defined PathService that:
   • Works with ALREADY RESOLVED paths from ResolutionService
   • Validates paths meet security requirements
   • Normalizes paths (POSIX, Windows) without custom parsing
   • Supports "test mode" overrides for in-memory tests
   • Exposes minimal, intuitive methods (e.g., validatePath, normalizePath)

2. Provide a single, well-defined FileSystemService that:
   • Abstracts reading, writing, existence checks, and directory creation
   • Distinguishes production usage (real disk) from test usage (in-memory FS)
   • Surfaces all file-based errors as typed MeldErrors
   • Is extremely easy to mock in directive tests

3. Arrange them in separate folders, each with a dedicated test file and supporting interface(s)

4. Ensure they are designed to be used by directive handlers (e.g., ImportDirectiveHandler, EmbedDirectiveHandler) without leaking internal complexities

5. Focus purely on path validation and file I/O:
   • Variable resolution is handled by ResolutionService
   • Section extraction is handled by llmxml
   • Fuzzy matching is handled by llmxml
   • Circular reference detection is handled by CircularityService

6. Align with the test architecture:
   • Use in-memory or mock FS in unit tests
   • Keep test code free of "string path manipulations"
   • Rely on TestContext / ProjectBuilder approach

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
II. FOLDER STRUCTURE & FILE LAYOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Following the services-based architecture:

services/
 ├─ PathService/
 │   ├─ PathService.ts           # Main service implementation
 │   ├─ PathService.test.ts      # Tests next to implementation
 │   ├─ IPathService.ts          # Service interface
 │   └─ errors/
 │       ├─ PathError.ts         # Path-specific errors
 │       └─ PathError.test.ts    # Error tests
 └─ FileSystemService/
     ├─ FileSystemService.ts     # Main service implementation
     ├─ FileSystemService.test.ts # Tests next to implementation
     ├─ IFileSystemService.ts    # Service interface
     ├─ adapters/               # Filesystem adapters
     │   ├─ RealFSAdapter.ts    # Production filesystem
     │   ├─ MemFSAdapter.ts     # In-memory filesystem for tests
     │   ├─ RealFSAdapter.test.ts
     │   └─ MemFSAdapter.test.ts
     └─ errors/
         ├─ FSError.ts          # Filesystem-specific errors
         └─ FSError.test.ts     # Error tests

Tests may live under tests/unit/PathService.test.ts if you prefer a single "unit" folder. The layout above just clarifies each service's tests are placed alongside it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
III. PATHSERVICE DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A. RESPONSIBILITY & SCOPE

• Validate resolved paths meet security requirements
• Normalize paths across Windows/POSIX boundaries
• Provide test overrides for in-memory testing
• Throw typed errors (e.g., MeldPathError) for invalid usage
• Expose a minimal public interface:

--------------------------------------------------------------------------------
export interface IPathService {
  // Core path validation
  validatePath(resolvedPath: string, options?: PathOptions): Promise<void>;
  normalizePath(resolvedPath: string): string;
  
  // Platform-specific operations
  join(...resolvedPaths: string[]): string;
  dirname(resolvedPath: string): string;
  basename(resolvedPath: string): string;
  
  // Test mode
  enableTestMode(): void;
  disableTestMode(): void;
  isTestMode(): boolean;
}

export interface PathOptions {
  baseDir?: string;              // Base directory for relative paths
  allowOutsideBaseDir?: boolean; // Allow paths outside base directory
  mustExist?: boolean;           // Path must exist
  mustBeDirectory?: boolean;     // Path must be a directory
  mustBeFile?: boolean;          // Path must be a file
}
--------------------------------------------------------------------------------

B. INTERNAL WORKFLOW ILLUSTRATION (ASCII)

When a directive calls PathService after ResolutionService has resolved variables:

     (1) Input: "/usr/myproject/foo/bar.meld" (already resolved by ResolutionService)
         └─ Possibly in test mode => validate against test filesystem
     (2) Validate security requirements (no "..", within allowed roots)
     (3) Normalize for platform => final "/usr/myproject/foo/bar.meld"
     (4) Return normalized path or throw validation error

C. SAMPLE CODE SKETCH (PathService.ts)
Below is a rough partial example for clarity:

--------------------------------------------------------------------------------
import { MeldPathError } from '../../core/errors/MeldError';

export class PathService implements IPathService {
  private testMode: boolean = false;
  private fileSystem: IFileSystemService;

  constructor(fileSystem: IFileSystemService) {
    this.fileSystem = fileSystem;
  }

  enableTestMode(): void {
    this.testMode = true;
  }

  disableTestMode(): void {
    this.testMode = false;
  }

  async validatePath(resolvedPath: string, options?: PathOptions): Promise<void> {
    if (!resolvedPath) {
      throw new MeldPathError('Cannot validate empty path');
    }

    // Validate security requirements
    if (resolvedPath.includes('..')) {
      throw new MeldPathError('Path contains forbidden navigation');
    }

    // Check existence if required
    if (options?.mustExist) {
      const exists = await this.fileSystem.exists(resolvedPath);
      if (!exists) {
        throw new MeldPathError(`Path does not exist: ${resolvedPath}`);
      }
    }

    // Additional validation based on options...
  }

  normalizePath(resolvedPath: string): string {
    // Platform-specific normalization
    return path.normalize(resolvedPath);
  }

  // ... implement other interface methods
}
--------------------------------------------------------------------------------

D. HOW DIRECTIVES USE IT

Example: In an ImportDirectiveHandler:

--------------------------------------------------------------------------------
// inside ImportDirectiveHandler
const resolvedPath = await resolutionService.resolvePath(directive.source);
await pathService.validatePath(resolvedPath);
const normalizedPath = pathService.normalizePath(resolvedPath);
const fileExists = await fileSystemService.exists(normalizedPath);
if (!fileExists) {
  throw new MeldImportError(`File does not exist: ${directive.source}`);
}
--------------------------------------------------------------------------------

E. TESTING STRATEGY

1. **Unit Tests** (PathService.test.ts):
   - Test path validation rules
   - Test normalization across platforms
   - Test testMode toggling
   - Validate security constraints
2. **No real disk**: We do not rely on actual OS paths
3. **Integration Tests**: The PathService is indirectly tested in directive tests

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IV. FILESYSTEMSERVICE DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A. RESPONSIBILITY & SCOPE

• Single place to handle actual readFile, writeFile, directory creation, file existence checks
• Decouple "real disk I/O" from the rest of the code
• In production, use Node.js fs module. In tests, use Memfs
• If a read fails, throw a typed MeldError (like MeldFileSystemError)
• Note: Section extraction and fuzzy matching are NOT handled here - use llmxml for those

B. INTERFACE

--------------------------------------------------------------------------------
export interface IFileSystemService {
  // File operations
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<Stats>;
  
  // Directory operations
  readDir(path: string): Promise<string[]>;
  ensureDir(path: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
  
  // Path operations
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  
  // Test mode
  enableTestMode(): void;
  disableTestMode(): void;
  isTestMode(): boolean;
  
  // Mock file system (for testing)
  mockFile(path: string, content: string): void;
  mockDir(path: string): void;
  clearMocks(): void;
}
--------------------------------------------------------------------------------

C. ASCII DIAGRAM

When a directive (like ImportDirective) needs to read "/memfs/proj/sub/fileA.meld":

   directive   -> FileSystemService.readFile("/memfs/proj/sub/fileA.meld")
                  └─ if in test => memfsVol.readFileSync ...
                        else => real fs.promises.readFile

If readFile fails => service wraps raw error => MeldFileSystemError.

D. IMPLEMENTATION DETAILS

1) We use an adapter pattern with two implementations:  
   • RealFSAdapter: uses Node's fs-extra for production
   • MemFSAdapter: uses in-memory Map for testing

2) Example implementation (FileSystemService.ts):

--------------------------------------------------------------------------------
import { IFileSystemService } from './IFileSystemService';
import { FSError } from './errors/FSError';
import { IFSAdapter } from './adapters/IFSAdapter';
import { RealFSAdapter } from './adapters/RealFSAdapter';
import { MemFSAdapter } from './adapters/MemFSAdapter';

export class FileSystemService implements IFileSystemService {
  private adapter: IFSAdapter;
  private testMode = false;

  constructor() {
    this.adapter = new RealFSAdapter();
  }

  enableTestMode(): void {
    this.testMode = true;
    this.adapter = new MemFSAdapter();
  }

  disableTestMode(): void {
    this.testMode = false;
    this.adapter = new RealFSAdapter();
  }

  isTestMode(): boolean {
    return this.testMode;
  }

  async readFile(path: string): Promise<string> {
    try {
      return await this.adapter.readFile(path);
    } catch (error) {
      throw new FSError('Failed to read file', {
        path,
        code: 'READ_ERROR',
        cause: error
      });
    }
  }

  // ... implement other interface methods ...

  mockFile(path: string, content: string): void {
    if (!this.testMode) {
      throw new Error('Cannot mock files outside of test mode');
    }
    if (this.adapter instanceof MemFSAdapter) {
      this.adapter.mockFile(path, content);
    }
  }

  mockDir(path: string): void {
    if (!this.testMode) {
      throw new Error('Cannot mock directories outside of test mode');
    }
    if (this.adapter instanceof MemFSAdapter) {
      this.adapter.mockDir(path);
    }
  }

  clearMocks(): void {
    if (this.adapter instanceof MemFSAdapter) {
      this.adapter.clear();
    }
  }
}
--------------------------------------------------------------------------------

E. HOW DIRECTIVES USE IT

Example: ImportDirectiveHandler:

--------------------------------------------------------------------------------
const resolved = await pathService.resolvePath(node.directive.sourcePath);
if (!await fileSystemService.exists(resolved)) {
  throw new MeldImportError(`File not found: ${resolved}`);
}
const content = await fileSystemService.readFile(resolved);
--------------------------------------------------------------------------------

F. TESTING STRATEGY

1) **Unit Tests** (FileSystemService.test.ts):
   - Provide a mock or Memfs adapter.  
   - Test read/write success, ensuring correct errors on missing files.  
   - Validate ensureDir logic (creating parent directories, etc.).  

2) **Integration**:
   - Indirect coverage in the directive tests.  
   - Possibly test real disk usage in a small E2E scenario if needed, but usually the memfs approach is enough.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
V. HOW DIRECTIVES WILL USE THESE SERVICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Example flow:*

1) The interpreter sees a node: "@import [somePath]".  
2) The ImportDirectiveHandler calls:  
   (a) pathService.resolvePath(directive.source).  
   (b) fileSystemService.readFile(resolved).  
   (c) parse/interpret that file if needed.  

Similarly, "@embed [myDoc.md]" calls the same pattern.

Below is an ASCII diagram:

         +----------------------+
         | @import directive   |
         +----------------------+
            |
            v
   +─────────────────────────────+
   |  ImportDirectiveHandler    |
   +─────────────────────────────+
       |  (calls)          \
       |                    \
       | pathService.resolvePath(directive.source)
       |                    \
       |  (returns) "/memfs/proj/some.meld"
       |
       +-> fileSystemService.readFile("/memfs/proj/some.meld")
            (In test mode => in-memory)
            (In prod => real fs)

That's it. No fiddling with raw path strings in the directive code.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VI. TESTING STRATEGY DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A. UNIT TESTS FOR PATHSERVICE
─────────────────────────────────────────────────────────────────────────
1) pathService.resolvePath("$PROJECTPATH/foo.meld") => "/my/project/foo.meld" (prod) or "/memfs/proj/foo.meld" (test).  
2) pathService.resolvePath("$HOMEPATH/some/thing") => "/home/user/some/thing" or "/memfs/home/some/thing".  
3) pathService.resolvePath("") => throws MeldPathError.  
4) pathService.resolvePath("../") => throws MeldPathError.  
5) pathService.enableTestMode(...) => subsequent calls reflect new overrides.

We'll use a local test suite. If we adopt the new test approach, we might have:

--------------------------------------------------------------------------------
describe('PathService (unit)', () => {
  let service: PathService;

  beforeEach(() => {
    service = new PathService();
  });

  it('resolves project path in real mode', async () => {
    service.setProjectPath('/real/project');
    const resolved = await service.resolvePath('$PROJECTPATH/file.txt');
    expect(resolved).toBe('/real/project/file.txt');
  });

  it('blocks ".." references', async () => {
    await expect(service.resolvePath('$PROJECTPATH/../etc/passwd'))
      .rejects.toThrow('Relative navigation');
  });
});
--------------------------------------------------------------------------------

B. UNIT TESTS FOR FILESYSTEMSERVICE
─────────────────────────────────────────────────────────────────────────
We pass a mock or in-memory FsAdapter:

--------------------------------------------------------------------------------
describe('FileSystemService (unit)', () => {
  let memfsAdapter: IFileSystemAdapter;
  let service: FileSystemService;

  beforeEach(() => {
    memfsAdapter = new InMemoryFsAdapter();
    service = new FileSystemService(memfsAdapter);
  });

  it('reads and writes files in memory', async () => {
    await service.writeFile('/proj/test.meld', 'content123');
    const content = await service.readFile('/proj/test.meld');
    expect(content).toBe('content123');
  });

  it('throws MeldFileSystemError if read fails', async () => {
    await expect(service.readFile('/missing.meld'))
      .rejects.toThrow('Failed to read file');
  });
});
--------------------------------------------------------------------------------

C. INTEGRATION TESTS
─────────────────────────────────────────────────────────────────────────
In higher-level directive tests (like import.test.ts or embed.test.ts), we set both PathService and FileSystemService to use an in-memory approach. The ImportDirectiveHandler can call them as if it's a real FS. This ensures no real disk usage, consistent with our overall test strategy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VII. EXAMPLE CODE USAGE IN A DIRECTIVE (INTEGRATION TEST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Let's imagine a small "ImportDirectiveHandler.test.ts":

--------------------------------------------------------------------------------
import { describe, it, expect, beforeEach } from 'vitest';
import { TestContext } from '../../../tests/utils/TestContext';
import { PathService } from '../../PathService/PathService';
import { FileSystemService } from '../../FileSystemService/FileSystemService';
import { InMemoryFsAdapter } from '../../FileSystemService/InMemoryFsAdapter';
import { ImportDirectiveHandler } from '../ImportDirectiveHandler';

describe('ImportDirectiveHandler (integration)', () => {
  let pathService: PathService;
  let fileSystemService: FileSystemService;
  let handler: ImportDirectiveHandler;

  beforeEach(() => {
    pathService = new PathService();
    pathService.enableTestMode('/memfs/home', '/memfs/proj');
    const memfsAdapter = new InMemoryFsAdapter();
    fileSystemService = new FileSystemService(memfsAdapter);

    // We might pass these to the ImportDirectiveHandler
    handler = new ImportDirectiveHandler(pathService, fileSystemService /*, ...*/);
  });

  it('imports content from a .meld file', async () => {
    // Put the file in memfs
    await fileSystemService.writeFile('/memfs/proj/sub/fileA.meld', '@text varA = "Hello"');

    // Run the directive
    // In real usage: directive node => handler.handle(...)
    await handler.handle({
      // Minimal directive node
      type: 'Directive',
      directive: {
        kind: 'import',
        source: '$PROJECTPATH/sub/fileA.meld'
      }
    } as any, /* state, context, etc. */);

    // Expect the state or side effects
    // ...
    expect(true).toBe(true);
  });
});
--------------------------------------------------------------------------------

No raw path manipulation in the test, no real disk usage. We just see "/memfs/proj" appear. That is entirely internal to the PathService + FileSystemService synergy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VIII. ASCII SUMMARY "HOW EVERYTHING FITS"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Below is a final ASCII summary of how it all lines up in our architecture:

                          (Directive Node)
                              |
                              v
   ┌─────────────────────────────────────────┐
   │   ImportDirectiveHandler.handle(...)   │
   └─────────────────────────────────────────┘
                 | 1) calls
                 |
   ┌───────────────────────────┐
   │   PathService.resolvePath │ <-- "$PROJECTPATH/sub/fileA.meld"
   └───────────────────────────┘
                 | 2) returns "/memfs/proj/sub/fileA.meld"
                 |
   ┌────────────────────────────────┐
   │ FileSystemService.readFile(...)│ <-- "/memfs/proj/sub/fileA.meld"
   └────────────────────────────────┘
          | 3) uses InMemoryFsAdapter or RealFsAdapter
          ▼
      (File content loaded)

Then the directive does further processing (like parse, interpret). The user sees no path manipulations in the test.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IX. CONCLUSION & NEXT STEPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1) We keep PathService specialized and testable, using meld-spec's PathVariable type
2) We keep FileSystemService minimal, focusing only on file I/O
3) We rely on llmxml for section extraction and fuzzy matching
4) We ensure 100% coverage via:
   • Unit tests for each service
   • Integration tests that prove synergy
5) We adopt the TestContext + MemfsTestFileSystem approach

This yields a thoroughly SOLID & maintainable approach, letting us rewrite any directive with confidence, minimal complexity, and a robust path/FS abstraction we can easily test.

By following this plan, the Meld codebase gains clarity, easier test coverage, and compliance with the Meld grammar and core libraries. We avoid "spaghetti" path logic in each directive; instead, they just do:

--------------------------------------------------------------------------------
const resolved = await pathService.resolvePath(directive.path);
await fileSystemService.exists(resolved);
--------------------------------------------------------------------------------

…and the rest is well-handled by these dedicated services and llmxml. This is a direct expression of the principle "High-level modules should not depend on low-level modules; both should depend on abstractions," as well as the single-responsibility principle.
