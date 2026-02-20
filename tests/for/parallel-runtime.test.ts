import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('/for parallel - Runtime Behavior', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  const ACTIVE_KEY = 'TEST_FOR_PAR_ACTIVE';
  const MAX_KEY = 'TEST_FOR_PAR_MAX';

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    delete process.env[ACTIVE_KEY];
    delete process.env[MAX_KEY];
  });

  afterEach(() => {
    delete process.env[ACTIVE_KEY];
    delete process.env[MAX_KEY];
    delete process.env.MLLD_PARALLEL_LIMIT;
  });

  it('respects default parallel limit (4) for /for parallel', async () => {
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

/for parallel @x in ["a","b","c","d","e","f"] => show @slowEcho(@x)
`;

    await interpret(input, { fileSystem, pathService });
    expect(process.env[MAX_KEY]).toBeDefined();
    expect(process.env[MAX_KEY]).toBe('4');
  });

  it('honors cap override: /for parallel(2)', async () => {
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

/for parallel(2) @x in ["a","b","c","d"] => show @slowEcho(@x)
`;

    await interpret(input, { fileSystem, pathService });
    expect(process.env[MAX_KEY]).toBe('2');
  });

  it('honors cap override from variable: /for parallel(@cap)', async () => {
    const input = `
/var @cap = 2
/exe @slowEcho(input) = js {
  const a = Number(process.env.${ACTIVE_KEY} || '0') + 1;
  process.env.${ACTIVE_KEY} = String(a);
  const m = Number(process.env.${MAX_KEY} || '0');
  if (a > m) process.env.${MAX_KEY} = String(a);
  await new Promise(r => setTimeout(r, 25));
  process.env.${ACTIVE_KEY} = String(a - 1);
  return input;
}

/for parallel(@cap) @x in ["a","b","c","d"] => show @slowEcho(@x)
`;

    await interpret(input, { fileSystem, pathService });
    expect(process.env[MAX_KEY]).toBe('2');
  });

  it('applies inherited options to nested inner /for', async () => {
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

/for parallel(3) @outer in [1] => for @x in ["a","b","c","d","e","f"] => show @slowEcho(@x)
`;

    await interpret(input, { fileSystem, pathService });
    expect(process.env[MAX_KEY]).toBe('3');
  });

  it('enforces pacing between iteration starts for /for parallel(cap, wait)', async () => {
    const input = `
/exe @id(input) = js { return input }

/for parallel(3, 0.02s) @x in ["a","b","c","d","e","f"] => show @id(@x)
`;

    const t0 = Date.now();
    await interpret(input, { fileSystem, pathService });
    const elapsed = Date.now() - t0;
    // With 6 items and 20ms pacing, starts are at least ~100ms apart in total
    expect(elapsed).toBeGreaterThanOrEqual((6 - 1) * 20 - 15);
  });

  it('reads pacing from variable in /for parallel', async () => {
    const input = `
/var @pace = "0.02s"
/exe @id(input) = js { return input }

/for parallel(3, @pace) @x in ["a","b","c","d","e","f"] => show @id(@x)
`;

    const t0 = Date.now();
    await interpret(input, { fileSystem, pathService });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual((6 - 1) * 20 - 15);
  });
});
