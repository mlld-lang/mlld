import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { analyzeModule } from './analyze';

const TEST_DIR = join(process.cwd(), 'tmp', 'analyze-tests');

describe('analyzeModule', () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  async function writeTestModule(name: string, content: string): Promise<string> {
    const filepath = join(TEST_DIR, name);
    await fs.writeFile(filepath, content, 'utf8');
    return filepath;
  }

  describe('basic analysis', () => {
    it('should analyze a simple module', async () => {
      const filepath = await writeTestModule('simple.mld', `
/var @greeting = "Hello"
/show @greeting
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.valid).toBe(true);
      expect(analysis.errors).toHaveLength(0);
      expect(analysis.filepath).toBe(filepath);
      expect(analysis.stats.lines).toBeGreaterThan(0);
    });

    it('should return error for non-existent file', async () => {
      const analysis = await analyzeModule('/nonexistent/path.mld');

      expect(analysis.valid).toBe(false);
      expect(analysis.errors).toHaveLength(1);
      expect(analysis.errors[0].code).toBe('FILE_NOT_FOUND');
    });

    it('should return parse error for invalid syntax', async () => {
      const filepath = await writeTestModule('invalid.mld', `
/var @x = [unclosed
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.valid).toBe(false);
      expect(analysis.errors.some(e => e.code === 'PARSE_ERROR')).toBe(true);
    });
  });

  describe('frontmatter extraction', () => {
    it('should extract frontmatter metadata', async () => {
      const filepath = await writeTestModule('with-frontmatter.mld', `---
name: test-module
author: alice
version: 1.0.0
about: A test module
license: MIT
---

/var @x = 1
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.valid).toBe(true);
      expect(analysis.frontmatter).toBeDefined();
      expect(analysis.frontmatter?.name).toBe('test-module');
      expect(analysis.frontmatter?.author).toBe('alice');
      expect(analysis.frontmatter?.version).toBe('1.0.0');
    });

    it('should extract needs from frontmatter', async () => {
      const filepath = await writeTestModule('with-needs.mld', `---
name: needs-module
needs: [js, sh]
---

/exe @helper() = js { return 1 }
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.valid).toBe(true);
      expect(analysis.needs).toBeDefined();
      expect(analysis.needs?.runtimes).toHaveLength(2);
      expect(analysis.needs?.runtimes?.[0].name).toBe('js');
      expect(analysis.needs?.runtimes?.[1].name).toBe('sh');
    });
  });

  describe('executable extraction', () => {
    it('should extract /exe directives', async () => {
      const filepath = await writeTestModule('executables.mld', `
/exe @greet(name) = run {echo "Hello @name"}
/exe @add(a, b) = js { return a + b }
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.valid).toBe(true);
      expect(analysis.executables).toHaveLength(2);

      const greet = analysis.executables.find(e => e.name === '@greet');
      expect(greet).toBeDefined();
      expect(greet?.params).toEqual(['name']);

      const add = analysis.executables.find(e => e.name === '@add');
      expect(add).toBeDefined();
      expect(add?.params).toEqual(['a', 'b']);
    });

    it('should extract security labels on executables', async () => {
      const filepath = await writeTestModule('labeled-exe.mld', `
/exe network,paid @postData(url, data) = run {curl -X POST "@url" -d "@data"}
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.valid).toBe(true);
      expect(analysis.executables).toHaveLength(1);

      const exe = analysis.executables[0];
      expect(exe.name).toBe('@postData');
      expect(exe.labels).toContain('network');
      expect(exe.labels).toContain('paid');
    });

    it('should determine language correctly', async () => {
      const filepath = await writeTestModule('languages.mld', `
/exe @cmdFunc() = run {echo hi}
/exe @jsFunc() = js { return 1 }
/exe @nodeFunc() = node { console.log('hi') }
/exe @tplFunc(x) = \`Hello @x\`
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.executables.find(e => e.name === '@cmdFunc')?.language).toBe('cmd');
      expect(analysis.executables.find(e => e.name === '@jsFunc')?.language).toBe('js');
      expect(analysis.executables.find(e => e.name === '@nodeFunc')?.language).toBe('node');
      expect(analysis.executables.find(e => e.name === '@tplFunc')?.language).toBe('template');
    });
  });

  describe('export extraction', () => {
    it('should extract /export directives', async () => {
      const filepath = await writeTestModule('exports.mld', `
/exe @helper() = js { return 1 }
/exe @process(x) = js { return x * 2 }
/var @config = { "key": "value" }

/export { @helper, @process }
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.valid).toBe(true);
      expect(analysis.exports).toContain('@helper');
      expect(analysis.exports).toContain('@process');
      expect(analysis.exports).not.toContain('@config');
    });

    it('should validate exports exist', async () => {
      const filepath = await writeTestModule('bad-export.mld', `
/exe @defined() = js { return 1 }
/export { @defined, @missing }
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.valid).toBe(false);
      expect(analysis.errors.some(e =>
        e.code === 'EXPORT_NOT_FOUND' && e.message.includes('@missing')
      )).toBe(true);
    });
  });

  describe('import extraction', () => {
    it('should extract /import directives', async () => {
      const filepath = await writeTestModule('imports.mld', `
/import { @helper, @process } from @author/utils
/import @mlld/core as @core
/import { @config } from "./local.mld"
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.imports).toHaveLength(3);

      const utilsImport = analysis.imports.find(i => i.source.includes('author/utils'));
      expect(utilsImport?.names).toContain('@helper');
      expect(utilsImport?.names).toContain('@process');

      const coreImport = analysis.imports.find(i => i.source.includes('mlld/core'));
      expect(coreImport?.alias).toBe('@core');

      const localImport = analysis.imports.find(i => i.source.includes('local.mld'));
      expect(localImport?.names).toContain('@config');
    });
  });

  describe('guard extraction', () => {
    it('should extract /guard directives', async () => {
      const filepath = await writeTestModule('guards.mld', `
/guard @noSecrets before secret = when [
  * => deny "blocked"
]

/guard after network = when [
  * => allow
]
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.guards).toHaveLength(2);

      const namedGuard = analysis.guards.find(g => g.name === '@noSecrets');
      expect(namedGuard?.timing).toBe('before');
      expect(namedGuard?.filter).toBe('secret');

      const anonGuard = analysis.guards.find(g => !g.name);
      expect(anonGuard?.timing).toBe('after');
      expect(anonGuard?.filter).toBe('network');
    });
  });

  describe('variable extraction', () => {
    it('should extract all variables with exported flag', async () => {
      const filepath = await writeTestModule('variables.mld', `
/var @publicVar = "public"
/var @privateVar = "private"
/exe @publicFunc() = js { return 1 }
/exe @privateFunc() = js { return 2 }

/export { @publicVar, @publicFunc }
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.variables).toHaveLength(4);

      const publicVar = analysis.variables.find(v => v.name === '@publicVar');
      expect(publicVar?.exported).toBe(true);

      const privateVar = analysis.variables.find(v => v.name === '@privateVar');
      expect(privateVar?.exported).toBe(false);

      const publicFunc = analysis.variables.find(v => v.name === '@publicFunc');
      expect(publicFunc?.exported).toBe(true);
      expect(publicFunc?.type).toBe('executable');

      const privateFunc = analysis.variables.find(v => v.name === '@privateFunc');
      expect(privateFunc?.exported).toBe(false);
    });

    it('should infer variable types', async () => {
      const filepath = await writeTestModule('var-types.mld', `
/var @str = "hello"
/var @num = 42
/var @bool = true
/var @arr = [1, 2, 3]
/var @obj = { "key": "value" }
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.variables.find(v => v.name === '@str')?.type).toBe('primitive');
      expect(analysis.variables.find(v => v.name === '@num')?.type).toBe('primitive');
      expect(analysis.variables.find(v => v.name === '@bool')?.type).toBe('primitive');
      expect(analysis.variables.find(v => v.name === '@arr')?.type).toBe('array');
      expect(analysis.variables.find(v => v.name === '@obj')?.type).toBe('object');
    });
  });

  describe('stats', () => {
    it('should compute correct stats', async () => {
      const filepath = await writeTestModule('stats.mld', `
/var @a = 1
/var @b = 2
/exe @helper() = js { return 1 }
/guard before secret = when [ * => allow ]
/import { @util } from @test/utils
/export { @helper }
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.stats.lines).toBeGreaterThan(0);
      expect(analysis.stats.directives).toBe(6);
      expect(analysis.stats.executables).toBe(1);
      expect(analysis.stats.guards).toBe(1);
      expect(analysis.stats.imports).toBe(1);
      expect(analysis.stats.exports).toBe(1);
    });
  });

  describe('lazy AST', () => {
    it('should provide lazy AST getter', async () => {
      const filepath = await writeTestModule('ast.mld', `
/var @x = 1
/show @x
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.ast).toBeDefined();
      expect(typeof analysis.ast).toBe('function');

      const ast = analysis.ast!();
      expect(Array.isArray(ast)).toBe(true);
      expect(ast.length).toBeGreaterThan(0);
    });
  });

  describe('real-world module', () => {
    it('should analyze a complete module', async () => {
      const filepath = await writeTestModule('complete.mld', `---
name: github-tools
author: acme
version: 1.0.0
about: GitHub API helpers
needs: [js, node]
license: MIT
---

/import { @fetch } from @mlld/http

/var @apiBase = "https://api.github.com"

/exe network,safe @getRepo(owner, repo) = run {
  curl "@apiBase/repos/@owner/@repo"
}

/exe network,moderate @createIssue(owner, repo, title, body) = run {
  curl -X POST "@apiBase/repos/@owner/@repo/issues" -d '{"title":"@title","body":"@body"}'
}

/guard @rateLimitGuard before network = when [
  * => allow
]

/export { @getRepo, @createIssue }
`);

      const analysis = await analyzeModule(filepath);

      expect(analysis.valid).toBe(true);
      expect(analysis.frontmatter?.name).toBe('github-tools');
      expect(analysis.needs?.runtimes).toHaveLength(2);
      expect(analysis.executables).toHaveLength(2);
      expect(analysis.guards).toHaveLength(1);
      expect(analysis.imports).toHaveLength(1);
      expect(analysis.exports).toHaveLength(2);

      // Check executable details
      const getRepo = analysis.executables.find(e => e.name === '@getRepo');
      expect(getRepo?.params).toEqual(['owner', 'repo']);
      expect(getRepo?.labels).toContain('network');
      expect(getRepo?.labels).toContain('safe');

      const createIssue = analysis.executables.find(e => e.name === '@createIssue');
      expect(createIssue?.labels).toContain('network');
      expect(createIssue?.labels).toContain('moderate');

      // Check variables include both exported and non-exported
      const exportedVars = analysis.variables.filter(v => v.exported);
      const nonExportedVars = analysis.variables.filter(v => !v.exported);
      expect(exportedVars.length).toBe(2);
      expect(nonExportedVars.length).toBeGreaterThan(0);
    });
  });
});
