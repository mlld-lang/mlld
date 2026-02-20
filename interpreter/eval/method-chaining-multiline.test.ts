import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

function createRuntime() {
  const fileSystem = new MemoryFileSystem();
  const pathService = new PathService(fileSystem, '/');
  return { fileSystem, pathService };
}

describe('multiline method chaining', () => {
  it('evaluates multiline method chains in exe assignment expressions', async () => {
    const { fileSystem, pathService } = createRuntime();
    const output = await interpret(
      `/exe @buildPrompt(tmpl, failure) = @tmpl\n` +
        `  .replace("@topic", @failure.topic)\n` +
        `  .replace("@experiment", @failure.experiment)\n` +
        `  .replace("@resultsPath", @failure.resultsPath)\n` +
        `/var @failure = {\n` +
        `  "topic": "Regression",\n` +
        `  "experiment": "Chain",\n` +
        `  "resultsPath": "/tmp/out.json"\n` +
        `}\n` +
        `/var @rendered = @buildPrompt("Topic=@topic | Experiment=@experiment | Path=@resultsPath", @failure)\n` +
        `/show @rendered\n`,
      {
        fileSystem,
        pathService,
        format: 'markdown',
        mlldMode: 'markdown',
        ephemeral: true,
        useMarkdownFormatter: false
      }
    );

    expect(output).toContain('Topic=Regression | Experiment=Chain | Path=/tmp/out.json');
    expect(output).not.toContain('@topic');
    expect(output).not.toContain('@experiment');
    expect(output).not.toContain('@resultsPath');
  });

  it('evaluates multiline method chains in var assignment expressions', async () => {
    const { fileSystem, pathService } = createRuntime();
    const output = await interpret(
      `/var @text = "a-b-c"\n` +
        `/var @result = @text\n` +
        `  .replace("a", "x")\n` +
        `  .replace("b", "y")\n` +
        `/show @result\n`,
      {
        fileSystem,
        pathService,
        format: 'markdown',
        mlldMode: 'markdown',
        ephemeral: true,
        useMarkdownFormatter: false
      }
    );

    expect(output.trim()).toBe('x-y-c');
  });
});
