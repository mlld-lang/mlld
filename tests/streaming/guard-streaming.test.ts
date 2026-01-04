import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { startStreamRecorder } from '../helpers/stream-recorder';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';

describe('Guards with streaming', () => {
  const fs = new NodeFileSystem();
  const pathService = new PathService();
  let manager: StreamingManager;

  beforeEach(() => {
    manager = new StreamingManager();
  });

  it('runs before guards while streaming and still emits chunks', async () => {
    const script = `
/guard @audit before op:run = when [
  * => allow
]

/run stream sh { echo "one"; sleep 0.05; echo "two" }
`;

    const recorder = startStreamRecorder(manager.getBus());
    const result = await interpret(script, {
      fileSystem: fs,
      pathService,
      streamingManager: manager,
      streaming: { enabled: true }
    });
    recorder.stop();

    const chunks = recorder.getChunks();
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    const output = typeof result === 'string' ? result : result.output;
    expect(output).toContain('two');
  });

  it('rejects after guards when streaming is enabled', async () => {
    const script = `
/guard after @post for op:run = when [
  * => allow
]

/run stream sh { echo "streaming guard" }
`;

    const recorder = startStreamRecorder(manager.getBus());
    await expect(
      interpret(script, { fileSystem: fs, pathService, streamingManager: manager, streaming: { enabled: true } })
    ).rejects.toThrow(/Cannot run after-guards when streaming is enabled/);
    recorder.stop();

    expect(recorder.getChunks().length).toBe(0);
  });
});
