import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { evaluateVar } from '@interpreter/eval/var';
import { VariableImporter } from '@interpreter/eval/import/VariableImporter';
import { ObjectReferenceResolver } from '@interpreter/eval/import/ObjectReferenceResolver';
import { VariableMetadataUtils } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';

describe('Security metadata propagation', () => {
  it('attaches descriptors when evaluating /var directives', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const directive = parseSync('/var secret,untrusted @foo = "value"')[0] as DirectiveNode;

    await evaluateVar(directive, env);

    const variable = env.getVariable('foo');
    expect(variable?.metadata?.security).toBeDefined();
    expect(Array.from(variable!.metadata!.security!.labels)).toEqual(['secret', 'untrusted']);
  });

  it('restores serialized metadata during import reconstruction', () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const serialized = VariableMetadataUtils.serializeSecurityMetadata({
      security: makeSecurityDescriptor({ labels: ['pii'] })
    });

    const variable = importer.createVariableFromValue('foo', 'bar', '/module', undefined, {
      serializedMetadata: serialized,
      securityLabels: ['secret']
    });

    expect(Array.from(variable.metadata?.security?.labels || [])).toEqual(['secret']);
    expect(variable.metadata?.security?.inference).toBe('explicit');
  });
});
