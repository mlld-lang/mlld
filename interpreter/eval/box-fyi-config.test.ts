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
  filePath: '/module.mld.md'
};

describe('box fyi config integration', () => {
  it('exposes box-scoped fact roots to @fyi.facts inside the box block', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/record @contact = { facts: [email: string] }',
      '/exe @emitContact() = js { return { email: "ada@example.com" }; } => contact',
      '/exe @discover() = @fyi.facts({ op: "op:@email.send", arg: "recipient" })',
      '/var @contact = @emitContact()',
      '/var @cfg = { fyi: { facts: [@contact] } }',
      '/box @cfg [',
      '  show @discover()',
      ']'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown'
    });

    expect(output.trim()).toBe(
      [
        '[',
        '  {',
        '    "handle": "h_1",',
        '    "label": "ada@example.com",',
        '    "field": "email",',
        '    "fact": "fact:@contact.email"',
        '  }',
        ']'
      ].join('\n')
    );
  });
});
