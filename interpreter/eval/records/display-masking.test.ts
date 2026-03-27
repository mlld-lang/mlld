import { describe, expect, it } from 'vitest';
import { maskFactFieldValue } from './display-masking';

describe('maskFactFieldValue', () => {
  it('uses value-aware masking for recipient-like fields', () => {
    expect(maskFactFieldValue('recipient', 'SE3550000000054910000003')).toBe('SE3***00003');
    expect(maskFactFieldValue('sender', 'Alice')).toBe('A****');
    expect(maskFactFieldValue('recipient', 'mark@example.com')).toBe('m***@example.com');
  });

  it('keeps explicit iban fields on the iban mask path', () => {
    expect(maskFactFieldValue('iban', 'US122000000121212121212')).toBe('US1***21212');
  });
});
