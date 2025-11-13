import { describe, expect, test } from 'vitest';
import { Environment } from '../../env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import { VariableImporter } from './VariableImporter';
import { ExportManifest } from './ExportManifest';
import { evaluateGuard } from '../guard';
import type { GuardDirectiveNode } from '@core/types/guard';

function createGuardDirective(name: string): GuardDirectiveNode {
  return {
    type: 'Directive',
    nodeId: 'guard',
    kind: 'guard',
    subtype: 'guard',
    source: undefined,
    values: {
      name: [
        {
          type: 'VariableReference',
          nodeId: 'name',
          identifier: name,
          valueType: 'identifier',
          location: null
        }
      ],
      filter: [
        {
          type: 'GuardFilter',
          nodeId: 'filter',
          filterKind: 'data',
          scope: 'perInput',
          value: 'secret',
          raw: 'secret',
          location: null
        }
      ],
      guard: [
        {
          type: 'GuardBlock',
          nodeId: 'block',
          modifier: 'default',
          rules: [
            {
              type: 'GuardRule',
              nodeId: 'rule',
              action: {
                type: 'GuardAction',
                nodeId: 'action',
                decision: 'allow',
                location: null
              },
              location: null
            }
          ],
          location: null
        }
      ]
    },
    raw: {},
    meta: {
      filterKind: 'data',
      filterValue: 'secret',
      scope: 'perInput',
      modifier: 'default',
      ruleCount: 1,
      hasName: true
    },
    location: null
  };
}

describe('Guard export/import integration', () => {
  test('exports guard definitions via manifest and registers on parent', async () => {
    const fs = new NodeFileSystem();
    const pathService = new PathService();
    const parentEnv = new Environment(fs, pathService, process.cwd());
    const childEnv = parentEnv.createChild(process.cwd());

    const guardDirective = createGuardDirective('moduleGuard');
    await evaluateGuard(guardDirective, childEnv);

    const manifest = new ExportManifest();
    manifest.add([{ name: 'moduleGuard', kind: 'guard' }]);
    childEnv.setExportManifest(manifest);

    const importer = new VariableImporter(new ObjectReferenceResolver());
    const result = importer.processModuleExports(new Map(), {}, true, manifest, childEnv);
    expect(result.guards).toHaveLength(1);
    expect(result.guards[0].name).toBe('moduleGuard');

    parentEnv.registerSerializedGuards(result.guards);
    expect(parentEnv.getGuardRegistry().getByName('moduleGuard')).toBeDefined();
  });
});
