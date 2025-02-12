# Hard earned wisdom

> "How do you avoid making mistakes? Experience. How do you get experience? From making mistakes." 

# Hard earned wisdom

> "How do you avoid making mistakes? Experience. How do you get experience? From making mistakes." 

## Mocking and Production Code

### The Path Mock Incident

When implementing a centralized mock for the path module, we learned some important lessons:

1. **Red Flag**: If you need to change production code to accommodate a new mock implementation, you're probably doing something wrong.
   - The production code was working
   - The tests were passing
   - The mock should adapt to match the expected behavior, not vice versa

2. **Minimal Mocking**: Keep mocks as close to the real implementation as possible
   ```typescript
   // Good - Only override what's necessary for cross-platform consistency
   vi.mock('path', async () => {
     const actual = await vi.importActual<typeof import('path')>('path');
     return {
       ...actual,
       sep: '/',
       normalize: (p: string) => p.replace(/\\/g, '/'),
       default: actual,
     };
   });
   ```

3. **Test Setup Changes**: When centralizing mocks, focus on changing how tests import/use the mock:
   ```diff
   // Mock path module
   vi.mock('path', async () => {
   -  const actual = await vi.importActual<typeof import('path')>('path');
   -  return {
   -    ...actual,
   -    default: actual,
   -  };
   +  const { createPathMock } = await import('../../../../tests/__mocks__/path');
   +  return createPathMock();
   });
   ```

4. **Path Normalization**: When dealing with paths in tests, always normalize for consistency:
   ```diff
   getPath(filePath: string): string {
   -  return path.join(this.testRoot, filePath);
   +  return path.normalize(path.join(this.testRoot, filePath));
   }
   ```

### Key Takeaways

1. If tests were passing before a refactor, and now they require production code changes to pass:
   - Stop and question why
   - The mock should adapt to the expected behavior
   - Don't change working production code to match a mock

2. When centralizing mocks:
   - Keep them minimal
   - Only override what's necessary
   - Preserve as much of the real implementation as possible
   - Focus on changing how tests use the mock, not the behavior they expect

3. Document these decisions and their rationale to prevent future regressions

