import { describe, expect, it } from 'vitest';
import type { GuardDefinition } from '@interpreter/guards';
import type { OperationContext } from '@interpreter/env/ContextManager';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import {
  buildPerInputCandidates,
  collectOperationGuards
} from '@interpreter/hooks/guard-candidate-selection';
import {
  buildOperationKeys,
  buildOperationKeySet,
  buildOperationSnapshot
} from '@interpreter/hooks/guard-operation-keys';

function createGuard(options: {
  id: string;
  name?: string;
  privileged?: boolean;
  filterKind?: 'data' | 'operation';
  filterValue?: string;
}): GuardDefinition {
  const filterKind = options.filterKind ?? 'data';
  return {
    id: options.id,
    name: options.name,
    filterKind,
    filterValue: options.filterValue ?? 'secret',
    scope: filterKind === 'operation' ? 'perOperation' : 'perInput',
    modifier: 'default',
    block: {
      type: 'GuardBlock',
      modifier: 'default',
      rules: [],
      location: null
    },
    registrationOrder: 1,
    timing: 'before',
    privileged: options.privileged
  };
}

function createInput(name: string, labels: string[]) {
  return createSimpleTextVariable(
    name,
    `${name}-value`,
    {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    },
    {
      security: makeSecurityDescriptor({
        labels,
        sources: [`source:${name}`]
      })
    }
  );
}

describe('guard candidate selection utilities', () => {
  it('preserves per-input order and label-order dedupe for data guards', () => {
    const ga = createGuard({ id: 'ga', name: 'ga' });
    const gb = createGuard({ id: 'gb', name: 'gb' });
    const gc = createGuard({ id: 'gc', name: 'gc' });

    const registry = {
      getDataGuardsForTiming(label: string): GuardDefinition[] {
        if (label === 'secret') {
          return [ga, gb];
        }
        if (label === 'pci') {
          return [gb, gc];
        }
        return [];
      }
    } as any;

    const results = buildPerInputCandidates(
      registry,
      [
        createInput('first', ['secret', 'pci']),
        createInput('second', ['pci']),
        createInput('third', [])
      ],
      { kind: 'none' }
    );

    expect(results.map(candidate => candidate.index)).toEqual([0, 1]);
    expect(results[0]?.guards.map(guard => guard.id)).toEqual(['ga', 'gb', 'gc']);
    expect(results[1]?.guards.map(guard => guard.id)).toEqual(['gb', 'gc']);
  });

  it('uses the provided timing when collecting per-input candidates', () => {
    const beforeGuard = createGuard({ id: 'before-guard', name: 'beforeGuard' });
    const afterGuard = createGuard({ id: 'after-guard', name: 'afterGuard' });
    const calls: string[] = [];

    const registry = {
      getDataGuardsForTiming(label: string, timing: string): GuardDefinition[] {
        calls.push(`${timing}:${label}`);
        return timing === 'after' ? [afterGuard] : [beforeGuard];
      }
    } as any;

    const results = buildPerInputCandidates(
      registry,
      [createInput('only', ['secret'])],
      { kind: 'none' },
      'after'
    );

    expect(calls).toEqual(['after:secret']);
    expect(results[0]?.guards.map(guard => guard.id)).toEqual(['after-guard']);
  });

  it('preserves operation-key order and dedupe when collecting operation guards', () => {
    const gRun = createGuard({ id: 'g-run', name: 'gRun' });
    const gShell = createGuard({ id: 'g-shell', name: 'gShell' });
    const gRunSubtype = createGuard({ id: 'g-runsubtype', name: 'gRunSubtype' });
    const gCmd = createGuard({ id: 'g-cmd', name: 'gCmd' });
    const gPolicy = createGuard({ id: 'g-policy', name: 'gPolicy' });

    const registry = {
      getOperationGuardsForTiming(key: string): GuardDefinition[] {
        if (key === 'run') {
          return [gRun];
        }
        if (key === 'shell') {
          return [gShell];
        }
        if (key === 'runcommand') {
          return [gRunSubtype];
        }
        if (key === 'cmd') {
          return [gCmd, gShell];
        }
        if (key === 'policy') {
          return [gPolicy];
        }
        return [];
      }
    } as any;

    const operation: OperationContext = {
      type: 'run',
      subtype: 'shell',
      metadata: { runSubtype: 'runCommand' },
      opLabels: ['Policy', 'RUN']
    };

    const results = collectOperationGuards(registry, operation, { kind: 'none' });
    expect(results.map(guard => guard.id)).toEqual([
      'g-run',
      'g-shell',
      'g-runsubtype',
      'g-cmd',
      'g-policy'
    ]);
  });

  it('collects operation guards with after timing and variable-label fallback', () => {
    const gExe = createGuard({ id: 'g-exe', name: 'gExe' });
    const gOpLabel = createGuard({ id: 'g-op-label', name: 'gOpLabel' });
    const gSecret = createGuard({ id: 'g-secret', name: 'gSecret' });

    const registry = {
      getOperationGuardsForTiming(key: string, timing: string): GuardDefinition[] {
        if (timing !== 'after') {
          return [];
        }
        if (key === 'exe') {
          return [gExe];
        }
        if (key === 'op:publish') {
          return [gOpLabel];
        }
        if (key === 'secret') {
          return [gSecret, gExe];
        }
        return [];
      }
    } as any;

    const operation: OperationContext = {
      type: 'exe',
      opLabels: ['op:publish']
    };

    const results = collectOperationGuards(
      registry,
      operation,
      { kind: 'none' },
      {
        timing: 'after',
        variables: [createInput('output', ['secret'])]
      }
    );

    expect(results.map(guard => guard.id)).toEqual(['g-exe', 'g-op-label', 'g-secret']);
  });

  it('preserves privileged inclusion for operation override filtering', () => {
    const privileged = createGuard({
      id: 'g-privileged',
      name: 'policyGuard',
      privileged: true
    });
    const target = createGuard({ id: 'g-target', name: 'targetGuard' });
    const other = createGuard({ id: 'g-other', name: 'otherGuard' });

    const registry = {
      getOperationGuardsForTiming(): GuardDefinition[] {
        return [privileged, target, other];
      }
    } as any;

    const operation: OperationContext = {
      type: 'show'
    };

    const results = collectOperationGuards(registry, operation, {
      kind: 'only',
      names: new Set(['targetGuard'])
    });
    expect(results.map(guard => guard.id)).toEqual(['g-privileged', 'g-target']);
  });
});

describe('guard operation key utilities', () => {
  it('aliases command-capable exe operations to run keys during guard dispatch', () => {
    const runGuard = createGuard({
      id: 'run-guard',
      name: 'runGuard',
      filterKind: 'operation',
      filterValue: 'run'
    });
    const exeGuard = createGuard({
      id: 'exe-guard',
      name: 'exeGuard',
      filterKind: 'operation',
      filterValue: 'exe'
    });
    const cmdGuard = createGuard({
      id: 'cmd-guard',
      name: 'cmdGuard',
      filterKind: 'operation',
      filterValue: 'cmd'
    });
    const shGuard = createGuard({
      id: 'sh-guard',
      name: 'shGuard',
      filterKind: 'operation',
      filterValue: 'sh'
    });
    const jsGuard = createGuard({
      id: 'js-guard',
      name: 'jsGuard',
      filterKind: 'operation',
      filterValue: 'js'
    });
    const nodeGuard = createGuard({
      id: 'node-guard',
      name: 'nodeGuard',
      filterKind: 'operation',
      filterValue: 'node'
    });
    const pyGuard = createGuard({
      id: 'py-guard',
      name: 'pyGuard',
      filterKind: 'operation',
      filterValue: 'py'
    });

    const guardMap = new Map<string, GuardDefinition[]>([
      ['run', [runGuard]],
      ['exe', [exeGuard]],
      ['cmd', [cmdGuard]],
      ['sh', [shGuard]],
      ['js', [jsGuard]],
      ['node', [nodeGuard]],
      ['py', [pyGuard]]
    ]);

    const registry = {
      getOperationGuardsForTiming(key: string): GuardDefinition[] {
        return guardMap.get(key) ?? [];
      }
    } as any;

    const cases: Array<{ operation: OperationContext; expectedSubtypeGuard: string }> = [
      {
        operation: { type: 'run', metadata: { runSubtype: 'runCommand' } } as OperationContext,
        expectedSubtypeGuard: 'cmd-guard'
      },
      {
        operation: { type: 'run', metadata: { runSubtype: 'runCode', language: 'sh' } } as OperationContext,
        expectedSubtypeGuard: 'sh-guard'
      },
      {
        operation: { type: 'run', metadata: { runSubtype: 'runCode', language: 'js' } } as OperationContext,
        expectedSubtypeGuard: 'js-guard'
      },
      {
        operation: { type: 'run', metadata: { runSubtype: 'runCode', language: 'node' } } as OperationContext,
        expectedSubtypeGuard: 'node-guard'
      },
      {
        operation: { type: 'run', metadata: { runSubtype: 'runCode', language: 'py' } } as OperationContext,
        expectedSubtypeGuard: 'py-guard'
      },
      {
        operation: { type: 'exe', opLabels: ['op:cmd'] } as OperationContext,
        expectedSubtypeGuard: 'cmd-guard'
      },
      {
        operation: { type: 'exe', opLabels: ['op:sh'] } as OperationContext,
        expectedSubtypeGuard: 'sh-guard'
      },
      {
        operation: { type: 'exe', opLabels: ['op:js'] } as OperationContext,
        expectedSubtypeGuard: 'js-guard'
      },
      {
        operation: { type: 'exe', opLabels: ['op:node'] } as OperationContext,
        expectedSubtypeGuard: 'node-guard'
      },
      {
        operation: { type: 'exe', opLabels: ['op:py'] } as OperationContext,
        expectedSubtypeGuard: 'py-guard'
      }
    ];

    for (const testCase of cases) {
      const guards = collectOperationGuards(registry, testCase.operation, { kind: 'none' });
      const ids = guards.map(guard => guard.id);
      expect(ids).toEqual(
        expect.arrayContaining(['run-guard', 'exe-guard', testCase.expectedSubtypeGuard])
      );
    }
  });

  it('expands run subtypes for command, exec, and language keys', () => {
    const commandKeys = buildOperationKeys({
      type: 'run',
      metadata: { runSubtype: 'runCommand' }
    } as OperationContext);
    expect(commandKeys).toEqual(['run', 'exe', 'runcommand', 'cmd']);

    const execKeys = buildOperationKeys({
      type: 'run',
      metadata: { runSubtype: 'runExecBash' }
    } as OperationContext);
    expect(execKeys).toEqual(['run', 'exe', 'runexecbash', 'exec']);

    const codeKeys = buildOperationKeys({
      type: 'run',
      metadata: { runSubtype: 'runCode', language: 'TypeScript' }
    } as OperationContext);
    expect(codeKeys).toEqual(['run', 'exe', 'runcode', 'typescript']);
  });

  it('extracts bare command keys from exe op labels', () => {
    const keys = buildOperationKeys({
      type: 'exe',
      opLabels: ['op:cmd', 'op:sh', 'op:js', 'op:node', 'op:py', 'op:prose', 'op:publish']
    } as OperationContext);

    expect(keys).toEqual([
      'exe',
      'op:cmd',
      'cmd',
      'op:sh',
      'sh',
      'op:js',
      'js',
      'op:node',
      'node',
      'op:py',
      'py',
      'op:prose',
      'prose',
      'op:publish',
      'run'
    ]);
  });

  it('does not alias non-command exe operation labels to run', () => {
    const keys = buildOperationKeys({
      type: 'exe',
      opLabels: ['op:publish']
    } as OperationContext);

    expect(keys).toEqual(['exe', 'op:publish']);
  });

  it('normalizes case when building the operation key set', () => {
    const keySet = buildOperationKeySet({
      type: 'Show',
      subtype: 'Display',
      opLabels: ['Release', 'show']
    } as OperationContext);

    expect(Array.from(keySet)).toEqual(['show', 'display', 'release']);
  });

  it('builds operation snapshots with aggregate metadata and variable references', () => {
    const first = createInput('first', ['secret']);
    const second = createInput('second', ['internal']);
    const snapshot = buildOperationSnapshot([first, second]);

    expect(snapshot.variables).toEqual([first, second]);
    expect(snapshot.aggregate).toBeDefined();
    expect(snapshot.labels).toEqual(expect.arrayContaining(['secret', 'internal']));
    expect(snapshot.sources).toEqual(expect.arrayContaining(['source:first', 'source:second']));
  });
});
