import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/exec-update-args-test.mld.md'
} as const;

async function interpretSource(source: string): Promise<string> {
  return await interpret(source.trim(), {
    fileSystem: new MemoryFileSystem(),
    pathService,
    pathContext,
    filePath: pathContext.filePath,
    format: 'markdown',
    normalizeBlankLines: true
  });
}

describe('exec invocation updateArgs', () => {
  it('rejects update tools when no changed fields are provided', async () => {
    await expect(
      interpretSource(`
        /exe tool:w @updateDraft(id, subject, body) = "ok" with { controlArgs: ["id"], updateArgs: ["subject", "body"] }
        /show @updateDraft("draft-1", null, null)
      `)
    ).rejects.toThrow(/Update with no changed fields/i);
  });

  it('accepts empty strings for declared updateArgs fields', async () => {
    const output = await interpretSource(`
      /exe tool:w @updateDraft(id, subject, body) = "ok" with { controlArgs: ["id"], updateArgs: ["subject", "body"] }
      /show @updateDraft("draft-1", "", null)
    `);

    expect(output.trim()).toBe('ok');
  });
});
