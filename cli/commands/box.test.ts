import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';

// Store the real homedir before any mocking
const realHomedir = os.homedir();
let mockHomedirValue: string | null = null;

// Mock os module to allow overriding homedir
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal() as typeof os;
  return {
    ...actual,
    homedir: () => mockHomedirValue ?? actual.homedir()
  };
});

import { boxCommand, extractPromptFromArgs } from './box';

const originalCwd = process.cwd;

describe('boxCommand', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    process.cwd = originalCwd;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('rejects invalid environment names', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    try {
      await boxCommand({ _: ['spawn', '..', '--', 'echo', 'test'] });
    } catch (error: any) {
      if (!error.message.includes('exit:1')) {
        throw error;
      }
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(
      consoleErrorSpy.mock.calls.some((call) => String(call[0]).includes('Environment name'))
    ).toBe(true);
  });

  it('rejects modules that are not environment modules', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-box-test-'));
    tempDirs.push(root);
    process.cwd = vi.fn(() => root);

    const envDir = path.join(root, '.llm/box/bad-env');
    await fs.mkdir(envDir, { recursive: true });
    await fs.writeFile(
      path.join(envDir, 'module.yml'),
      'name: bad-env\ntype: tool\n',
      'utf8'
    );

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    try {
      await boxCommand({ _: ['spawn', 'bad-env', '--', 'echo', 'test'] });
    } catch (error: any) {
      if (!error.message.includes('exit:1')) {
        throw error;
      }
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        String(call[0]).includes("Module 'bad-env' is not an environment module.")
      )
    ).toBe(true);
  });

  describe('extractPromptFromArgs', () => {
    it('returns empty string for empty args', () => {
      expect(extractPromptFromArgs([])).toBe('');
    });

    it('returns single arg as-is', () => {
      expect(extractPromptFromArgs(['Fix the bug'])).toBe('Fix the bug');
    });

    it('extracts prompt from -p flag', () => {
      expect(extractPromptFromArgs(['claude', '-p', 'Fix the bug'])).toBe('Fix the bug');
    });

    it('extracts prompt from --prompt flag', () => {
      expect(extractPromptFromArgs(['claude', '--prompt', 'Fix the bug'])).toBe('Fix the bug');
    });

    it('joins args when no -p flag present', () => {
      expect(extractPromptFromArgs(['fix', 'the', 'bug'])).toBe('fix the bug');
    });

    it('handles -p at end without value by joining', () => {
      expect(extractPromptFromArgs(['claude', '-p'])).toBe('claude -p');
    });
  });

  it('invokes @spawn export from environment module', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-box-spawn-'));
    tempDirs.push(root);
    process.cwd = vi.fn(() => root);

    const envDir = path.join(root, '.llm/box/good-env');
    await fs.mkdir(envDir, { recursive: true });
    await fs.writeFile(
      path.join(envDir, 'module.yml'),
      'name: good-env\ntype: environment\nentry: index.mld\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(envDir, 'index.mld'),
      [
        '/exe @spawn(cmd) = `spawned @cmd`',
        '',
        '/export { @spawn }'
      ].join('\n'),
      'utf8'
    );

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    try {
      await boxCommand({ _: ['spawn', 'good-env', '--', 'hello'] });
    } catch (error: any) {
      if (!error.message.includes('exit:0')) {
        throw error;
      }
    }

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  describe('capture command', () => {
    beforeEach(() => {
      mockHomedirValue = null;
    });

    afterEach(() => {
      mockHomedirValue = null;
    });

    it('captures skills directory when present', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-box-capture-'));
      tempDirs.push(root);
      process.cwd = vi.fn(() => root);

      // Create fake home with .claude config including skills
      const fakeHome = path.join(root, 'fake-home');
      const claudeDir = path.join(fakeHome, '.claude');
      const skillsDir = path.join(claudeDir, 'skills');
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(path.join(claudeDir, 'settings.json'), '{"theme": "dark"}');
      await fs.writeFile(path.join(skillsDir, 'my-skill.md'), '# My Skill\nDoes stuff');
      await fs.writeFile(path.join(skillsDir, 'other-skill.md'), '# Other Skill');

      mockHomedirValue = fakeHome;
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await boxCommand({ _: ['capture', 'test-env'] });

      // Check skills were copied
      const targetSkillsDir = path.join(root, '.llm/box/test-env/.claude/skills');
      const mySkill = await fs.readFile(path.join(targetSkillsDir, 'my-skill.md'), 'utf8');
      expect(mySkill).toBe('# My Skill\nDoes stuff');

      const otherSkill = await fs.readFile(path.join(targetSkillsDir, 'other-skill.md'), 'utf8');
      expect(otherSkill).toBe('# Other Skill');

      const pulledBase = await fs.readFile(
        path.join(root, '.llm/box/test-env/agents/base.mld'),
        'utf8'
      );
      expect(pulledBase).toContain('/export { @keychainRef, @emptyMcpConfig }');

      const indexMld = await fs.readFile(
        path.join(root, '.llm/box/test-env/index.mld'),
        'utf8'
      );
      expect(indexMld).toContain('Pulled module: @mlld/agents/claude');
      expect(indexMld).toContain('from "./agents/claude.mld"');
    });

    it('captures from local .claude with --local flag', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-box-capture-local-'));
      tempDirs.push(root);
      process.cwd = vi.fn(() => root);

      // Create local .claude config
      const localClaudeDir = path.join(root, '.claude');
      await fs.mkdir(localClaudeDir, { recursive: true });
      await fs.writeFile(path.join(localClaudeDir, 'settings.json'), '{"local": true}');
      await fs.writeFile(path.join(localClaudeDir, 'CLAUDE.md'), '# Local Config');

      // Create global .claude that should NOT be used
      const fakeHome = path.join(root, 'fake-home');
      const globalClaudeDir = path.join(fakeHome, '.claude');
      await fs.mkdir(globalClaudeDir, { recursive: true });
      await fs.writeFile(path.join(globalClaudeDir, 'settings.json'), '{"global": true}');

      mockHomedirValue = fakeHome;
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await boxCommand({ _: ['capture', 'local-env', '--local'] });

      // Check local config was used (not global)
      const settings = await fs.readFile(
        path.join(root, '.llm/box/local-env/.claude/settings.json'),
        'utf8'
      );
      expect(JSON.parse(settings)).toEqual({ local: true });

      const claudeMd = await fs.readFile(
        path.join(root, '.llm/box/local-env/.claude/CLAUDE.md'),
        'utf8'
      );
      expect(claudeMd).toBe('# Local Config');
    });

    it('captures Codex config with --codex flag', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-box-capture-codex-'));
      tempDirs.push(root);
      process.cwd = vi.fn(() => root);

      // Create fake home with .codex config
      const fakeHome = path.join(root, 'fake-home');
      const codexDir = path.join(fakeHome, '.codex');
      await fs.mkdir(codexDir, { recursive: true });
      await fs.writeFile(path.join(codexDir, 'settings.json'), '{"codex": true}');

      mockHomedirValue = fakeHome;
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await boxCommand({ _: ['capture', 'codex-env', '--codex'] });

      // Check .codex directory was created and used
      const settings = await fs.readFile(
        path.join(root, '.llm/box/codex-env/.codex/settings.json'),
        'utf8'
      );
      expect(JSON.parse(settings)).toEqual({ codex: true });

      // Check index.mld references codex
      const pulledCodex = await fs.readFile(
        path.join(root, '.llm/box/codex-env/agents/codex.mld'),
        'utf8'
      );
      expect(pulledCodex).toContain('codex -p @prompt');
      expect(pulledCodex).toContain('CODEX_CONFIG_DIR');
    });

    it('auto-discovers codex when only codex config exists', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-box-capture-auto-codex-'));
      tempDirs.push(root);
      process.cwd = vi.fn(() => root);

      const fakeHome = path.join(root, 'fake-home');
      const codexDir = path.join(fakeHome, '.codex');
      await fs.mkdir(codexDir, { recursive: true });
      await fs.writeFile(path.join(codexDir, 'settings.json'), '{"codex": true}');

      mockHomedirValue = fakeHome;
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await boxCommand({ _: ['capture', 'autodetect-env'] });

      const codexSettingsPath = path.join(root, '.llm/box/autodetect-env/.codex/settings.json');
      const claudeSettingsPath = path.join(root, '.llm/box/autodetect-env/.claude/settings.json');
      const codexModulePath = path.join(root, '.llm/box/autodetect-env/agents/codex.mld');

      expect(await fs.access(codexSettingsPath).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(claudeSettingsPath).then(() => true).catch(() => false)).toBe(false);
      expect(await fs.access(codexModulePath).then(() => true).catch(() => false)).toBe(true);
    });

    it('stores in global .llm/box with --global flag', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-box-capture-global-'));
      tempDirs.push(root);
      process.cwd = vi.fn(() => root);

      const fakeHome = path.join(root, 'fake-home');
      const claudeDir = path.join(fakeHome, '.claude');
      await fs.mkdir(claudeDir, { recursive: true });
      await fs.writeFile(path.join(claudeDir, 'settings.json'), '{}');

      mockHomedirValue = fakeHome;
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await boxCommand({ _: ['capture', 'global-env', '--global'] });

      // Should be in fake-home/.llm/box, not root/.llm/box
      const globalEnvPath = path.join(fakeHome, '.llm/box/global-env/module.yml');
      const localEnvPath = path.join(root, '.llm/box/global-env/module.yml');

      expect(await fs.access(globalEnvPath).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(localEnvPath).then(() => true).catch(() => false)).toBe(false);
    });
  });
});
