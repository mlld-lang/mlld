import { describe, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { PathContext } from '@core/services/PathContextService';

const PROJECT_ROOT = '/project';
const MAIN_FILE = '/project/main.mld';

function createPathContext(): PathContext {
  return {
    projectRoot: PROJECT_ROOT,
    fileDirectory: PROJECT_ROOT,
    executionDirectory: PROJECT_ROOT,
    invocationDirectory: PROJECT_ROOT,
    filePath: MAIN_FILE
  };
}

describe('when expression error context', () => {
  it('includes file path and full condition pair text for failing when-action evaluation', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const pathContext = createPathContext();
    const source = [
      '/var @line = "not valid json"',
      '/exe @loadRecentEvents() = when [',
      '  * => @line | @json',
      ']',
      '/show @loadRecentEvents()'
    ].join('\n');

    try {
      await interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      });
      throw new Error('Expected when-expression failure');
    } catch (error: any) {
      expect(error?.message).toContain('When expression evaluation failed with 1 condition errors');
      expect(error?.message).toContain('/project/main.mld');

      const details = error?.details ?? {};
      const firstError = Array.isArray(details.errors) ? String(details.errors[0] ?? '') : '';
      expect(firstError).toContain('(* => @line | @json)');
      expect(firstError).toContain('JSON parsing failed');
      expect(firstError).toContain('/project/main.mld');
      expect(firstError).not.toContain('[undefined]');
    }
  });
});
