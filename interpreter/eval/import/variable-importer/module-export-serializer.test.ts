import { describe, expect, it } from 'vitest';
import {
  createSimpleTextVariable,
  VariableMetadataUtils,
  type Variable
} from '@core/types/variable';
import { ObjectReferenceResolver } from '../ObjectReferenceResolver';
import { ModuleExportSerializer } from './ModuleExportSerializer';

const SOURCE = {
  directive: 'var' as const,
  syntax: 'literal' as const,
  hasInterpolation: false,
  isMultiLine: false
};

describe('ModuleExportSerializer', () => {
  it('keeps serialized metadata output and system variable filtering behavior stable', () => {
    const serializer = new ModuleExportSerializer(new ObjectReferenceResolver());
    const childVars = new Map<string, Variable>();
    const exported = createSimpleTextVariable('value', 'hello', SOURCE, {
      mx: {
        labels: ['sensitive'],
        taint: ['sensitive'],
        sources: ['unit-test']
      }
    });
    const system = createSimpleTextVariable('fm', 'frontmatter', SOURCE, {
      internal: {
        isSystem: true
      }
    });

    childVars.set('value', exported);
    childVars.set('fm', system);

    const { moduleObject } = serializer.serialize({
      childVars,
      explicitExports: null,
      isLegitimateVariableForExport: variable => !(variable.internal?.isSystem ?? false),
      serializeShadowEnvs: envs => envs,
      serializeModuleEnv: () => ({})
    });

    expect(moduleObject.value).toBe('hello');
    expect(moduleObject.fm).toBeUndefined();

    const metadataMap = (moduleObject as {
      __metadata__?: Record<string, ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>>;
    }).__metadata__;
    expect(metadataMap?.value).toBeDefined();

    const parsedMetadata = VariableMetadataUtils.deserializeSecurityMetadata(metadataMap.value);
    expect(parsedMetadata.security?.labels).toEqual(expect.arrayContaining(['sensitive']));
    expect(parsedMetadata.security?.sources).toEqual(expect.arrayContaining(['unit-test']));
  });

  it('does not leak module-level security snapshot labels onto unrelated exports', () => {
    const serializer = new ModuleExportSerializer(new ObjectReferenceResolver());
    const childVars = new Map<string, Variable>();
    childVars.set(
      'helper',
      createSimpleTextVariable('helper', 'safe utility', SOURCE)
    );
    childVars.set(
      'apiKey',
      createSimpleTextVariable('apiKey', 'sk-123', SOURCE, {
        mx: {
          labels: ['secret'],
          taint: ['secret'],
          sources: ['module']
        }
      })
    );

    const { moduleObject } = serializer.serialize({
      childVars,
      explicitExports: new Set(['helper']),
      childEnv: {
        getSecuritySnapshot: () => ({
          labels: ['secret'],
          taint: ['secret'],
          sources: ['module'],
          policy: undefined
        })
      } as any,
      isLegitimateVariableForExport: () => true,
      serializeShadowEnvs: envs => envs,
      serializeModuleEnv: () => ({})
    });

    const metadataMap = (moduleObject as {
      __metadata__?: Record<string, ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>>;
    }).__metadata__;

    expect(moduleObject.helper).toBe('safe utility');
    expect(metadataMap?.helper).toBeUndefined();
  });
});
