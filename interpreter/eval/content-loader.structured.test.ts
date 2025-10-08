import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { isStructuredValue, asText } from '../utils/structured-value';
import * as path from 'path';

describe('processContentLoader (structured flag)', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  let previousFlag: string | undefined;
  const baseDir = process.cwd();

  beforeEach(() => {
    previousFlag = process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    process.env.MLLD_ENABLE_STRUCTURED_EXEC = 'true';

    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    env = new Environment(fileSystem, pathService, baseDir);
  });

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    } else {
      process.env.MLLD_ENABLE_STRUCTURED_EXEC = previousFlag;
    }
  });

  it('wraps single file results with structured metadata', async () => {
    const filePath = path.join(baseDir, 'README.md');
    await fileSystem.writeFile(filePath, '# Test\n\nContent body.');

    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'README.md' }],
        raw: 'README.md'
      }
    };

    const result = await processContentLoader(node, env);
    expect(isStructuredValue(result)).toBe(true);
    if (isStructuredValue(result)) {
      expect(result.type).toBe('object');
      expect(result.metadata?.source).toBe('load-content');
      expect(result.metadata?.filename).toBe('README.md');
      expect(asText(result)).toContain('# Test');
      expect((result.data as any).filename).toBe('README.md');
    }
  });

  it('wraps section extraction as structured text', async () => {
    const filePath = path.join(baseDir, 'README.md');
    await fileSystem.writeFile(
      filePath,
      '# Test README\n\n## Installation\n\nInstall instructions here.'
    );

    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'README.md' }],
        raw: 'README.md'
      },
      options: {
        section: {
          identifier: { type: 'Text', content: 'Installation' }
        }
      }
    };

    const result = await processContentLoader(node, env);
    expect(isStructuredValue(result)).toBe(true);
    if (isStructuredValue(result)) {
      expect(result.type).toBe('object');
      expect(asText(result)).toContain('Install instructions here');
      expect(result.metadata?.source).toBe('load-content');
      expect(result.metadata?.filename).toBe('README.md');
    }
  });
});
