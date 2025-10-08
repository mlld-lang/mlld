import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Exec pipeline structured flow (feature flag)', () => {
  let previousFlag: string | undefined;

  beforeEach(() => {
    previousFlag = process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    process.env.MLLD_ENABLE_STRUCTURED_EXEC = 'true';
  });

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    } else {
      process.env.MLLD_ENABLE_STRUCTURED_EXEC = previousFlag;
    }
  });

  it('allows field access on structured pipeline results', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();

    const input = `
/exe @emit() = js { return '{"count": 5}' }
/exe @parseJson(val) = js { return JSON.parse(val) }
/var @result = @emit() with { pipeline: [@parseJson] }
/show @result.text
/show @result
`;

    const output = await interpret(input, { fileSystem, pathService });
    expect(output.trim()).toBe('{"count": 5}\n{"count": 5}');
  });
});
