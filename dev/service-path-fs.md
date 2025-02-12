# PathService and FileSystemService 

Below is a focused design for the PathService and FileSystemService that aligns with meld-spec's path variable types and the Meld grammar. These services handle path resolution and file I/O while ensuring compatibility with the core Meld libraries.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I. OVERVIEW & GOALS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Provide a single, well-defined PathService that:
   • Resolves path variables using meld-spec's PathVariable type
   • Normalizes paths (POSIX, Windows) without custom parsing
   • Supports "test mode" overrides for in-memory tests
   • Exposes minimal, intuitive methods (e.g., resolvePath)

2. Provide a single, well-defined FileSystemService that:
   • Abstracts reading, writing, existence checks, and directory creation
   • Distinguishes production usage (real disk) from test usage (in-memory FS)
   • Surfaces all file-based errors as typed MeldErrors
   • Is extremely easy to mock in directive tests

3. Arrange them in separate folders, each with a dedicated test file and supporting interface(s)

4. Ensure they are designed to be used by directive handlers (e.g., ImportDirectiveHandler, EmbedDirectiveHandler) without leaking internal complexities

5. Focus purely on path resolution and file I/O:
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

Following the previously recommended architecture:

services/
 ├─ PathService/
 │   ├─ PathService.ts
 │   ├─ PathService.interfaces.ts     # optional for strongly typed interfaces
 │   └─ PathService.test.ts           # unit tests for all path logic
 └─ FileSystemService/
     ├─ FileSystemService.ts
     ├─ FileSystemService.interfaces.ts  # optional
     └─ FileSystemService.test.ts        # unit tests for file read/write etc

Tests may live under tests/unit/PathService.test.ts if you prefer a single "unit" folder. The layout above just clarifies each service's tests are placed alongside it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
III. PATHSERVICE DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A. RESPONSIBILITY & SCOPE

• Expand path variables using meld-spec's PathVariable type
• Normalize paths across Windows/POSIX boundaries
• Provide test overrides for in-memory testing
• Throw typed errors (e.g., MeldPathError) for invalid usage
• Expose a minimal public interface:

--------------------------------------------------------------------------------
import { PathVariable } from 'meld-spec';

export interface IPathService {
  enableTestMode(homePathOverride: string, projectPathOverride: string): void;
  disableTestMode(): void;

  setHomePath(actualHome: string): void;
  setProjectPath(actualProject: string): void;

  resolvePath(meldPath: string): Promise<string>;   // e.g. $PROJECTPATH/sub/file.txt -> /real/abs/path
  joinPaths(...parts: string[]): Promise<string>;
  isAbsolute(testPath: string): boolean;
}
--------------------------------------------------------------------------------

B. INTERNAL WORKFLOW ILLUSTRATION (ASCII)

When a directive calls PathService.resolvePath("$PROJECTPATH/foo/bar.meld"):

     (1) Input: "$PROJECTPATH/foo/bar.meld"
         └─ Possibly in test mode => override $PROJECTPATH to "/memfs/proj"
     (2) Expand special variables
         => "/memfs/proj/foo/bar.meld"  (or real "/usr/myproject/foo/bar.meld" in prod)
     (3) Validate no ".." or invalid segments => throw MeldPathError if so
     (4) Normalize => final "/memfs/proj/foo/bar.meld"
     (5) Return as string

C. SAMPLE CODE SKETCH (PathService.ts)
Below is a rough partial example for clarity:

--------------------------------------------------------------------------------
import { MeldPathError } from '../../core/errors/MeldError';

export class PathService implements IPathService {
  private testMode: boolean = false;
  private homePath: string = '/home/user';
  private projectPath: string = '/my/project';

  enableTestMode(homeOverride: string, projectOverride: string): void {
    this.testMode = true;
    this.homePath = homeOverride;
    this.projectPath = projectOverride;
  }
  disableTestMode(): void {
    this.testMode = false;
    // We might revert to some default or environment-based path
  }
  setHomePath(actualHome: string): void {
    this.homePath = actualHome;
  }
  setProjectPath(actualProject: string): void {
    this.projectPath = actualProject;
  }

  public async resolvePath(meldPath: string): Promise<string> {
    if (!meldPath) {
      throw new MeldPathError(`Cannot resolve empty path.`);
    }
    // 1) Expand special prefixes
    let expanded = this.expandSpecialPrefix(meldPath);

    // 2) Disallow ".." if we consider them security hazards
    if (expanded.includes('..')) {
      throw new MeldPathError(`Relative navigation '..' is not allowed: ${meldPath}`);
    }

    // 3) E.g., check isAbsolute, do path.normalize, etc. (We might import 'path' or handle ourselves)
    // return final string
    return expanded;
  }

  private expandSpecialPrefix(meldPath: string): string {
    // e.g. replace $PROJECTPATH => this.projectPath, $HOMEPATH => this.homePath, etc.
    // Then path.join or path.normalize
    // Return final expanded
  }

  public async joinPaths(...parts: string[]): Promise<string> {
    // Join multiple Meld-style paths:
    // each part might be $PROJECTPATH/stuff, or an absolute sub path
    // running expands them all, then does path.join
  }

  public isAbsolute(testPath: string): boolean {
    // ...
  }
}
--------------------------------------------------------------------------------

D. HOW DIRECTIVES USE IT

Example: In an ImportDirectiveHandler:

--------------------------------------------------------------------------------
// inside ImportDirectiveHandler
const resolvedPath = await pathService.resolvePath(directive.source);
const fileExists = await fileSystemService.exists(resolvedPath);
if (!fileExists) {
  throw new MeldImportError(`File does not exist: ${directive.source}`);
}
--------------------------------------------------------------------------------

E. TESTING STRATEGY

1. **Unit Tests** (PathService.test.ts):
   - Thoroughly check expansions: "$PROJECTPATH/file", "$HOMEPATH/abc", etc.  
   - Test testMode toggling: in test mode, $PROJECTPATH => /memfs/proj.  
   - Validate ".." disclaimers or other edge cases.  
2. **No real disk**: We do not rely on actual OS home directories.  
3. **Integration Tests**: The PathService is indirectly tested in directive tests, but most direct coverage remains in the PathService.test.ts.

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
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  ensureDir(dirPath: string): Promise<void>;

  // Basic file operations only - no section extraction or fuzzy matching
}
--------------------------------------------------------------------------------

C. ASCII DIAGRAM

When a directive (like ImportDirective) needs to read "/memfs/proj/sub/fileA.meld":

   directive   -> FileSystemService.readFile("/memfs/proj/sub/fileA.meld")
                  └─ if in test => memfsVol.readFileSync ...
                        else => real fs.promises.readFile

If readFile fails => service wraps raw error => MeldFileSystemError.

D. IMPLEMENTATION DETAILS

1) We can unify everything behind an "adapter" pattern:  
   • RealFileSystemAdapter: uses Node's fs/promises.  
   • MemfsFileSystemAdapter: uses memfs Volume or a Map.  
   • FileSystemService constructor picks the adapter based on ENV or runtime config.

2) Example partial snippet (FileSystemService.ts):

--------------------------------------------------------------------------------
import { IFileSystemService } from './FileSystemService.interfaces';
import { MeldFileSystemError } from '../../core/errors/MeldError';

export class FileSystemService implements IFileSystemService {
  constructor(private adapter: IFileSystemAdapter) {}

  async readFile(filePath: string): Promise<string> {
    try {
      return await this.adapter.readFile(filePath);
    } catch (rawError: any) {
      throw new MeldFileSystemError(`Failed to read file: ${filePath}`, rawError);
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await this.adapter.writeFile(filePath, content);
    } catch (rawError: any) {
      throw new MeldFileSystemError(`Failed to write file: ${filePath}`, rawError);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    return this.adapter.exists(filePath);
  }

  async ensureDir(dirPath: string): Promise<void> {
    try {
      await this.adapter.ensureDir(dirPath);
    } catch (rawError: any) {
      throw new MeldFileSystemError(`Failed to ensure directory: ${dirPath}`, rawError);
    }
  }
}
--------------------------------------------------------------------------------

3) **FileSystemAdapter** (One real, one for tests) might look like:

--------------------------------------------------------------------------------
export interface IFileSystemAdapter {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;
}

export class RealFsAdapter implements IFileSystemAdapter {
  // uses fs/promises behind the scenes...
}

export class InMemoryFsAdapter implements IFileSystemAdapter {
  // uses memfs or whatever approach
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
