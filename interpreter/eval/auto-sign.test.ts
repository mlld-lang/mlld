import { describe, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const pathContext = {
  projectRoot: '/project',
  fileDirectory: '/project',
  executionDirectory: '/project',
  invocationDirectory: '/project',
  filePath: '/project/main.mld'
};

describe('auto-sign defaults', () => {
  it('signs template variables when autosign includes templates', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/var @policyConfig = {
  defaults: {
    autosign: ["templates"]
  }
}
/policy @p = union(@policyConfig)
/var @prompt = ::Evaluate @input::
/var @plain = "plain"
`.trim();

    await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect(await fileSystem.exists('/project/.mlld/sec/sigs/prompt.sig')).toBe(true);
    expect(await fileSystem.exists('/project/.mlld/sec/sigs/plain.sig')).toBe(false);
    const content = await fileSystem.readFile('/project/.mlld/sec/sigs/prompt.content');
    expect(content).toBe('Evaluate @input');
  });

  it('signs variables matching autosign patterns', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/var @policyConfig = {
  defaults: {
    autosign: {
      variables: ["@*Prompt"]
    }
  }
}
/policy @p = union(@policyConfig)
/var @auditPrompt = "Check this"
/var @auditInstructions = "Ignore this"
`.trim();

    await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect(await fileSystem.exists('/project/.mlld/sec/sigs/auditPrompt.sig')).toBe(true);
    expect(await fileSystem.exists('/project/.mlld/sec/sigs/auditInstructions.sig')).toBe(false);
  });

  it('signs .att content when autosign templates is enabled', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    await fileSystem.writeFile('/project/prompt.att', 'Review @input');
    const source = `
/var @policyConfig = { defaults: { autosign: ["templates"] } }
/policy @p = union(@policyConfig)
/var @promptFile = <prompt.att>
`.trim();

    await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect(await fileSystem.exists('/project/.mlld/sec/sigs/promptFile.sig')).toBe(true);
    const content = await fileSystem.readFile('/project/.mlld/sec/sigs/promptFile.content');
    expect(content).toBe('Review @input');
  });

  it('signs template executables when autosign templates is enabled', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    await fileSystem.writeFile('/project/audit.att', 'Review @input');
    const source = `
/var @policyConfig = { defaults: { autosign: ["templates"] } }
/policy @p = union(@policyConfig)
/exe @auditPrompt(input) = template "./audit.att"
`.trim();

    await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect(await fileSystem.exists('/project/.mlld/sec/sigs/auditPrompt.sig')).toBe(true);
    const content = await fileSystem.readFile('/project/.mlld/sec/sigs/auditPrompt.content');
    expect(content).toBe('Review @input');
  });
});
