import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Parallel Pipeline - Runtime Behavior', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  const ACTIVE_KEY = 'TEST_PAR_ACTIVE';
  const MAX_KEY = 'TEST_PAR_MAX';

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    // Reset counters for concurrency test
    delete process.env[ACTIVE_KEY];
    delete process.env[MAX_KEY];
  });

  afterEach(() => {
    delete process.env[ACTIVE_KEY];
    delete process.env[MAX_KEY];
  });

  it('should reject retry inside a parallel stage', async () => {
    const input = `
/exe @seed() = "x"
/exe @left(input) = \`L:@input\`
/exe @requestRetry(input) = js { return 'retry' }

/var @out = @seed() | @left || @requestRetry | @left
/show @out`;

    await expect(
      interpret(input, { fileSystem, pathService })
    ).rejects.toThrow(/retry not supported in parallel stage/i);
  });

  it('should respect default parallel limit (4) across many branches', async () => {
    const input = `
/exe @slowEcho(input) = js {
  const a = Number(process.env.${ACTIVE_KEY} || '0') + 1;
  process.env.${ACTIVE_KEY} = String(a);
  const m = Number(process.env.${MAX_KEY} || '0');
  if (a > m) process.env.${MAX_KEY} = String(a);
  await new Promise(r => setTimeout(r, 25));
  process.env.${ACTIVE_KEY} = String(a - 1);
  return input;
}

/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(',');
}

/exe @seed() = "s"
/var @out = @seed() | @slowEcho || @slowEcho || @slowEcho || @slowEcho || @slowEcho || @slowEcho | @combine
/show @out`;

    const out = await interpret(input, { fileSystem, pathService });
    // Output not important; verify max concurrency observed
    expect(process.env[MAX_KEY]).toBeDefined();
    expect(process.env[MAX_KEY]).toBe('4');
    // sanity: output should have 6 entries
    expect(out.trim().split(',').length).toBe(6);
  });

  it('should run inline effects for each command in a parallel group', async () => {
    const input = `
/exe @left(input) = \`L:@input\`
/exe @right(input) = \`R:@input\`
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(' + ');
}

/exe @seed() = "x"

/var @out = @seed() | @left || @right | @show("EFFECT") | @combine
/show @out`;

    const out = await interpret(input, { fileSystem, pathService });
    // Two EFFECT lines emitted by inline effects (one per branch)
    const effectCount = (out.match(/EFFECT/g) || []).length;
    expect(effectCount).toBe(2);
    // Final combined result should still be present
    expect(out.trim()).toContain('L:x + R:x');
  });

  it('should fail the whole group if any branch errors', async () => {
    const input = `
/exe @left(input) = \`L:@input\`
/exe @boom(input) = js { throw new Error('boom') }
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(' + ');
}

/exe @seed() = "x"

/var @out = @seed() | @left || @boom | @combine
/show @out`;

    await expect(
      interpret(input, { fileSystem, pathService })
    ).rejects.toThrow(/Pipeline failed at stage 2|boom/);
  });
});
