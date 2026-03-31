import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ObjectReferenceResolver } from '../ObjectReferenceResolver';
import { VariableImporter } from '../VariableImporter';
import { ensureStructuredValue } from '@interpreter/utils/structured-value';
import { makeSecurityDescriptor } from '@core/types/security';
import {
  VariableMetadataUtils,
  createExecutableVariable,
  createSimpleTextVariable
} from '@core/types/variable';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  return env;
}

function createImporter(): VariableImporter {
  return new VariableImporter(new ObjectReferenceResolver());
}

const serializedMetadata = VariableMetadataUtils.serializeSecurityMetadata({
  security: makeSecurityDescriptor({
    labels: ['serialized'],
    sources: ['serialized-source']
  })
});

describe('VariableImporter factory strategies', () => {
  it('keeps structured-value strategy behavior stable with metadata propagation', () => {
    const importer = createImporter();
    const env = createEnv();
    const value = ensureStructuredValue({ answer: 42 }, 'json', '{"answer":42}');

    const variable = importer.createVariableFromValue(
      'payload',
      value,
      '/project/module.mld',
      undefined,
      {
        securityLabels: ['runtime'],
        serializedMetadata,
        env
      }
    );

    expect(variable.type).toBe('structured');
    expect(variable.mx?.labels).toEqual(expect.arrayContaining(['runtime']));
  });

  it('keeps executable strategy behavior stable with descriptor propagation', () => {
    const importer = createImporter();
    const env = createEnv();
    const value = {
      __executable: true,
      value: { type: 'command', template: 'echo hi', language: 'sh' },
      executableDef: {
        type: 'command',
        template: 'echo hi',
        language: 'sh',
        paramNames: ['name']
      },
      internal: {}
    };

    const variable = importer.createVariableFromValue(
      'run',
      value,
      '/project/module.mld',
      undefined,
      {
        securityLabels: ['runtime'],
        serializedMetadata,
        env
      }
    );

    expect(variable.type).toBe('executable');
    expect(variable.mx?.labels).toEqual(expect.arrayContaining(['runtime']));
  });

  it('keeps template strategy behavior stable with metadata propagation', () => {
    const importer = createImporter();
    const env = createEnv();
    const value = {
      __template: true,
      content: 'Hello {{name}}',
      parameters: ['name'],
      templateSyntax: 'doubleColon',
      templateAst: []
    };

    const variable = importer.createVariableFromValue(
      'tmpl',
      value,
      '/project/module.mld',
      undefined,
      {
        securityLabels: ['runtime'],
        serializedMetadata,
        env
      }
    );

    expect(variable.type).toBe('template');
    expect(variable.mx?.labels).toEqual(expect.arrayContaining(['runtime']));
  });

  it('keeps array strategy behavior stable with descriptor propagation', () => {
    const importer = createImporter();
    const env = createEnv();

    const variable = importer.createVariableFromValue(
      'items',
      [1, 2, 3],
      '/project/module.mld',
      undefined,
      {
        securityLabels: ['runtime'],
        serializedMetadata,
        env
      }
    );

    expect(variable.type).toBe('array');
    expect(variable.mx?.labels).toEqual(expect.arrayContaining(['runtime']));
  });

  it('keeps object strategy behavior stable with descriptor propagation', () => {
    const importer = createImporter();
    const env = createEnv();

    const variable = importer.createVariableFromValue(
      'record',
      { nested: { count: 1 }, values: [1, 2] },
      '/project/module.mld',
      undefined,
      {
        securityLabels: ['runtime'],
        serializedMetadata,
        env
      }
    );

    expect(variable.type).toBe('object');
    expect(variable.mx?.labels).toEqual(expect.arrayContaining(['runtime']));
  });

  it('preserves captured module env on nested executable variables when rewrapping plain objects', () => {
    const importer = createImporter();
    const env = createEnv();
    const helper = createSimpleTextVariable(
      'mcp',
      'namespace',
      {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      }
    );
    const capturedModuleEnv = new Map<string, any>([['mcp', helper]]);
    const executable = createExecutableVariable(
      'tool',
      'command',
      '',
      ['arg'],
      'sh',
      {
        directive: 'exe',
        syntax: 'braces',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        internal: {
          executableDef: {
            type: 'command',
            template: '',
            language: 'sh',
            paramNames: ['arg']
          } as any,
          capturedModuleEnv
        }
      }
    );

    const variable = importer.createVariableFromValue(
      'record',
      { nested: executable },
      '/project/module.mld',
      undefined,
      { env }
    );

    expect(variable.type).toBe('object');
    const nested = (variable.value as any).nested;
    expect(nested).toBe(executable);
    expect(nested.internal?.capturedModuleEnv).toBe(capturedModuleEnv);
    expect(Array.from((nested.internal?.capturedModuleEnv as Map<string, any>).keys())).toEqual(['mcp']);
  });

  it('keeps primitive fallback behavior stable with serialized descriptor propagation', () => {
    const importer = createImporter();
    const env = createEnv();

    const variable = importer.createVariableFromValue(
      'count',
      42,
      '/project/module.mld',
      undefined,
      {
        serializedMetadata,
        env
      }
    );

    expect(variable.type).toBe('imported');
    expect(variable.value).toBe(42);
    expect(variable.mx?.labels).toEqual(expect.arrayContaining(['serialized']));
  });
});
