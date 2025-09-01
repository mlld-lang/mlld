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

  it('honors cap override: /for 2 parallel', async () => {
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

/for 2 parallel @x in ["a","b","c","d"] => show @slowEcho(@x)
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

/for 3 parallel @outer in [1] => for @x in ["a","b","c","d","e","f"] => show @slowEcho(@x)
`;

    await interpret(input, { fileSystem, pathService });
    expect(process.env[MAX_KEY]).toBe('3');
  });
});

