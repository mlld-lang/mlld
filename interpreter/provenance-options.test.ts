import { describe, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ExecutionEmitter } from '@sdk/execution-emitter';
import type { StreamExecution as StreamHandle } from '@sdk/types';

const source = `
/var @name = "Ada"
/export { name }
/show @name
`.trim();

describe('provenance options', () => {
  it('includes provenance when enabled in structured mode', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const result = (await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      provenance: true
    })) as any;

    expect(result.effects[0].provenance).toBeDefined();
    const exported = result.exports['name'] ?? result.exports['@name'];
    expect(exported?.metadata?.provenance).toBeDefined();
  });

  it('omits provenance when not requested in structured mode', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const result = (await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured'
    })) as any;

    expect(result.effects[0].provenance).toBeUndefined();
    const exported = result.exports['name'] ?? result.exports['@name'];
    expect(exported?.metadata?.provenance).toBeUndefined();
  });

  it('propagates provenance through stream mode events when enabled', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const emitter = new ExecutionEmitter();
    const events: any[] = [];
    emitter.on('effect', event => events.push(event));

    const handle = (await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'stream',
      emitter,
      provenance: true,
      streaming: { enabled: false }
    })) as StreamHandle;

    const result = await handle.result();
    const effectEvent = events.find(e => e.type === 'effect');

    expect(effectEvent?.effect?.provenance).toBeDefined();
    const exported = result.exports['name'] ?? result.exports['@name'];
    expect(exported?.metadata?.provenance).toBeDefined();
  });
});
