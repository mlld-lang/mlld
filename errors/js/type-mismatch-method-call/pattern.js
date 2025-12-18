export const pattern = {
  name: 'type-mismatch-method-call',

  test(error, mx) {
    if (!error || !error.message) return false;
    // Match common shape: Cannot call .<method>() on <type>
    return /Cannot call \.\w+\(\) on \w+/.test(error.message);
  },

  enhance(error, mx) {
    const method = (error.message.match(/Cannot call \.([\w$]+)\(\)/) || [])[1] || 'method';
    const type = (error.message.match(/on (\w+)$/) || [])[1] || 'unknown';

    const alt = {
      string: 'Strings support: split(), includes(), toUpperCase(), slice() — not join()',
      object: 'Objects do not have array methods; use Object.keys()/values() or convert to array',
      number: 'Numbers do not have methods for joining; convert to string or array first',
      boolean: 'Booleans have no such methods; use conditional logic instead',
      undefined: 'Value is undefined; ensure it is set before calling methods',
    };
    const hint = alt[type] || 'Ensure the value is of the correct type for this method.';

    const firstLine = (mx.code || '').split('\n')[0]?.trim() || '';
    return {
      METHOD: method,
      TYPE: type,
      CONTEXT: firstLine,
      HINT: hint
    };
  }
};

