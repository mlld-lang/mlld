import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '../../index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import type { IPathService } from '@services/fs/IPathService';
import * as path from 'path';

// Simple mock path service for tests
class MockPathService implements IPathService {
  resolve(...segments: string[]): string { return path.resolve(...segments); }
  relative(from: string, to: string): string { return path.relative(from, to); }
  join(...segments: string[]): string { return path.join(...segments); }
  dirname(filePath: string): string { return path.dirname(filePath); }
  basename(filePath: string, ext?: string): string { return path.basename(filePath, ext); }
  extname(filePath: string): string { return path.extname(filePath); }
  isAbsolute(filePath: string): boolean { return path.isAbsolute(filePath); }
  normalize(filePath: string): string { return path.normalize(filePath); }
  sep = path.sep;
}

describe('Executable in Object Property', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: MockPathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new MockPathService();
  });

  it('should preserve executable as proper Variable when stored in object property', async () => {
    // Provider module with executable stored in object
    await fileSystem.writeFile('/provider.mld', `
/exe @greet(name) = \`Hello, @name!\`
/var @config = { greeter: @greet, prefix: "Config" }
/export { @config }
`);

    // Consumer that imports and uses the executable property
    const source = `
/import { @config } from "/provider.mld"
/show @config.prefix
/var @result = @config.greeter("World")
/show @result
`;

    const result = await interpret(source, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/'
    });

    expect(result).toContain('Config');
    expect(result).toContain('Hello, World!');
  });

  it('should handle nested objects with executables', async () => {
    await fileSystem.writeFile('/provider.mld', `
/exe @inner(x) = \`Inner: @x\`
/var @nested = { level1: { level2: { fn: @inner } } }
/export { @nested }
`);

    const source = `
/import { @nested } from "/provider.mld"
/var @result = @nested.level1.level2.fn("test")
/show @result
`;

    const result = await interpret(source, {
      fileSystem,
      pathService,
      format: 'markdown',
      basePath: '/'
    });

    expect(result).toContain('Inner: test');
  });
});
