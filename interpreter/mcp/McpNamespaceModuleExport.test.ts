import { describe, it, expect, afterEach } from 'vitest';
import type { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { fileURLToPath } from 'url';

const fakeServerPath = fileURLToPath(
  new URL('../../tests/support/mcp/fake-server.cjs', import.meta.url)
);

const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/test.mld.md'
};

describe('MCP exe wrapper - parameter resolution', () => {
  let environment: Environment | undefined;

  afterEach(() => {
    environment?.cleanup();
    environment = undefined;
  });

  it('direct MCP call with positional args works', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/show @mcp.sendEmail(["test@example.com"], "Test Subject", "Hello World")'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown',
      captureEnvironment: env => { environment = env; }
    });

    expect(output).toContain('recipients=["test@example.com"]');
    expect(output).toContain('subject="Test Subject"');
    expect(output).toContain('body="Hello World"');
  });

  it('exeBlock exe wrapper resolves params (inline)', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;
    const source = [
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/exe @sendEmail(recipients, subject, body, attachments, cc, bcc) = [',
      '  => @mcp.sendEmail(@recipients, @subject, @body, @attachments, @cc, @bcc)',
      ']',
      '/show @sendEmail(["test@example.com"], "Test Subject", "Hello World", [], [], [])'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown',
      captureEnvironment: env => { environment = env; }
    });

    expect(output).toContain('recipients=["test@example.com"]');
    expect(output).toContain('subject="Test Subject"');
    expect(output).toContain('body="Hello World"');
  });

  // This matches the evals pattern: exe wrappers defined in a separate module file
  it('exeBlock exe wrapper imported from module resolves params', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;

    // Module file that defines MCP wrappers and exports them
    await fileSystem.writeFile('/tools.mld', [
      `import tools from mcp "${serverSpec}" as @mcp`,
      '',
      'exe @sendEmail(recipients, subject, body, attachments, cc, bcc) = [',
      '  => @mcp.sendEmail(@recipients, @subject, @body, @attachments, @cc, @bcc)',
      ']',
      '',
      'export { @sendEmail }'
    ].join('\n'));

    const source = [
      '/import { @sendEmail } from "/tools.mld"',
      '/show @sendEmail(["test@example.com"], "Test Subject", "Hello World", [], [], [])'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown',
      captureEnvironment: env => { environment = env; }
    });

    expect(output).toContain('recipients=["test@example.com"]');
    expect(output).toContain('subject="Test Subject"');
    expect(output).toContain('body="Hello World"');
  });

  // Full evals pattern: dispatch function that routes to imported MCP wrappers
  it('dispatch through imported exeBlock MCP wrapper', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;

    await fileSystem.writeFile('/tools.mld', [
      `import tools from mcp "${serverSpec}" as @mcp`,
      '',
      'exe @sendEmail(recipients, subject, body, attachments, cc, bcc) = [',
      '  => @mcp.sendEmail(@recipients, @subject, @body, @attachments, @cc, @bcc)',
      ']',
      '',
      'exe @createEvent(title, participants) = [',
      '  => @mcp.createEvent(@title, @participants)',
      ']',
      '',
      'exe @dispatch(name, args) = [',
      '  when @name [',
      '    "send_email" => @sendEmail(@args.recipients, @args.subject, @args.body, @args.attachments, @args.cc, @args.bcc)',
      '    "create_event" => @createEvent(@args.title, @args.participants)',
      '  ]',
      ']',
      '',
      'export { @dispatch, @sendEmail, @createEvent }'
    ].join('\n'));

    const source = [
      '/import { @dispatch, @sendEmail } from "/tools.mld"',
      '',
      '>> Direct call',
      '/show @sendEmail(["test@example.com"], "Direct Test", "Direct Hello", [], [], [])',
      '',
      '>> Dispatch call',
      '/show @dispatch("send_email", { recipients: ["test@example.com"], subject: "Dispatch Test", body: "Dispatch Hello", attachments: [], cc: [], bcc: [] })'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown',
      captureEnvironment: env => { environment = env; }
    });

    expect(output).toContain('recipients=["test@example.com"]');
    expect(output).toContain('subject="Direct Test"');
    expect(output).toContain('subject="Dispatch Test"');
  });

  it('dispatch preserves empty arrays through MCP call', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;

    await fileSystem.writeFile('/tools.mld', [
      `import tools from mcp "${serverSpec}" as @mcp`,
      '',
      'exe @sendEmail(recipients, subject, body, attachments, cc, bcc) = [',
      '  => @mcp.sendEmail(@recipients, @subject, @body, @attachments, @cc, @bcc)',
      ']',
      '',
      'exe @dispatch(name, args) = [',
      '  when @name [',
      '    "send_email" => @sendEmail(@args.recipients, @args.subject, @args.body, @args.attachments, @args.cc, @args.bcc)',
      '  ]',
      ']',
      '',
      'export { @dispatch, @sendEmail }'
    ].join('\n'));

    const source = [
      '/import { @dispatch } from "/tools.mld"',
      '/show @dispatch("send_email", { recipients: ["test@example.com"], subject: "Test", body: "Hello", attachments: [], cc: [], bcc: [] })'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown',
      captureEnvironment: env => { environment = env; }
    });

    expect(output).toContain('attachments=[]');
    expect(output).toContain('cc=[]');
    expect(output).toContain('bcc=[]');
  });

  // create_calendar_event through dispatch (the one the agent says works)
  it('dispatch routes create_event through imported wrapper', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;

    await fileSystem.writeFile('/tools.mld', [
      `import tools from mcp "${serverSpec}" as @mcp`,
      '',
      'exe @createEvent(title, participants) = [',
      '  => @mcp.createEvent(@title, @participants)',
      ']',
      '',
      'exe @dispatch(name, args) = [',
      '  when @name [',
      '    "create_event" => @createEvent(@args.title, @args.participants)',
      '  ]',
      ']',
      '',
      'export { @dispatch, @createEvent }'
    ].join('\n'));

    const source = [
      '/import { @dispatch } from "/tools.mld"',
      '/show @dispatch("create_event", { title: "Lunch", participants: ["alice@example.com"] })'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown',
      captureEnvironment: env => { environment = env; }
    });

    expect(output).toContain('title="Lunch"');
    expect(output).toContain('participants=["alice@example.com"]');
  });

  // With security labels like the actual evals code
  it('labeled exeBlock imported from module resolves params', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;

    await fileSystem.writeFile('/tools.mld', [
      `import tools from mcp "${serverSpec}" as @mcp`,
      '',
      'exe exfil:send, tool:w @sendEmail(recipients, subject, body, attachments, cc, bcc) = [',
      '  => @mcp.sendEmail(@recipients, @subject, @body, @attachments, @cc, @bcc)',
      ']',
      '',
      'export { @sendEmail }'
    ].join('\n'));

    const source = [
      '/import { @sendEmail } from "/tools.mld"',
      '/show @sendEmail(["test@example.com"], "Test Subject", "Hello World", [], [], [])'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown',
      captureEnvironment: env => { environment = env; }
    });

    expect(output).toContain('recipients=["test@example.com"]');
    expect(output).toContain('subject="Test Subject"');
    expect(output).toContain('body="Hello World"');
  });
});
