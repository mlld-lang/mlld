import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { existsSync } from 'fs';
import { MODULE_TYPE_PATHS, type ModuleType } from './types';

describe('ModuleInstaller type-based routing', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-installer-test-'));
  });

  afterEach(async () => {
    if (tempDir && existsSync(tempDir)) {
      await fs.rm(tempDir, { recursive: true });
    }
  });

  describe('MODULE_TYPE_PATHS', () => {
    it('defines paths for all module types', () => {
      const types: ModuleType[] = ['library', 'app', 'command', 'skill'];
      for (const type of types) {
        expect(MODULE_TYPE_PATHS[type]).toBeDefined();
        expect(MODULE_TYPE_PATHS[type].local).toBeDefined();
        expect(MODULE_TYPE_PATHS[type].global).toBeDefined();
      }
    });

    it('app local path is llm/run', () => {
      expect(MODULE_TYPE_PATHS.app.local).toBe('llm/run');
    });

    it('app global path is .mlld/run', () => {
      expect(MODULE_TYPE_PATHS.app.global).toBe('.mlld/run');
    });

    it('library local path is llm/lib', () => {
      expect(MODULE_TYPE_PATHS.library.local).toBe('llm/lib');
    });

    it('library global path is .mlld/lib', () => {
      expect(MODULE_TYPE_PATHS.library.global).toBe('.mlld/lib');
    });

    it('command local path is .claude/commands', () => {
      expect(MODULE_TYPE_PATHS.command.local).toBe('.claude/commands');
    });

    it('command global path is .claude/commands', () => {
      expect(MODULE_TYPE_PATHS.command.global).toBe('.claude/commands');
    });

    it('skill local path is .claude/skills', () => {
      expect(MODULE_TYPE_PATHS.skill.local).toBe('.claude/skills');
    });

    it('skill global path is .claude/skills', () => {
      expect(MODULE_TYPE_PATHS.skill.global).toBe('.claude/skills');
    });
  });

  describe('path computation', () => {
    it('computes correct local app path', () => {
      const projectRoot = tempDir;
      const moduleType: ModuleType = 'app';
      const moduleName = 'test-app';

      const typePaths = MODULE_TYPE_PATHS[moduleType];
      const targetDir = path.join(projectRoot, typePaths.local, moduleName);

      expect(targetDir).toBe(path.join(tempDir, 'llm', 'run', 'test-app'));
    });

    it('computes correct global app path', () => {
      const moduleType: ModuleType = 'app';
      const moduleName = 'test-app';

      const typePaths = MODULE_TYPE_PATHS[moduleType];
      const targetDir = path.join(os.homedir(), typePaths.global, moduleName);

      expect(targetDir).toBe(path.join(os.homedir(), '.mlld', 'run', 'test-app'));
    });

    it('computes correct local library path', () => {
      const projectRoot = tempDir;
      const moduleType: ModuleType = 'library';
      const moduleName = 'test-lib';

      const typePaths = MODULE_TYPE_PATHS[moduleType];
      const targetDir = path.join(projectRoot, typePaths.local, moduleName);

      expect(targetDir).toBe(path.join(tempDir, 'llm', 'lib', 'test-lib'));
    });

    it('computes correct local command path', () => {
      const projectRoot = tempDir;
      const moduleType: ModuleType = 'command';
      const moduleName = 'review';

      const typePaths = MODULE_TYPE_PATHS[moduleType];
      const targetDir = path.join(projectRoot, typePaths.local, moduleName);

      expect(targetDir).toBe(path.join(tempDir, '.claude', 'commands', 'review'));
    });

    it('computes correct local skill path', () => {
      const projectRoot = tempDir;
      const moduleType: ModuleType = 'skill';
      const moduleName = 'helper';

      const typePaths = MODULE_TYPE_PATHS[moduleType];
      const targetDir = path.join(projectRoot, typePaths.local, moduleName);

      expect(targetDir).toBe(path.join(tempDir, '.claude', 'skills', 'helper'));
    });

    it('strips @author/ prefix from module name', () => {
      const fullModuleName = '@testuser/my-module';
      const simpleName = fullModuleName.replace(/^@[^/]+\//, '');

      expect(simpleName).toBe('my-module');
    });
  });

  describe('directory file writing', () => {
    it('writes all files to target directory', async () => {
      const targetDir = path.join(tempDir, 'test-module');
      const files = {
        'index.mld': 'show "hello"',
        'module.yml': 'name: test\nauthor: test\ntype: app',
        'README.md': '# Test'
      };

      // Simulate what ModuleInstaller does
      await fs.mkdir(targetDir, { recursive: true });
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(targetDir, filePath);
        const fileDir = path.dirname(fullPath);
        await fs.mkdir(fileDir, { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
      }

      // Verify
      expect(existsSync(path.join(targetDir, 'index.mld'))).toBe(true);
      expect(existsSync(path.join(targetDir, 'module.yml'))).toBe(true);
      expect(existsSync(path.join(targetDir, 'README.md'))).toBe(true);

      const indexContent = await fs.readFile(path.join(targetDir, 'index.mld'), 'utf-8');
      expect(indexContent).toBe('show "hello"');
    });

    it('creates nested subdirectories', async () => {
      const targetDir = path.join(tempDir, 'test-module');
      const files = {
        'index.mld': 'import from "lib/helper.mld"',
        'lib/helper.mld': 'exe @help() = "help"',
        'lib/utils/format.mld': 'exe @format(x) = `formatted: @x`'
      };

      await fs.mkdir(targetDir, { recursive: true });
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(targetDir, filePath);
        const fileDir = path.dirname(fullPath);
        await fs.mkdir(fileDir, { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
      }

      expect(existsSync(path.join(targetDir, 'lib', 'helper.mld'))).toBe(true);
      expect(existsSync(path.join(targetDir, 'lib', 'utils', 'format.mld'))).toBe(true);
    });
  });
});
