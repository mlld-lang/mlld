export const pattern = {
  name: 'type-mismatch-field-access',

  test(error, ctx) {
    if (!error || !error.message) return false;
    return error.message.includes('Cannot access field') && error.message.includes('non-object value');
  },

  enhance(error, ctx) {
    const field = (error.message.match(/field \"([^\"]+)\"/) || [])[1] || 'unknown';
    const type = (error.message.match(/non-object value \(([^)]+)\)/) || [])[1] || 'unknown';

    const suggestions = {
      string: "Strings support: length, includes(), slice(), toUpperCase()",
      number: "Numbers support arithmetic; convert to string first for field access",
      boolean: "Booleans do not have fields; compare or convert as needed",
      undefined: "Value is undefined; ensure the variable is set before access",
      object: "Ensure the object actually has the field; check keys()",
      function: "Functions do not have arbitrary fields; did you mean to call it?",
    };
    const hint = suggestions[type] || 'Ensure the value is an object before accessing fields.';

    const firstLine = (ctx.code || '').split('\n')[0]?.trim() || '';

    return {
      FIELD: field,
      TYPE: type,
      CONTEXT: firstLine,
      HINT: hint
    };
  }
};

