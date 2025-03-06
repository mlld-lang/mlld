You are the architect of this codebase. It has gone through some refactors:

- We've fully abstracted out the import and md/xml handling with another library we built called llmxml.
- We've create PathService and centralized our path/fs mocks in testing.

But as we've been revisiting the remaining directives, we've discovered a lot of brittleness to our test configuration and it feels like we still need to do more in order to make our codebase more SOLID, maintainable, readable, and testable.

We are working on designing a new architecture which you have been leading the way on. (I will share this below.)

Here's our intended UX:

====== UX

@import[docs/UX.md]

====== / end UX

Here's a repo we used as the spec for meld-ast which we use in this codebase. Our types presumably align with the spec as well.

====== MELD SPEC SRC

@cmd[cpai ../meld-spec/src]

====== / end MELD SPEC SRC

Here's our current code and tests:

====== CODE AND TESTS

@cmd[cpai src tests --stdout]

====== / end CODE AND TESTS

Here's your design for our new architecture:

====== YOUR ARCHITECTURAL DESIGN

@import[dev/arch-1.md]

====== / end YOUR ARCHITECTURAL DESIGN

====== TEST SETUP GOALS

Here are the key goals for an ideal test setup for file/path operations:

1. **Zero Path String Manipulation in Tests**
- Tests should never deal with raw paths
- No manual joining of path segments
- No need to understand $PROJECTPATH/$HOMEPATH resolution
- Path normalization should be invisible to tests

2. **Declarative Project Structure**
- Define test files and directories as simple data structures 
- Easy creation of nested directory structures
- Ability to set up multiple related files in one operation
- Simple snapshot/restore of file trees

3. **Intuitive File Operations**
- Read/write files without path manipulation
- Clear distinction between project and home paths
- Automatic parent directory creation
- Standardized error handling

4. **Test-Friendly Assertions**
- Check file existence without resolving paths
- Compare file contents easily
- Verify directory structures
- Match file patterns and wildcards

5. **Isolation and Reset**
- Clean separation between tests
- Easy cleanup of test state
- No leakage between test cases
- Simple "start fresh" mechanism

6. **Minimal Test Setup Code**
- Reusable project templates/fixtures
- Helper methods for common patterns
- Chainable setup operations
- Default reasonable test structures

7. **Clear Error Messages**
- Meaningful errors when files don't exist
- Clear reporting of path resolution failures
- Stack traces that point to test code
- Validation of test setup operations

8. **Mock File System Inspection**
- Easy debugging of file system state
- Clear view of what files exist
- Simple diffing of file system changes
- Visualization of directory structure

The specific test utilities I believe would be needed to implement this vision effectively:

1. **Project Builder Utility**
```typescript
interface TestProject {
  // Create project structure declaratively
  create(structure: {
    files: Record<string, string>  // filename -> content
    dirs?: string[]
  }): Promise<void>

  // Add individual files with smart path handling
  addFile(filename: string, content: string): Promise<void>

  // Get file content without path manipulation
  getFile(filename: string): Promise<string>

  // Check file existence
  hasFile(filename: string): Promise<boolean>

  // Clear all test files
  reset(): Promise<void>
}
```

2. **Directory Structure Validator**
```typescript
interface DirectoryValidator {
  // Verify directory has expected files
  verifyDirectory(dir: string, expected: string[]): Promise<void>
  
  // Get directory listing
  listFiles(dir: string): Promise<string[]>

  // Compare directory state with snapshot
  matchSnapshot(dir: string): Promise<void>
}
```

3. **Test Context Builder**
```typescript
interface TestContextBuilder {
  // Set up standard test environment
  withBasicProject(): TestContext
  
  // Set up project with specific files
  withFiles(files: Record<string, string>): TestContext
  
  // Load predefined fixture
  fromFixture(fixtureName: string): TestContext
}
```

4. **Path Handling Utilities**
```typescript
interface PathUtils {
  // Convert between relative and absolute without knowing implementation
  toProjectPath(filename: string): string
  toHomePath(filename: string): string
  
  // Get parent directory
  getParentDir(path: string): string
}
```

5. **File System State Inspector**
```typescript
interface FSInspector {
  // Get current file system state
  getSnapshot(): Map<string, string>
  
  // Compare states
  getDiff(before: Map<string, string>): {
    added: string[]
    removed: string[]
    modified: string[]
  }
  
  // Debug view of file system
  printTree(): string
}
```

6. **Custom Test Matchers**
```typescript
interface CustomMatchers {
  toHaveFile(filename: string): void
  toHaveDirectory(dirname: string): void
  toMatchFileContent(filename: string, content: string): void
  toHaveFileStructure(expected: Record<string, string>): void
}
```

7. **Fixture Manager**
```typescript
interface FixtureManager {
  // Load predefined test fixtures
  load(fixtureName: string): Promise<void>
  
  // Save current state as fixture
  save(fixtureName: string): Promise<void>
  
  // List available fixtures
  list(): string[]
}
```

8. **Error Wrapper**
```typescript
interface ErrorWrapper {
  // Convert fs errors to test-friendly errors
  wrapFsError(error: Error): TestError
  
  // Create validation errors
  createError(message: string, path: string): TestError
}
```

Each of these would work together to enable tests like:

```typescript
// Example test usage
it('should process imported files', async () => {
  const context = await TestContext.builder()
    .withBasicProject()
    .withFiles({
      'main.meld': '@import [other.meld]',
      'other.meld': '@text greeting = "Hello"'
    })
    .build()

  await runMeld('main.meld')

  await expect(context).toHaveFile('main.meld')
  await expect(context.file('other.meld')).toHaveContent('@text greeting = "Hello"')
})
```

The key is that these utilities should:
1. Work together cohesively
2. Hide implementation details
3. Provide clear error messages
4. Be easy to use in common test scenarios
5. Support debugging when things go wrong

====== / end TEST SETUP GOALS

====== YOUR TASK

You are designing the utilities and systems for our tests. We already have some existing utilities we can build on, but it still needs a lot of work and we need an approach that abstracts away all complexity for our tests so they can focus on the logic rather than the inner workings.

Your test setup design should:
- align with, build on, and enhance your architectural design
- build on (and, if necessary, improve on) our test setup goals
- adhere strictly to the spec and target UX (double check this!)
- focus first and foremost on isolating and controlling complexity with centralized utilities -- which are themselves tested
- reference patterns and libraries that will help us approach this using well-established and reliable methods

Assume:
- vitest for tests, memfs for in-mem fs testing
- we will completely rewrite the directives and their tests
- no sunk cost. this codebase needs NO backward compatibility for anything because we haven't even shipped it yet. we can delete anything and just move forward with a clean approach.
- we should eschew performance for 'working' and maintainability/readability. we need to first make it work and make it clear before we make it fast.

You should deliver a test design aligned with target UX and spec which includes:
- file structure of the tests
- specific code for the core test utilities
- patterns demonstrating how tests will use the utilities

The end result of the design should be a test setup you are proud of and which aligns with your passion for SOLID, testable, maintainable architecture that is well-tested.

This is YOUR codebase so DO NOT be hand-wavy. Be specific, and decisive in your guidance.