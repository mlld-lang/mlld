import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SigService, buildFileSigningMetadata } from '@core/security';
import { collectFilesystemStatus, statusCommand } from './status';

describe('statusCommand', () => {
  let root: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'mlld-status-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await writeFile(path.join(root, 'package.json'), '{}');
    await writeFile(
      path.join(root, 'mlld-config.json'),
      JSON.stringify({
        policy: {
          import: ['./policy.mld']
        }
      })
    );
    await writeFile(
      path.join(root, 'policy.mld'),
      [
        '/policy @fs = {',
        '  defaults: { unlabeled: "untrusted" },',
        '  signers: { "user:*": ["trusted"] },',
        '  filesystem_integrity: { "@base/docs/*.txt": { authorizedIdentities: ["user:*"] } }',
        '}',
        '/export { @fs }'
      ].join('\n')
    );
    await mkdir(path.join(root, 'docs'), { recursive: true });
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await rm(root, { recursive: true, force: true });
  });

  it('reports signed, modified, and unsigned files with signer-derived labels', async () => {
    const signedPath = path.join(root, 'docs', 'signed.txt');
    const modifiedPath = path.join(root, 'docs', 'modified.txt');
    const unsignedPath = path.join(root, 'docs', 'unsigned.txt');
    await Promise.all([
      writeFile(signedPath, 'signed'),
      writeFile(modifiedPath, 'original'),
      writeFile(unsignedPath, 'unsigned')
    ]);

    const sigService = new SigService(root);
    await sigService.init();
    await sigService.sign(signedPath, 'user:alice', buildFileSigningMetadata(['secret']));
    await sigService.sign(modifiedPath, 'user:alice');
    await writeFile(modifiedPath, 'tampered');

    const entries = await collectFilesystemStatus({ basePath: root });
    expect(entries).toEqual([
      expect.objectContaining({
        relativePath: 'docs/modified.txt',
        status: 'modified',
        signer: 'user:alice',
        labels: ['untrusted']
      }),
      expect.objectContaining({
        relativePath: 'docs/signed.txt',
        status: 'verified',
        signer: 'user:alice',
        labels: ['trusted'],
        taint: ['secret']
      }),
      expect.objectContaining({
        relativePath: 'docs/unsigned.txt',
        status: 'unsigned',
        signer: null,
        labels: ['untrusted']
      })
    ]);
  });

  it('filters output with --glob and emits parseable json', async () => {
    const filePath = path.join(root, 'docs', 'note.txt');
    await writeFile(filePath, 'hello');

    const sigService = new SigService(root);
    await sigService.init();
    await sigService.sign(filePath, 'user:alice');

    await statusCommand({
      basePath: root,
      glob: 'docs/note.txt',
      json: true
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(payload).toEqual([
      expect.objectContaining({
        relativePath: 'docs/note.txt',
        status: 'verified',
        signer: 'user:alice'
      })
    ]);
  });

  it('prints taint metadata when requested', async () => {
    const filePath = path.join(root, 'docs', 'tainted.txt');
    await writeFile(filePath, 'hello');

    const sigService = new SigService(root);
    await sigService.init();
    await sigService.sign(filePath, 'user:alice', buildFileSigningMetadata(['secret', 'src:mcp']));

    await statusCommand({
      basePath: root,
      taint: true,
      glob: 'docs/tainted.txt'
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('docs/tainted.txt'));
    expect(logSpy).toHaveBeenCalledWith('  taint: secret, src:mcp');
  });
});
