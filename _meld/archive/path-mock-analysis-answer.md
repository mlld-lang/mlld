Below is a step‐by‐step analysis of where the fs/path mocking is going wrong, why the two errors are surfacing, and how to fix them in a clean and consistent way.

────────────────────────────────────────────────────────────────────────────
1) OVERALL ARCHITECTURE & BEST‐PRACTICE ASSESSMENT
────────────────────────────────────────────────────────────────────────────

You already have a strong foundation:

• Central “path mock” with factory (createPathMock)  
• Separate “fs” and “fs/promises” mocks that share in‐memory state  
• TestContext that wraps setup/teardown, ensuring test isolation  
• Pattern for mocking path: vi.mock('path', …)  
• Pattern for mocking fs/promises: vi.mock('fs/promises', …)  
• Platform‐aware path logic and variable‐substitution logic  

In other words, your “big picture” is correct. The recurring pitfalls are:

1) Inconsistent usage of default exports vs. named exports for fs/promises  
2) Tests that never import the path mock (so path becomes undefined or real path usage conflicts)  
3) Tests that manually call process.cwd() or import fs in an ad hoc way  

────────────────────────────────────────────────────────────────────────────
2) ROOT CAUSES OF THE TEST FAILURES
────────────────────────────────────────────────────────────────────────────

ERROR #1:  “TypeError: default.writeFile is not a function”

Common cause:
• Your mock for fs/promises likely provides only named exports { writeFile, readFile, … }, but your test or source code is doing:
  import fs from 'fs/promises';
  fs.writeFile(…);
  
  Under the hood, that translates to fs.default.writeFile when the mock has no default export. Hence the “not a function” error.

How to confirm quickly:
• Look at src/__mocks__/fs-promises.ts and see if it exports “export function writeFile() { … }” or “export default { writeFile, … }”.  
• Look at the test or the code under test to see if it does “import fs from 'fs/promises'” or “import * as fsPromises from 'fs/promises'” or “import { writeFile }”.  

ERROR #2:  “FileSystemError: The "path" argument must be of type string … Received undefined”

Common cause:
• The code is calling writeFile(undefined, …).  
• Typically happens because path resolution is missing. For instance, a test calls:
  context.writeFile(somePath, 'content');
  …and somePath is undefined from an un‐mocked path.join, or from direct process.cwd() usage that doesn’t match the TestContext.  

How to confirm quickly:
• Put a console.log right before your writeFile calls to see what path is passed. Often it’s an unmocked path module or an uninitialized context.  
• Some tests never call context.initialize() or never import your path mock.  

────────────────────────────────────────────────────────────────────────────
3) HOW TO FIX THESE ISSUES CLEANLY
────────────────────────────────────────────────────────────────────────────

Below is the most robust, consistent approach:

A) Standardize “fs/promises” Mock Exports  
   • Decide whether your code does “import fs from 'fs/promises'” or “import { writeFile } from 'fs/promises'”. Then match the mock exactly.  
   • For default import style (import fs from 'fs/promises'), your mock must have a default export object:  
     
     // src/__mocks__/fs-promises.ts
     export async function writeFile(path: string, data: string | Buffer) { … }
     export async function readFile(path: string) { … }
     // etc.
     
     export default {
       writeFile,
       readFile,
       // ... all needed fs/promises methods
     };
     
     This ensures fs.default.writeFile === writeFile.  

   OR

   • Switch all of your code to named imports and do:
     
     import { writeFile } from 'fs/promises';
     
     // Then your mock can simply do:
     export async function writeFile(path: string, data: string | Buffer) { … }
     export async function readFile(path: string) { … }
     // etc.
     // No default export needed.
     

   Whichever route you take, just make sure your real code and your mock match.  

B) Enforce Path Resolution in All Tests  
   • Every test that touches the filesystem must rely on the same path mock, not the real Node path.  
   • Use “vi.mock('path', async () => { return (await import('../../__mocks__/path')).createPathMock(); });” in each test file or in a global jest.setup.ts / vitest.setup.ts (depending on your test runner).  
   • Whenever you need an absolute path, do “context.fs.getPath(path.join('some', 'segments'))” at runtime.  

C) Mandate TestContext for File Ops  
   • The moment your test needs to write or read a file, do:
     
       beforeEach(async () => {
         context = new TestContext();
         await context.initialize();
         await context.writeFile('project/test.txt', 'some content');
       });
       
       afterEach(async () => {
         await context.cleanup();
         vi.resetAllMocks();
       });
     
   • If you see code using process.cwd() or direct fs methods, convert it to your TestContext approach to guarantee the path is always defined.  

D) Eliminate process.cwd() Usage in Tests  
   • If you need a “current directory,” mock it or derive it from context’s root. For example:
     
       vi.spyOn(process, 'cwd').mockReturnValue(context.fs.getPath('mock-root'));
     

   That way you never pass undefined into your mock’s path logic.  

────────────────────────────────────────────────────────────────────────────
4) FURTHER IMPROVEMENTS
────────────────────────────────────────────────────────────────────────────

1) Explicit Default vs. Named Exports  
   • Avoid confusion by deciding on one pattern across all tests.  

2) Provide a “Defensive” TestContext.writeFile  
   • Inside writeFile, log the path if it’s undefined. This helps catch path bugs quickly instead of letting them bubble up with cryptic errors.  

3) Force Path Initialization in BeforeAll or BeforeEach  
   • Make your TestContext constructor throw if used before calling initialize()—you’ll know exactly when a test forgot to set up.  

4) Expand or Validate the Mocks for Missing Methods  
   • If your code calls fs.stat or fsPromises.access but the mock doesn’t define them, you’ll get similar “function not defined” errors.  

5) Strict ESM vs. CJS Consistency  
   • If you use an ESM test runner but your mocks are commonJS, watch out for the difference between “default” and “named” exports.  

────────────────────────────────────────────────────────────────────────────
BOTTOM LINE
────────────────────────────────────────────────────────────────────────────

• Your architecture is sound; the failures come from mismatched default exports in your fs/promises mock and missing path resolution in certain tests (embed.test.ts, cli.test.ts).  
• Fix by making sure all code either uses (a) default exports or (b) named exports for fs/promises consistently, and ensure all tests actually call TestContext + the mocked path module.  
• Eliminate direct process.cwd() usage; rely on your TestContext’s path.  

Following those steps will resolve “default.writeFile is not a function” and “Received undefined” errors definitively, while preserving your clean, centralized mock architecture.
