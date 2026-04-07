import { describe, expect, it } from 'vitest';
import { makeSecurityDescriptor } from '@core/types/security';
import { materializeGuardTransform } from '@interpreter/utils/guard-transform';
import {
  extractSecurityDescriptor,
  isStructuredValue,
  wrapStructured
} from '@interpreter/utils/structured-value';

describe('materializeGuardTransform', () => {
  it('merges guard provenance into structured replacement values', () => {
    const replacement = wrapStructured('padded', 'text', 'padded', {
      security: makeSecurityDescriptor({
        labels: ['secret'],
        sources: ['expr:trim']
      })
    });
    const inputDescriptor = makeSecurityDescriptor({
      labels: ['secret'],
      sources: ['source:input']
    });

    const materialized = materializeGuardTransform(replacement, 'sanitize', inputDescriptor);

    expect(isStructuredValue(materialized.value)).toBe(true);
    expect(materialized.mx?.sources).toEqual(
      expect.arrayContaining(['expr:trim', 'source:input', 'guard:sanitize'])
    );

    const valueDescriptor = extractSecurityDescriptor(materialized.value);
    expect(valueDescriptor?.sources).toEqual(
      expect.arrayContaining(['expr:trim', 'source:input', 'guard:sanitize'])
    );
  });
});
