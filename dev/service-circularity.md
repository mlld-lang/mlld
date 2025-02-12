# CircularityService

Below is a focused design for the CircularityService that aligns with meld-spec's types and the Meld grammar. This service handles circular import detection while ensuring compatibility with the core Meld libraries.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I. OVERVIEW & PURPOSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The CircularityService is responsible for:
• Tracking which Meld files are currently being imported
• Detecting cycles (e.g., file A imports B, which imports A)
• Throwing typed errors that align with meld-spec's error types
• Providing clear error messages with import chain details

This keeps the import code simple:
1. Call "startImport(filePath)" → Throws if that file is already on the stack
2. If no error, proceed to interpret using meld-ast
3. Call "endImport(filePath)" to pop it off the stack (in success or failure case)

The service is designed to be enhanced without impacting the rest of the codebase, following SOLID principles.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
II. CODEBASE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

We place this new service in:

services/
 ├─ CircularityService/
 │   ├─ CircularityService.ts
 │   ├─ CircularityService.test.ts         (unit tests)
 │   └─ ...
 └─ ...

Inside CircularityService.ts, we define a small, well-typed class.  

An ASCII illustration:

 ┌─────────────────────────────────────────────────────────┐
 │   ImportDirectiveHandler (or other code wanting import)│
 │      calls: .beginImport("FileA.meld")                 │
 │                 ▼                                      │
 │    +----------------------------------------+          │
 │    | CircularityService                     |          │
 │    |  - importStack: string[]              |          │
 │    |                                        |          │
 │    |  beginImport(filePath) → throws        |          │
 │    |  endImport(filePath)                   |          │
 │    |  isInStack(filePath) → boolean         |          │
 │    +----------------------------------------+          │
 │                 ▲                                      │
 │   If it throws, "ImportDirectiveHandler" knows cycle.  │
 └─────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
III. CIRCULARITYSERVICE: PROPOSED API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Tracks current chain of imports to detect circular references.
 * Uses meld-spec's error types for consistency.
 */
export class CircularityService {
  private importStack: string[] = [];

  /**
   * Called at the start of an import operation.
   * If filePath is already in importStack, we have a cycle.
   */
  public beginImport(filePath: string): void {
    if (this.importStack.includes(filePath)) {
      const importChain = [...this.importStack, filePath].join(' → ');
      throw new MeldImportError(
        `Circular import detected: ${importChain}`,
        'circular_import',
        { importChain }
      );
    }
    this.importStack.push(filePath);
  }

  /**
   * Called after import is finished (success or failure).
   * Removes filePath from the import stack.
   */
  public endImport(filePath: string): void {
    const idx = this.importStack.lastIndexOf(filePath);
    if (idx !== -1) {
      this.importStack.splice(idx, 1);
    }
  }

  /**
   * Convenience check for code that might want to see if a file is currently importing.
   */
  public isInStack(filePath: string): boolean {
    return this.importStack.includes(filePath);
  }

  /**
   * Clear the stack (common in tests or top-level reset).
   */
  public reset(): void {
    this.importStack = [];
  }
}

Key points:
• We store a simple array importStack.  
• beginImport() checks membership → if found, throw error.  
• endImport() removes it.  
• Optionally, we can store a more advanced structure if we want a full graph or more advanced detection.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IV. HOW DIRECTIVES WILL USE IT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the Meld architecture, the ImportDirectiveHandler uses it like this:

--------------------------------------------------------------------------------
// Inside ImportDirectiveHandler.ts
import { parse as meldAstParse } from 'meld-ast';

constructor(
  private fileSystemService: FileSystemService,
  private pathService: PathService,
  private stateService: StateService,
  private circularityService: CircularityService
) {}

public async executeImportDirective(node: DirectiveNode): Promise<void> {
  // 1) Resolve path
  const resolved = this.pathService.resolve(node.directive.source);

  // 2) Check for circular reference
  this.circularityService.beginImport(resolved);

  try {
    // 3) Read and parse with meld-ast
    const content = await this.fileSystemService.readFile(resolved);
    const ast = meldAstParse(content);
    
    // 4) Create child state and interpret
    const childState = this.stateService.createChild();
    await this.interpreterService.interpret(ast, childState);
    
    // 5) Merge child state back
    this.stateService.mergeChild(childState);
  } finally {
    // 6) Always end import
    this.circularityService.endImport(resolved);
  }
}
--------------------------------------------------------------------------------

If beginImport() throws, we know a cycle has been found. The rest of the directive logic can bail out right away.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
V. HANDLING COMPLEX SCENARIOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A. Nested or multi-step imports
• Because we push each filePath before interpreting its contents, any nested imports inside that interpret call will also do "beginImport(subFile)."  
• If subFile is ever the same as something in the stack, we immediately detect a cycle.  
• Once done, we endImport(subFile).  

B. Partial or optional expansions
• We usually store the full real path or some canonical path so that "/main.meld" and "/Main.meld" don't confuse a case-insensitive FS. The PathService can take care of normalizing.  
• If we plan to show the chain ("A imports B, B imports A"), we can store an actual stack of filePaths. For advanced "graph-based" detection, we can wrap it in an adjacency list. But for typical Meld usage, the stack approach suffices.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VI. TESTING STRATEGY & INTEGRATION WITH OUR TEST SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A. UNIT TESTS (services/CircularityService/CircularityService.test.ts)
─────────────────────────────────────────────────────────────────────────
We write direct tests of the CircularityService class. No file I/O is needed. Something like:

--------------------------------------------------------------------------------
import { describe, it, expect, beforeEach } from 'vitest';
import { CircularityService } from './CircularityService';
import { MeldImportError } from '../../core/errors/MeldImportError'; // or ErrorFactory

describe('CircularityService', () => {
  let service: CircularityService;

  beforeEach(() => {
    service = new CircularityService();
  });

  it('allows starting and ending imports in LIFO order', () => {
    service.beginImport('A.meld');
    service.beginImport('B.meld');
    service.endImport('B.meld');
    service.endImport('A.meld');
    expect(service.isInStack('A.meld')).toBe(false);
    expect(service.isInStack('B.meld')).toBe(false);
  });

  it('throws if we import a file already in stack', () => {
    service.beginImport('A.meld');
    expect(() => service.beginImport('A.meld')).toThrow(MeldImportError);
  });

  it('does not throw if we re-import after ending', () => {
    service.beginImport('A.meld');
    service.endImport('A.meld');
    expect(() => service.beginImport('A.meld')).not.toThrow();
  });
});
--------------------------------------------------------------------------------

This ensures the class behaves as expected in isolation.

B. INTEGRATION TESTS (tests/integration/interpreter/ or directive-level)
─────────────────────────────────────────────────────────────────────────
We create a scenario with a real or mocked in-memory FS:

1. Provide "FileA.meld" that imports "FileB.meld," and "FileB.meld" that imports "FileA.meld."  
2. The ImportDirectiveHandler calls circularityService.  
3. Confirm it throws a "Circular import detected" MeldError.  

Using our new test architecture (MemfsTestFileSystem, ProjectBuilder, TestContext, etc.):

--------------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '../../utils/TestContext';
import { runMeld } from '../../../sdk';

describe('Import Directive - circular import detection (integration)', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    context.initialize();
  });

  afterEach(() => {
    context.cleanup();
  });

  it('throws when A imports B, which imports A again', async () => {
    // Setup a project with two files
    await context.builder.create({
      files: {
        'project/FileA.meld': '@import [FileB.meld]\n@text done = "A done"',
        'project/FileB.meld': '@import [FileA.meld]\n@text done = "B done"'
      }
    });

    // Act & Assert
    await expect(runMeld('project/FileA.meld')).rejects.toThrow(/Circular import detected/);
  });
});
--------------------------------------------------------------------------------

Now you have a black-box test that shows import cycles lead to a thrown error.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VII. FUTURE EXTENSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• A more advanced approach might store a directed graph of imports, then do a DFS to detect cycles with a comprehensive error message. For large nested imports, we could show the entire chain.  
• We might want a "startImport(filePath, parentFilePath)" that logs edges in a adjacency map, then if we detect a cycle, we build a string "FileA → FileB → FileA."  
• We might gather partial results or warnings for non-critical cycles (not typical for Meld, but possible expansions).  

But the simpler stack-based approach is enough to detect the typical cyclical problem.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VIII. CONCLUSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This CircularityService design:

1. Properly uses meld-spec's error types
2. Maintains clean integration with meld-ast
3. Keeps circular reference detection isolated
4. Provides clear testing patterns
5. Remains extensible for future needs

By leveraging meld-spec's types and following the grammar rules, we create a robust service that fits perfectly into the Meld ecosystem while remaining maintainable and testable.
