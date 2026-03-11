import { describe, expect, it } from 'vitest';
import { VirtualFS } from './VirtualFS';
import { ShellSession } from './ShellSession';

describe('ShellSession', () => {
  describe('basic execution', () => {
    it('runs echo and captures stdout', async () => {
      const vfs = VirtualFS.empty();
      const shell = await ShellSession.create(vfs);

      const result = await shell.exec('echo "hello world"');
      expect(result.stdout).toBe('hello world\n');
      expect(result.exitCode).toBe(0);
    });

    it('captures nonzero exit code', async () => {
      const vfs = VirtualFS.empty();
      const shell = await ShellSession.create(vfs);

      const result = await shell.exec('exit 42');
      expect(result.exitCode).toBe(42);
    });
  });

  describe('filesystem integration', () => {
    it('writes files visible to VirtualFS', async () => {
      const vfs = VirtualFS.empty();
      const shell = await ShellSession.create(vfs);

      await shell.exec('echo "created by bash" > /tmp/output.txt');

      // File should be visible through VirtualFS directly
      const content = await vfs.readFile('/tmp/output.txt');
      expect(content).toContain('created by bash');

      // And tracked in changes
      const changes = await vfs.changes();
      const created = changes.find((c) => c.path === '/tmp/output.txt');
      expect(created).toBeDefined();
      expect(created?.type).toBe('created');
    });

    it('reads files pre-populated in VirtualFS', async () => {
      const vfs = VirtualFS.empty();
      await vfs.mkdir('/data', { recursive: true });
      await vfs.writeFile('/data/input.txt', 'pre-existing content');

      const shell = await ShellSession.create(vfs);
      const result = await shell.exec('cat /data/input.txt');
      expect(result.stdout).toBe('pre-existing content');
    });

    it('bash and mlld share the same shadow state', async () => {
      const vfs = VirtualFS.empty();

      // mlld interpreter would write this
      await vfs.writeFile('/project/config.json', '{"key": "value"}');

      // bash tool reads it
      const shell = await ShellSession.create(vfs);
      const result = await shell.exec('cat /project/config.json | jq .key');
      expect(result.stdout.trim()).toBe('"value"');

      // bash modifies, mlld sees it
      await shell.exec(
        'echo \'{"key": "updated"}\' > /project/config.json'
      );
      const content = await vfs.readFile('/project/config.json');
      expect(content).toContain('updated');
    });
  });

  describe('pipes and commands', () => {
    it('supports pipes between commands', async () => {
      const vfs = VirtualFS.empty();
      const shell = await ShellSession.create(vfs);

      await shell.exec(
        'echo -e "banana\\napple\\ncherry" > /tmp/fruits.txt'
      );
      const result = await shell.exec('cat /tmp/fruits.txt | sort');
      expect(result.stdout).toBe('apple\nbanana\ncherry\n');
    });

    it('supports grep', async () => {
      const vfs = VirtualFS.empty();
      const shell = await ShellSession.create(vfs);

      await shell.exec(
        'echo -e "hello world\\nfoo bar\\nhello again" > /tmp/lines.txt'
      );
      const result = await shell.exec('grep hello /tmp/lines.txt');
      expect(result.stdout).toContain('hello world');
      expect(result.stdout).toContain('hello again');
      expect(result.stdout).not.toContain('foo bar');
    });

    it('supports ls', async () => {
      const vfs = VirtualFS.empty();
      const shell = await ShellSession.create(vfs);

      await shell.exec('mkdir -p /project/src');
      await shell.exec('echo "a" > /project/src/main.ts');
      await shell.exec('echo "b" > /project/src/util.ts');

      const result = await shell.exec('ls /project/src');
      expect(result.stdout).toContain('main.ts');
      expect(result.stdout).toContain('util.ts');
    });
  });

  describe('environment and cwd', () => {
    it('respects custom cwd', async () => {
      const vfs = VirtualFS.empty();
      await vfs.mkdir('/workspace', { recursive: true });

      const shell = await ShellSession.create(vfs, { cwd: '/workspace' });
      const result = await shell.exec('pwd');
      expect(result.stdout.trim()).toBe('/workspace');
    });

    it('respects custom env vars', async () => {
      const vfs = VirtualFS.empty();
      const shell = await ShellSession.create(vfs, {
        env: { MY_VAR: 'custom_value' },
      });

      const result = await shell.exec('echo $MY_VAR');
      expect(result.stdout.trim()).toBe('custom_value');
    });

    it('getCwd and getEnv reflect shell state', async () => {
      const vfs = VirtualFS.empty();
      const shell = await ShellSession.create(vfs, {
        cwd: '/start',
        env: { FOO: 'bar' },
      });

      expect(shell.getCwd()).toBe('/start');
      const env = shell.getEnv();
      expect(env.FOO).toBe('bar');
    });
  });

  describe('VirtualFS lifecycle integration', () => {
    it('export/apply round-trips bash changes', async () => {
      const vfs = VirtualFS.empty();
      const shell = await ShellSession.create(vfs);

      await shell.exec('mkdir -p /output');
      await shell.exec('echo "result" > /output/data.txt');

      // Export patch from vfs
      const patch = vfs.export();
      expect(patch.entries.length).toBeGreaterThan(0);

      // Apply to a fresh VirtualFS
      const vfs2 = VirtualFS.empty();
      vfs2.apply(patch);
      expect(await vfs2.readFile('/output/data.txt')).toContain('result');
    });

    it('changes() reports bash-created files', async () => {
      const vfs = VirtualFS.empty();
      const shell = await ShellSession.create(vfs);

      await shell.exec('echo "new" > /new-file.txt');

      const changes = await vfs.changes();
      expect(changes.some((c) => c.path === '/new-file.txt' && c.type === 'created')).toBe(true);
    });

    it('flush() persists bash changes to backing', async () => {
      const { MemoryFileSystem } = await import(
        '../../tests/utils/MemoryFileSystem'
      );
      const backing = new MemoryFileSystem();
      await backing.mkdir('/project', { recursive: true });

      const vfs = VirtualFS.over(backing);
      const shell = await ShellSession.create(vfs);

      await shell.exec('echo "flushed" > /project/out.txt');

      // Not in backing yet
      expect(await backing.exists('/project/out.txt')).toBe(false);

      // Flush
      await vfs.flush();

      // Now it's persisted
      const content = await backing.readFile('/project/out.txt');
      expect(content).toContain('flushed');
    });

    it('discard() reverts bash changes', async () => {
      const vfs = VirtualFS.empty();
      const shell = await ShellSession.create(vfs);

      await shell.exec('echo "temp" > /scratch.txt');
      expect(await vfs.exists('/scratch.txt')).toBe(true);

      vfs.discard('/scratch.txt');
      expect(await vfs.exists('/scratch.txt')).toBe(false);
    });
  });

  describe('backing passthrough with bash', () => {
    it('bash reads files from backing filesystem', async () => {
      const { MemoryFileSystem } = await import(
        '../../tests/utils/MemoryFileSystem'
      );
      const backing = new MemoryFileSystem();
      await backing.mkdir('/repo', { recursive: true });
      await backing.writeFile('/repo/README.md', '# My Project\n\nHello from backing.');

      const vfs = VirtualFS.over(backing);
      const shell = await ShellSession.create(vfs);

      const result = await shell.exec('cat /repo/README.md');
      expect(result.stdout).toContain('Hello from backing');

      // grep against backing content
      const grepResult = await shell.exec('grep -c "Hello" /repo/README.md');
      expect(grepResult.stdout.trim()).toBe('1');
    });
  });
});
