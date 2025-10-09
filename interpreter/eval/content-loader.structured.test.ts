import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { isStructuredValue, asText } from '../utils/structured-value';
import * as path from 'path';

describe('processContentLoader (structured)', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  const baseDir = process.cwd();

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    env = new Environment(fileSystem, pathService, baseDir);
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
      expect(result.metadata?.loadResult).toBeDefined();
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

  it('parses JSON files into structured data with preserved metadata', async () => {
    const filePath = path.join(baseDir, 'data.json');
    await fileSystem.writeFile(filePath, '[{"value":1},{"value":2}]');

    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'data.json' }],
        raw: 'data.json'
      }
    };

    const result = await processContentLoader(node, env);
    expect(isStructuredValue(result)).toBe(true);
    if (isStructuredValue(result)) {
      expect(result.type).toBe('array');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toEqual([{ value: 1 }, { value: 2 }]);
      expect(result.metadata?.loadResult).toBeDefined();
      expect((result.metadata?.loadResult as any).filename).toBe('data.json');
      expect(asText(result)).toBe('[{"value":1},{"value":2}]');
    }
  });
});
