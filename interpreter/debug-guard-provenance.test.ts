import { describe, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('debug guard provenance', () => {
  it('attaches trace data and provenance to guard events', async () => {
    const script = `
/guard @audit before op:run = when [
  * => allow
]

/run sh { echo "hello" }
    `.trim();

    const result = (await interpret(script, {
      fileSystem: new MemoryFileSystem(),
      pathService: new PathService(),
      basePath: '/',
      mode: 'debug'
    })) as any;

    const guardEvents = result.trace.filter(
      (event: any) => event.type === 'debug:guard:before' || event.type === 'debug:guard:after'
    );

    expect(guardEvents.length).toBeGreaterThan(0);
    for (const event of guardEvents) {
      expect(event.trace?.length).toBeGreaterThan(0);
      expect(event.provenance).toBeDefined();
    }
  });
});
