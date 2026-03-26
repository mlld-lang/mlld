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
  it('treats @fyi.facts() and @fyi.facts({}) identically for call-scoped roots', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/record @contact = { facts: [email: string, name: string] }',
      '/exe @emitContact() = js { return { email: "mark@example.com", name: "Mark" }; } => contact',
      '/var @contact = @emitContact()',
      '/var @result = {',
      '  noArg: @fyi.facts() with { fyi: { facts: [@contact] } },',
      '  explicit: @fyi.facts({}) with { fyi: { facts: [@contact] } }',
      '}',
      '/show @result | @json'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown'
    });

    const parsed = JSON.parse(output.trim()) as {
      noArg: Array<{ handle: string; label: string; field: string; fact: string }>;
      explicit: Array<{ handle: string; label: string; field: string; fact: string }>;
    };

    expect(parsed.noArg).toHaveLength(2);
    expect(parsed.explicit).toHaveLength(2);
    expect(parsed.noArg.map(candidate => ({ label: candidate.label, field: candidate.field, fact: candidate.fact }))).toEqual([
      {
        label: 'Mark',
        field: 'email',
        fact: 'fact:@contact.email'
      },
      {
        label: 'name value',
        field: 'name',
        fact: 'fact:@contact.name'
      }
    ]);
    expect(parsed.explicit.map(candidate => ({ label: candidate.label, field: candidate.field, fact: candidate.fact }))).toEqual([
      {
        label: 'Mark',
        field: 'email',
        fact: 'fact:@contact.email'
      },
      {
        label: 'name value',
        field: 'name',
        fact: 'fact:@contact.name'
      }
    ]);
  });

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
        '    "label": "a***@example.com",',
        '    "field": "email",',
        '    "fact": "fact:@contact.email"',
        '  }',
        ']'
      ].join('\n')
    );
  });

  it('filters discovery for in-scope tool ops when the op ref is escaped in mlld string syntax', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/record @contact = { facts: [email: string, name: string] }',
      '/exe @emitContact() = js { return { email: "mark@example.com", name: "Mark" }; } => contact',
      '/exe exfil:send, tool:w @send_email(recipients: array, subject, body) = [',
      '  => "sent"',
      '] with { controlArgs: ["recipients"] }',
      '/var @contact = @emitContact()',
      '/show @fyi.facts({ op: "op:\\@send_email", arg: "recipients" }) with {',
      '  fyi: { facts: [@contact] }',
      '} | @json'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown'
    });

    expect(JSON.parse(output.trim())).toEqual([
      {
        handle: 'h_1',
        label: 'Mark',
        field: 'email',
        fact: 'fact:@contact.email'
      }
    ]);
  });
});
