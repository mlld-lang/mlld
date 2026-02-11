import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectiveNode } from '@core/types';
import { makeSecurityDescriptor } from '@core/types/security';
import { Environment } from '@interpreter/env/Environment';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import {
  enforceShowPolicyIfNeeded,
  ShowDescriptorCollector
} from './shared-helpers';

function makeShowDirective(): DirectiveNode {
  return {
    type: 'Directive',
    nodeId: 'show-test',
    kind: 'show',
    subtype: 'show',
    source: 'test',
    raw: {},
    values: {},
    location: {
      source: '/project/main.mld',
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 0, line: 1, column: 1 }
    },
    meta: {}
  } as unknown as DirectiveNode;
}

describe('show shared helpers', () => {
  let env: Environment;

  beforeEach(() => {
    env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
    env.setCurrentFilePath('/project/main.mld');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    env.cleanup();
  });

  it('keeps descriptor merge precedence with interpolated descriptor keys over source keys', () => {
    const collector = new ShowDescriptorCollector(env);
    collector.collectInterpolatedDescriptor(
      makeSecurityDescriptor({
        labels: ['interpolated'],
        taint: ['interpolated-taint'],
        sources: ['template'],
        policyContext: { precedence: 'interpolated', interpolatedOnly: true }
      })
    );

    collector.setSourceFromVariable({
      mx: {
        labels: ['source'],
        taint: ['source-taint'],
        sources: ['variable'],
        policy: { precedence: 'source', sourceOnly: true }
      }
    } as any);

    const merged = collector.mergePipelineDescriptorFromVariable({
      mx: {
        labels: ['input'],
        taint: ['input-taint'],
        sources: ['input-source'],
        policy: { precedence: 'input', inputOnly: true }
      }
    } as any);

    expect(merged).toBeDefined();
    expect(merged?.labels).toEqual(
      expect.arrayContaining(['input', 'interpolated'])
    );
    expect(merged?.sources).toEqual(
      expect.arrayContaining(['input-source', 'template'])
    );
    expect(merged?.policyContext).toEqual(
      expect.objectContaining({
        precedence: 'interpolated',
        inputOnly: true,
        interpolatedOnly: true
      })
    );
  });

  it('runs policy checks only when policy evaluation is required', () => {
    const collector = new ShowDescriptorCollector(env);
    collector.collectInterpolatedDescriptor(
      makeSecurityDescriptor({
        labels: ['secret'],
        taint: ['secret'],
        sources: ['test']
      })
    );

    const checkSpy = vi
      .spyOn(PolicyEnforcer.prototype, 'checkLabelFlow')
      .mockImplementation(() => undefined);

    enforceShowPolicyIfNeeded({
      context: undefined,
      directive: makeShowDirective(),
      env,
      descriptorCollector: collector,
      displayDescriptor: undefined,
      directiveLocation: null
    });
    expect(checkSpy).toHaveBeenCalledTimes(1);

    enforceShowPolicyIfNeeded({
      context: { isExpression: true } as any,
      directive: makeShowDirective(),
      env,
      descriptorCollector: collector,
      displayDescriptor: undefined,
      directiveLocation: null
    });
    expect(checkSpy).toHaveBeenCalledTimes(1);

    enforceShowPolicyIfNeeded({
      context: { policyChecked: true } as any,
      directive: makeShowDirective(),
      env,
      descriptorCollector: collector,
      displayDescriptor: undefined,
      directiveLocation: null
    });
    expect(checkSpy).toHaveBeenCalledTimes(1);
  });
});
