import { describe, expect, it } from 'vitest';
import { makeSecurityDescriptor } from '@core/types/security';
import {
  applySecurityDescriptorToStructuredValue,
  wrapStructured
} from './structured-value';
import {
  materializeGuardInputs,
  materializeGuardInputsWithMapping
} from './guard-inputs';

describe('materializeGuardInputs', () => {
  it('preserves labels from structured primitive payloads', () => {
    const payload = wrapStructured('secret-log', 'text', 'secret-log');
    applySecurityDescriptorToStructuredValue(
      payload,
      makeSecurityDescriptor({ labels: ['secret'] })
    );

    const [result] = materializeGuardInputs([payload], { nameHint: '__effect_input__' });

    expect(result?.value).toBe('secret-log');
    expect(result?.mx?.labels).toContain('secret');
  });

  it('preserves labels in mapping mode for structured primitive payloads', () => {
    const payload = wrapStructured('secret-log', 'text', 'secret-log');
    applySecurityDescriptorToStructuredValue(
      payload,
      makeSecurityDescriptor({ labels: ['secret'] })
    );

    const [entry] = materializeGuardInputsWithMapping([payload], { nameHint: '__effect_input__' });

    expect(entry?.index).toBe(0);
    expect(entry?.variable.value).toBe('secret-log');
    expect(entry?.variable.mx?.labels).toContain('secret');
  });

  it('keeps inline array args structured in mapping mode', () => {
    const [entry] = materializeGuardInputsWithMapping(
      [['john@gmail.com', 'ops@example.com']],
      { nameHint: '__guard_input__', argNames: ['recipients'] }
    );

    expect(entry?.index).toBe(0);
    expect(entry?.name).toBe('recipients');
    expect(entry?.variable.type).toBe('array');
    expect(entry?.variable.value).toEqual(['john@gmail.com', 'ops@example.com']);
  });
});
