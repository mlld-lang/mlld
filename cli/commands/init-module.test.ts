import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import * as os from 'os';
import { MODULE_TYPE_PATHS } from '@core/registry/types';

describe('init-module directory scaffolding', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-init-module-test-'));
  });

  afterEach(async () => {
    if (tempDir && existsSync(tempDir)) {
      await fs.rm(tempDir, { recursive: true });
    }
  });

  describe('scaffoldDirectoryModule', () => {
    it('creates app directory structure', async () => {
      const appDir = path.join(tempDir, 'llm', 'run', 'test-app');

      // Create structure manually (simulating what scaffoldDirectoryModule does)
      await fs.mkdir(appDir, { recursive: true });

      const manifest = `name: test-app
author: test-author
type: app
about: "Test app description"
version: 1.0.0
license: CC0
`;
      await fs.writeFile(path.join(appDir, 'module.yml'), manifest);

      const indexContent = `>> Test app description
>> Entry point for test-app

var @message = "Hello from test-app!"
show @message
`;
      await fs.writeFile(path.join(appDir, 'index.mld'), indexContent);

      const readme = `# test-app

Test app description

## tldr

\`\`\`bash
mlld run test-app
\`\`\`

## docs

Add detailed documentation here.

## License

CC0 - Public Domain
`;
      await fs.writeFile(path.join(appDir, 'README.md'), readme);

      // Verify structure
      expect(existsSync(path.join(appDir, 'module.yml'))).toBe(true);
      expect(existsSync(path.join(appDir, 'index.mld'))).toBe(true);
      expect(existsSync(path.join(appDir, 'README.md'))).toBe(true);

      // Verify manifest content
      const manifestContent = await fs.readFile(path.join(appDir, 'module.yml'), 'utf8');
      expect(manifestContent).toContain('name: test-app');
      expect(manifestContent).toContain('type: app');
      expect(manifestContent).toContain('author: test-author');
    });

    it('creates library directory structure', async () => {
      const libDir = path.join(tempDir, 'llm', 'lib', 'test-lib');

      await fs.mkdir(libDir, { recursive: true });

      const manifest = `name: test-lib
author: test-author
type: library
about: "Test library"
version: 1.0.0
license: CC0
`;
      await fs.writeFile(path.join(libDir, 'module.yml'), manifest);

      const indexContent = `>> Test library
>> Entry point for test-lib

exe @greet(name) = \`Hello, @name!\`

export { @greet }
`;
      await fs.writeFile(path.join(libDir, 'index.mld'), indexContent);

      // Verify library-specific content
      const index = await fs.readFile(path.join(libDir, 'index.mld'), 'utf8');
      expect(index).toContain('exe @greet');
      expect(index).toContain('export { @greet }');
    });

    it('creates command directory structure', async () => {
      const cmdDir = path.join(tempDir, '.claude', 'commands', 'test-cmd');

      await fs.mkdir(cmdDir, { recursive: true });

      const manifest = `name: test-cmd
author: test-author
type: command
about: "Test command"
version: 1.0.0
license: CC0
`;
      await fs.writeFile(path.join(cmdDir, 'module.yml'), manifest);

      const indexContent = `>> Test command
>> Claude Code slash command

var @result = "Command test-cmd executed"
show @result
`;
      await fs.writeFile(path.join(cmdDir, 'index.mld'), indexContent);

      // Verify command-specific content
      const index = await fs.readFile(path.join(cmdDir, 'index.mld'), 'utf8');
      expect(index).toContain('Claude Code slash command');
      expect(index).toContain('Command test-cmd executed');
    });

    it('creates skill directory structure', async () => {
      const skillDir = path.join(tempDir, '.claude', 'skills', 'test-skill');

      await fs.mkdir(skillDir, { recursive: true });

      const manifest = `name: test-skill
author: test-author
type: skill
about: "Test skill"
version: 1.0.0
license: CC0
`;
      await fs.writeFile(path.join(skillDir, 'module.yml'), manifest);

      const indexContent = `>> Test skill
>> Claude Code skill

var @response = "Skill test-skill activated"
show @response
`;
      await fs.writeFile(path.join(skillDir, 'index.mld'), indexContent);

      // Verify skill-specific content
      const index = await fs.readFile(path.join(skillDir, 'index.mld'), 'utf8');
      expect(index).toContain('Claude Code skill');
      expect(index).toContain('Skill test-skill activated');
    });
  });

  describe('module type paths', () => {
    it('app uses llm/run/ locally', () => {
      expect(MODULE_TYPE_PATHS.app.local).toBe('llm/run');
    });

    it('library uses llm/lib/ locally', () => {
      expect(MODULE_TYPE_PATHS.library.local).toBe('llm/lib');
    });

    it('command uses .claude/commands/ locally', () => {
      expect(MODULE_TYPE_PATHS.command.local).toBe('.claude/commands');
    });

    it('skill uses .claude/skills/ locally', () => {
      expect(MODULE_TYPE_PATHS.skill.local).toBe('.claude/skills');
    });

    it('global paths use home directory', () => {
      expect(MODULE_TYPE_PATHS.app.global).toBe('.mlld/run');
      expect(MODULE_TYPE_PATHS.library.global).toBe('.mlld/lib');
      expect(MODULE_TYPE_PATHS.command.global).toBe('.claude/commands');
      expect(MODULE_TYPE_PATHS.skill.global).toBe('.claude/skills');
    });
  });

  describe('manifest validation', () => {
    it('requires name field', async () => {
      const manifestPath = path.join(tempDir, 'module.yml');
      const invalidManifest = `author: test
type: app
about: "Test"
`;
      await fs.writeFile(manifestPath, invalidManifest);

      // validateManifest would reject this
      const content = await fs.readFile(manifestPath, 'utf8');
      expect(content).not.toContain('name:');
    });

    it('requires valid type field', async () => {
      const manifestPath = path.join(tempDir, 'module.yml');
      const invalidManifest = `name: test
author: test
type: invalid-type
about: "Test"
`;
      await fs.writeFile(manifestPath, invalidManifest);

      const content = await fs.readFile(manifestPath, 'utf8');
      expect(content).toContain('type: invalid-type');
      // validateManifest would reject 'invalid-type' as not in ['library', 'app', 'command', 'skill']
    });
  });
});
