import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('evaluateExecInvocation runtime trace', () => {
  it('records llm call durations in verbose traces', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/exe llm @agent(prompt, config) = js {
  return {
    ok: true,
    prompt,
    model: config?.model ?? null
  };
}
/show @agent("hello", { model: "fake-model" })
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'verbose'
    }) as any;

    const llmCall = result.traceEvents.find((event: any) => event.event === 'llm.call');
    expect(llmCall).toBeDefined();
    expect(llmCall.data.phase).toBe('finish');
    expect(llmCall.data.model).toBe('fake-model');
    expect(llmCall.data.ok).toBe(true);
    expect(typeof llmCall.data.durationMs).toBe('number');
    expect(llmCall.data.durationMs).toBeGreaterThanOrEqual(0);
  });
});
