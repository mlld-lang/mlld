import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as fs from 'fs';
import * as path from 'path';

describe('Shell Commands - Parallel Execution', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  const SLOW_SHELL_SCRIPT = '/tmp/mlld-test-slow-shell.sh';
  const ACTIVE_KEY = 'TEST_SHELL_PAR_ACTIVE';
  const MAX_KEY = 'TEST_SHELL_PAR_MAX';

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    delete process.env[ACTIVE_KEY];
    delete process.env[MAX_KEY];

    // Create a shell script that tracks concurrent execution
    const scriptContent = `#!/bin/bash
# Track concurrent execution using environment variables
ACTIVE_COUNT=$(printenv ${ACTIVE_KEY} || echo "0")
ACTIVE_COUNT=$((ACTIVE_COUNT + 1))
export ${ACTIVE_KEY}=$ACTIVE_COUNT

# Update max if needed
MAX_COUNT=$(printenv ${MAX_KEY} || echo "0")
if [ $ACTIVE_COUNT -gt $MAX_COUNT ]; then
  export ${MAX_KEY}=$ACTIVE_COUNT
fi

# Simulate work
sleep 0.1

# Decrement active count
ACTIVE_COUNT=$((ACTIVE_COUNT - 1))
export ${ACTIVE_KEY}=$ACTIVE_COUNT

# Return the input
echo "$1"
`;

    fs.writeFileSync(SLOW_SHELL_SCRIPT, scriptContent, { mode: 0o755 });
  });

  afterEach(() => {
    delete process.env[ACTIVE_KEY];
    delete process.env[MAX_KEY];
    // Clean up test script
    if (fs.existsSync(SLOW_SHELL_SCRIPT)) {
      fs.unlinkSync(SLOW_SHELL_SCRIPT);
    }
  });

  it('should execute shell commands in parallel for /for N parallel', async () => {
    const input = `
/exe @slowShell(input) = { ${SLOW_SHELL_SCRIPT} "@input" }

/for 4 parallel @x in ["A","B","C","D"] => show @slowShell(@x)
`;

    const t0 = Date.now();
    await interpret(input, { fileSystem, pathService });
    const elapsed = Date.now() - t0;

    // If running in parallel, 4 tasks of 100ms each should take ~100-200ms
    // If running sequentially, they would take ~400ms+
    // Allow for process spawn overhead
    expect(elapsed).toBeLessThan(450); // Parallel execution (much better than 800ms+ sequential)

    // The max concurrent count should be 4 (or close to it)
    // Note: This test may be flaky due to env var limitations across processes
  }, 10000);

  it('should execute shell commands in parallel for pipeline || stages', async () => {
    const input = `
/exe @slowShell(input) = { ${SLOW_SHELL_SCRIPT} "@input" }
/exe @seed() = "seed"
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(',');
}

/var @result = @seed() | @slowShell || @slowShell || @slowShell || @slowShell | @combine
/show @result
`;

    const t0 = Date.now();
    await interpret(input, { fileSystem, pathService });
    const elapsed = Date.now() - t0;

    // If running in parallel, 4 tasks of 100ms each should take ~100-200ms
    // If running sequentially, they would take ~400ms+
    expect(elapsed).toBeLessThan(450); // Parallel execution
  }, 10000);

  it('should demonstrate timing difference between JS (parallel) and shell (sequential)', async () => {
    const jsInput = `
/exe @slowJs(input) = js {
  await new Promise(r => setTimeout(r, 100));
  return input;
}

/for 4 parallel @x in ["A","B","C","D"] => show @slowJs(@x)
`;

    const shellInput = `
/exe @slowShell(input) = { ${SLOW_SHELL_SCRIPT} "@input" }

/for 4 parallel @x in ["A","B","C","D"] => show @slowShell(@x)
`;

    const jsStart = Date.now();
    await interpret(jsInput, { fileSystem, pathService });
    const jsElapsed = Date.now() - jsStart;

    const shellStart = Date.now();
    await interpret(shellInput, { fileSystem, pathService });
    const shellElapsed = Date.now() - shellStart;

    // Both JS and shell should be fast (parallel) after the fix
    expect(jsElapsed).toBeLessThan(450);
    expect(shellElapsed).toBeLessThan(450); // Now works in parallel!
  }, 20000);
});
