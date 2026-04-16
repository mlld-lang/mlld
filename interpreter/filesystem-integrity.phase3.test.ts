import { describe, expect, it } from 'vitest';
import { buildFileSigningMetadata, SigService } from '@core/security';
import { processContentLoader } from '@interpreter/eval/content-loader';
import { Environment } from '@interpreter/env/Environment';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { extractSecurityDescriptor, isStructuredValue } from '@interpreter/utils/structured-value';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

function createEnvironment() {
  const fileSystem = new MemoryFileSystem();
  const env = new Environment(fileSystem, new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  const sigService = new SigService('/project', fileSystem);
  env.setSigService(sigService);
  return { env, fileSystem, sigService };
}

describe('filesystem integrity Phase 3', () => {
  it('assigns signer labels from policy while preserving source and inherited taint', async () => {
    const { env, fileSystem, sigService } = createEnvironment();
    env.recordPolicyConfig('policy', {
      defaults: { unlabeled: 'untrusted' },
      signers: {
        'agent:*': ['agent-authored']
      }
    });

    await fileSystem.writeFile('/project/docs/note.txt', 'hello world');
    await sigService.sign(
      '/project/docs/note.txt',
      'agent:script',
      buildFileSigningMetadata(['secret', 'src:mcp'])
    );

    const result = await processContentLoader(
      {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'docs/note.txt' }],
          raw: 'docs/note.txt'
        }
      } as any,
      env
    );

    expect(isStructuredValue(result)).toBe(true);
    const wrapper = result as any;
    expect(wrapper.metadata?.sig).toMatchObject({
      status: 'verified',
      signer: 'agent:script'
    });
    expect(wrapper.mx.taint).toContain('agent-authored');
    expect(wrapper.mx.taint).toContain('secret');
    expect(wrapper.mx.taint).toContain('src:mcp');
    expect(wrapper.mx.taint).toContain('src:file');
    expect(wrapper.mx.taint).toContain('dir:/project/docs');
  });

  it('applies default unlabeled trust even when audit fallback contributes custom labels', async () => {
    const { env, fileSystem } = createEnvironment();
    env.recordPolicyConfig('policy', {
      defaults: { unlabeled: 'untrusted' }
    });

    await fileSystem.writeFile('/project/docs/legacy.txt', 'legacy');
    await fileSystem.writeFile(
      '/project/.llm/sec/audit.jsonl',
      JSON.stringify({
        event: 'write',
        path: '/project/docs/legacy.txt',
        taint: ['secret'],
        writer: 'user:legacy'
      }) + '\n'
    );

    const result = await processContentLoader(
      {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'docs/legacy.txt' }],
          raw: 'docs/legacy.txt'
        }
      } as any,
      env
    );

    expect(isStructuredValue(result)).toBe(true);
    const wrapper = result as any;
    expect(wrapper.mx.taint).toContain('secret');
    expect(wrapper.mx.taint).toContain('untrusted');
  });

  it('replaces stale trusted labels when a signed file is modified', async () => {
    const { env, fileSystem, sigService } = createEnvironment();
    env.recordPolicyConfig('policy', {
      defaults: { unlabeled: 'untrusted' },
      signers: {
        'user:*': ['trusted']
      }
    });

    await fileSystem.writeFile('/project/docs/state.txt', 'v1');
    await sigService.sign('/project/docs/state.txt', 'user:alice');

    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'docs/state.txt' }],
        raw: 'docs/state.txt'
      }
    };

    const trustedResult = await processContentLoader(node as any, env);
    expect((trustedResult as any).mx.taint).toContain('trusted');

    await fileSystem.writeFile('/project/docs/state.txt', 'v2');
    const modifiedResult = await processContentLoader(node as any, env);

    expect((modifiedResult as any).metadata?.sig).toMatchObject({
      status: 'modified',
      signer: 'user:alice'
    });
    expect((modifiedResult as any).mx.taint).toContain('untrusted');
    expect((modifiedResult as any).mx.taint).not.toContain('trusted');
  });

  it('denies downstream flow for a modified file after a signed write because it becomes untrusted on read', async () => {
    const { env, fileSystem, sigService } = createEnvironment();
    env.recordPolicyConfig('policy', {
      defaults: { unlabeled: 'trusted' },
      signers: { 'user:*': ['trusted'] },
      labels: {
        untrusted: { deny: ['op:show'] }
      }
    });

    await fileSystem.writeFile('/project/docs/report.txt', 'signed');
    await sigService.sign(
      '/project/docs/report.txt',
      'user:alice',
      buildFileSigningMetadata(['trusted'])
    );
    await fileSystem.writeFile('/project/docs/report.txt', 'tampered');

    const loaded = await processContentLoader(
      {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'docs/report.txt' }],
          raw: 'docs/report.txt'
        }
      } as any,
      env
    );

    const descriptor = extractSecurityDescriptor(loaded);
    expect(descriptor?.taint).toContain('untrusted');

    const policyEnforcer = new PolicyEnforcer(env.getPolicySummary());
    expect(() =>
      policyEnforcer.checkLabelFlow(
        {
          inputTaint: descriptor?.taint ?? [],
          opLabels: ['op:show'],
          exeLabels: []
        },
        { env }
      )
    ).toThrow('policy.labels.untrusted.deny');
  });
});
