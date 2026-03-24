import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PersistentContentStore } from '@disreguard/sig';
import { SigService } from '@core/security';
import { createSigContextWithFS } from '@core/security/sig-adapter';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import {
  createExecutionFileWriter,
  liveSignContent,
  liveSignFile,
  liveVerifyFile
} from './live-stdio-security';

describe('live stdio security helpers', () => {
  let root: string;
  let fileSystem: NodeFileSystem;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'mlld-live-sec-'));
    fileSystem = new NodeFileSystem();
    await writeFile(path.join(root, 'package.json'), '{}');
    await mkdir(path.join(root, 'docs'), { recursive: true });
    await mkdir(path.join(root, 'routes'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('signs and verifies files through the live helper surface', async () => {
    const filePath = path.join(root, 'docs', 'note.txt');
    await writeFile(filePath, 'hello');

    const signed = await liveSignFile({
      path: 'docs/note.txt',
      basePath: root,
      identity: 'user:alice',
      metadata: { purpose: 'phase5' },
      fileSystem
    });
    const verified = await liveVerifyFile({
      path: filePath,
      basePath: root,
      fileSystem
    });

    expect(signed).toMatchObject({
      path: filePath,
      status: 'verified',
      signer: 'user:alice'
    });
    expect(verified).toMatchObject({
      path: filePath,
      status: 'verified',
      signer: 'user:alice',
      metadata: {
        purpose: 'phase5'
      }
    });
  });

  it('persists signed content records for live sign-content requests', async () => {
    const signature = await liveSignContent({
      content: 'signed body',
      identity: 'user:alice',
      metadata: { channel: 'sdk' },
      basePath: root,
      fileSystem
    });

    const store = new PersistentContentStore(createSigContextWithFS(root, fileSystem));
    const verified = await store.verify(signature.id);

    expect(signature).toMatchObject({
      id: expect.any(String),
      signedBy: 'user:alice',
      metadata: {
        channel: 'sdk'
      }
    });
    expect(verified).toMatchObject({
      verified: true,
      id: signature.id,
      content: 'signed body'
    });
  });

  it('writes files for active executions with request provenance', async () => {
    const scriptPath = path.join(root, 'routes', 'route.mld');
    await writeFile(scriptPath, '/show "ok"');

    const writeFileForExecution = await createExecutionFileWriter({
      requestId: 'req-17',
      scriptPath,
      fileSystem
    });

    const writeResult = await writeFileForExecution('out.txt', 'hello from sdk');
    const outputPath = path.join(root, 'routes', 'out.txt');
    const sigService = new SigService(root, fileSystem);
    const verified = await sigService.verify(outputPath);

    expect(writeResult).toMatchObject({
      path: outputPath,
      status: 'verified',
      signer: 'agent:route'
    });
    expect(verified).toMatchObject({
      status: 'verified',
      signer: 'agent:route',
      metadata: {
        taint: ['untrusted'],
        provenance: {
          sourceType: 'mlld_execution',
          sourceId: 'req-17',
          scriptPath
        }
      }
    });
  });
});
