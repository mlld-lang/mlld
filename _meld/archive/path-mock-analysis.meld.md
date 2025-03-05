# Path Mock Architecture Analysis

=== MOCKING ARCHITECTURE AND CURRENT STATUS ===

@import[../dev/MOCKS.md]

=== CURRENT TEST FILES AND IMPLEMENTATIONS ===

@cmd[cpai ../src/interpreter/directives/__tests__/embed.test.ts ../tests/integration/cmd.test.ts ../src/__mocks__/fs.ts ../src/__mocks__/fs-promises.ts ../src/test/fs-utils.ts ../tests/__mocks__/path.ts --stdout]

=== CURRENT TEST FAILURES ===

@cmd[npm test src/interpreter/directives/__tests__/embed.test.ts tests/integration/cmd.test.ts]

YOUR TASK:

We are seeing test failures in our fs/path mocking strategy. The key issues appear to be:

1. FileSystemError: The "path" argument must be of type string or an instance of Buffer or URL. Received undefined
   - Happening in fs mock's normalizePath function
   - Suggests undefined paths in test setup
   - Particularly occurring in setup.ts when adding mock files

2. ENOENT errors for test files that should exist
   - Files like '/Users/adam/dev/meld/test/_tmp/project/test.meld' not found
   - Suggests potential timing/initialization issues with mock filesystem

Please analyze:
1. Our overall fs/path mocking architecture and whether it follows best practices
2. The specific issues causing these test failures
3. The best way to fix these issues while maintaining clean architecture
4. Any other improvements we should make to our mocking strategy

Key areas to examine:
- Path mock initialization timing
- Mock filesystem setup sequence
- Test context initialization
- Special path variable handling ($PROJECTPATH, etc)
- Directory vs file handling in mocks
- Interaction between fs/path mocks

DO NOT GUESS. DO NOT GIVE HAND-WAVY ADVICE. BE EVIDENCE-BASED, EXPLICIT, AND DECISIVE. 