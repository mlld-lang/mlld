import { describe, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MlldWhenExpressionError } from '@core/errors';
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

    await expect(
      interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      })
    ).rejects.toThrow(/Error evaluating action for condition 1.*\(\* => @line \| @json\).*JSON parsing failed/s);
  });

  it('uses the imported module path for failing when expressions inside imported executables', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const pathContext = createPathContext();

    await fileSystem.writeFile(
      '/project/worker.mld',
      [
        '/var @line = "not valid json"',
        '/exe @loadRecentEvents() = when [',
        '  * => @line | @json',
        ']'
      ].join('\n')
    );

    const source = [
      '/import "./worker.mld" as @worker',
      '/show @worker.loadRecentEvents()'
    ].join('\n');

    let thrown: unknown;
    try {
      await interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MlldWhenExpressionError);
    const mlldError = thrown as MlldWhenExpressionError;
    expect(mlldError.sourceLocation?.filePath).toBe('/project/worker.mld');
    expect(mlldError.details?.filePath).toBe('/project/worker.mld');
    expect(mlldError.details?.conditionLocation?.filePath).toBe('/project/worker.mld');
    expect(mlldError.message).toContain('/project/worker.mld');
    expect(mlldError.message).not.toContain(MAIN_FILE);
  });
});
