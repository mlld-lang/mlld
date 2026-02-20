import { describe, expect, it } from 'vitest';
import { VariableMetadataUtils } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { MetadataMapParser } from './MetadataMapParser';

describe('MetadataMapParser', () => {
  it('keeps metadata map extraction behavior stable for serialized metadata containers', () => {
    const parser = new MetadataMapParser();
    const serialized = VariableMetadataUtils.serializeSecurityMetadata({
      security: makeSecurityDescriptor({ labels: ['sensitive'] })
    });

    const map = parser.extractMetadataMap({
      value: 'hello',
      __metadata__: {
        value: serialized
      }
    });

    expect(map).toEqual({
      value: serialized
    });
  });

  it('keeps metadata extraction behavior stable when container is absent', () => {
    const parser = new MetadataMapParser();

    expect(parser.extractMetadataMap({ value: 'hello' })).toBeUndefined();
  });
});
